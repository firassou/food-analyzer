import { cleanQuestion, cleanTurns } from "@/app/lib/analysis/ask";
import type { AnalyzeErrorCode, AskResponse } from "@/app/lib/analysis/types";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/app/lib/i18n/locales";
import { AnalyzeError } from "@/app/lib/server/analyze";
import { askAboutProduct } from "@/app/lib/server/ask";
import { clientKey, MemoryRateLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";

// must stay above DEADLINE_MS in server/ask.ts
export const maxDuration = 60;

const MAX_BODY_BYTES = 256 * 1024;
const limiter: RateLimiter = new MemoryRateLimiter(20, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number) {
  return Response.json({ ok: false, error, code } satisfies AskResponse, { status });
}

export async function POST(req: Request) {
  if (await limiter.hit(clientKey(req))) {
    return fail("Too many questions in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY_BYTES) {
    return fail("That request is too large.", "too_large", 413);
  }

  let body: Record<string, unknown>;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY_BYTES) return fail("That request is too large.", "too_large", 413);
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("Send a JSON body with a question, the conversation and the result.", "bad_request", 400);
  }

  const question = cleanQuestion(body.question);
  if (!question) return fail("Ask a question.", "bad_request", 400);
  if (!body.result || typeof body.result !== "object") return fail("The scanned product is missing.", "bad_request", 400);
  const locale: Locale = isLocale(body.lang) ? body.lang : DEFAULT_LOCALE;

  try {
    const { answer, model, provider } = await askAboutProduct(
      { question, history: cleanTurns(body.history), result: body.result, locale },
      req.signal,
    );
    return Response.json({ ok: true, answer, model, provider } satisfies AskResponse);
  } catch (error) {
    if (error instanceof AnalyzeError) return fail(error.message, error.code, error.status);
    console.error("[ask] unexpected error:", error);
    return fail("Something went wrong while answering. Please try again.", "internal", 500);
  }
}
