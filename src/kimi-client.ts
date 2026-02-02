import { KimiAPIResponse, KimiAPIError } from './types.js';
import { KIMI_API_CONFIG, RETRY_CONFIG } from './constants.js';

export class KimiClient {
  private apiKey: string;
  private apiCallCount: number = 0;
  private apiErrorTimestamps: number[] = [];

  constructor(apiKey: string) {
    if (!apiKey) {
      throw new Error('KIMI_API_KEY environment variable is required');
    }
    this.apiKey = apiKey;
  }

  async chat(
    messages: Array<{ role: string; content: string }>,
    agent: 'planner' | 'coder' | 'critic' | 'verifier'
  ): Promise<KimiAPIResponse> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), KIMI_API_CONFIG.TIMEOUT_MS);

    try {
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
    let lastError: KimiAPIError | null = null;

    for (let attempt = 0; attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        return await this.makeRequest(messages, signal);
      } catch (err) {
        lastError = err as KimiAPIError;

        if (!lastError.transient) {
          throw lastError;
        }

        if (lastError.status === 429 && attempt < RETRY_CONFIG.MAX_RATE_LIMIT_RETRIES - 1) {
          const delay = RETRY_CONFIG.RATE_LIMIT_DELAYS_MS[attempt];
          await this.sleep(delay);
          continue;
        }

        if (lastError.status >= 500 && lastError.status < 600 && attempt === 0) {
          await this.sleep(RETRY_CONFIG.SERVER_ERROR_DELAY_MS);
          continue;
        }

        throw lastError;
      }
    }

    throw lastError || new Error('Unexpected retry loop exit');
  }

  private async makeRequest(
    messages: Array<{ role: string; content: string }>,
    signal: AbortSignal
  ): Promise<KimiAPIResponse> {
    this.checkAPIErrorRate();

    const requestBody = {
      model: KIMI_API_CONFIG.MODEL,
      messages: messages,
      temperature: 0.7
    };

    try {
      const response = await fetch(KIMI_API_CONFIG.ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify(requestBody),
        signal
      });

      if (!response.ok) {
        const errorBody = await response.text();
        const isTransient = response.status === 429 || (response.status >= 500 && response.status < 600);
        
        if (!isTransient || response.status >= 500) {
          this.recordAPIError();
        }

        throw {
          status: response.status,
          message: `API error ${response.status}: ${errorBody}`,
          transient: isTransient
        } as KimiAPIError;
      }

      const data = await response.json();
      this.apiCallCount++;
      return data as KimiAPIResponse;

    } catch (err: any) {
      if (err.name === 'AbortError') {
        this.recordAPIError();
        throw {
          status: 0,
          message: 'Request timeout',
          transient: true
        } as KimiAPIError;
      }

      if (err.status !== undefined) {
        throw err;
      }

      this.recordAPIError();
      throw {
        status: 0,
        message: `Network error: ${err.message}`,
        transient: true
      } as KimiAPIError;
    }
  }

  private checkAPIErrorRate(): void {
    const now = Date.now();
    const windowStart = now - RETRY_CONFIG.API_ERROR_RATE_WINDOW_MS;
    
    this.apiErrorTimestamps = this.apiErrorTimestamps.filter(ts => ts > windowStart);
    
    if (this.apiErrorTimestamps.length >= RETRY_CONFIG.API_ERROR_RATE_LIMIT) {
      throw new Error('Circuit breaker: API error rate exceeded');
    }
  }

  private recordAPIError(): void {
    this.apiErrorTimestamps.push(Date.now());
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
