import "server-only";
import { normalize } from "../analysis/normalize";
import { parseModelJson } from "../analysis/parse";
import { SYSTEM_PROMPT, USER_PROMPT } from "../analysis/prompt";
import type { AnalyzeErrorCode, AnalyzeMeta, LabelAnalysis } from "../analysis/types";
import { classify, describe, type FailureKind, getTargets, StallError, type Target } from "./models";

// Budget ordering must hold: DEADLINE_MS < route maxDuration (120 s) < client timeout (150 s).
/** total time budget for one analysis, across every attempt */
const DEADLINE_MS = 115_000;
/** a model that hasn't started answering by then is considered stuck */
const FIRST_TOKEN_MS = 35_000;
/** …and one that stops streaming for this long, too */
const IDLE_MS = 20_000;
/** don't start another attempt with less time than this left */
const MIN_ATTEMPT_MS = 12_000;
const MAX_ATTEMPTS = 4;
const MAX_TOKENS = 6000;

const DEV = process.env.NODE_ENV !== "production";

export class AnalyzeError extends Error {
  constructor(
    message: string,
    public code: AnalyzeErrorCode,
    public status: number,
    public trace?: string[],
  ) {
    super(message);
  }
}

interface Attempt {
  target: Target;
  outcome: "ok" | FailureKind | "no_json" | "truncated";
  ms: number;
  detail?: string;
}

const cancelled = () => new AnalyzeError("The request was cancelled.", "bad_request", 499);

/**
 * Runs the photo through the model chain until one returns a complete JSON answer.
 * Never gives up while a model can still answer: truncated answers are repaired and
 * kept as a fallback, non-JSON answers still produce a (flagged) result.
 */
export async function analyzeLabel(
  imageDataUrl: string,
  signal: AbortSignal,
): Promise<{ result: LabelAnalysis; meta: AnalyzeMeta }> {
  const targets = getTargets();
  if (targets.length === 0) {
    throw new AnalyzeError(
      "The server has no AI provider configured. Set HF_TOKEN (and optionally NVIDIA_API_KEY) in .env.local.",
      "not_configured",
      503,
    );
  }

  const started = Date.now();
  const attempts: Attempt[] = [];
  const deadProviders = new Set<Target["provider"]>();
  // the best incomplete result so far, used if nothing better arrives
  let fallback: { result: LabelAnalysis; target: Target } | null = null;

  for (const target of targets) {
    if (signal.aborted) throw cancelled();
    if (attempts.length >= MAX_ATTEMPTS) break;
    if (deadProviders.has(target.provider)) continue;
    const remaining = DEADLINE_MS - (Date.now() - started);
    if (remaining < MIN_ATTEMPT_MS) break;

    const t0 = Date.now();
    try {
      const { content, finish } = await streamCompletion(target, imageDataUrl, signal, remaining);
      const ms = Date.now() - t0;
      const parsed = parseModelJson(content);

      if (!parsed) {
        attempts.push({ target, outcome: "no_json", ms, detail: content.slice(0, 120) });
        log(target, `no JSON in ${ms}ms (finish=${finish})`, content.slice(0, 200));
        continue;
      }

      const truncated = parsed.repaired || finish === "length" || finish === "stalled";
      const result = normalize(parsed.value, { repaired: truncated });
      log(target, `${truncated ? "partial" : "ok"} in ${ms}ms (finish=${finish}, ${content.length} chars)`);

      if (!truncated) {
        attempts.push({ target, outcome: "ok", ms });
        return { result, meta: meta(target, attempts, started) };
      }
      // incomplete: keep it, and try the next model if there's time for a complete one
      attempts.push({ target, outcome: "truncated", ms, detail: String(finish) });
      if (!fallback || score(result) > score(fallback.result)) fallback = { result, target };
    } catch (error) {
      const kind = classify(error);
      const ms = Date.now() - t0;
      attempts.push({ target, outcome: kind, ms, detail: describe(error) });
      log(target, `failed after ${ms}ms: ${kind}`, describe(error));
      if (kind === "aborted" || signal.aborted) throw cancelled();
      if (kind === "auth" || kind === "quota") deadProviders.add(target.provider);
    }
  }

  if (fallback) return { result: fallback.result, meta: meta(fallback.target, attempts, started) };

  // models answered, but never in JSON (refusal or a free-text description): still answer
  const textAnswer = attempts.find((a) => a.outcome === "no_json");
  if (textAnswer) {
    const result = normalize({ label_detected: false });
    result.warnings = [
      "The AI couldn't produce a structured reading of this photo. Try a sharper, well-lit photo of the ingredient list or nutrition table.",
    ];
    return { result, meta: meta(textAnswer.target, attempts, started) };
  }

  const failure = summarizeFailure(attempts);
  if (DEV) failure.trace = traceOf(attempts);
  throw failure;
}

