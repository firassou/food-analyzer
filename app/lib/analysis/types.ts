// The normalized result the API always returns. Every field is present;
// "unknown" is expressed as null / [] / "unclear", never as a missing key.
// Shared by client and server: keep it free of runtime dependencies.

import type { Locale } from "../i18n/locales";

export type Presence = "contains" | "likely_contains" | "no_indication" | "unclear";
export type Confidence = "high" | "medium" | "low";
export type Level = "low" | "medium" | "high";
export type Basis = "100g" | "100ml";
export type ImageQuality = "good" | "fair" | "poor";
export type HighlightTone = "positive" | "neutral" | "caution";
/** what the photo shows: a packaged food label, bottled water, another drink, a prepared dish, a medicine, or none of these */
export type SubjectKind = "label" | "water" | "drink" | "dish" | "medicine" | "other";
/** where the ingredient list comes from: read on the label, a product database, or an estimate */
export type IngredientSource = "label" | "database" | "estimated";

/** dissolved minerals a water label prints, in mg/L */
export const MINERAL_KEYS = [
  "calcium",
  "magnesium",
  "sodium",
  "potassium",
  "bicarbonate",
  "sulphate",
  "chloride",
  "nitrate",
  "fluoride",
  "silica",
] as const;
export type MineralKey = (typeof MINERAL_KEYS)[number];

/** deterministic remarks about a water's composition (see knowledge.ts `waterFacts`) */
export type WaterFactId =
  | "ph_acidic"
  | "ph_neutral"
  | "ph_alkaline"
  | "ph_sparkling"
  | "mineral_very_low"
  | "mineral_low"
  | "mineral_medium"
  | "mineral_high"
  | "hardness_soft"
  | "hardness_medium"
  | "hardness_hard"
  | "hardness_very_hard"
  | "low_sodium"
  | "sodium_rich"
  | "calcium_rich"
  | "magnesium_rich"
  | "bicarbonate_rich"
  | "sulphate_rich"
  | "chloride_rich"
  | "fluoride_present"
  | "fluoride_high"
  | "nitrate_low"
  | "nitrate_high";

export interface WaterFact {
  id: WaterFactId;
  tone: HighlightTone;
  /** the fact, with its figures */
  text: string;
  /** what it means for the person drinking it, in everyday terms */
  tip: string;
  /** the published guidance the tip rests on */
  source: string;
}

export interface Water {
  /** mg/L as printed; null when the label doesn't give it */
  minerals: Record<MineralKey, number | null>;
  /** dry residue at 180 °C (total dissolved solids), mg/L */
  dry_residue_mg_l: number | null;
  ph: number | null;
  sparkling: boolean;
  /** total hardness as mg/L CaCO₃, computed from calcium and magnesium */
  hardness_mg_l: number | null;
  /** computed from the values above, never taken from the model */
  facts: WaterFact[];
}

/** excipients a patient may need to know about (see excipients.ts) */
export const EXCIPIENT_IDS = [
  "wheat_starch",
  "starch_unspecified",
  "lactose",
  "sugars",
  "fructose_sorbitol",
  "aspartame",
  "peanut_oil",
  "soya",
  "sesame_oil",
  "sulphites",
  "azo_colours",
  "parabens",
  "benzoates",
  "benzyl_alcohol",
  "alcohol",
  "propylene_glycol",
  "effervescent_sodium",
] as const;
export type ExcipientId = (typeof EXCIPIENT_IDS)[number];

export interface ExcipientNote {
  id: ExcipientId;
  /** the excipient as printed, e.g. "amidon de blé" */
  matched: string;
  /** what it means for the patient, in the standard wording */
  note: string;
  source: string;
}

/** the pharmacist's pen marks on the box: how many units at each time of day */
export interface DoseMarks {
  morning: number;
  midday: number;
  evening: number;
  /** units a day at no particular time: one line drawn across the box means "once a day" */
  anytime: number;
  /** written next to the marks, e.g. "7 jours" */
  duration: string | null;
  /** any other handwritten note, as read */
  note: string | null;
  /** how clearly the marks could be read */
  confidence: Confidence;
}

export interface Medicine {
  /** "film-coated tablets", "syrup"… */
  form: string | null;
  /** read on the pack */
  active: { name: string; name_local: string | null; strength: string | null }[];
  /** read on the box; null when nothing is handwritten on it */
  marks: DoseMarks | null;
  // General information about the active substance, from the model's knowledge.
  // It is NOT read on the pack and is not the patient's prescription.
  uses: string[];
  typical_dose: string | null;
  how_to_take: string | null;
  not_for: string[];
  warnings: string[];
  side_effects: string[];
  /** computed from the printed excipients, never taken from the model */
  excipients: ExcipientNote[];
}

export interface Drink {
  /** container volume parsed from the net quantity */
  volume_ml: number | null;
  /** sugars in the whole container, from sugars per 100 ml × volume */
  sugar_per_container_g: number | null;
  /** names of the colour additives found */
  colours: string[];
  /** names of the sweeteners found */
  sweeteners: string[];
  caffeine: boolean;
}

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
  /** translation into the requested interface language, when that isn't English or the label's own */
  name_local: string | null;
  /** only a percentage literally printed next to the ingredient */
  percent: number | null;
  /** how sure the estimate is; null for ingredients read on a label */
  confidence: Confidence | null;
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
  /** the name in the requested interface language, when that isn't English */
  name_local: string | null;
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
  /** a rough figure for a typical recipe (a dish with no label), not read from anything */
  estimated: boolean;
  per_serving: Nutrients | null;
  /** UK FSA front-of-pack levels, computed from per_100 */
  levels: Record<LevelKey, Level | null>;
}

export interface LabelAnalysis {
  label_detected: boolean;
  kind: SubjectKind;
  image_quality: ImageQuality;
  /** ISO 639 code of the label's main language */
  language: string | null;
  product: {
    name: string | null;
    brand: string | null;
    category: string | null;
    quantity: string | null;
    /** digits printed under the barcode, when legible */
    barcode: string | null;
  };
  summary: string | null;
  highlights: { tone: HighlightTone; text: string }[];
  ingredients: Ingredient[];
  /** "estimated" and "database" ingredients were not read on the photo */
  ingredient_source: IngredientSource;
  /** the product database entry the result was completed from */
  database: { name: string; product: string; url: string } | null;
  allergens: Allergen[];
  gluten: { status: Presence; confidence: Confidence; evidence: string[] };
  lactose: { status: Presence; evidence: string[] };
  additives: Additive[];
  nutrition: Nutrition | null;
  /** composition of a bottled water; null for anything else */
  water: Water | null;
  /** what matters in a drink; null for anything else */
  drink: Drink | null;
  /** a medicine's substance, cautions and dose marks; null for anything else. Its excipients are in `ingredients`. */
  medicine: Medicine | null;
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
  /** interface language the free-text fields were written in */
  locale: Locale;
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
  | "not_found"
  | "internal";

export type AnalyzeResponse =
  | { ok: true; result: LabelAnalysis; meta: AnalyzeMeta }
  | { ok: false; error: string; code: AnalyzeErrorCode; trace?: string[] };
