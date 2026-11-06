export interface RateLimitDecision {
  allowed: boolean;
  retryAfterMs: number;
}

interface WindowState {
  minuteStartedAt: number;
  minuteCount: number;
  hourStartedAt: number;
  hourCount: number;
}

export class PerKeyRateLimiter {
  private readonly windows = new Map<string, WindowState>();

  constructor(
    private readonly perMinute: number,
    private readonly perHour: number,
    private readonly retentionMs = 2 * 60 * 60 * 1000
  ) {}

  consume(key: string, now = Date.now()): RateLimitDecision {
    let state = this.windows.get(key);
    if (!state) {
      state = {
        minuteStartedAt: now,
        minuteCount: 0,
        hourStartedAt: now,
        hourCount: 0,
      };
    } else {
      if (now - state.minuteStartedAt >= 60_000) {
        state.minuteStartedAt = now;
        state.minuteCount = 0;
      }
      if (now - state.hourStartedAt >= 60 * 60_000) {
        state.hourStartedAt = now;
        state.hourCount = 0;
      }
    }

    if (state.minuteCount >= this.perMinute) {
      this.windows.set(key, state);
      return { allowed: false, retryAfterMs: Math.max(1, 60_000 - (now - state.minuteStartedAt)) };
    }
    if (state.hourCount >= this.perHour) {
      this.windows.set(key, state);
      return { allowed: false, retryAfterMs: Math.max(1, 60 * 60_000 - (now - state.hourStartedAt)) };
    }

    state.minuteCount += 1;
    state.hourCount += 1;
    this.windows.set(key, state);
    this.prune(now);
    return { allowed: true, retryAfterMs: 0 };
  }

  private prune(now: number): void {
    if (this.windows.size < 5000) return;
    for (const [key, state] of this.windows) {
      if (now - state.hourStartedAt > this.retentionMs) this.windows.delete(key);
    }
  }
}
