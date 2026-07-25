/**
 * In-memory sliding-window rate limiter.
 * Suitable for single-process hackathon deployments.
 * For multi-process production use a Redis-backed implementation.
 */
export class RateLimiter {
  private readonly windowMs: number;
  private readonly maxRequests: number;
  private readonly store = new Map<string, number[]>();

  constructor(windowMs: number, maxRequests: number) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
    // Periodically clean up old entries to prevent memory leak
    setInterval(() => this.cleanup(), windowMs * 2).unref();
  }

  /** Returns true if the request should be allowed, false if rate-limited */
  allow(key: string): boolean {
    const now = Date.now();
    const timestamps = (this.store.get(key) ?? []).filter(t => now - t < this.windowMs);
    if (timestamps.length >= this.maxRequests) return false;
    timestamps.push(now);
    this.store.set(key, timestamps);
    return true;
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, timestamps] of this.store.entries()) {
      const fresh = timestamps.filter(t => now - t < this.windowMs);
      if (fresh.length === 0) this.store.delete(key);
      else this.store.set(key, fresh);
    }
  }
}

// ── Pre-configured limiters ───────────────────────────────────────────────────
/** Login: 5 attempts per 15 minutes per IP */
export const loginLimiter = new RateLimiter(15 * 60 * 1000, 5);

/** Natural-language report: 10 per minute per user */
export const nlpLimiter = new RateLimiter(60 * 1000, 10);

/** Admin override: 20 per minute per user */
export const overrideLimiter = new RateLimiter(60 * 1000, 20);
