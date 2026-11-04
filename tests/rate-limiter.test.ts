import assert from 'node:assert/strict';
import { PerKeyRateLimiter } from '../server/rateLimiter.ts';

const limiter = new PerKeyRateLimiter(2, 3);
const base = 1_000_000;
assert.equal(limiter.consume('session-a', base).allowed, true);
assert.equal(limiter.consume('session-a', base + 1).allowed, true);
const minuteLimit = limiter.consume('session-a', base + 2);
assert.equal(minuteLimit.allowed, false, 'per-minute limit is enforced');
assert.ok(minuteLimit.retryAfterMs > 0);

// Crossing the minute window resets only the minute counter, not the hour counter.
assert.equal(limiter.consume('session-a', base + 60_001).allowed, true);
const hourlyLimit = limiter.consume('session-a', base + 60_002);
assert.equal(hourlyLimit.allowed, false, 'hourly limit survives minute-window reset');

// A different browser session has an independent budget.
assert.equal(limiter.consume('session-b', base + 60_003).allowed, true);

// After the hour window, the same session can use its new hourly budget.
assert.equal(limiter.consume('session-a', base + 3_600_001).allowed, true);

console.log('PASS - Libi rate limiting preserves hourly limits across minute resets');
