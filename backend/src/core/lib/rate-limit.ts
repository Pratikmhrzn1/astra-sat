/**
 * Fixed-window counters held in process memory.
 *
 * IMPORTANT: this state is per-process. It resets on restart, and with more
 * than one backend instance each would enforce its own budget — so these are a
 * cost/abuse guard for a single-instance deployment, not a security control.
 * Moving to multiple instances means moving these counters to Postgres or Redis.
 */
export interface RateLimitResult {
  allowed: boolean;
  /** Seconds until the current window resets. Only meaningful when blocked. */
  retryAfterSeconds: number;
  remaining: number;
}

interface Window {
  count: number;
  startedAt: number;
}

export class FixedWindowRateLimiter {
  private readonly windows = new Map<string, Window>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {}

  /**
   * Charges `cost` units against `key`. Callers should pass the number of
   * operations actually about to happen, not a theoretical maximum, so a
   * request that hits cache does not consume budget it never used.
   */
  consume(key: string, cost = 1): RateLimitResult {
    const now = Date.now();
    let window = this.windows.get(key);

    if (!window || now - window.startedAt >= this.windowMs) {
      window = { count: 0, startedAt: now };
      this.windows.set(key, window);
    }

    const retryAfterSeconds = Math.ceil((window.startedAt + this.windowMs - now) / 1000);

    if (window.count + cost > this.limit) {
      return { allowed: false, retryAfterSeconds, remaining: Math.max(0, this.limit - window.count) };
    }

    window.count += cost;
    return { allowed: true, retryAfterSeconds, remaining: this.limit - window.count };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  /** Drops expired windows so the map cannot grow without bound. */
  prune(): void {
    const now = Date.now();
    for (const [key, window] of this.windows) {
      if (now - window.startedAt >= this.windowMs) this.windows.delete(key);
    }
  }
}

/**
 * Tracks consecutive failures per key and locks the key out once a threshold is
 * crossed. Used for login, where the useful signal is failures-in-a-row per
 * account rather than request volume per IP.
 */
export class LockoutTracker {
  private readonly records = new Map<string, { failures: number; lockedUntil: number }>();

  constructor(
    private readonly maxFailures: number,
    private readonly lockoutMs: number,
  ) {}

  /** Seconds remaining on an active lockout, or 0 when not locked. */
  lockedFor(key: string): number {
    const record = this.records.get(key);
    if (!record || record.lockedUntil <= Date.now()) return 0;
    return Math.ceil((record.lockedUntil - Date.now()) / 1000);
  }

  /** Returns how many attempts remain, and whether this failure caused a lock. */
  recordFailure(key: string): { attemptsRemaining: number; locked: boolean } {
    const record = this.records.get(key) ?? { failures: 0, lockedUntil: 0 };
    record.failures += 1;
    const locked = record.failures >= this.maxFailures;
    if (locked) record.lockedUntil = Date.now() + this.lockoutMs;
    this.records.set(key, record);
    return { attemptsRemaining: Math.max(0, this.maxFailures - record.failures), locked };
  }

  reset(key: string): void {
    this.records.delete(key);
  }
}
