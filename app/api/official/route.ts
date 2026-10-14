import type { OfficialResponse } from "@/app/lib/analysis/official";
import type { AnalyzeErrorCode } from "@/app/lib/analysis/types";
import { crossSite, readText } from "@/app/lib/server/guard";
import { lookupEnabled } from "@/app/lib/server/lookup";
import { findMedicine, type WantedMedicine } from "@/app/lib/server/medicines";
import { clientKey, globalLimiter, makeLimiter, type RateLimiter } from "@/app/lib/server/rateLimit";

// A saved medicine's official product information, for scans made before the analysis fetched it:
// POST {"name", "strengths", "form", "substances"} → {"ok": true, "official": {...} | null}.
// Only what was read on the box is sent (and on to the public medicines database); nothing is kept.

export const maxDuration = 30;


const MAX_BODY_BYTES = 4 * 1024;
const limiter: RateLimiter = makeLimiter("official", 20, 60_000);

function fail(error: string, code: AnalyzeErrorCode, status: number) {
  return Response.json({ ok: false, error, code } satisfies OfficialResponse, { status });
}

const text = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const texts = (v: unknown) => (Array.isArray(v) ? v.map((x) => text(x, 60)).filter((x): x is string => x !== null).slice(0, 6) : []);

export async function POST(req: Request) {
  if (crossSite(req)) return fail("This request did not come from the app.", "bad_request", 403);
  if ((await limiter.hit(clientKey(req))) || (await globalLimiter.hit("*"))) {
    return fail("Too many requests in a short time. Please wait a minute and try again.", "rate_limited", 429);
  }
  let body: Record<string, unknown>;
  try {
    const raw = await readText(req, MAX_BODY_BYTES);
    if (raw === null) return fail("That request is too large.", "too_large", 413);
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return fail('Send a JSON body: {"name", "strengths", "form", "substances"}.', "bad_request", 400);
  }
  const wanted: WantedMedicine = { name: text(body.name), strengths: texts(body.strengths), form: text(body.form, 80), substances: texts(body.substances) };
  if (!wanted.name && !wanted.substances?.length) return fail("Send a medicine's name or its active substance.", "bad_request", 400);
  if (!lookupEnabled()) return Response.json({ ok: true, official: null } satisfies OfficialResponse);
  try {
    const found = await findMedicine(wanted, AbortSignal.any([req.signal, AbortSignal.timeout(25_000)]));
    return Response.json({ ok: true, official: found?.official ?? null } satisfies OfficialResponse);
  } catch (error) {
    console.warn("[official] lookup failed:", error instanceof Error ? error.message : error);
    return fail("The medicines database couldn't be reached. Please try again later.", "upstream_unavailable", 502);
  }
}
