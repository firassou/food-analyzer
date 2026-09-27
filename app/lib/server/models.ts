import "server-only";
import OpenAI from "openai";

type Env = Record<string, string | undefined>;

/**
 * Every provider speaks the OpenAI chat API. A provider joins the chain when its key is set;
 * its models (comma-separated env overrides) are tried in order.
 */
const PROVIDERS = {
  huggingface: {
    key: "HF_TOKEN",
    baseURL: "https://router.huggingface.co/v1",
    models: (env: Env) => [
      ...list(env.HF_MODEL || "Qwen/Qwen3-VL-30B-A3B-Instruct"),
      ...list(env.HF_FALLBACK_MODELS ?? "Qwen/Qwen3-VL-235B-A22B-Instruct"),
    ],
  },
  nvidia: {
    key: "NVIDIA_API_KEY",
    baseURL: "https://integrate.api.nvidia.com/v1",
    models: (env: Env) => list(env.NVIDIA_MODEL || "google/gemma-4-31b-it"),
  },
  // free tiers (rate-limited per minute and per day)
  gemini: {
    key: "GEMINI_API_KEY",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    models: (env: Env) => list(env.GEMINI_MODEL || "gemini-3.8-flash,gemini-3.5-flash-lite"),
  },
  groq: {
    key: "GROQ_API_KEY",
    baseURL: "https://api.groq.com/openai/v1",
    models: (env: Env) => list(env.GROQ_MODEL || "qwen/qwen3.8-27b"),
  },
  openrouter: {
    key: "OPENROUTER_API_KEY",
    baseURL: "https://openrouter.ai/api/v1",
    models: (env: Env) => list(env.OPENROUTER_MODEL || "google/gemma-4-31b-it:free,google/gemma-4-26b-a4b-it:free"),
    headers: { "X-Title": "Food Analyzer" },
  },
} satisfies Record<string, { key: string; baseURL: string; models: (env: Env) => string[]; headers?: Record<string, string> }>;

export type ProviderId = keyof typeof PROVIDERS;
/** Part A order; PROVIDER_ORDER (comma-separated) reorders it, and providers left out go last */
const DEFAULT_ORDER: ProviderId[] = ["huggingface", "nvidia", "gemini", "groq", "openrouter"];

export interface Target {
  provider: ProviderId;
  model: string;
  client: OpenAI;
}

const list = (v: string | undefined) =>
  (v ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export function providerOrder(env: Env): ProviderId[] {
  const wanted = list(env.PROVIDER_ORDER).filter((p): p is ProviderId => p in PROVIDERS);
  return [...new Set([...wanted, ...DEFAULT_ORDER])];
}

/** the ordered model chain for an environment (pure apart from building clients) */
export function buildTargets(env: Env): Target[] {
  const targets: Target[] = [];
  for (const provider of providerOrder(env)) {
    const def: (typeof PROVIDERS)[ProviderId] = PROVIDERS[provider];
    const apiKey = env[def.key];
    if (!apiKey) continue;
    const client = new OpenAI({
      apiKey,
      baseURL: def.baseURL,
      maxRetries: 0, // retrying means moving to the next target
      ...("headers" in def && { defaultHeaders: def.headers }),
    });
    for (const model of new Set(def.models(env))) targets.push({ provider, model, client });
  }
  return targets;
}

let cached: Target[] | null = null;

export function getTargets(): Target[] {
  return (cached ??= buildTargets(process.env));
}

// ---- cooldowns: a model that just hit a limit is skipped by later requests until it resets

const cooldowns = new Map<string, number>();
const targetKey = (t: Pick<Target, "provider" | "model">) => `${t.provider}/${t.model}`;

export function coolingDown(t: Target, now = Date.now()): boolean {
  const until = cooldowns.get(targetKey(t));
  if (until === undefined) return false;
  if (until > now) return true;
  cooldowns.delete(targetKey(t));
  return false;
}

/** how long to skip a target after a failure; null = don't skip it next time */
export function cooldownMs(kind: FailureKind, error: unknown): number | null {
  if (kind === "rate_limited") return retryAfterMs(error) ?? 60_000;
  // "overloaded, try again later": skip it for a short while instead of paying its latency every time
  if (error instanceof OpenAI.APIError && error.status === 503) return retryAfterMs(error) ?? 30_000;
  if (kind === "quota" || kind === "auth") return 60 * 60_000;
  return null;
}

export function coolDown(t: Target, ms: number, now = Date.now()) {
  cooldowns.set(targetKey(t), now + ms);
}

/** Retry-After (seconds or an HTTP date), capped at a day */
function retryAfterMs(error: unknown): number | null {
  if (!(error instanceof OpenAI.APIError)) return null;
  const raw = error.headers?.get?.("retry-after");
  if (!raw) return null;
  const ms = /^\d+(\.\d+)?$/.test(raw) ? Number(raw) * 1000 : Date.parse(raw) - Date.now();
  return Number.isFinite(ms) && ms > 0 ? Math.min(ms, 24 * 60 * 60_000) : null;
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
    // some providers (Gemini) answer a bad key with 400 instead of 401
    if (s === 400 && /api[ _-]?key/i.test(error.message)) return "auth";
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
