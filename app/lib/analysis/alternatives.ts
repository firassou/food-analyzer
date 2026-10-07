import { countryTag } from "./country";
import type { LabelAnalysis } from "./types";

// Better choices in the same category, ranked from Open Food Facts entries. Pure and client-safe:
// the server fetches the entries, this decides which ones are worth showing. The grade is the
// database's own Nutri-Score; nothing here is computed by the model.

export const GRADES = ["a", "b", "c", "d", "e"] as const;
export type Grade = (typeof GRADES)[number];

export const isGrade = (v: unknown): v is Grade => typeof v === "string" && (GRADES as readonly string[]).includes(v);

export interface Candidate {
  code: string;
  name: string;
  brand: string | null;
  grade: Grade;
  /** sugars per 100 g or 100 ml, when the entry has them */
  sugar: number | null;
}

export const MAX_ALTERNATIVES = 4;

const rank = (g: Grade) => GRADES.indexOf(g);

/** a raw search hit as a candidate, or null when it lacks a name, a code or a grade */
export function toCandidate(raw: unknown): Candidate | null {
  const x = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const code = typeof x.code === "string" && /^\d{8,14}$/.test(x.code) ? x.code : null;
  const name = typeof x.product_name === "string" ? x.product_name.replace(/\s+/g, " ").trim().slice(0, 80) : "";
  const grade = typeof x.nutriscore_grade === "string" ? x.nutriscore_grade.toLowerCase() : null;
  if (!code || !name || !isGrade(grade)) return null;
  const nutriments = (typeof x.nutriments === "object" && x.nutriments !== null ? x.nutriments : {}) as Record<string, unknown>;
  const sugar = typeof nutriments.sugars_100g === "number" && Number.isFinite(nutriments.sugars_100g) ? nutriments.sugars_100g : null;
  const brand = typeof x.brands === "string" ? (x.brands.split(",")[0].trim().slice(0, 40) || null) : null;
  return { code, name, brand, grade, sugar };
}

/** a sweet product's alternative must be sweet too: below this share of its sugar it is a different kind of product */
const COMPARABLE_SHARE = 0.25;
/** "sweet": the share rule only applies from here (g per 100 g) */
const SWEET_FROM = 15;

/**
 * The entries with a strictly better grade than the product (or, when it has none, an A or B),
 * that don't have more sugar than it does, and that are still the same kind of thing (a spread
 * with almost no sugar in a sweet category is a chilli paste, not a swap). Best grade first,
 * then least sugar, without the product itself or a repeated name.
 */
export function pickAlternatives(own: { code: string; grade: Grade | null; sugar?: number | null }, hits: unknown[], limit = MAX_ALTERNATIVES): Candidate[] {
  const sugar = own.sugar ?? null;
  const seen = new Set<string>();
  return hits
    .map(toCandidate)
    .filter((c): c is Candidate => c !== null && c.code !== own.code)
    .filter((c) => (own.grade ? rank(c.grade) < rank(own.grade) : rank(c.grade) <= 1))
    .filter((c) => sugar === null || c.sugar === null || c.sugar <= sugar)
    .filter((c) => sugar === null || sugar < SWEET_FROM || c.sugar === null || c.sugar >= sugar * COMPARABLE_SHARE)
    .sort((p, q) => rank(p.grade) - rank(q.grade) || (p.sugar ?? Infinity) - (q.sugar ?? Infinity))
    .filter((c) => {
      const key = `${c.brand ?? ""}|${c.name}`.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, limit);
}

/** the most specific English category of a product: Open Food Facts lists them general to specific */
export function mainCategory(tags: unknown): string | null {
  const english = (Array.isArray(tags) ? tags : []).filter((t): t is string => typeof t === "string" && /^en:[a-z0-9-]+$/.test(t));
  return english.at(-1) ?? null;
}

/** a candidate with what the database says about it as a full result, so the reader's profile can be checked on the device */
export type Alternative = Candidate & { result: LabelAnalysis };

/** how many candidates the server sends: the reader's profile will cross some out, and a few must be left */
export const CANDIDATES_SENT = 12;

/** what `GET /api/alternatives` answers: products sold in `country`, not yet checked against any profile */
export type AlternativesResponse =
  | { ok: true; category: string; country: string; own: { grade: Grade | null; sugar: number | null }; items: Alternative[] }
  | { ok: false; error: string; code: "bad_request" | "rate_limited" | "not_configured" | "not_found" | "upstream_unavailable" };

/** the Open Food Facts tag of a country code ("TN" → "en:tunisia"); null for anything that isn't one */
export function countryTagOf(code: string): string | null {
  try {
    return countryTag(code, new Intl.DisplayNames("en", { type: "region" }).of(code));
  } catch {
    return null;
  }
}
