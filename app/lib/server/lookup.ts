import "server-only";
import { fold } from "../analysis/knowledge";
import { analysisMessages } from "../analysis/messages";
import { normalize } from "../analysis/normalize";
import type { AllergenId, LabelAnalysis, Nutrition } from "../analysis/types";
import type { Locale } from "../i18n/locales";

// When a packaged product is recognised but its ingredient list isn't readable, the
// list is looked up in Open Food Facts (a free, open product database) by barcode,
// else by brand and name. What comes back goes through normalize() like any model
// output, and the result says plainly that it wasn't read on the photo.

const API = "https://world.openfoodfacts.org";
const SOURCE = "Open Food Facts";
/** the lookup is a bonus: it must not hold up a finished analysis for long */
const TIMEOUT_MS = 6000;
const FIELDS =
  "code,product_name,brands,quantity,lang,ingredients_text,ingredients_text_en,ingredients_text_fr,ingredients_text_ar,allergens_tags,traces_tags,nutriments";
// Open Food Facts asks every client to identify itself
const USER_AGENT = "FoodAnalyzer/0.1 (https://github.com/firassou/food-analyzer)";

export interface DatabaseProduct {
  code: string | null;
  name: string | null;
  brand: string | null;
  /** every brand the entry lists ("Nutella, Ferrero"), for matching */
  brands: string | null;
  quantity: string | null;
  lang: string | null;
  ingredients: string;
  allergens: AllergenId[];
  traces: AllergenId[];
  /** per 100 g/ml, in the model's nutrient keys */
  nutrients: Record<string, number> | null;
  url: string;
}

export const lookupEnabled = (env: Record<string, string | undefined> = process.env) =>
  !/^(off|false|0|no)$/i.test(env.PRODUCT_LOOKUP?.trim() ?? "");

/** a recognised packaged product whose ingredients weren't read on the photo */
export function needsLookup(r: LabelAnalysis): boolean {
  if (r.kind !== "label" && r.kind !== "drink") return false;
  if (r.ingredients.length > 0 && r.ingredient_source === "label") return false;
  return !!(r.product.barcode || r.product.name);
}

const ALLERGEN_TAGS: Record<string, AllergenId> = {
  gluten: "gluten",
  milk: "milk",
  eggs: "eggs",
  peanuts: "peanuts",
  nuts: "tree_nuts",
  soybeans: "soy",
  "sesame-seeds": "sesame",
  fish: "fish",
  crustaceans: "crustaceans",
  molluscs: "molluscs",
  celery: "celery",
  mustard: "mustard",
  "sulphur-dioxide-and-sulphites": "sulphites",
  lupin: "lupin",
};

const NUTRIMENTS: Record<string, string> = {
  "energy-kj_100g": "energy_kj",
  "energy-kcal_100g": "energy_kcal",
  fat_100g: "fat_g",
  "saturated-fat_100g": "saturated_fat_g",
  carbohydrates_100g: "carbohydrates_g",
  sugars_100g: "sugars_g",
  fiber_100g: "fiber_g",
  proteins_100g: "protein_g",
  salt_100g: "salt_g",
};

const text = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const tags = (v: unknown): AllergenId[] =>
  (Array.isArray(v) ? v : [])
    .map((t) => ALLERGEN_TAGS[String(t).replace(/^[a-z]{2}:/, "")])
    .filter((id): id is AllergenId => !!id);

/** maps one Open Food Facts product; null when it has no ingredient list to offer */
export function parseProduct(raw: unknown, locale: Locale): DatabaseProduct | null {
  if (typeof raw !== "object" || raw === null) return null;
  const p = raw as Record<string, unknown>;
  // the reader's language first, then English, then whatever the entry was written in
  const main = text(p.ingredients_text);
  const ingredients =
    text(p[`ingredients_text_${locale}`]) ?? (p.lang === locale ? main : null) ?? text(p.ingredients_text_en) ?? main;
  if (!ingredients) return null;
  const nutriments = typeof p.nutriments === "object" && p.nutriments !== null ? (p.nutriments as Record<string, unknown>) : {};
  const nutrients: Record<string, number> = {};
  for (const [from, to] of Object.entries(NUTRIMENTS)) {
    const n = Number(nutriments[from]);
    if (nutriments[from] != null && Number.isFinite(n)) nutrients[to] = n;
  }
  const code = text(p.code);
  return {
    code,
    name: text(p.product_name),
    // "Nutella, Ferrero" → the first brand is the one printed on the pack
    brand: text(p.brands)?.split(",")[0].trim() ?? null,
    brands: text(p.brands),
    quantity: text(p.quantity),
    lang: text(p.lang),
    ingredients: ingredients.replace(/_/g, ""),
    allergens: tags(p.allergens_tags),
    traces: tags(p.traces_tags),
    nutrients: Object.keys(nutrients).length ? nutrients : null,
    url: code ? `${API}/product/${code}` : API,
  };
}

const tokens = (s: string | null) => fold(s ?? "").split(/[^\p{L}\p{N}]+/u).filter((t) => t.length >= 3);

