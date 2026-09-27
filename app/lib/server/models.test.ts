import OpenAI from "openai";
import { describe, expect, it } from "vitest";
import { buildTargets, classify, cooldownMs, providerOrder } from "./models";

const chain = (env: Record<string, string>) => buildTargets(env).map((t) => `${t.provider}/${t.model}`);

describe("buildTargets", () => {
  it("keeps the Part A order and defaults when only HF and NVIDIA are set", () => {
    expect(chain({ HF_TOKEN: "x", NVIDIA_API_KEY: "y" })).toEqual([
      "huggingface/Qwen/Qwen3-VL-30B-A3B-Instruct",
      "huggingface/Qwen/Qwen3-VL-235B-A22B-Instruct",
      "nvidia/google/gemma-4-31b-it",
    ]);
  });

  it("adds free tiers whose keys are set, in PROVIDER_ORDER", () => {
    expect(
      chain({ PROVIDER_ORDER: "groq, gemini", GEMINI_API_KEY: "g", GROQ_API_KEY: "q", HF_TOKEN: "h", HF_FALLBACK_MODELS: "" }),
    ).toEqual([
      "groq/qwen/qwen3.8-27b",
      "gemini/gemini-3.8-flash",
      "gemini/gemini-3.5-flash-lite",
      "huggingface/Qwen/Qwen3-VL-30B-A3B-Instruct",
    ]);
  });

  it("ignores unknown provider names and dedupes models", () => {
    expect(providerOrder({ PROVIDER_ORDER: "bogus,openrouter" })[0]).toBe("openrouter");
    expect(chain({ OPENROUTER_API_KEY: "o", OPENROUTER_MODEL: "a:free, a:free,b:free" })).toEqual([
      "openrouter/a:free",
      "openrouter/b:free",
    ]);
  });

  it("builds nothing without keys", () => {
    expect(buildTargets({})).toEqual([]);
  });
});

describe("classify and cooldowns", () => {
  const err = (status: number, message: string, headers: Record<string, string> = {}) =>
    OpenAI.APIError.generate(status, { message }, message, new Headers(headers));

  it("maps a 400 bad-key answer (Gemini) to auth", () => {
    expect(classify(err(400, "API key not valid. Please pass a valid API key."))).toBe("auth");
    expect(classify(err(400, "Image too large"))).toBe("bad_request");
  });

  it("uses Retry-After for rate limits and a long pause for quota and auth", () => {
    expect(cooldownMs("rate_limited", err(429, "slow", { "retry-after": "12" }))).toBe(12_000);
    expect(cooldownMs("rate_limited", err(429, "slow"))).toBe(60_000);
    expect(cooldownMs("quota", err(402, "credits"))).toBe(3_600_000);
    expect(cooldownMs("timeout", new Error("x"))).toBeNull();
    expect(cooldownMs("unavailable", err(503, "high demand"))).toBe(30_000);
    expect(cooldownMs("unavailable", err(500, "boom"))).toBeNull();
  });
});
