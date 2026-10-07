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
 * A limiter whose counters live in Upstash Redis (REST), so every server instance shares
 * them. A fixed window: INCR the key, and set the window's expiry the first time (NX).
 * If the store can't be reached the request is counted by `fallback` instead: the app
 * never refuses people because the limiter is down.
 */
export class UpstashRateLimiter implements RateLimiter {
  constructor(
    private config: { url: string; token: string; prefix: string },
    private max: number,
    private windowMs: number,
    private fallback: RateLimiter,
    private fetcher: typeof fetch = fetch,
  ) {}

  async hit(key: string): Promise<boolean> {
    const redisKey = `${this.config.prefix}:${key}`;
    try {
      const res = await this.fetcher(`${this.config.url.replace(/\/$/, "")}/pipeline`, {
        method: "POST",
        headers: { Authorization: `Bearer ${this.config.token}`, "content-type": "application/json" },
        body: JSON.stringify([
          ["INCR", redisKey],
          ["PEXPIRE", redisKey, this.windowMs, "NX"],
        ]),
        signal: AbortSignal.timeout(1500),
      });
      if (!res.ok) throw new Error(`rate limit store answered ${res.status}`);
      const data: unknown = await res.json();
      const count = Array.isArray(data) ? (data[0] as { result?: unknown } | undefined)?.result : undefined;
      if (typeof count !== "number") throw new Error("unexpected rate limit store answer");
      return count > this.max;
    } catch (error) {
      console.warn("[rateLimit] shared store unavailable, counting locally:", error instanceof Error ? error.message : error);
      return this.fallback.hit(key);
    }
  }
}

/**
 * The limiter for one endpoint: shared through Upstash when `UPSTASH_REDIS_REST_URL` and
 * `UPSTASH_REDIS_REST_TOKEN` are set, per instance in memory otherwise.
 */
export function makeLimiter(
  name: string,
  max: number,
  windowMs: number,
  maxKeys = 5000,
  env: Record<string, string | undefined> = process.env,
): RateLimiter {
  const memory = new MemoryRateLimiter(max, windowMs, maxKeys);
  const url = env.UPSTASH_REDIS_REST_URL?.trim();
  const token = env.UPSTASH_REDIS_REST_TOKEN?.trim();
  return url && token ? new UpstashRateLimiter({ url, token, prefix: `fa:${name}` }, max, windowMs, memory) : memory;
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
export const globalLimiter: RateLimiter = makeLimiter("global", 240, 60_000, 1);