/** an entry may name the product a little more fully ("… 400 g", "… spread"), not be a different one */
const MAX_EXTRA_WORDS = 2;

/**
 * How far a search hit is from the wanted product: the number of words in the entry's
 * name that the photo didn't show, or null when it isn't the same product. Every word
 * of the wanted name must appear in the entry's name or brands, and the brand must
 * agree when both are known: a wrong product's ingredients would be worse than none.
 */
export function distance(wanted: { name: string | null; brand: string | null }, candidate: DatabaseProduct): number | null {
  const name = tokens(wanted.name);
  if (name.length === 0) return null;
  const haystack = new Set(tokens(`${candidate.name ?? ""} ${candidate.brands ?? ""}`));
  if (!name.every((t) => haystack.has(t))) return null;
  const brand = tokens(wanted.brand);
  if (brand.length > 0 && candidate.brands && !brand.some((t) => haystack.has(t))) return null;
  const known = new Set([...name, ...brand, ...tokens(candidate.brands)]);
  const extra = tokens(candidate.name).filter((t) => !known.has(t)).length;
  return extra <= MAX_EXTRA_WORDS ? extra : null;
}

async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  });
  // 404 is the barcode API's "unknown product"
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Open Food Facts answered ${res.status}`);
  return res.json();
}

/** looks a product up by barcode, else by brand and name; null when nothing trustworthy is found */
export async function findProduct(
  wanted: { barcode: string | null; name: string | null; brand: string | null },
  locale: Locale,
  signal: AbortSignal,
): Promise<DatabaseProduct | null> {
  if (wanted.barcode) {
    const data = (await getJson(`${API}/api/v2/product/${wanted.barcode}.json?fields=${FIELDS}`, signal)) as {
      product?: unknown;
    } | null;
    const product = parseProduct(data?.product, locale);
    if (product) return product;
  }
  if (!wanted.name) return null;
  const terms = encodeURIComponent(`${wanted.brand ?? ""} ${wanted.name}`.trim());
  const data = (await getJson(
    `${API}/cgi/search.pl?search_terms=${terms}&search_simple=1&action=process&json=1&page_size=8&fields=${FIELDS}`,
    signal,
  )) as { products?: unknown[] } | null;
  // the closest name wins; ties keep the database's own ranking
  let best: { product: DatabaseProduct; extra: number } | null = null;
  for (const raw of data?.products ?? []) {
    const product = parseProduct(raw, locale);
    const extra = product && distance(wanted, product);
    if (product && extra != null && (!best || extra < best.extra)) best = { product, extra };
  }
  return best?.product ?? null;
}

/** the already-normalized nutrition, back in the shape normalize() reads */
const asInput = (n: Nutrition) => ({
  basis: n.basis,
  serving_size: n.serving_size,
  per_100_printed: !n.per_100_calculated,
  per_100: n.per_100_calculated ? null : n.per_100,
  per_serving: n.per_serving,
});

/**
 * Re-runs the deterministic checks on the photo's reading completed by the database
 * entry. What was read on the photo always wins; the entry only fills what's missing.
 */
export function completeFromDatabase(result: LabelAnalysis, found: DatabaseProduct, locale: Locale): LabelAnalysis {
  const product = [found.name, found.brand].filter(Boolean).join(" – ") || found.code || SOURCE;
  const completed = normalize(
    {
      label_detected: true,
      kind: result.kind,
      image_quality: result.image_quality,
      language: found.lang ?? result.language,
      product: {
        name: result.product.name ?? found.name,
        brand: result.product.brand ?? found.brand,
        category: result.product.category,
        quantity: result.product.quantity ?? found.quantity,
        barcode: result.product.barcode ?? found.code,
      },
      ingredients: found.ingredients.replace(/[.\s]+$/, ""),
      allergens: { declared: found.allergens, may_contain: found.traces },
      // a baseline the rules can only raise: the list is complete, unlike the photo's
      gluten: { status: "no_indication", confidence: "medium", evidence: [] },
      lactose: { status: "no_indication", evidence: [] },
      nutrition: result.nutrition
        ? asInput(result.nutrition)
        : found.nutrients && { basis: result.sugar.basis, per_100_printed: true, per_100: found.nutrients },
      summary: result.summary,
      highlights: result.highlights,
      claims: result.claims,
      certifications: result.certifications,
      dates: result.dates,
      storage: result.storage,
      manufacturer: result.manufacturer,
      origin: result.origin,
      raw_text: result.raw_text,
    },
    { locale, database: { name: SOURCE, product, url: found.url } },
  );
  // the entry answers these; every other warning of the photo's reading still stands
  const w = analysisMessages(locale).warnings;
  const answered = new Set([w.needProductPhoto, w.noIngredients, w.estimatedProduct, w.notALabel]);
  for (const warning of result.warnings)
    if (!answered.has(warning) && !completed.warnings.includes(warning)) completed.warnings.push(warning);
  return completed;
}
