export type RateLimiterOptions = {
  tokensPerInterval: number;
  intervalMs: number;
  burst: number;
};

type NowFn = () => number;
type SleepFn = (ms: number) => Promise<void>;

const sleep: SleepFn = (ms: number) =>
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Token bucket rate limiter with burst support.
 */
export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly ratePerMs: number;
  private readonly burst: number;
  private readonly now: NowFn;
  private readonly sleep: SleepFn;

  constructor(options: RateLimiterOptions, now: NowFn = Date.now, sleepFn: SleepFn = sleep) {
    if (options.tokensPerInterval <= 0) {
      throw new Error('tokensPerInterval must be greater than 0');
    }
    if (options.intervalMs <= 0) {
      throw new Error('intervalMs must be greater than 0');
    }
    if (options.burst <= 0) {
      throw new Error('burst must be greater than 0');
    }

    this.ratePerMs = options.tokensPerInterval / options.intervalMs;
    this.burst = options.burst;
    this.tokens = options.burst;
    this.lastRefill = now();
    this.now = now;
    this.sleep = sleepFn;
  }

  async acquire(): Promise<void> {
    while (true) {
      this.refill();
      if (this.tokens >= 1) {
        this.tokens -= 1;
        return;
      }

      const msToWait = this.msUntilNextToken();
      await this.sleep(msToWait);
    }
  }

  private refill(): void {
    const current = this.now();
    const elapsed = current - this.lastRefill;

    if (elapsed <= 0) {
      return;
    }

    this.tokens = Math.min(this.burst, this.tokens + elapsed * this.ratePerMs);
    this.lastRefill = current;
  }

  private msUntilNextToken(): number {
    if (this.tokens >= 1) return 0;
    const missing = 1 - this.tokens;
    return Math.ceil(missing / this.ratePerMs);
  }
}
