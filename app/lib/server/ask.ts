import "server-only";
import { askSystemPrompt, cleanAnswer, digestForAsk, digestForCabinet, kindOf } from "../analysis/ask";
import type { ChatTurn } from "../analysis/types";
import type { Locale } from "../i18n/locales";
import { AnalyzeError } from "./analyze";
import { classify, coolDown, cooldownMs, coolingDown, describe, getTargets, type FailureKind } from "./models";

// Budget ordering must hold: DEADLINE_MS < route maxDuration (60 s) < client timeout (75 s).
const DEADLINE_MS = 50_000;
/** one model gets this long for a short text answer */
const ATTEMPT_MS = 25_000;
const MIN_ATTEMPT_MS = 8_000;
const MAX_ATTEMPTS = 3;
const MAX_TOKENS = 1500;
const INSTANT_FAILURES = new Set<FailureKind | "empty">(["auth", "quota", "rate_limited", "bad_request"]);

/**
 * Answers one follow-up question about a scanned product, using the same provider chain as
 * the analysis. Text only: the photo isn't sent, the analysis stands in for it.
 */
export async function askAboutProduct(
  input: { question: string; history: ChatTurn[]; result: unknown; locale: Locale; cabinet?: unknown[] },
  signal: AbortSignal,
): Promise<{ answer: string; model: string; provider: string }> {
  const targets = getTargets();
  if (targets.length === 0) {
    throw new AnalyzeError("The server has no AI provider configured.", "not_configured", 503);
  }
  const system = input.cabinet
    ? askSystemPrompt(input.locale, digestForCabinet(input.cabinet), "cabinet")
    : askSystemPrompt(input.locale, digestForAsk(input.result), kindOf(input.result));
  const started = Date.now();
  const kinds: (FailureKind | "empty")[] = [];
  const deadProviders = new Set<string>();
  const ordered = [...targets.filter((t) => !coolingDown(t)), ...targets.filter((t) => coolingDown(t))];

  for (const target of ordered) {
    if (signal.aborted) throw new AnalyzeError("The request was cancelled.", "bad_request", 499);
    if (kinds.filter((k) => !INSTANT_FAILURES.has(k)).length >= MAX_ATTEMPTS) break;
    if (deadProviders.has(target.provider)) continue;
    const remaining = DEADLINE_MS - (Date.now() - started);
    if (remaining < MIN_ATTEMPT_MS) break;

    try {
      const completion = await target.client.chat.completions.create(
        {
          model: target.model,
          messages: [
            { role: "system", content: system },
            ...input.history.map((t) => ({ role: t.role, content: t.text })),
            { role: "user", content: input.question },
          ],
          temperature: 0.3,
          max_tokens: MAX_TOKENS,
        },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(ATTEMPT_MS, remaining))]) },
      );
      const answer = cleanAnswer(completion.choices?.[0]?.message?.content ?? "");
      if (answer) return { answer, model: target.model, provider: target.provider };
      kinds.push("empty");
      console.log(`[ask] ${target.provider}/${target.model}: empty answer`);
    } catch (error) {
      if (signal.aborted) throw new AnalyzeError("The request was cancelled.", "bad_request", 499);
      const kind = classify(error);
      kinds.push(kind);
      console.log(`[ask] ${target.provider}/${target.model}: ${kind} — ${describe(error).replace(/\s+/g, " ")}`);
      const cooldown = cooldownMs(kind, error);
      const accountWide = kind === "auth" || kind === "quota";
      if (accountWide) deadProviders.add(target.provider);
      if (cooldown !== null) {
        for (const t of accountWide ? targets.filter((x) => x.provider === target.provider) : [target]) coolDown(t, cooldown);
      }
    }
  }

  if (kinds.length > 0 && kinds.every((k) => k === "auth" || k === "quota")) {
    throw new AnalyzeError("Every AI provider is out of credits or free quota. Try again later.", "upstream_quota", 502);
  }
  if (kinds.includes("rate_limited")) {
    throw new AnalyzeError("The AI service is busy right now. Please wait a few seconds and try again.", "rate_limited", 503);
  }
  if (kinds.length === 0 || kinds.includes("timeout")) {
    throw new AnalyzeError("The AI took too long to respond. Please try again in a moment.", "timeout", 504);
  }
  throw new AnalyzeError("The AI service is temporarily unavailable. Please try again shortly.", "upstream_unavailable", 502);
}
