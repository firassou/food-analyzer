import { cleanConditionQuery, type ConditionsResponse } from "@/app/lib/analysis/conditionsAi";
import type { AnalyzeErrorCode } from "@/app/lib/analysis/types";
import { AnalyzeError } from "@/app/lib/server/analyze";
import { understandConditions } from "@/app/lib/server/conditions";
import { DEFAULT_LOCALE, isLocale } from "@/app/lib/i18n/locales";
import { crossSite, readText } from "@/app/lib/server/guard";
import { clientKey, globalLimiter, makeLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";

// A health condition the settings search didn't know, mapped onto the known ids and named:
// POST {"text": "…", "lang": "en"} → {"ok": true, "ids": [...], "others": [...]}. Sent only when
// the reader taps "Understand with AI"; nothing else from the profile comes with it, and nothing is kept.

// must stay above DEADLINE_MS in server/conditions.ts
export const maxDuration = 30;

const MAX_BODY_BYTES = 4 * 1024;
const limiter: RateLimiter = makeLimiter("conditions", 10, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number) {
  return Response.json({ ok: false, error, code } satisfies ConditionsResponse, { status });
}

export async function POST(req: Request) {
  if (crossSite(req)) return fail("This request did not come from the app.", "bad_request", 403);
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many requests in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    const text = await readText(req, MAX_BODY_BYTES);
    if (text === null) return fail("That request is too large.", "too_large", 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('Send a JSON body: {"text": "…"}.', "bad_request", 400);
  }
  const text = cleanConditionQuery(body.text);
  if (!text) return fail("Type a health condition.", "bad_request", 400);
  const locale = isLocale(body.lang) ? body.lang : DEFAULT_LOCALE;

  try {
    const { ids, others } = await understandConditions(text, locale, req.signal);
    return Response.json({ ok: true, ids, others } satisfies ConditionsResponse);
  } catch (error) {
    if (error instanceof AnalyzeError) return fail(error.message, error.code, error.status);
    console.error("[conditions] unexpected error:", error);
    return fail("Something went wrong. Please try again.", "internal", 500);
  }
}
