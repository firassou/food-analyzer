import "server-only";

// Open Food Facts is a free public service: its search answers 503 under load and allows a
// client about ten searches a minute. This client keeps well inside that and degrades quietly:
// - answers are kept an hour, and an older one is still served when the service is down
// - the same request made at the same time is sent once
// - after a failure the service is left alone for a short while instead of being hammered
// - searches are counted, and past the budget the cached answer (or nothing) is used

const USER_AGENT =
  "FoodAnalyzer/0.1 (https://github.com/firassou/food-analyzer)";

export interface OffClientOptions {
  fetch?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** how long an answer is served without asking again */
  freshMs?: number;
  /** how long an old answer may stand in for a service that is down */
  staleMs?: number;
  maxEntries?: number;
  timeoutMs?: number;
  /** pause after a failed request before the service is tried again */
  cooldownMs?: number;
  searchesPerMinute?: number;
}

export interface OffRequest {
  /** what the answer is cached under */
  key: string;
  url: string;
  /** searches are the rate-limited, flaky ones */
  search?: boolean;
}

export class OffClient {
  private readonly cache = new Map<string, { at: number; value: unknown }>();
  private readonly inflight = new Map<string, Promise<unknown>>();
  private readonly searchTimes: number[] = [];
  private downUntil = 0;
  private readonly o: Required<OffClientOptions>;

  constructor(options: OffClientOptions = {}) {
    this.o = {
      fetch: options.fetch ?? ((...args) => fetch(...args)),
      now: options.now ?? Date.now,
      sleep:
        options.sleep ??
        ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
      freshMs: options.freshMs ?? 60 * 60 * 1000,
      staleMs: options.staleMs ?? 24 * 60 * 60 * 1000,
      maxEntries: options.maxEntries ?? 300,
      timeoutMs: options.timeoutMs ?? 7000,
      cooldownMs: options.cooldownMs ?? 30_000,
      searchesPerMinute: options.searchesPerMinute ?? 8,
    };
  }

  /** the parsed JSON, or null for an unknown product; throws only when there is nothing to fall back on */
  async getJson(req: OffRequest, signal?: AbortSignal): Promise<unknown> {
    const { now } = this.o;
    const hit = this.cache.get(req.key);
    const age = hit ? now() - hit.at : Infinity;
    if (hit && age <= this.o.freshMs) return hit.value;

    const stale = hit && age <= this.o.staleMs ? hit : undefined;
    const fallback = (why: string) => {
      if (stale) return stale.value;
      throw new Error(why);
    };
    if (now() < this.downUntil)
      return fallback("Open Food Facts is being left alone after an error");
    if (req.search && !this.takeSearch())
      return fallback("Open Food Facts search budget used up");

    let flight = this.inflight.get(req.key);
    if (!flight) {
      flight = this.fetchWithRetry(req.url).finally(() =>
        this.inflight.delete(req.key),
      );
      this.inflight.set(req.key, flight);
    }
    try {
      const value = await (signal ? raceAbort(flight, signal) : flight);
      this.store(req.key, value);
      return value;
    } catch (error) {
      if (signal?.aborted) throw error;
      this.downUntil = now() + this.o.cooldownMs;
      return fallback(
        error instanceof Error ? error.message : "Open Food Facts failed",
      );
    }
  }

  /** true when a search may be sent now; counts it */
  private takeSearch(): boolean {
    const t = this.o.now();
    while (this.searchTimes.length && t - this.searchTimes[0] >= 60_000)
      this.searchTimes.shift();
    if (this.searchTimes.length >= this.o.searchesPerMinute) return false;
    this.searchTimes.push(t);
    return true;
  }

  private store(key: string, value: unknown) {
    if (this.cache.size >= this.o.maxEntries && !this.cache.has(key))
      this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key, { at: this.o.now(), value });
  }

  private async fetchWithRetry(url: string): Promise<unknown> {
    try {
      return await this.fetchOnce(url);
    } catch (error) {
      const wait = error instanceof RetryError ? error.afterMs : 500;
      // a little jitter so concurrent retries don't land together
      await this.o.sleep(
        Math.min(wait, 2000) + Math.floor(Math.random() * 200),
      );
      return this.fetchOnce(url);
    }
  }

  private async fetchOnce(url: string): Promise<unknown> {
    const res = await this.o.fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(this.o.timeoutMs),
    });
    if (res.status === 404) return null;
    // the search is sometimes switched off for load: an HTML error page, not JSON
    if (!res.ok || !(res.headers.get("content-type") ?? "").includes("json")) {
      const seconds = Number(res.headers.get("retry-after"));
      throw new RetryError(
        `Open Food Facts answered ${res.status}`,
        Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : 500,
      );
    }
    return res.json();
  }
}

class RetryError extends Error {
  constructor(
    message: string,
    readonly afterMs: number,
  ) {
    super(message);
  }
}

/** stops waiting when the caller leaves; the shared request carries on for anyone else */
function raceAbort<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) return Promise.reject(signal.reason);
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => reject(signal.reason);
    signal.addEventListener("abort", onAbort, { once: true });
    promise
      .then(resolve, reject)
      .finally(() => signal.removeEventListener("abort", onAbort));
  });
}

/** one client for the whole server process, so every request shares the cache and the budget */
export const off = new OffClient();
