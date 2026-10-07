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
    this.hits.delete(key); // re-insert so the map stays ordered by last hit
    if (this.hits.size >= this.maxKeys) this.evict(now);
    this.hits.set(key, recent);
    return recent.length > this.max;
  }

  /** drops keys with no hit inside the window, then the least recently seen ones */
  private evict(now: number) {
    for (const [k, times] of this.hits) if (now - times[times.length - 1] >= this.windowMs) this.hits.delete(k);
    for (const k of this.hits.keys()) {
      if (this.hits.size < this.maxKeys) break;
      this.hits.delete(k);
    }
  }
}

/**
 * Best-effort client key. Headers a platform sets itself win over `x-forwarded-for`, which
 * a client can write: when it is the only one, the *last* hop is used (the one the nearest
 * proxy appended), never the first. Still a cost guard, not a security boundary: see
 * `globalLimiter` for the ceiling that holds even when a key is spoofed.
 */
export function clientKey(req: Request): string {
  const h = req.headers;
  const trusted = h.get("x-vercel-forwarded-for") ?? h.get("cf-connecting-ip") ?? h.get("x-real-ip");
  if (trusted) return trusted.trim().slice(0, 64);
  const hops = h.get("x-forwarded-for")?.split(",").map((x) => x.trim()).filter(Boolean);
  return hops?.at(-1)?.slice(0, 64) || "local";
}

/** one shared bucket for every client of an instance: the limit that spoofed keys can't dodge */
export const globalLimiter: RateLimiter = new MemoryRateLimiter(240, 60_000, 1);
