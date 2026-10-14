import "server-only";
import { readTranslations, translateSystemPrompt } from "../analysis/translate";
import type { Locale } from "../i18n/locales";
import { completeText } from "./text";

// Budget ordering must hold: DEADLINE_MS < route maxDuration (60 s) < client timeout (75 s).
const DEADLINE_MS = 50_000;
const ATTEMPT_MS = 30_000;
const MAX_TOKENS = 6000;

/**
 * The texts in `to`, in the same order. Nothing is cached here on purpose: a translation
 * shared between visitors could be steered by one of them (a request is anyone's to write),
 * so each reader keeps their own, with the scan (see client/translate.ts).
 */
export async function translateTexts(texts: string[], to: Locale, signal: AbortSignal): Promise<string[]> {
  const unique = [...new Set(texts)];
  const { value } = await completeText(
    [
      { role: "system", content: translateSystemPrompt(to) },
      { role: "user", content: JSON.stringify(unique) },
    ],
    { label: "translate", deadlineMs: DEADLINE_MS, attemptMs: ATTEMPT_MS, maxTokens: MAX_TOKENS, temperature: 0.1 },
    (answer) => readTranslations(answer, unique),
    signal,
  );
  const translated = new Map(unique.map((t, i) => [t, value[i]]));
  return texts.map((t) => translated.get(t) ?? t);
}
