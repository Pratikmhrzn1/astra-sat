/**
 * Fixed-window counters held in process memory.
 *
 * IMPORTANT: this state is per-process. It resets on restart, and with more
 * than one backend instance each would enforce its own budget — so these are a
 * cost/abuse guard for a single-instance deployment, not a security control.
 * Moving to multiple instances means moving these counters to Postgres or Redis.
 */
export interface BudgetVerdict {
  allowed: boolean;
  /** Seconds until the current window resets. Only meaningful when blocked. */
  retryAfterSeconds: number;
  remaining: number;
}

interface Window {
  count: number;
  startedAt: number;
}

export class FixedWindowBudget {
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
  consume(key: string, cost = 1): BudgetVerdict {
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
