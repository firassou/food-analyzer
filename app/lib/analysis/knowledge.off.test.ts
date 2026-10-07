// The allergen rules measured against Open Food Facts: a snapshot of real products (ingredient
// text in six languages, plus the allergens and traces the database lists for each), saved by
// scripts/fetch-off-corpus.mjs. Offline and deterministic.
//
// OFF's tags come partly from its own rules applied to the same text, so this measures how far
// knowledge.ts agrees with a large independent system, not whether either one is right. A
// disagreement is a lead to look at (`OFF_REPORT=1 pnpm test knowledge.off` lists them), not
// always a bug here. The floors below sit just under what the rules score today: a change that
// lowers them breaks the test, and raising them after an improvement is the point.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mentionsGlutenFree, splitPrecautions } from "./knowledge";
import type { AllergenId } from "./types";

interface Product {
  code: string;
  lang: string;
  text: string;
  allergens: string[];
  traces: string[];
}

let products: Product[] = [];
try {
  products = (JSON.parse(readFileSync(new URL("./__fixtures__/off-corpus.json", import.meta.url), "utf8")) as { products: Product[] }).products;
} catch {
  // no snapshot: skipped on a developer machine (run scripts/fetch-off-corpus.mjs to create it) but
  // never silently in CI, where a missing file would otherwise turn the whole check into a pass
  if (process.env.CI) throw new Error("app/lib/analysis/__fixtures__/off-corpus.json is missing or unreadable");
}

// OFF allergen tag -> ours
const TAGS: Record<string, AllergenId> = {
  "en:gluten": "gluten",
  "en:milk": "milk",
  "en:eggs": "eggs",
  "en:peanuts": "peanuts",
  "en:nuts": "tree_nuts",
  "en:soybeans": "soy",
  "en:sesame-seeds": "sesame",
  "en:fish": "fish",
  "en:crustaceans": "crustaceans",
  "en:molluscs": "molluscs",
  "en:celery": "celery",
  "en:mustard": "mustard",
  "en:sulphur-dioxide-and-sulphites": "sulphites",
  "en:lupin": "lupin",
};
const ids = (tags: string[]) => new Set(tags.map((t) => TAGS[t]).filter(Boolean));

interface Score {
  tp: number;
  fp: number;
  fn: number;
}
const empty = (): Score => ({ tp: 0, fp: 0, fn: 0 });
const recall = (s: Score) => (s.tp + s.fn === 0 ? 1 : s.tp / (s.tp + s.fn));
const precision = (s: Score) => (s.tp + s.fp === 0 ? 1 : s.tp / (s.tp + s.fp));

/**
 * What the text names (outside or inside a "may contain" sentence) against the allergens the
 * database lists for the product. OFF keeps traces in a field of their own that is not in the
 * ingredient text, so an allergen it lists only as a trace and that the text names is a right
 * answer, not a false alarm; one it lists as an allergen and the text only mentions as "may
 * contain" counts as found.
 */
function measure() {
  const byAllergen = new Map<AllergenId, Score>();
  const byLang = new Map<string, Score>();
  const misses: string[] = [];
  const bump = (map: Map<string, Score>, key: string, field: keyof Score) => {
    const s = map.get(key) ?? empty();
    s[field]++;
    map.set(key, s);
  };
  for (const p of products) {
    const found = splitPrecautions(p.text);
    const named = new Set([...found.restAllergens, ...found.traceAllergens]);
    // "gluten-free" names gluten and says there is none; normalize() handles that claim, not the keyword rule
    if (mentionsGlutenFree(p.text)) named.delete("gluten");
    const truth = ids(p.allergens);
    const traces = ids(p.traces);
    for (const id of new Set([...truth, ...named])) {
      if (!truth.has(id) && traces.has(id)) continue;
      const field: keyof Score = truth.has(id) && named.has(id) ? "tp" : truth.has(id) ? "fn" : "fp";
      bump(byAllergen, id, field);
      bump(byLang, p.lang, field);
      if (field !== "tp" && misses.length < 4000) misses.push(`${field} ${id} [${p.lang}] ${p.code}: ${p.text.slice(0, 160)}`);
    }
  }
  return { byAllergen, byLang, misses };
}

// What the rules score today, minus a margin. Recall matters most: a missed allergen is the
// costly error. Only allergens with at least 20 products in the snapshot, and languages with at
// least 50, are held to a floor; the ones left out (crustaceans, molluscs, lupin) have too few
// examples to say anything. Sulphites are low because OFF lists them for foods whose text never
// names them (it derives them from additives and fruit it knows about).
// Raise a floor after an improvement; lower one only after looking at why (OFF_REPORT=1).
const ALLERGEN_FLOORS: Partial<Record<AllergenId, { recall: number; precision: number }>> = {
  milk: { recall: 0.92, precision: 0.85 },
  eggs: { recall: 0.89, precision: 0.84 },
  gluten: { recall: 0.94, precision: 0.89 },
  soy: { recall: 0.87, precision: 0.9 },
  tree_nuts: { recall: 0.9, precision: 0.86 },
  sesame: { recall: 0.83, precision: 0.85 },
  peanuts: { recall: 0.82, precision: 0.78 },
  sulphites: { recall: 0.38, precision: 0.68 },
  mustard: { recall: 0.77, precision: 0.58 },
  celery: { recall: 0.77, precision: 0.87 },
  fish: { recall: 0.69, precision: 0.72 },
};
// Arabic precision is low because Arabic entries on OFF are often French or Spanish text and
// many list no allergens at all for plain milk.
const LANGUAGE_FLOORS: Record<string, { recall: number; precision: number }> = {
  en: { recall: 0.9, precision: 0.92 },
  fr: { recall: 0.92, precision: 0.9 },
  es: { recall: 0.88, precision: 0.89 },
  it: { recall: 0.9, precision: 0.87 },
  ar: { recall: 0.85, precision: 0.68 },
};

describe.skipIf(products.length === 0)("allergen rules against Open Food Facts", () => {
  const { byAllergen, byLang, misses } = measure();

  it("reports", () => {
    if (!process.env.OFF_REPORT) return;
    const row = (name: string, s: Score) => ({ name, n: s.tp + s.fn, recall: +recall(s).toFixed(3), precision: +precision(s).toFixed(3), fp: s.fp, fn: s.fn });
    console.table([...byAllergen].map(([k, s]) => row(k, s)));
    console.table([...byLang].map(([k, s]) => row(k, s)));
    console.log(misses.join("\n"));
  });

  it("finds the allergens the database lists, and does not invent them", () => {
    for (const [id, floor] of Object.entries(ALLERGEN_FLOORS) as [AllergenId, { recall: number; precision: number }][]) {
      const s = byAllergen.get(id) ?? empty();
      expect(s.tp + s.fn, `enough ${id} examples`).toBeGreaterThanOrEqual(20);
      expect(recall(s), `recall ${id}`).toBeGreaterThanOrEqual(floor.recall);
      expect(precision(s), `precision ${id}`).toBeGreaterThanOrEqual(floor.precision);
    }
  });

  it("holds in every language", () => {
    for (const [lang, floor] of Object.entries(LANGUAGE_FLOORS)) {
      const s = byLang.get(lang) ?? empty();
      expect(s.tp + s.fn, `enough ${lang} examples`).toBeGreaterThanOrEqual(50);
      expect(recall(s), `recall ${lang}`).toBeGreaterThanOrEqual(floor.recall);
      expect(precision(s), `precision ${lang}`).toBeGreaterThanOrEqual(floor.precision);
    }
  });
});
