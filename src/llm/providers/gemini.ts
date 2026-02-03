/**
 * Google Gemini API client implementation.
 * 
 * Specifications:
 * - Model: gemini-1.5-pro
 * - Context: 2,097,152 tokens (2M)
 * - Output: 8,192 tokens max
 * - Endpoint: https://generativelanguage.googleapis.com/v1beta/models
 * - Auth: x-goog-api-key header
 * - Rate Limits (free): 15 RPM, 1M TPD
 */

import { LLMRequest, LLMResponse, LLMProviderClient } from '../provider-types.js';
import { APIError, TimeoutError, CircuitBreakerError, classifyHTTPError } from '../../utils/errors.js';
import { RateLimiter } from '../../utils/rate-limiter.js';
import { RETRY_CONFIG, LIMITS, RATE_LIMITER } from '../../constants.js';

export class GeminiClient implements LLMProviderClient {
  private apiKey: string;
  private endpoint: string;
  private model: string;
  private timeout: number;
  private apiCallCount: number = 0;
  private apiErrorTimestamps: number[] = [];
  private rateLimiter: RateLimiter;

  constructor(apiKey: string, model: string, timeout: number) {
    if (!apiKey) {
      throw new Error('KIMI_API_KEY environment variable is required (Google Gemini API key)');
    }
    this.apiKey = apiKey;
    this.model = model;
    this.endpoint = 'https://generativelanguage.googleapis.com/v1beta/models';
    this.timeout = timeout;
    this.rateLimiter = new RateLimiter({
      tokensPerInterval: RATE_LIMITER.REQUESTS_PER_MINUTE,
      intervalMs: 60 * 1000,
      burst: RATE_LIMITER.BURST
    });
  }

  async chat(request: LLMRequest): Promise<LLMResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      await this.rateLimiter.acquire();
      const response = await this.makeRequestWithRetry(request, controller.signal);
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async makeRequestWithRetry(
    request: LLMRequest,
    signal: AbortSignal
  ): Promise<LLMResponse> {
    let lastError: APIError | TimeoutError | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await this.makeRequest(request, signal);
      } catch (err) {
        if (err instanceof APIError || err instanceof TimeoutError) {
          lastError = err;

          if (!lastError.transient) {
            throw lastError;
          }

          if (err instanceof APIError && err.statusCode === 429) {
            if (attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES - 1) {
              const baseDelay = RETRY_CONFIG.RATE_LIMIT_DELAYS_MS[attempt];
              const delay = this.addJitter(baseDelay);
              await this.sleep(delay);
              continue;
            }
          }

          if (err instanceof APIError && err.statusCode >= 500 && err.statusCode < 600) {
            if (attempt === 0) {
              const delay = this.addJitter(RETRY_CONFIG.SERVER_ERROR_DELAY_MS);
              await this.sleep(delay);
              continue;
            }
          }

          if (err instanceof TimeoutError && attempt === 0) {
            const delay = this.addJitter(RETRY_CONFIG.SERVER_ERROR_DELAY_MS);
            await this.sleep(delay);
            continue;
          }

          throw lastError;
        }
        throw err;
      }
    }

    throw lastError || new Error('Unexpected retry loop exit');
  }

  private async makeRequest(
    request: LLMRequest,
    signal: AbortSignal
  ): Promise<LLMResponse> {
    this.checkAPIErrorRate();

    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: request.messages.map(m => m.content).join('\n')
            }
          ]
        }
      ],
      generationConfig: {
        maxOutputTokens: request.maxTokens ?? 16384,
        temperature: request.temperature ?? 1.0,
        topP: request.topP ?? 1.0
      }
    };

    try {
      const endpoint = `${this.endpoint}/${this.model}:generateContent?key=${this.apiKey}`;
      
      const response = await fetch(
        endpoint,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(requestBody),
          signal
        }
      );

      if (!response.ok) {
        const errorBody = await response.text();
        const classification = classifyHTTPError(response.status);
        
        let errorDetail = '';
        try {
          const errorJson = JSON.parse(errorBody);
          if (errorJson.error?.message) {
            errorDetail = ` (${errorJson.error.message})`;
          }
        } catch {}
        
        if (!classification.transient || response.status >= 500) {
          this.recordAPIError();
        }

        throw new APIError(
          `Gemini API: ${classification.message}${errorDetail}`,
          response.status,
          classification.transient
        );
      }

      const data = await response.json();
      this.apiCallCount++;

      // Extract content and tokens from Gemini response
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
      const promptTokens = data.usageMetadata?.promptTokenCount ?? 0;
      const completionTokens = data.usageMetadata?.candidatesTokenCount ?? 0;

      return {
        content,
        usage: {
          promptTokens,
          completionTokens
        }
      };

    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.recordAPIError();
        throw new TimeoutError('Gemini API request timeout');
      }

      if (err instanceof APIError) {
        throw err;
      }

      this.recordAPIError();
      throw new APIError(`Gemini network error: ${err.message}`, 0, true);
    }
  }

  private checkAPIErrorRate(): void {
    const now = Date.now();
    const windowStart = now - LIMITS.API_ERROR_RATE_WINDOW_MS;
    
    this.apiErrorTimestamps = this.apiErrorTimestamps.filter(ts => ts > windowStart);
    
    if (this.apiErrorTimestamps.length >= LIMITS.API_ERROR_RATE_LIMIT) {
      throw new CircuitBreakerError(
        `Gemini API error rate exceeded: ${this.apiErrorTimestamps.length} errors in ${LIMITS.API_ERROR_RATE_WINDOW_MS / 1000}s`
      );
    }
  }

  private recordAPIError(): void {
    this.apiErrorTimestamps.push(Date.now());
  }

  private addJitter(delayMs: number): number {
    const jitterFactor = 0.25;
    const jitter = (Math.random() * 2 - 1) * jitterFactor * delayMs;
    return Math.max(100, delayMs + jitter);
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
