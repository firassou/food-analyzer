// The normalized result the API always returns. Every field is present;
// "unknown" is expressed as null / [] / "unclear", never as a missing key.
// Shared by client and server: keep it free of runtime dependencies.

export type Presence = "contains" | "likely_contains" | "no_indication" | "unclear";
export type Confidence = "high" | "medium" | "low";
export type Level = "low" | "medium" | "high";
export type Basis = "100g" | "100ml";
export type ImageQuality = "good" | "fair" | "poor";
export type HighlightTone = "positive" | "neutral" | "caution";

/** the EU 14 major allergens, in regulation order */
export const ALLERGEN_IDS = [
  "gluten",
  "milk",
  "eggs",
  "peanuts",
  "tree_nuts",
  "soy",
  "sesame",
  "fish",
  "crustaceans",
  "molluscs",
  "celery",
  "mustard",
  "sulphites",
  "lupin",
] as const;
export type AllergenId = (typeof ALLERGEN_IDS)[number];

export const ALLERGEN_NAMES: Record<AllergenId, string> = {
  gluten: "Gluten",
  milk: "Milk",
  eggs: "Eggs",
  peanuts: "Peanuts",
  tree_nuts: "Tree nuts",
  soy: "Soy",
  sesame: "Sesame",
  fish: "Fish",
  crustaceans: "Crustaceans",
  molluscs: "Molluscs",
  celery: "Celery",
  mustard: "Mustard",
  sulphites: "Sulphites",
  lupin: "Lupin",
};

export const NUTRIENT_KEYS = [
  "energy_kj",
  "energy_kcal",
  "fat_g",
  "saturated_fat_g",
  "carbohydrates_g",
  "sugars_g",
  "fiber_g",
  "protein_g",
  "salt_g",
  "sodium_mg",
] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];
export type Nutrients = Record<NutrientKey, number | null>;

export type LevelKey = "fat" | "saturated_fat" | "sugars" | "salt";

export interface Ingredient {
  /** as printed on the label */
  name: string;
  /** English translation when the label is in another language */
  name_en: string | null;
  /** only a percentage literally printed next to the ingredient */
  percent: number | null;
  /** canonical code, e.g. "E322", "E150d", "E500ii" */
  e_number: string | null;
  allergens: AllergenId[];
  gluten: boolean;
  dairy: boolean;
}

export interface Allergen {
  id: AllergenId;
  name: string;
  presence: "contains" | "may_contain";
  /** explicitly declared on the label (allergen statement / bold text) */
  declared: boolean;
  /** ingredients or statements that triggered it (max 6) */
  sources: string[];
}

export interface Additive {
  code: string | null;
  name: string;
  category: string | null;
  purpose: string | null;
  explanation: string | null;
}

export interface Nutrition {
  basis: Basis;
  serving_size: string | null;
  per_100: Nutrients | null;
  /** per-100 values derived from the serving column because the label doesn't print them */
  per_100_calculated: boolean;
  per_serving: Nutrients | null;
  /** UK FSA front-of-pack levels, computed from per_100 */
  levels: Record<LevelKey, Level | null>;
}

export interface LabelAnalysis {
  label_detected: boolean;
  image_quality: ImageQuality;
  /** ISO 639 code of the label's main language */
  language: string | null;
  product: {
    name: string | null;
    brand: string | null;
    category: string | null;
    quantity: string | null;
  };
  summary: string | null;
  highlights: { tone: HighlightTone; text: string }[];
  ingredients: Ingredient[];
  allergens: Allergen[];
  gluten: { status: Presence; confidence: Confidence; evidence: string[] };
  lactose: { status: Presence; evidence: string[] };
  additives: Additive[];
  nutrition: Nutrition | null;
  sugar: {
    level: Level | "unknown";
    per_100: number | null;
    basis: Basis;
    explanation: string | null;
  };
  claims: string[];
  certifications: string[];
  dates: {
    best_before: string | null;
    expiration: string | null;
    production: string | null;
    lot: string | null;
  };
  storage: { instructions: string | null; temperature: string | null };
  manufacturer: {
    name: string | null;
    address: string | null;
    country: string | null;
  };
  origin: string | null;
  raw_text: string | null;
  /** things the user should know about the reliability of this result */
  warnings: string[];
}

export interface AnalyzeMeta {
  model: string;
  provider: string;
  attempts: number;
  duration_ms: number;
  /** development only: what each attempt did */
  trace?: string[];
}

export type AnalyzeErrorCode =
  | "bad_request"
  | "unsupported_image"
  | "too_large"
  | "rate_limited"
  | "not_configured"
  | "upstream_auth"
  | "upstream_quota"
  | "upstream_unavailable"
  | "timeout"
  | "internal";

export type AnalyzeResponse =
  | { ok: true; result: LabelAnalysis; meta: AnalyzeMeta }
  | { ok: false; error: string; code: AnalyzeErrorCode; trace?: string[] };
