// "Understand with AI" for a health condition the search didn't know: the typed text alone
// (and the interface language, for the names) goes to /api/conditions, only when the reader
// taps the button. Nothing is stored here.

import { type ConditionAnswer, type ConditionsResponse, cleanOtherConditions } from "../analysis/conditionsAi";
import { CONDITION_IDS } from "../analysis/profile";
import type { Locale } from "../i18n/locales";

// must stay above the server's deadline and maxDuration (30 s) in api/conditions/route.ts
const CLIENT_TIMEOUT_MS = 40_000;

/** the known conditions the text names and the other health conditions (both possibly none); throws when the request fails */
export async function understandConditions(text: string, locale: Locale, signal: AbortSignal): Promise<ConditionAnswer> {
  const response = await fetch("/api/conditions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text, lang: locale }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
  });
  const data = (await response.json().catch(() => null)) as ConditionsResponse | null;
  if (!data?.ok || !Array.isArray(data.ids)) throw new Error(data && !data.ok ? data.code : `status ${response.status}`);
  // the server already checked them; a client never trusts a response blindly either
  return { ids: CONDITION_IDS.filter((id) => data.ids.includes(id)), others: cleanOtherConditions(data.others) };
}
