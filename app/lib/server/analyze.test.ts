import { afterEach, describe, expect, it, vi } from "vitest";

type Chunk = { choices: { delta: { content?: string; reasoning_content?: string }; finish_reason?: string | null }[] };
type Script = (signal: AbortSignal) => AsyncIterable<Chunk>;
const scripts: Script[] = [];

// each target replays one script; like the SDK, a stream that is aborted after it started ends quietly
vi.mock("./models", async (importOriginal) => {
  const real = await importOriginal<typeof import("./models")>();
  const target = (i: number) => ({
    provider: i === 0 ? "huggingface" : "nvidia",
    model: `m${i}`,
    client: { chat: { completions: { create: async (_: unknown, o: { signal: AbortSignal }) => scripts[i](o.signal) } } },
  });
  return { ...real, getTargets: () => scripts.map((_, i) => target(i)) };
});

const { analyzeLabel } = await import("./analyze");

const chunk = (content?: string, reasoning?: string, finish: string | null = null): Chunk => ({
  choices: [{ delta: { content, reasoning_content: reasoning }, finish_reason: finish }],
});
const ANSWER = '{"label_detected": true, "product": {"name": "Test bar"}, "ingredients": [{"name": "sugar"}]}';

/** sends `before`, then goes silent until aborted, then ends without throwing */
const stallsAfter = (...before: Chunk[]): Script =>
  async function* (signal) {
    yield* before;
    await new Promise((resolve) => signal.addEventListener("abort", resolve, { once: true }));
  };

afterEach(() => {
  scripts.length = 0;
  vi.useRealTimers();
});

describe("analyzeLabel", () => {
  it("treats a stream that goes quiet after headers as a timeout, not a text answer", async () => {
    vi.useFakeTimers();
    scripts.push(stallsAfter());
    const run = analyzeLabel("data:image/jpeg;base64,", new AbortController().signal).catch((e) => e);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(await run).toMatchObject({ code: "timeout", status: 504 });
  });

  it("keeps a partial answer from a stalled stream as a repaired fallback", async () => {
    vi.useFakeTimers();
    scripts.push(stallsAfter(chunk('{"label_detected": true, "product": {"name": "Half')));
    const run = analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    await vi.advanceTimersByTimeAsync(120_000);
    const { result, meta } = await run;
    expect(result.product.name).toBe("Half");
    expect(result.warnings.join(" ")).toMatch(/cut short/);
    expect(meta.attempts).toBe(1);
  });

  it("uses an answer found only in the reasoning channel, as a fallback", async () => {
    scripts.push(async function* () {
      yield chunk(undefined, 'Let me think. Draft: {"x": 1}. Final: ' + ANSWER);
      yield chunk("", undefined, "stop");
    });
    const { result, meta } = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    expect(result.product.name).toBe("Test bar");
    expect(meta.trace?.[0]).toMatch(/truncated.*answer in reasoning/);
  });

  it("prefers a later model's complete answer over a reasoning-only one", async () => {
    scripts.push(async function* () {
      yield chunk(undefined, ANSWER, "stop");
    });
    scripts.push(async function* () {
      yield chunk(ANSWER.replace("Test bar", "Complete bar"), undefined, "stop");
    });
    const { result, meta } = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    expect(result.product.name).toBe("Complete bar");
    expect(meta.model).toBe("m1");
  });

  it("stops with 499 when the client cancels mid-stream", async () => {
    const ctrl = new AbortController();
    scripts.push(stallsAfter(chunk("{")));
    const run = analyzeLabel("data:image/jpeg;base64,", ctrl.signal).catch((e) => e);
    setTimeout(() => ctrl.abort(), 10);
    expect(await run).toMatchObject({ status: 499 });
  });
});
