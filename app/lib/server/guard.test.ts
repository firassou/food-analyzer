import { describe, expect, it } from "vitest";
import { crossSite, readText } from "./guard";
import { clientKey, makeLimiter, MemoryRateLimiter, UpstashRateLimiter } from "./rateLimit";

const req = (headers: Record<string, string>, body?: string) =>
  new Request("http://localhost:3000/api/ask", { method: "POST", headers, body });

describe("crossSite", () => {
  it("lets through a request with no Origin (curl, same-origin GET) and the app's own origin", () => {
    expect(crossSite(req({ host: "app.test" }))).toBe(false);
    expect(crossSite(req({ host: "app.test", origin: "https://app.test" }))).toBe(false);
    expect(crossSite(req({ "x-forwarded-host": "app.test", host: "internal:3000", origin: "https://app.test" }))).toBe(false);
  });
  it("refuses another site's page and a garbled Origin", () => {
    expect(crossSite(req({ host: "app.test", origin: "https://evil.example" }))).toBe(true);
    expect(crossSite(req({ host: "app.test", origin: "not a url" }))).toBe(true);
    expect(crossSite(req({ origin: "https://app.test" }))).toBe(true);
  });
});

describe("readText", () => {
  it("reads a body within the limit", async () => {
    expect(await readText(req({}, "hello"), 10)).toBe("hello");
  });
  it("refuses a body over the limit, whatever Content-Length says", async () => {
    expect(await readText(req({}, "x".repeat(50)), 10)).toBeNull();
    expect(await readText(req({ "content-length": "5000" }, "x"), 10)).toBeNull();
  });
});

describe("clientKey", () => {
  it("trusts what the platform sets over what a client can write", () => {
    expect(clientKey(req({ "x-vercel-forwarded-for": "1.1.1.1", "x-forwarded-for": "6.6.6.6, 2.2.2.2" }))).toBe("1.1.1.1");
    expect(clientKey(req({ "x-real-ip": "3.3.3.3", "x-forwarded-for": "6.6.6.6" }))).toBe("3.3.3.3");
  });
  it("falls back to the last hop, never the first one a client can forge", () => {
    expect(clientKey(req({ "x-forwarded-for": "6.6.6.6, 7.7.7.7, 2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientKey(req({}))).toBe("local");
  });
});

describe("limiters", () => {
  const cfg = { url: "https://redis.test/", token: "t", prefix: "fa:x" };
  const answer = (count: unknown, ok = true) => (async () => new Response(JSON.stringify([{ result: count }, { result: 1 }]), { status: ok ? 200 : 500 })) as typeof fetch;

  it("counts in the shared store and refuses past the maximum", async () => {
    const calls: { url: string; body: string; auth: string | null }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, body: String(init.body), auth: new Headers(init.headers).get("authorization") });
      return new Response(JSON.stringify([{ result: calls.length }, { result: 1 }]));
    }) as unknown as typeof fetch;
    const limiter = new UpstashRateLimiter(cfg, 2, 60_000, new MemoryRateLimiter(1, 60_000), fetcher);
    expect(await limiter.hit("a")).toBe(false);
    expect(await limiter.hit("a")).toBe(false);
    expect(await limiter.hit("a")).toBe(true);
    expect(calls[0].url).toBe("https://redis.test/pipeline");
    expect(calls[0].auth).toBe("Bearer t");
    expect(JSON.parse(calls[0].body)).toEqual([["INCR", "fa:x:a"], ["PEXPIRE", "fa:x:a", 60000, "NX"]]);
  });

  it("falls back to counting locally when the store fails or answers nonsense", async () => {
    for (const fetcher of [answer(1, false), answer("many"), (async () => { throw new Error("down"); }) as typeof fetch]) {
      const limiter = new UpstashRateLimiter(cfg, 5, 60_000, new MemoryRateLimiter(1, 60_000), fetcher);
      expect(await limiter.hit("a")).toBe(false);
      expect(await limiter.hit("a")).toBe(true); // the local fallback allows 1
    }
  });

  it("uses memory unless both Upstash variables are set", () => {
    expect(makeLimiter("x", 1, 1000, 10, {})).toBeInstanceOf(MemoryRateLimiter);
    expect(makeLimiter("x", 1, 1000, 10, { UPSTASH_REDIS_REST_URL: "https://r" })).toBeInstanceOf(MemoryRateLimiter);
    expect(makeLimiter("x", 1, 1000, 10, { UPSTASH_REDIS_REST_URL: "https://r", UPSTASH_REDIS_REST_TOKEN: "t" })).toBeInstanceOf(UpstashRateLimiter);
  });
});
