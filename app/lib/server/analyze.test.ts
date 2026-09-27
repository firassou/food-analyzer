import OpenAI from "openai";
import { afterEach, describe, expect, it, vi } from "vitest";

type Chunk = { choices: { delta: { content?: string; reasoning_content?: string }; finish_reason?: string | null }[] };
type Script = (signal: AbortSignal) => AsyncIterable<Chunk>;
const scripts: Script[] = [];
// cooldowns are module state: give every test its own model names
let run = 0;

// each target replays one script; like the SDK, a stream that is aborted after it started ends quietly
vi.mock("./models", async (importOriginal) => {
  const real = await importOriginal<typeof import("./models")>();
  const target = (i: number) => ({
    provider: i === 0 ? "huggingface" : "nvidia",
    model: `run${run}-m${i}`,
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
  run++;
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
    expect(meta.model).toBe(`run${run}-m1`);
  });

  it("stops with 499 when the client cancels mid-stream", async () => {
    const ctrl = new AbortController();
    scripts.push(stallsAfter(chunk("{")));
    const run = analyzeLabel("data:image/jpeg;base64,", ctrl.signal).catch((e) => e);
    setTimeout(() => ctrl.abort(), 10);
    expect(await run).toMatchObject({ status: 499 });
  });
});

const rateLimited = (retryAfter?: string): Script =>
  async function* () {
    throw new OpenAI.RateLimitError(429, { message: "slow down" }, "429 slow down", new Headers(retryAfter ? { "retry-after": retryAfter } : {}));
  };
const answers = (name: string): Script =>
  async function* () {
    yield chunk(ANSWER.replace("Test bar", name), undefined, "stop");
  };

describe("limits and fallbacks", () => {
  it("switches to the next model when one is rate-limited, and skips it on the next request", async () => {
    let calls = 0;
    const limitedOnce: Script = (signal) => {
      calls++;
      return rateLimited("30")(signal);
    };
    scripts.push(limitedOnce, answers("Second"));
    const first = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    expect(first.result.product.name).toBe("Second");
    expect(first.meta.trace?.[0]).toMatch(/rate_limited/);

    // the limited model is cooling down: the next request goes straight to the working one
    const second = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    expect(second.result.product.name).toBe("Second");
    expect(second.meta.attempts).toBe(1);
    expect(calls).toBe(1);
  });

  it("still tries models that are cooling down when nothing else works", async () => {
    scripts.push(rateLimited("600"));
    await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal).catch(() => {});
    scripts[0] = answers("Recovered");
    const { result } = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    expect(result.product.name).toBe("Recovered");
  });

  it("doesn't let instant limit errors use up the attempt budget", async () => {
    for (let i = 0; i < 5; i++) scripts.push(rateLimited());
    scripts.push(answers("Sixth"));
    const { result, meta } = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal);
    expect(result.product.name).toBe("Sixth");
    expect(meta.attempts).toBe(6);
  });

  it("reports rate_limited when every model is limited", async () => {
    scripts.push(rateLimited(), rateLimited());
    const err = await analyzeLabel("data:image/jpeg;base64,", new AbortController().signal).catch((e) => e);
    expect(err).toMatchObject({ code: "rate_limited", status: 503 });
  });
});
