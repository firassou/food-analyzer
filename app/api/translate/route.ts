import { cleanTexts } from "@/app/lib/analysis/translate";
import type { AnalyzeErrorCode, TranslateResponse } from "@/app/lib/analysis/types";
import { isLocale } from "@/app/lib/i18n/locales";
import { AnalyzeError } from "@/app/lib/server/analyze";
import { crossSite, readText } from "@/app/lib/server/guard";
import { clientKey, globalLimiter, makeLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";
import { translateTexts } from "@/app/lib/server/translate";

// The model's free text of a result, in another interface language: POST {"to": "en", "texts": [...]}.
// Text only, no photo: see relocalize.ts for everything that is rebuilt without a model.

// must stay above DEADLINE_MS in server/translate.ts
export const maxDuration = 60;

const MAX_BODY_BYTES = 64 * 1024;
const limiter: RateLimiter = makeLimiter("translate", 20, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number) {
  return Response.json({ ok: false, error, code } satisfies TranslateResponse, { status });
}

export async function POST(req: Request) {
  if (crossSite(req)) return fail("This request did not come from the app.", "bad_request", 403);
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many translations in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    const text = await readText(req, MAX_BODY_BYTES);
    if (text === null) return fail("That request is too large.", "too_large", 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('Send a JSON body: {"to": "en", "texts": ["…"]}.', "bad_request", 400);
  }
  if (!isLocale(body.to)) return fail("Unknown language.", "bad_request", 400);
  const texts = cleanTexts(body.texts);
  if (!texts) return fail("Send between 1 and 80 short texts.", "bad_request", 400);

  try {
    return Response.json({ ok: true, texts: await translateTexts(texts, body.to, req.signal) } satisfies TranslateResponse);
  } catch (error) {
    if (error instanceof AnalyzeError) return fail(error.message, error.code, error.status);
    console.error("[translate] unexpected error:", error);
    return fail("Something went wrong while translating. Please try again.", "internal", 500);
  }
}
