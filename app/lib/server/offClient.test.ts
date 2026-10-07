import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { OffClient } = await import("./offClient");

const json = (body: unknown) =>
  new Response(JSON.stringify(body), {
    headers: { "content-type": "application/json" },
  });
const down = (headers: Record<string, string> = {}) =>
  new Response("<html>busy</html>", { status: 503, headers });

function setup(
  responses: (() => Response)[],
  options: ConstructorParameters<typeof OffClient>[0] = {},
) {
  let t = 1_000_000;
  const calls: string[] = [];
  const fetchMock = vi.fn(async (url: string | URL | Request) => {
    calls.push(String(url));
    const next = responses.length > 1 ? responses.shift()! : responses[0];
    return next();
  });
  const client = new OffClient({
    fetch: fetchMock as unknown as typeof fetch,
    now: () => t,
    sleep: async () => undefined,
    ...options,
  });
  return { client, calls, advance: (ms: number) => (t += ms) };
}

describe("OffClient", () => {
  it("serves a fresh answer without asking again", async () => {
    const { client, calls } = setup([() => json({ a: 1 })]);
    expect(await client.getJson({ key: "k", url: "u" })).toEqual({ a: 1 });
    expect(await client.getJson({ key: "k", url: "u" })).toEqual({ a: 1 });
    expect(calls).toHaveLength(1);
  });

  it("sends one request for the same thing asked at the same time", async () => {
    const { client, calls } = setup([() => json({ a: 1 })]);
    const [x, y] = await Promise.all([
      client.getJson({ key: "k", url: "u" }),
      client.getJson({ key: "k", url: "u" }),
    ]);
    expect(x).toEqual(y);
    expect(calls).toHaveLength(1);
  });

  it("retries once after a 503", async () => {
    const { client, calls } = setup([() => down(), () => json({ ok: true })]);
    expect(await client.getJson({ key: "k", url: "u" })).toEqual({ ok: true });
    expect(calls).toHaveLength(2);
  });

  it("treats an HTML page as a failure and a 404 as an unknown product", async () => {
    const html = setup([
      () =>
        new Response("<html></html>", {
          headers: { "content-type": "text/html" },
        }),
    ]);
    await expect(html.client.getJson({ key: "k", url: "u" })).rejects.toThrow();
    const missing = setup([() => new Response("", { status: 404 })]);
    expect(await missing.client.getJson({ key: "k", url: "u" })).toBeNull();
  });

  it("serves an old answer while the service is down, then forgets it", async () => {
    const { client, advance } = setup([() => json({ v: 1 }), () => down()]);
    await client.getJson({ key: "k", url: "u" });
    advance(2 * 60 * 60 * 1000);
    expect(await client.getJson({ key: "k", url: "u" })).toEqual({ v: 1 });
    advance(30 * 60 * 60 * 1000);
    await expect(client.getJson({ key: "k", url: "u" })).rejects.toThrow();
  });

  it("leaves the service alone for a while after a failure", async () => {
    const { client, calls, advance } = setup([
      () => down(),
      () => down(),
      () => json({ ok: true }),
    ]);
    await expect(client.getJson({ key: "a", url: "u" })).rejects.toThrow();
    const sent = calls.length;
    await expect(client.getJson({ key: "b", url: "u" })).rejects.toThrow();
    expect(calls).toHaveLength(sent);
    advance(31_000);
    expect(await client.getJson({ key: "b", url: "u" })).toEqual({ ok: true });
  });

  it("stays inside the search budget and falls back to the cache", async () => {
    const { client, calls, advance } = setup([() => json({ n: 1 })], {
      searchesPerMinute: 2,
    });
    await client.getJson({ key: "s1", url: "u1", search: true });
    await client.getJson({ key: "s2", url: "u2", search: true });
    await expect(
      client.getJson({ key: "s3", url: "u3", search: true }),
    ).rejects.toThrow(/budget/);
    expect(calls).toHaveLength(2);
    // products aren't searches: no budget
    await client.getJson({ key: "p", url: "up" });
    advance(61_000);
    await client.getJson({ key: "s3", url: "u3", search: true });
    expect(calls).toHaveLength(4);
  });

  it("lets a caller leave without cancelling the shared request", async () => {
    const { client } = setup([() => json({ a: 1 })]);
    const gone = new AbortController();
    const waiting = client.getJson({ key: "k", url: "u" }, gone.signal);
    gone.abort();
    await expect(waiting).rejects.toBeDefined();
    expect(await client.getJson({ key: "k", url: "u" })).toEqual({ a: 1 });
  });
});