/**
 * Streams one completion with a watchdog: fails fast when the model never starts
 * or stalls, but lets a slow-yet-progressing answer finish. A stall after some
 * output returns the partial text so it can be repaired.
 */
async function streamCompletion(
  target: Target,
  imageDataUrl: string,
  outer: AbortSignal,
  budgetMs: number,
): Promise<{ content: string; finish: string | null }> {
  const ctrl = new AbortController();
  let stall: StallError | null = null;
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  const arm = (ms: number, phase: StallError["phase"]) => {
    clearTimeout(watchdog);
    watchdog = setTimeout(() => {
      stall = new StallError(phase, ms);
      ctrl.abort();
    }, ms);
  };
  const hardStop = setTimeout(() => {
    stall = new StallError("deadline", budgetMs);
    ctrl.abort();
  }, budgetMs);
  const onOuterAbort = () => ctrl.abort();
  outer.addEventListener("abort", onOuterAbort, { once: true });
  if (outer.aborted) ctrl.abort();
  arm(Math.min(FIRST_TOKEN_MS, budgetMs), "first_token");

  let content = "";
  let finish: string | null = null;
  try {
    const stream = await target.client.chat.completions.create(
      {
        model: target.model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          {
            role: "user",
            content: [
              { type: "image_url", image_url: { url: imageDataUrl } },
              { type: "text", text: USER_PROMPT },
            ],
          },
        ],
        temperature: 0.1,
        max_tokens: MAX_TOKENS,
        stream: true,
      },
      { signal: ctrl.signal },
    );
    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta as { content?: unknown; reasoning_content?: unknown } | undefined;
      if (typeof delta?.content === "string" && delta.content) {
        content += delta.content;
        arm(IDLE_MS, "stalled");
      } else if (typeof delta?.reasoning_content === "string" && delta.reasoning_content) {
        // reasoning models think before answering: that's progress too
        arm(IDLE_MS, "stalled");
      }
      if (choice?.finish_reason) finish = choice.finish_reason;
    }
    return { content, finish };
  } catch (error) {
    if (outer.aborted) throw error;
    if (stall) {
      if (content.trim()) return { content, finish: "stalled" };
      throw stall;
    }
    throw error;
  } finally {
    clearTimeout(watchdog);
    clearTimeout(hardStop);
    outer.removeEventListener("abort", onOuterAbort);
  }
}

/** prefer results with more extracted content */
function score(r: LabelAnalysis): number {
  return r.ingredients.length * 2 + (r.nutrition ? 10 : 0) + (r.product.name ? 3 : 0) + r.allergens.length;
}

function summarizeFailure(attempts: Attempt[]): AnalyzeError {
  const kinds = new Set(attempts.map((a) => a.outcome));
  const only = (...k: Attempt["outcome"][]) => kinds.size > 0 && [...kinds].every((x) => k.includes(x));
  if (only("auth"))
    return new AnalyzeError(
      "The AI provider rejected the server's API key. Check HF_TOKEN / NVIDIA_API_KEY.",
      "upstream_auth",
      502,
    );
  if (only("quota", "auth"))
    return new AnalyzeError(
      "The AI provider's credits are exhausted. Top up the account or add another provider key.",
      "upstream_quota",
      502,
    );
  if (kinds.has("rate_limited"))
    return new AnalyzeError(
      "The AI service is busy right now. Please wait a few seconds and try again.",
      "rate_limited",
      503,
    );
  if (attempts.length === 0 || kinds.has("timeout"))
    return new AnalyzeError("The AI took too long to respond. Please try again in a moment.", "timeout", 504);
  return new AnalyzeError(
    "The AI service is temporarily unavailable. Please try again shortly.",
    "upstream_unavailable",
    502,
  );
}

function traceOf(attempts: Attempt[]) {
  return attempts.map(
    (a) => `${a.target.provider}/${a.target.model}: ${a.outcome} in ${a.ms}ms${a.detail ? ` (${a.detail})` : ""}`,
  );
}

function meta(target: Target, attempts: Attempt[], started: number): AnalyzeMeta {
  return {
    model: target.model,
    provider: target.provider,
    attempts: attempts.length,
    duration_ms: Date.now() - started,
    ...(DEV && { trace: traceOf(attempts) }),
  };
}

function log(target: Target, msg: string, extra?: string) {
  console.log(`[analyze] ${target.provider}/${target.model}: ${msg}${extra ? ` — ${extra.replace(/\s+/g, " ")}` : ""}`);
}
