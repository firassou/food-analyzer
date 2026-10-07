import { barcodeDigits } from "@/app/lib/analysis/knowledge";
import type { AnalyzeErrorCode, AnalyzeResponse } from "@/app/lib/analysis/types";
import { DEFAULT_LOCALE, isLocale } from "@/app/lib/i18n/locales";
import { findProduct, fromDatabase, lookupEnabled } from "@/app/lib/server/lookup";
import { clientKey, globalLimiter, MemoryRateLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";

// Barcode lookup: GET /api/product?code=<digits>&lang=<en|fr|ar>. No model is involved:
// the Open Food Facts entry goes through the same deterministic checks as a photo.

const limiter: RateLimiter = new MemoryRateLimiter(30, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number) {
  return Response.json({ ok: false, error, code } satisfies AnalyzeResponse, { status });
}

export async function GET(req: Request) {
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many lookups in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }
  const params = new URL(req.url).searchParams;
  const code = barcodeDigits(params.get("code") ?? "");
  if (!code) return fail("That isn't a valid barcode. Check the digits and try again.", "bad_request", 400);
  if (!lookupEnabled()) return fail("The product lookup is switched off on this server.", "not_configured", 503);
  const lang = params.get("lang");
  const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;

  const started = Date.now();
  try {
    const found = await findProduct({ barcode: code, name: null, brand: null }, locale, req.signal);
    if (!found) {
      return fail("This product isn't in the database yet. Take a photo of its label instead.", "not_found", 404);
    }
    return Response.json({
      ok: true,
      result: fromDatabase(found, locale),
      meta: { model: "open-food-facts", provider: "database", attempts: 1, duration_ms: Date.now() - started, locale },
    } satisfies AnalyzeResponse);
  } catch (error) {
    console.warn("[product] lookup failed:", error instanceof Error ? error.message : error);
    return fail("The product database can't be reached right now. Please try again shortly.", "upstream_unavailable", 502);
  }
}
