// A result on screen, shown in the interface language the reader switched to. What the app
// writes itself is rebuilt on the spot (relocalize.ts); the model's free text is translated
// by /api/translate, once: every translation is kept with the scan (`phrases`), so going back
// and forth between languages costs nothing after the first time.

import { relocalize } from "../analysis/relocalize";
import { batches } from "../analysis/translate";
import type { LabelAnalysis, TranslateResponse } from "../analysis/types";
import type { Locale } from "../i18n/locales";
import type { Phrase } from "./history";

// must stay above the server's deadline and maxDuration (60 s) in api/translate/route.ts
const CLIENT_TIMEOUT_MS = 75_000;
/** translations kept per scan: a result has a few dozen texts, in up to three languages */
const MAX_PHRASES = 300;

export class TranslateFailure extends Error {}

async function post(texts: string[], to: Locale, signal: AbortSignal): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ to, texts }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(CLIENT_TIMEOUT_MS)]),
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new TranslateFailure("network");
  }
  const data = (await response.json().catch(() => null)) as TranslateResponse | null;
  if (data?.ok && data.texts.length === texts.length && data.texts.every((t) => typeof t === "string")) return data.texts;
  throw new TranslateFailure(data && !data.ok ? data.code : `status ${response.status}`);
}

const finder = (phrases: Phrase[], from: Locale, to: Locale) => (text: string) =>
  phrases.find((p) => p[from] === text && p[to] !== undefined)?.[to];

/** adds what was learned to the phrasebook: the same text in `from` gains its `to` */
function learn(phrases: Phrase[], from: Locale, to: Locale, pairs: [string, string][]): Phrase[] {
  const next = phrases.map((p) => ({ ...p }));
  for (const [text, translation] of pairs) {
    const known = next.find((p) => p[from] === text);
    if (known) known[to] = translation;
    else next.push({ [from]: text, [to]: translation });
  }
  return next.slice(-MAX_PHRASES);
}

/** the result in `to`, and the phrasebook to keep with it; throws TranslateFailure when the model text couldn't be translated */
export async function translateResult(
  result: LabelAnalysis,
  from: Locale,
  to: Locale,
  phrases: Phrase[],
  signal: AbortSignal,
): Promise<{ result: LabelAnalysis; phrases: Phrase[] }> {
  let pass = relocalize(result, from, to, finder(phrases, from, to));
  if (pass.missing.length === 0) return { result: pass.result, phrases };
  const learned: [string, string][] = [];
  for (const batch of batches(pass.missing)) {
    const texts = await post(batch, to, signal);
    batch.forEach((text, i) => learned.push([text, texts[i]]));
  }
  const book = learn(phrases, from, to, learned);
  pass = relocalize(result, from, to, finder(book, from, to));
  return { result: pass.result, phrases: book };
}
