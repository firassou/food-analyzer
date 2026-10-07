import { cleanCabinet, cleanQuestion, cleanTurns } from "@/app/lib/analysis/ask";
import type { AnalyzeErrorCode, AskResponse } from "@/app/lib/analysis/types";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/app/lib/i18n/locales";
import { AnalyzeError } from "@/app/lib/server/analyze";
import { askAboutProduct } from "@/app/lib/server/ask";
import { crossSite, readText } from "@/app/lib/server/guard";
import { clientKey, globalLimiter, makeLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";

// must stay above DEADLINE_MS in server/ask.ts
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;
const limiter: RateLimiter = makeLimiter("ask", 20, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number) {
  return Response.json({ ok: false, error, code } satisfies AskResponse, { status });
}

export async function POST(req: Request) {
  if (crossSite(req)) return fail("This request did not come from the app.", "bad_request", 403);
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many questions in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }

  let body: Record<string, unknown>;
  try {
    const text = await readText(req, MAX_BODY_BYTES);
    if (text === null) return fail("That request is too large.", "too_large", 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body with a question, the conversation and the result.", "bad_request", 400);
  }

  const question = cleanQuestion(body.question);
  if (!question) return fail("Ask a question.", "bad_request", 400);
  // a conversation about the whole shelf of medicines carries them instead of one result
  const cabinet = body.cabinet === undefined ? undefined : cleanCabinet(body.cabinet);
  if (cabinet !== undefined && cabinet.length === 0) return fail("The medicines are missing.", "bad_request", 400);
  if (cabinet === undefined && (!body.result || typeof body.result !== "object")) return fail("The scanned product is missing.", "bad_request", 400);
  const locale: Locale = isLocale(body.lang) ? body.lang : DEFAULT_LOCALE;

  try {
    const { answer, model, provider } = await askAboutProduct(
      { question, history: cleanTurns(body.history), result: body.result, locale, cabinet },
      req.signal,
    );
    return Response.json({ ok: true, answer, model, provider } satisfies AskResponse);
  } catch (error) {
    if (error instanceof AnalyzeError) return fail(error.message, error.code, error.status);
    console.error("[ask] unexpected error:", error);
    return fail("Something went wrong while answering. Please try again.", "internal", 500);
  }
}
