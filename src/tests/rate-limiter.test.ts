import test from 'node:test';
import assert from 'node:assert/strict';
import { RateLimiter } from '../utils/rate-limiter.js';

test('rate limiter waits for refill when tokens are exhausted', async () => {
  let now = 0;
  let totalSlept = 0;

  const limiter = new RateLimiter(
    { tokensPerInterval: 1, intervalMs: 1000, burst: 1 },
    () => now,
    async (ms: number) => {
      totalSlept += ms;
      now += ms;
    }
  );

  await limiter.acquire();
  await limiter.acquire();

  assert.equal(totalSlept, 1000);
});
