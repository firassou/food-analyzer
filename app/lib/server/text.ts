import "server-only";
import { AnalyzeError } from "./analyze";
import { classify, coolDown, cooldownMs, coolingDown, describe, getTargets, type FailureKind } from "./models";

type Message = { role: "system" | "user" | "assistant"; content: string };

const INSTANT_FAILURES = new Set<FailureKind | "empty">(["auth", "quota", "rate_limited", "bad_request"]);

/**
 * One short text completion through the provider chain (no image): the first model whose
 * answer `accept` takes wins. Models that hit a limit are cooled down for later requests,
 * exactly as for an analysis. Throws an AnalyzeError the routes can pass on.
 */
export async function completeText<T>(
  messages: Message[],
  opts: { label: string; deadlineMs: number; attemptMs: number; minAttemptMs?: number; maxAttempts?: number; maxTokens: number; temperature: number },
  accept: (text: string) => T | null,
  signal: AbortSignal,
): Promise<{ value: T; model: string; provider: string }> {
  const targets = getTargets();
  if (targets.length === 0) throw new AnalyzeError("The server has no AI provider configured.", "not_configured", 503);
  const { label, deadlineMs, attemptMs, minAttemptMs = 8_000, maxAttempts = 3, maxTokens, temperature } = opts;
  const started = Date.now();
  const kinds: (FailureKind | "empty")[] = [];
  const deadProviders = new Set<string>();
  const ordered = [...targets.filter((t) => !coolingDown(t)), ...targets.filter((t) => coolingDown(t))];
  const cancelled = () => new AnalyzeError("The request was cancelled.", "bad_request", 499);

  for (const target of ordered) {
    if (signal.aborted) throw cancelled();
    if (kinds.filter((k) => !INSTANT_FAILURES.has(k)).length >= maxAttempts) break;
    if (deadProviders.has(target.provider)) continue;
    const remaining = deadlineMs - (Date.now() - started);
    if (remaining < minAttemptMs) break;

    try {
      const completion = await target.client.chat.completions.create(
        { model: target.model, messages, temperature, max_tokens: maxTokens },
        { signal: AbortSignal.any([signal, AbortSignal.timeout(Math.min(attemptMs, remaining))]) },
      );
      const value = accept(completion.choices?.[0]?.message?.content ?? "");
      if (value !== null) return { value, model: target.model, provider: target.provider };
      kinds.push("empty");
      console.log(`[${label}] ${target.provider}/${target.model}: unusable answer`);
    } catch (error) {
      if (signal.aborted) throw cancelled();
      const kind = classify(error);
      kinds.push(kind);
      console.log(`[${label}] ${target.provider}/${target.model}: ${kind} — ${describe(error).replace(/\s+/g, " ")}`);
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
