import "server-only";
import { type ConditionAnswer, conditionsSystemPrompt, readConditionAnswer } from "../analysis/conditionsAi";
import type { Locale } from "../i18n/locales";
import { completeText } from "./text";

// Budget ordering must hold: DEADLINE_MS < route maxDuration (30 s) < client timeout (40 s).
const DEADLINE_MS = 25_000;
const ATTEMPT_MS = 12_000;
const MAX_TOKENS = 300;

/** the known conditions a typed text names, and the other health conditions it names in the reader's language */
export async function understandConditions(text: string, locale: Locale, signal: AbortSignal): Promise<ConditionAnswer> {
  const { value } = await completeText(
    [
      { role: "system", content: conditionsSystemPrompt(locale) },
      { role: "user", content: JSON.stringify(text) },
    ],
    { label: "conditions", deadlineMs: DEADLINE_MS, attemptMs: ATTEMPT_MS, maxTokens: MAX_TOKENS, temperature: 0 },
    readConditionAnswer,
    signal,
  );
  return value;
}
