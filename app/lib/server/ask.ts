import "server-only";
import { askSystemPrompt, cleanAnswer, digestForAsk, digestForCabinet, kindOf } from "../analysis/ask";
import type { AskContext } from "../analysis/askContext";
import type { ChatTurn } from "../analysis/types";
import type { Locale } from "../i18n/locales";
import { completeText } from "./text";

// Budget ordering must hold: DEADLINE_MS < route maxDuration (60 s) < client timeout (75 s).
const DEADLINE_MS = 50_000;
/** one model gets this long for a short text answer */
const ATTEMPT_MS = 25_000;
const MAX_TOKENS = 1500;

/**
 * Answers one follow-up question about a scanned product, using the same provider chain as
 * the analysis. Text only: the photo isn't sent, the analysis stands in for it.
 */
export async function askAboutProduct(
  input: { question: string; history: ChatTurn[]; result: unknown; locale: Locale; cabinet?: unknown[]; context?: AskContext },
  signal: AbortSignal,
): Promise<{ answer: string; model: string; provider: string }> {
  const system = input.cabinet
    ? askSystemPrompt(input.locale, digestForCabinet(input.cabinet), "cabinet")
    : askSystemPrompt(input.locale, digestForAsk(input.result), kindOf(input.result), input.context);
  const { value, model, provider } = await completeText(
    [
      { role: "system", content: system },
      ...input.history.map((t) => ({ role: t.role, content: t.text })),
      { role: "user", content: input.question },
    ],
    { label: "ask", deadlineMs: DEADLINE_MS, attemptMs: ATTEMPT_MS, maxTokens: MAX_TOKENS, temperature: 0.3 },
    (text) => cleanAnswer(text) || null,
    signal,
  );
  return { answer: value, model, provider };
}
