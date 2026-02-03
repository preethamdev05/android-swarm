import { KimiAPIResponse, KimiAPIError } from './types.js';
import { KIMI_API_CONFIG, RETRY_CONFIG, LIMITS, RATE_LIMITER } from './constants.js';
import { APIError, TimeoutError, CircuitBreakerError, classifyHTTPError } from './utils/errors.js';
import { RateLimiter } from './utils/rate-limiter.js';

/**
 * NVIDIA NIM Kimi API client with robust error handling and retry logic.
 * 
 * Error classification:
 * - TRANSIENT: 429 (rate limit), 5xx (server errors), timeouts, network errors
 * - FATAL: 401 (auth), 403 (quota), 400 (invalid request)
 * 
 * Retry strategy:
 * - Rate limit (429): Exponential backoff with jitter, up to 3 attempts
 * - Server errors (5xx): Single retry after delay
 * - Fatal errors: No retry, fail immediately
 */
export class KimiClient {
  private apiKey: string;
  private apiCallCount: number = 0;
  private apiErrorTimestamps: number[] = [];
  private rateLimiter: RateLimiter;

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('KIMI_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: RATE_LIMITER.REQUESTS_PER_MINUTE,
      intervalMs: 60 * 1000,
      burst: RATE_LIMITER.BURST
    });
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    agent: 'planner' | 'coder' | 'critic' | 'verifier'
  ): Promise<KimiAPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KIMI_API_CONFIG.TIMEOUT_MS);

    try {
      await this.rateLimiter.acquire();
      const response = await this.makeRequestWithRetry(messages, controller.signal);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async makeRequestWithRetry(
    messages: Array<{ role: string; content: string }>,
    signal: AbortSignal
  ): Promise<KimiAPIResponse> {
    let lastError: APIError | TimeoutError | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await this.makeRequest(messages, signal);
      } catch (err) {
        if (err instanceof APIError || err instanceof TimeoutError) {
          lastError = err;

          // FATAL errors: no retry
          if (!lastError.transient) {
            throw lastError;
          }

          // TRANSIENT: Rate limit (429) - exponential backoff with jitter
          if (err instanceof APIError && err.statusCode === 429) {
            if (attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES - 1) {
              const baseDelay = RETRY_CONFIG.RATE_LIMIT_DELAYS_MS[attempt];
              const delay = this.addJitter(baseDelay);
              await this.sleep(delay);
              continue;
            }
          }

          // TRANSIENT: Server errors (5xx) - single retry
          if (err instanceof APIError && err.statusCode >= 500 && err.statusCode < 600) {
            if (attempt === 0) {
              const delay = this.addJitter(RETRY_CONFIG.SERVER_ERROR_DELAY_MS);
              await this.sleep(delay);
              continue;
            }
          }

          // TRANSIENT: Timeout - single retry
          if (err instanceof TimeoutError && attempt === 0) {
            const delay = this.addJitter(RETRY_CONFIG.SERVER_ERROR_DELAY_MS);
            await this.sleep(delay);
            continue;
          }

          // Exhausted retries for transient error
          throw lastError;
        }
        
        // Legacy KimiAPIError fallback (for backward compatibility)
        const legacyError = err as KimiAPIError;
        if (!legacyError.transient) {
          throw err;
        }

        if (legacyError.status === 429 && attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES - 1) {
          const baseDelay = RETRY_CONFIG.RATE_LIMIT_DELAYS_MS[attempt];
          const delay = this.addJitter(baseDelay);
          await this.sleep(delay);
          continue;
        }

        if (legacyError.status >= 500 && legacyError.status < 600 && attempt === 0) {
          const delay = this.addJitter(RETRY_CONFIG.SERVER_ERROR_DELAY_MS);
          await this.sleep(delay);
          continue;
        }

        throw err;
      }
    }

    throw lastError || new Error('Unexpected retry loop exit');
  }

  private async makeRequest(
    messages: Array<{ role: string; content: string }>,
    signal: AbortSignal
  ): Promise<KimiAPIResponse> {
    // Check circuit breaker before making request
    this.checkAPIErrorRate();

    const requestBody = {
      model: KIMI_API_CONFIG.MODEL,
      messages,
      max_tokens: 16384,
      temperature: 1.0,
      top_p: 1.0,
      stream: false,
      chat_template_kwargs: { thinking: true }
    };

    try {
      const response = await fetch(
        KIMI_API_CONFIG.ENDPOINT,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.apiKey}`
          },
          body: JSON.stringify(requestBody),
          signal
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        const classification = classifyHTTPError(response.status);
        
        // Parse error body for specific error codes
        let errorDetail = '';
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorDetail = ` (${errorJson.error.message})`;
          }
        } catch {}
        
        // Record error for circuit breaker (only for non-transient or server errors)
        if (!classification.transient || response.status >= 500) {
          this.recordAPIError();
        }

        throw new APIError(
          `${classification.message}${errorDetail}: ${errorBody}`,
          response.status,
          classification.transient
        );
      }

      const data = await response.json();
      this.apiCallCount++;
      return data as KimiAPIResponse;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.recordAPIError();
        throw new TimeoutError('API request timeout');
      }

      if (err instanceof APIError) {
        throw err;
      }

      // Network errors are transient
      this.recordAPIError();
      throw new APIError(`Network error: ${err.message}`, 0, true);
    }
  }

  /**
   * Circuit breaker: checks API error rate and throws if threshold exceeded.
   * 
   * Safety mechanism to prevent cascading failures when API is degraded.
   * Threshold: 5 errors within 60 seconds.
   */
  private checkAPIErrorRate(): void {
    const now = Date.now();
    const windowStart = now - LIMITS.API_ERROR_RATE_WINDOW_MS;
    
    // Clean up old timestamps outside the window
    this.apiErrorTimestamps = this.apiErrorTimestamps.filter(ts => ts > windowStart);
    
    if (this.apiErrorTimestamps.length >= LIMITS.API_ERROR_RATE_LIMIT) {
      throw new CircuitBreakerError(
        `API error rate exceeded: ${this.apiErrorTimestamps.length} errors in ${LIMITS.API_ERROR_RATE_WINDOW_MS / 1000}s`
      );
    }
  }

  private recordAPIError(): void {
    this.apiErrorTimestamps.push(Date.now());
  }

  /**
   * Adds random jitter (±25%) to delay for exponential backoff.
   * Prevents thundering herd problem when multiple requests retry simultaneously.
   */
  private addJitter(delayMs: number): number {
    const jitterFactor = 0.25; // ±25%
    const jitter = (Math.random() * 2 - 1) * jitterFactor * delayMs;
    return Math.max(100, delayMs + jitter); // Minimum 100ms
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getAPICallCount(): number {
    return this.apiCallCount;
  }

  resetAPICallCount(): void {
    this.apiCallCount = 0;
  }
}
