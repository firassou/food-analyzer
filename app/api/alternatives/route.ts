import type { AlternativesResponse } from "@/app/lib/analysis/alternatives";
import { isCountry } from "@/app/lib/analysis/country";
import { DEFAULT_LOCALE, isLocale } from "@/app/lib/i18n/locales";
import { barcodeDigits } from "@/app/lib/analysis/knowledge";
import { findAlternatives } from "@/app/lib/server/alternatives";
import { lookupEnabled } from "@/app/lib/server/lookup";
import { clientKey, globalLimiter, makeLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";

// Better choices for a scanned product: GET /api/alternatives?code=<digits>. No model is involved:
// the Nutri-Score is Open Food Facts' own, and the ranking is plain code.

const limiter: RateLimiter = makeLimiter("alternatives", 20, 60_000);

function fail(error: string, code: Extract<AlternativesResponse, { ok: false }>["code"], status: number) {
  return Response.json({ ok: false, error, code } satisfies AlternativesResponse, { status });
}

export async function GET(req: Request) {
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many searches in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }
  const params = new URL(req.url).searchParams;
  const code = barcodeDigits(params.get("code") ?? "");
  if (!code) return fail("That isn't a valid barcode.", "bad_request", 400);
  // products must be sold where the reader is: without a country there is nothing to suggest
  const country = params.get("country")?.toUpperCase() ?? "";
  if (!isCountry(country)) return fail("A country is needed.", "bad_request", 400);
  const lang = params.get("lang");
  if (!lookupEnabled()) return fail("The product lookup is switched off on this server.", "not_configured", 503);
  try {
    const found = await findAlternatives(code, country, isLocale(lang) ? lang : DEFAULT_LOCALE, req.signal);
    if (!found) return fail("Nothing to suggest for this product in that country.", "not_found", 404);
    return Response.json(found satisfies AlternativesResponse);
  } catch (error) {
    console.warn("[alternatives] lookup failed:", error instanceof Error ? error.message : error);
    return fail("The product database can't be reached right now. Please try again shortly.", "upstream_unavailable", 502);
  }
}
