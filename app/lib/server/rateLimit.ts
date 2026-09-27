import "server-only";

/**
 * Per-key request limiter. The in-memory implementation is per server instance,
 * so on serverless it only limits a single warm instance; swap in a shared
 * backend (e.g. Redis) behind this interface for real multi-instance limits.
 */
export interface RateLimiter {
  /** records a hit for `key` and reports whether it is over the limit */
  hit(key: string): Promise<boolean>;
}

export class MemoryRateLimiter implements RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private max: number,
    private windowMs: number,
    private maxKeys = 5000,
  ) {}

  async hit(key: string): Promise<boolean> {
    const now = Date.now();
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < this.windowMs);
    recent.push(now);
    if (this.hits.size >= this.maxKeys && !this.hits.has(key)) this.hits.clear();
    this.hits.set(key, recent);
    return recent.length > this.max;
  }
}

/**
 * Best-effort client key. `x-forwarded-for` is client-controlled unless a trusted
 * proxy overwrites it, so this is a cost guard, not a security boundary.
 */
export function clientKey(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "local";
}
