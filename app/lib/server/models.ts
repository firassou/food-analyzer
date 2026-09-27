import "server-only";
import OpenAI from "openai";

export interface Target {
  provider: "huggingface" | "nvidia";
  model: string;
  client: OpenAI;
}

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

let cached: Target[] | null = null;

/**
 * Ordered list of vision models to try. Hugging Face first (primary + fallbacks),
 * then NVIDIA as an independent provider when a key is configured.
 * Override with HF_MODEL, HF_FALLBACK_MODELS, NVIDIA_MODEL (comma-separated).
 */
export function getTargets(): Target[] {
  if (cached) return cached;
  const targets: Target[] = [];

  if (process.env.HF_TOKEN) {
    const client = new OpenAI({
      apiKey: process.env.HF_TOKEN,
      baseURL: "https://router.huggingface.co/v1",
      maxRetries: 0, // retrying means moving to the next target
    });
    const models = [
      ...list(process.env.HF_MODEL || "Qwen/Qwen3-VL-30B-A3B-Instruct"),
      ...list(process.env.HF_FALLBACK_MODELS ?? "Qwen/Qwen3-VL-235B-A22B-Instruct"),
    ];
    for (const model of new Set(models)) targets.push({ provider: "huggingface", model, client });
  }

  if (process.env.NVIDIA_API_KEY) {
    const client = new OpenAI({
      apiKey: process.env.NVIDIA_API_KEY,
      baseURL: "https://integrate.api.nvidia.com/v1",
      maxRetries: 0,
    });
    for (const model of new Set(list(process.env.NVIDIA_MODEL || "google/gemma-4-31b-it")))
      targets.push({ provider: "nvidia", model, client });
  }

  cached = targets;
  return targets;
}

export type FailureKind =
  | "auth" // bad or expired key: skip every model of this provider
  | "quota" // out of credits: skip this provider
  | "rate_limited"
  | "unavailable" // model not served or provider down: try the next model
  | "bad_request" // provider rejected the payload: try the next model
  | "timeout"
  | "aborted"; // the user cancelled: stop everything

/** the model didn't start answering, stopped mid-answer, or ran out of time */
export class StallError extends Error {
  constructor(
    public phase: "first_token" | "stalled" | "deadline",
    ms: number,
  ) {
    super(
      phase === "first_token"
        ? `no response within ${ms}ms`
        : phase === "stalled"
          ? `stream stalled for ${ms}ms`
          : `exceeded the ${ms}ms budget`,
    );
  }
}

export function classify(error: unknown): FailureKind {
  if (error instanceof StallError) return "timeout";
  if (error instanceof OpenAI.APIUserAbortError) return "aborted";
  if (error instanceof OpenAI.APIConnectionTimeoutError) return "timeout";
  if (error instanceof OpenAI.APIConnectionError) return "unavailable";
  if (error instanceof OpenAI.APIError) {
    const s = error.status ?? 0;
    if (s === 401) return "auth";
    // 403 is often model-specific (gated model, provider policy): skip just this model
    if (s === 403) return "unavailable";
    if (s === 402) return "quota";
    if (s === 429) return "rate_limited";
    if (s === 400 || s === 413 || s === 422) return "bad_request";
    return "unavailable";
  }
  if (error instanceof Error && error.name === "AbortError") return "aborted";
  return "unavailable";
}

export function describe(error: unknown): string {
  const text =
    error instanceof OpenAI.APIError
      ? `${error.status ?? "?"} ${error.message}`
      : error instanceof Error
        ? error.message
        : String(error);
  return text.slice(0, 300);
}
