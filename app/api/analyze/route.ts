import { AnalyzeError, analyzeLabel } from "@/app/lib/server/analyze";
import { ImageError, MAX_UPLOAD_BYTES, prepareImage, TOO_LARGE_MESSAGE } from "@/app/lib/server/image";
import { completeFromDatabase, findProduct, lookupEnabled, needsLookup } from "@/app/lib/server/lookup";
import { needsExcipients } from "@/app/lib/analysis/medicine";
import { completeMedicine, findMedicine, wantedMedicine } from "@/app/lib/server/medicines";
import { getTargets } from "@/app/lib/server/models";
import { crossSite } from "@/app/lib/server/guard";
import { clientKey, globalLimiter, makeLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";
import type { AnalyzeErrorCode, AnalyzeResponse } from "@/app/lib/analysis/types";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@/app/lib/i18n/locales";

// the fallback chain can take a while on slow providers; must stay above DEADLINE_MS in analyze.ts
export const maxDuration = 120;

// light per-IP limiter so a stuck client can't burn through API credits
const limiter: RateLimiter = makeLimiter("analyze", 12, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number, trace?: string[]) {
  return Response.json({ ok: false, error, code, ...(trace && { trace }) } satisfies AnalyzeResponse, { status });
}

export async function POST(req: Request) {
  if (crossSite(req)) return fail("This request did not come from the app.", "bad_request", 403);
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many analyses in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }

  // multipart overhead is small; reject obviously oversized bodies before reading them
  const declaredLength = Number(req.headers.get("content-length") ?? 0);
  if (declaredLength > MAX_UPLOAD_BYTES + 64 * 1024) return fail(TOO_LARGE_MESSAGE, "too_large", 413);

  let file: FormDataEntryValue | null;
  // language of the analysis text; anything unsupported falls back to English
  let locale: Locale = DEFAULT_LOCALE;
  try {
    const form = await req.formData();
    file = form.get("image") ?? form.get("file");
    const lang = form.get("lang");
    if (isLocale(lang)) locale = lang;
  } catch {
    return fail('Send the photo as multipart/form-data in an "image" field.', "bad_request", 400);
  }
  if (!file || typeof file === "string") return fail("No image was uploaded.", "bad_request", 400);
  if (file.size > MAX_UPLOAD_BYTES) return fail(TOO_LARGE_MESSAGE, "too_large", 413);

  try {
    const image = await prepareImage(new Uint8Array(await file.arrayBuffer()));
    const analysis = await analyzeLabel(image.dataUrl, req.signal, locale);
    const { meta } = analysis;
    let { result } = analysis;
    // a recognised product with no readable ingredient list: complete it from the product database
    if (lookupEnabled() && needsLookup(result)) {
      try {
        const found = await findProduct(result.product, locale, req.signal);
        if (found) result = completeFromDatabase(result, found, locale);
        console.log(`[analyze] product lookup: ${found ? `matched ${found.url}` : "no match"}`);
      } catch (error) {
        // the photo's own reading (and its "couldn't read the ingredients" warning) still stands
        console.warn("[analyze] product lookup failed:", error instanceof Error ? error.message : error);
      }
    }
    // a medicine whose composition isn't in view (it rarely is on the front of the box):
    // look its excipients up in the official database. Optional: the reading stands without it.
    if (lookupEnabled() && needsExcipients(result) && result.product.name) {
      try {
        const found = await findMedicine(wantedMedicine(result), req.signal);
        if (found) result = completeMedicine(result, found, locale);
        console.log(`[analyze] medicine lookup: ${found ? `matched ${found.url}` : "no match"}`);
      } catch (error) {
        console.warn("[analyze] medicine lookup failed:", error instanceof Error ? error.message : error);
      }
    }
    return Response.json({ ok: true, result, meta } satisfies AnalyzeResponse);
  } catch (error) {
    if (error instanceof ImageError) {
      return fail(error.message, error.code, error.code === "too_large" ? 413 : 415);
    }
    if (error instanceof AnalyzeError) return fail(error.message, error.code, error.status, error.trace);
    console.error("[analyze] unexpected error:", error);
    return fail("Something went wrong while analyzing the photo. Please try again.", "internal", 500);
  }
}

/** lightweight health check: is an AI provider configured? (never exposes secrets) */
export function GET() {
  const targets = getTargets();
  // which providers and models are configured is for the developer, not for the public
  const detail = process.env.NODE_ENV !== "production";
  return Response.json({
    ok: targets.length > 0,
    ...(detail && { providers: [...new Set(targets.map((t) => t.provider))], models: targets.map((t) => t.model) }),
  });
}
