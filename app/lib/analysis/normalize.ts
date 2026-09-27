// Maps any model output (any shape, any types, partial or garbage) onto a
// complete LabelAnalysis, then cross-checks it with deterministic rules.
// This function must never throw. See .claude/skills/normalize-invariants.

import {
  additiveCategory,
  additiveName,
  canonicalENumber,
  codeForName,
  detectAllergens,
  findENumbers,
  fold,
  glutenSignal,
  isDairy,
  isDrink,
  isNutrientFortificant,
  LEVEL_THRESHOLDS,
  levelOf,
  splitPrecautions,
  mentionsGlutenFree,
  mentionsLactoseFree,
} from "./knowledge";
import {
  ALLERGEN_IDS,
  ALLERGEN_NAMES,
  NUTRIENT_KEYS,
  type Additive,
  type Allergen,
  type AllergenId,
  type Basis,
  type Confidence,
  type HighlightTone,
  type ImageQuality,
  type Ingredient,
  type LabelAnalysis,
  type Level,
  type LevelKey,
  type NutrientKey,
  type Nutrients,
  type Nutrition,
  type Presence,
} from "./types";

type Obj = Record<string, unknown>;

const MAX_INGREDIENTS = 120;
const MAX_ADDITIVES = 40;
const MAX_HIGHLIGHTS = 5;
const MAX_SOURCES = 6;

// ------------------------------------------------------------------ helpers

const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);

const keyOf = (k: string) =>
  fold(k)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");

/** first value among aliases: exact keys first, then case/format-insensitive */
function pick(o: unknown, ...aliases: string[]): unknown {
  if (!isObj(o)) return undefined;
  for (const a of aliases) if (o[a] !== undefined && o[a] !== null) return o[a];
  const wanted = aliases.map(keyOf);
  for (const [k, v] of Object.entries(o)) {
    if (v !== undefined && v !== null && wanted.includes(keyOf(k))) return v;
  }
  return undefined;
}

const PLACEHOLDER =
  /^(null|none|nil|n\/?a|na|unknown|not (visible|available|specified|stated|found|provided|legible|readable)|unreadable|illegible|-+|—|–|\?+|\.+|empty|string)$/i;

const truncate = (s: string, max: number) => (s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s);

/** a single-line string, or null for placeholders / non-strings */
function str(v: unknown, max = 300): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (isObj(v)) v = pick(v, "text", "value", "name");
  if (typeof v !== "string") return null;
  const s = v.replace(/\s+/g, " ").trim();
  if (!s || PLACEHOLDER.test(s)) return null;
  return truncate(s, max);
}

/** multi-line text: keeps line breaks, collapses runs of spaces */
function text(v: unknown, max: number): string | null {
  if (typeof v !== "string") return str(v, max);
  const s = v
    .replace(/\r/g, "")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!s || PLACEHOLDER.test(s)) return null;
  return truncate(s, max);
}

/** first non-negative number in a value ("0,5 g" → 0.5); null otherwise */
function num(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (isObj(v)) return num(pick(v, "value", "amount", "quantity"));
  if (typeof v !== "string") return null;
  const t = v.replace(/(\d),(\d)/g, "$1.$2");
  const m = t.match(/(-\s*)?(\d+(?:\.\d+)?)/);
  if (!m || m[1]) return null;
  return Number(m[2]);
}

function bool(v: unknown): boolean | null {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    if (/^(true|yes|1)$/i.test(v.trim())) return true;
    if (/^(false|no|0)$/i.test(v.trim())) return false;
  }
  return null;
}

function arr(v: unknown): unknown[] {
  if (Array.isArray(v)) return v;
  if (typeof v === "string") return splitList(v);
  if (v === undefined || v === null) return [];
  return [v];
}

/** splits "a, b (c, d), e" on top-level separators only */
function splitList(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const c of s) {
    if ("([{".includes(c)) depth++;
    if (")]}".includes(c)) depth = Math.max(0, depth - 1);
    if (depth === 0 && (c === "," || c === ";" || c === "\n" || c === "،")) {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

function strList(v: unknown, maxItems = 12, maxLen = 80): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of arr(v)) {
    const s = str(item, maxLen);
    if (s && !seen.has(fold(s))) {
      seen.add(fold(s));
      out.push(s);
    }
    if (out.length >= maxItems) break;
  }
  return out;
}

const round = (n: number, d = 2) => Math.round((n + Number.EPSILON) * 10 ** d) / 10 ** d;
const decimalsFor = (k: NutrientKey) => (k === "sodium_mg" || k.startsWith("energy") ? 0 : 2);

// ------------------------------------------------------------------ enums

const PRESENCE_RANK: Record<Presence, number> = {
  no_indication: 0,
  unclear: 1,
  likely_contains: 2,
  contains: 3,
};

function presence(v: unknown): Presence | null {
  if (typeof v === "boolean") return v ? "contains" : "no_indication";
  const s = str(v);
  if (!s) return null;
  const k = keyOf(s);
  if (/^(contains?|yes|present|true|detected|positive|has)/.test(k)) return "contains";
  if (/likely|may|possibl|probab|trace|cross|partial|suspect/.test(k)) return "likely_contains";
  if (/^(no|none|absent|not|free|false|negative|without)(_|$)|free$/.test(k)) return "no_indication";
  if (/unclear|unknown|uncertain|insufficient|cannot|can_t/.test(k)) return "unclear";
  return null;
}

function confidence(v: unknown): Confidence {
  if (typeof v === "number" && Number.isFinite(v)) return v > 0.75 ? "high" : v > 0.4 ? "medium" : "low";
  const k = keyOf(str(v) ?? "");
  if (k.startsWith("high")) return "high";
  if (k.startsWith("low")) return "low";
  return "medium";
}

function imageQuality(v: unknown): ImageQuality | null {
  const k = keyOf(str(v) ?? "");
  if (/^(good|high|clear|excellent|sharp)/.test(k)) return "good";
  if (/^(poor|bad|low|blurry|unreadable|illegible)/.test(k)) return "poor";
  if (/^(fair|medium|ok|average|moderate|partial)/.test(k)) return "fair";
  return null;
}

function tone(v: unknown): HighlightTone {
  const k = keyOf(str(v) ?? "");
  if (/^(positive|good|benefit|pro|plus|green)/.test(k)) return "positive";
  if (/^(caution|warning|warn|negative|bad|concern|alert|red|con)/.test(k)) return "caution";
  return "neutral";
}

function sugarLevel(v: unknown): Level | null {
  const k = keyOf(str(v) ?? "");
  if (k.startsWith("low")) return "low";
  if (k.startsWith("high")) return "high";
  if (k.startsWith("moderate") || k.startsWith("medium")) return "medium";
  return null;
}

const ALLERGEN_SYNONYMS: [RegExp, AllergenId][] = [
  [/gluten|wheat|cereal|barley|rye|oat|spelt/, "gluten"],
  [/milk|dairy|lactose|whey|casein/, "milk"],
  [/egg/, "eggs"],
  [/peanut|groundnut/, "peanuts"],
  [/tree_?nut|^nuts?$|almond|hazelnut|walnut|cashew|pecan|pistachio|macadamia|brazil/, "tree_nuts"],
  [/soy|soja/, "soy"],
  [/sesame/, "sesame"],
  [/crustacean|shellfish|shrimp|prawn|crab|lobster/, "crustaceans"],
  [/mollus|mussel|oyster|squid|clam|snail/, "molluscs"],
  [/fish/, "fish"],
  [/celery|celeriac/, "celery"],
  [/mustard/, "mustard"],
  [/sulph|sulf/, "sulphites"],
  [/lupin/, "lupin"],
];

function allergenIds(v: unknown): AllergenId[] {
  const out = new Set<AllergenId>();
  for (const item of arr(v)) {
    const s = str(isObj(item) ? pick(item, "id", "name", "allergen") : item);
    if (!s) continue;
    const k = keyOf(s);
    const direct = (ALLERGEN_IDS as readonly string[]).includes(k)
      ? (k as AllergenId)
      : ALLERGEN_SYNONYMS.find(([re]) => re.test(k))?.[1];
    if (direct) out.add(direct);
    else detectAllergens(s).forEach((a) => out.add(a));
  }
  return [...out];
}

// ------------------------------------------------------------------ nutrition

type MassKey = Exclude<NutrientKey, "energy_kj" | "energy_kcal" | "sodium_mg">;

const NUTRIENT_ALIASES: Record<MassKey, string[]> = {
  fat_g: ["fat_g", "fat", "fats", "total_fat", "lipids", "fat_total"],
  saturated_fat_g: ["saturated_fat_g", "saturated_fat", "saturated_fats", "saturates", "saturated", "sat_fat"],
  carbohydrates_g: ["carbohydrates_g", "carbohydrates", "carbohydrate", "carbs", "total_carbohydrate", "total_carbohydrates"],
  sugars_g: ["sugars_g", "sugars", "sugar", "total_sugars", "of_which_sugars"],
  fiber_g: ["fiber_g", "fibre_g", "fiber", "fibre", "dietary_fiber", "dietary_fibre"],
  protein_g: ["protein_g", "protein", "proteins"],
  salt_g: ["salt_g", "salt"],
};
const MASS_KEYS = Object.keys(NUTRIENT_ALIASES) as MassKey[];

/** grams from "220 mg", "0,5 g", {value, unit}, 12 … */
function grams(v: unknown, defaultUnit: "g" | "mg" = "g"): number | null {
  let unit = "";
  if (isObj(v)) {
    unit = str(pick(v, "unit", "units")) ?? "";
    v = pick(v, "value", "amount", "quantity");
  }
  const n = num(v);
  if (n === null) return null;
  if (typeof v === "string") unit = v.match(/(mg|µg|μg|mcg|g)\b/i)?.[1] ?? unit;
  unit = unit.toLowerCase() || defaultUnit;
  if (unit === "mg") return n / 1000;
  if (unit === "µg" || unit === "μg" || unit === "mcg") return n / 1e6;
  return n;
}

/** a bare energy number: above 950 it can only be kJ per 100 */
const splitBareEnergy = (n: number) => (n > 950 ? { kj: n, kcal: null } : { kj: null, kcal: n });

function energy(o: Obj): { kj: number | null; kcal: number | null } {
  let kj = num(pick(o, "energy_kj", "kj", "energy_kilojoules"));
  let kcal = num(pick(o, "energy_kcal", "kcal", "calories", "energy_kilocalories"));
  const combined = pick(o, "energy", "energy_value");
  if (typeof combined === "string") {
    const t = combined.replace(/(\d),(\d)/g, "$1.$2");
    kj ??= num(t.match(/(\d+(?:\.\d+)?)\s*kj/i)?.[1]);
    kcal ??= num(t.match(/(\d+(?:\.\d+)?)\s*(kcal|cal)/i)?.[1]);
    if (kj === null && kcal === null) {
      const n = num(t);
      if (n !== null) ({ kj, kcal } = splitBareEnergy(n));
    }
  } else if (isObj(combined)) {
    const inner = energy(combined);
    kj ??= inner.kj;
    kcal ??= inner.kcal;
  } else if (kj === null && kcal === null) {
    const n = num(combined);
    if (n !== null) ({ kj, kcal } = splitBareEnergy(n));
  }
  return { kj, kcal };
}

function nutrients(v: unknown, per100: boolean, warn: (w: string) => void): Nutrients | null {
  if (!isObj(v)) return null;
  const out = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, null])) as Nutrients;
  ({ kj: out.energy_kj, kcal: out.energy_kcal } = energy(v));

  for (const key of MASS_KEYS) {
    const raw = pick(v, ...NUTRIENT_ALIASES[key]);
    if (raw !== undefined) out[key] = grams(raw);
  }
  // "sodium_mg" is mg by name; a bare "sodium" value is grams unless implausibly large
  const sodiumMg = pick(v, "sodium_mg");
  const sodiumBare = pick(v, "sodium");
  const sodiumG =
    sodiumMg !== undefined
      ? grams(sodiumMg, "mg")
      : grams(sodiumBare, (num(sodiumBare) ?? 0) > 5 ? "mg" : "g");
  out.sodium_mg = sodiumG === null ? null : sodiumG * 1000;

  // physically impossible values are dropped rather than shown
  const limits = per100
    ? { mass: 100, sodium_mg: 40_000, energy_kcal: 950, energy_kj: 4000 }
    : { mass: 2000, sodium_mg: 100_000, energy_kcal: 20_000, energy_kj: 80_000 };
  let dropped = false;
  const cap = (k: NutrientKey, max: number) => {
    const n = out[k];
    if (n !== null && (n < 0 || n > max)) {
      out[k] = null;
      dropped = true;
    }
  };
  MASS_KEYS.forEach((k) => cap(k, limits.mass));
  cap("sodium_mg", limits.sodium_mg);
  cap("energy_kcal", limits.energy_kcal);
  cap("energy_kj", limits.energy_kj);
  if (dropped) warn("Some nutrition values were unreadable or impossible and were left out.");

  // salt ⇄ sodium (salt = sodium × 2.5)
  if (out.salt_g === null && out.sodium_mg !== null) out.salt_g = (out.sodium_mg / 1000) * 2.5;
  if (out.sodium_mg === null && out.salt_g !== null) out.sodium_mg = (out.salt_g / 2.5) * 1000;

  for (const k of NUTRIENT_KEYS) {
    const n = out[k];
    if (n !== null) out[k] = round(n, decimalsFor(k));
  }
  return NUTRIENT_KEYS.some((k) => out[k] !== null) ? out : null;
}

/** |9·fat + 4·carbs + 4·protein + 2·fibre − kcal| > max(40, 35%) */
function energyMismatch(n: Nutrients): boolean {
  const { energy_kcal: kcal, energy_kj: kj, fat_g: fat, carbohydrates_g: carbs, protein_g: protein, fiber_g: fiber } = n;
  const energy = kcal ?? (kj !== null ? kj / 4.184 : null);
  if (energy === null || fat === null || carbs === null || protein === null) return false;
  const est = 9 * fat + 4 * carbs + 4 * protein + 2 * (fiber ?? 0);
  return Math.abs(est - energy) > Math.max(40, energy * 0.35);
}

function consistencyWarnings(n: Nutrients, basis: Basis): string[] {
  const issues: string[] = [];
  const { fat_g: fat, saturated_fat_g: sat, carbohydrates_g: carbs, sugars_g: sugars, protein_g: protein, fiber_g: fiber } = n;
  if (sugars !== null && carbs !== null && sugars > carbs + 0.5) issues.push("sugars exceed carbohydrates");
  if (sat !== null && fat !== null && sat > fat + 0.5) issues.push("saturates exceed total fat");
  if (basis === "100g" && (fat ?? 0) + (carbs ?? 0) + (protein ?? 0) + (fiber ?? 0) > 105)
    issues.push("macronutrients add up to more than 100 g");
  if (energyMismatch(n)) issues.push("energy doesn't match the macronutrients");
  return issues.length
    ? [`Some nutrition values look inconsistent (${issues.join("; ")}). Double-check them on the pack.`]
    : [];
}

/** per-serving values scaled to 100 g/ml */
function scaleTo100(n: Nutrients, servingAmount: number): Nutrients {
  const f = 100 / servingAmount;
  return Object.fromEntries(
    NUTRIENT_KEYS.map((k) => {
      const v = n[k];
      return [k, v === null ? null : round(v * f, decimalsFor(k) === 0 ? 0 : 1)];
    }),
  ) as Nutrients;
}

/** grams/ml in one serving: "2/3 cup (55g)" → 55, "1 can (330 ml)" → 330 */
function servingAmountOf(servingSize: string | null): number | null {
  const matches = [...(servingSize ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*(g|gr|grams?|ml)\b/gi)];
  const n = num(matches.at(-1)?.[1]);
  return n !== null && n > 0 ? n : null;
}

function buildNutrition(raw: unknown, productText: string, warn: (w: string) => void): Nutrition | null {
  if (!isObj(raw)) return null;
  const basisRaw = fold(str(pick(raw, "basis", "per", "unit")) ?? "");
  const per100Raw = pick(raw, "per_100", "per_100g", "per_100ml", "per_100g_or_ml", "per100", "per_100_g", "per_100_ml");
  const basis: Basis =
    /ml|(?<![a-z])l\b/.test(basisRaw) || pick(raw, "per_100ml", "per_100_ml") !== undefined
      ? "100ml"
      : /g\b|gram/.test(basisRaw)
        ? "100g"
        : isDrink(productText)
          ? "100ml"
          : "100g";
  // a flat nutrition object (no per_100 wrapper) is treated as per 100
  const looksFlat =
    per100Raw === undefined && pick(raw, "fat", "fat_g", "sugars", "sugars_g", "energy", "energy_kcal") !== undefined;
  let per100 = nutrients(looksFlat ? raw : per100Raw, true, warn);
  const perServing = nutrients(pick(raw, "per_serving", "per_portion", "serving", "portion"), false, warn);
  const servingSize = str(pick(raw, "serving_size", "portion_size"), 60)?.replace(/^per\s+/i, "") ?? null;
  const servingAmount = servingAmountOf(servingSize);
  const printed = bool(pick(raw, "per_100_printed"));

  // No per-100 column (e.g. US panels), or one that fails the energy check while
  // the serving column passes: derive per 100 from the serving.
  let per100Calculated = false;
  if (
    perServing &&
    servingAmount &&
    (!per100 || printed === false || (energyMismatch(per100) && !energyMismatch(perServing)))
  ) {
    per100 = scaleTo100(perServing, servingAmount);
    per100Calculated = true;
  } else if (printed === false) {
    per100 = null;
  }
  if (!per100 && !perServing) return null;

  const t = LEVEL_THRESHOLDS[basis];
  if (per100) consistencyWarnings(per100, basis).forEach(warn);
  return {
    basis,
    serving_size: servingSize,
    per_100: per100,
    per_100_calculated: per100Calculated,
    per_serving: perServing,
    levels: {
      fat: levelOf(per100?.fat_g ?? null, t.fat),
      saturated_fat: levelOf(per100?.saturated_fat_g ?? null, t.saturated_fat),
      sugars: levelOf(per100?.sugars_g ?? null, t.sugars),
      salt: levelOf(per100?.salt_g ?? null, t.salt),
    },
  };
}

// ------------------------------------------------------------------ ingredients

/** "chocolate chips (22%) (sugar, cocoa…)" → "chocolate chips" */
const shortName = (s: string) =>
  s
    .replace(/\s*[([].*$/, "")
    .replace(/\s*\d+(?:[.,]\d+)?\s*%/, "")
    .replace(/[.:;,\s]+$/, "")
    .slice(0, 48) || s.slice(0, 48);

/** every named part: "acids (phosphoric acid, citric acid)" → ["acids", "phosphoric acid", "citric acid"] */
const ingredientParts = (s: string) =>
  s
    .split(/[,;:()[\]]/)
    .map((p) => p.trim())
    .filter((p) => p.length > 1);

/** a list of sub-ingredients: "(sugar, cocoa mass, …)" or "raising agents: a, b" */
const hasSubIngredients = (s: string) => /\([^)]*[,;:][^)]*\)/.test(s) || /:[^()]*,/.test(s);

const INGREDIENTS_HEADING =
  /(ingr[eé]dients?|ingredientes|ingredienti|zutaten|ingredi[eë]nten|sk[lł]adniki|المكونات|مكونات)\s*[:：]/i;
const INGREDIENTS_END =
  /\.\s*(?=[A-ZÀ-Ý]|\n)|\n\s*\n|(may contain|contains|peut contenir|allerg|traces|puede contener|kann spuren|قد يحتوي)/i;

/** fallback when the model returned no list: split the transcribed ingredient text */
function ingredientsFromText(raw: string): string[] {
  const m = INGREDIENTS_HEADING.exec(raw);
  if (!m) return [];
  let body = raw.slice(m.index + m[0].length);
  const stop = body.search(INGREDIENTS_END);
  if (stop > 0) body = body.slice(0, stop);
  return splitList(body)
    .map((s) => s.replace(/^[.\s]+|[.\s]+$/g, ""))
    .filter((s) => s.length > 1 && s.length < 200)
    .slice(0, 80);
}

const bothNames = (i: { name: string; name_en: string | null }) => `${i.name} ${i.name_en ?? ""}`;

/** ambiguous additives (code null) are deduplicated by kind, not by exact wording */
function additiveKey(code: string | null, name: string): string {
  if (code) return code;
  const t = fold(name);
  if (/starch|amidon/.test(t)) return "modified starch";
  if (/caramel/.test(t)) return "caramel colour";
  return t;
}

// ------------------------------------------------------------------ main

export interface NormalizeOptions {
  /** output was truncated and repaired by parseModelJson */
  repaired?: boolean;
}

export function normalize(input: unknown, opts: NormalizeOptions = {}): LabelAnalysis {
  try {
    return normalizeUnsafe(input, opts);
  } catch {
    // Last line of defence for invariant 1: a bug in a rule must not become a 500.
    return normalizeUnsafe({}, { repaired: opts?.repaired });
  }
}

function normalizeUnsafe(input: unknown, opts: NormalizeOptions): LabelAnalysis {
  const warnings: string[] = [];
  const warn = (w: string) => {
    if (!warnings.includes(w)) warnings.push(w);
  };

  const root = unwrap(input);
  // tolerate an older schema, where analysis fields lived under "analysis"
  const analysis = isObj(root.analysis) ? root.analysis : {};
  const get = (...aliases: string[]) => pick(root, ...aliases) ?? pick(analysis, ...aliases);

  // ---- 1. product
  const productRaw = get("product");
  const product = {
    name: str(pick(productRaw, "name", "product_name", "title") ?? get("product_name", "name"), 140),
    brand: str(pick(productRaw, "brand", "brand_name") ?? get("brand"), 80),
    category: str(pick(productRaw, "category", "type") ?? get("category"), 60),
    quantity:
      str(
        pick(productRaw, "quantity", "net_quantity", "net_weight", "size", "weight", "volume") ??
          get("quantity", "net_weight"),
        40,
      )
        // the ℮ "estimated quantity" mark is often read as a stray "e"
        ?.replace(/(\d\s*(g|kg|ml|cl|l|oz))\s*[℮e]$/i, "$1") ?? null,
  };
  const productText = `${product.category ?? ""} ${product.name ?? ""}`;

  const rawText = text(get("raw_text", "text", "transcription", "ocr_text"), 4000);
  const claims = strList(get("claims"), 12, 60);
  const certifications = strList(get("certifications", "labels", "logos"), 12, 60);
  const packText = [rawText ?? "", ...claims, ...certifications].join(" \n ");

  // ---- 2. allergens (declared / may contain)
  const declared: AllergenId[] = [];
  const mayContain: AllergenId[] = [];
  const detectedFromList: { id: AllergenId; evidence: string | null }[] = [];
  for (const allergenRaw of [pick(root, "allergens", "allergen_info"), pick(analysis, "allergens")]) {
    if (isObj(allergenRaw)) {
      declared.push(...allergenIds(pick(allergenRaw, "declared", "contains", "present")));
      mayContain.push(...allergenIds(pick(allergenRaw, "may_contain", "traces", "precautionary", "may_contains")));
      continue;
    }
    // a flat list: strings, or {name, evidence} objects (older schema)
    for (const item of arr(allergenRaw)) {
      const ev = isObj(item) ? str(pick(item, "evidence", "source")) : null;
      const isTrace = ev ? /may contain|trace|cross/i.test(ev) : false;
      for (const id of allergenIds([item])) {
        if (isTrace) mayContain.push(id);
        else detectedFromList.push({ id, evidence: ev });
      }
    }
  }
  declared.push(...allergenIds(pick(root, "allergens_declared", "declared_allergens")));
  mayContain.push(...allergenIds(get("may_contain", "traces")));

  // A declared allergen that only appears in a "may contain" sentence is a trace
  // warning, not an ingredient (models confuse the two on blurry photos).
  // The model listing an allergen as both declared and "may contain" is the same confusion:
  // the precautionary reading wins unless the label text shows it outside a precaution
  // (a real ingredient still raises it back to "contains" through keyword detection below).
  const labelText = splitPrecautions(rawText ?? "");
  const precautions = labelText.statements;
  const precautionary = new Set([...labelText.traceAllergens, ...mayContain]);
  mayContain.push(...labelText.traceAllergens);
  const declaredSet = new Set(declared.filter((a) => !precautionary.has(a) || labelText.restAllergens.has(a)));

  // ---- 3. ingredients
  let ingredientItems = arr(get("ingredients", "ingredient_list", "ingredients_list"));
  if (ingredientItems.length === 0 && rawText) {
    ingredientItems = ingredientsFromText(rawText);
    if (ingredientItems.length) warn("The ingredient list was reconstructed from the label text.");
  }
  if (ingredientItems.length > 0 && ingredientItems.every((x) => isObj(x) && num(pick(x, "order", "position")) !== null)) {
    ingredientItems = [...ingredientItems].sort(
      (a, b) => (num(pick(a, "order", "position")) ?? 0) - (num(pick(b, "order", "position")) ?? 0),
    );
  }

  const ingredients: Ingredient[] = [];
  const glutenSignals = new Map<Ingredient, ReturnType<typeof glutenSignal>>();
  const seenIngredients = new Set<string>();
  for (const item of ingredientItems) {
    const name = str(isObj(item) ? pick(item, "name", "ingredient", "text", "label", "original") : item, 160);
    if (!name || seenIngredients.has(fold(name))) continue;
    seenIngredients.add(fold(name));
    let nameEn = isObj(item) ? str(pick(item, "name_en", "english", "translation", "en"), 160) : null;
    if (nameEn && fold(nameEn) === fold(name)) nameEn = null;
    const both = `${name} ${nameEn ?? ""}`;
    // models sometimes glue the "may contain" sentence onto the last ingredient:
    // its allergens are traces, so detect ingredient allergens without it
    const { statements: ownTraces, traceAllergens, rest: own } = splitPrecautions(both);
    precautions.push(...ownTraces);
    mayContain.push(...traceAllergens);

    // a percentage must actually be printed next to the ingredient
    const printedPct = num(both.match(/(\d+(?:[.,]\d+)?)\s*%/)?.[1]);
    const modelPct = isObj(item) ? num(pick(item, "percent", "percentage", "pct")) : null;
    const pct = printedPct !== null ? (modelPct !== null && both.includes(String(modelPct)) ? modelPct : printedPct) : null;

    // E-number: printed code, else the code implied by the name; a model guess is kept
    // only for names that aren't a known/ambiguous additive, a fortificant or a compound
    // (a compound's name implies no single code: its additives are listed separately)
    const compound = hasSubIngredients(both);
    const nameCode = compound ? undefined : (codeForName(nameEn ?? name) ?? codeForName(name));
    const modelCode = isObj(item) ? canonicalENumber(str(pick(item, "e_number", "code", "ins")) ?? "") : null;
    const eNumber =
      findENumbers(both)[0] ??
      (nameCode !== undefined
        ? nameCode
        : modelCode && !compound && !isNutrientFortificant(shortName(nameEn ?? name))
          ? modelCode
          : null);

    // the model's per-ingredient allergens are kept when the keywords support them, or when
    // the ingredient has no listed sub-ingredients (e.g. "brioche") and the label declares it
    const keywordAllergens = detectAllergens(own);
    const modelAllergens = (isObj(item) ? allergenIds(pick(item, "allergens", "allergen")) : []).filter(
      (a) => keywordAllergens.includes(a) || !traceAllergens.has(a),
    );
    const trustModel = !compound;
    const allergens = new Set<AllergenId>([
      ...keywordAllergens,
      ...modelAllergens.filter(
        (a) => keywordAllergens.includes(a) || (trustModel && (declaredSet.size === 0 || declaredSet.has(a))),
      ),
    ]);
    const signal = glutenSignal(own);
    const gluten = allergens.has("gluten") || signal !== null;
    if (gluten) allergens.add("gluten");
    const dairy = allergens.has("milk") || isDairy(own);
    if (dairy) allergens.add("milk");
    const ingredient: Ingredient = {
      name,
      name_en: nameEn,
      percent: pct !== null && pct > 0 && pct <= 100 ? pct : null,
      e_number: eNumber,
      allergens: ALLERGEN_IDS.filter((a) => allergens.has(a)),
      gluten,
      dairy,
    };
    ingredients.push(ingredient);
    glutenSignals.set(ingredient, signal);
    if (ingredients.length >= MAX_INGREDIENTS) break;
  }
  const label = (i: Ingredient) => shortName(i.name_en ?? i.name);

  // ---- 4. allergen list
  const allergenMap = new Map<AllergenId, Allergen>();
  const addAllergen = (id: AllergenId, p: Allergen["presence"], source: string | null, isDeclared = false) => {
    const cur = allergenMap.get(id) ?? { id, name: ALLERGEN_NAMES[id], presence: p, declared: false, sources: [] };
    if (p === "contains") cur.presence = "contains";
    cur.declared ||= isDeclared;
    if (source && !cur.sources.some((s) => fold(s) === fold(source)) && cur.sources.length < MAX_SOURCES)
      cur.sources.push(source);
    allergenMap.set(id, cur);
  };
  // oats alone only make gluten likely, so they don't put it on the "contains" list
  for (const ing of ingredients)
    for (const a of ing.allergens)
      addAllergen(a, a === "gluten" && glutenSignals.get(ing) === "oats" ? "may_contain" : "contains", label(ing));
  for (const id of declaredSet) addAllergen(id, "contains", null, true);
  for (const { id, evidence } of detectedFromList) addAllergen(id, "contains", evidence);
  for (const id of mayContain) {
    if (allergenMap.get(id)?.presence === "contains") continue;
    const statement = precautions.find((p) => detectAllergens(p).includes(id));
    addAllergen(
      id,
      "may_contain",
      statement ? `“${statement.replace(/^./, (c) => c.toUpperCase()).slice(0, 80)}”` : "“May contain” statement",
    );
  }
  const allergenPresence = (id: AllergenId) => allergenMap.get(id)?.presence;

  // ---- 5. gluten (deterministic signals may only raise the status)
  const glutenRaw = get("gluten");
  let glutenStatus = presence(pick(glutenRaw, "status") ?? glutenRaw) ?? "unclear";
  let glutenConfidence = confidence(pick(glutenRaw, "confidence"));
  const glutenEvidence = strList(pick(glutenRaw, "evidence"), 6, 160);
  const strongGluten = ingredients.filter((i) => i.gluten && glutenSignals.get(i) !== "oats");
  const oatsOnly = ingredients.filter((i) => glutenSignals.get(i) === "oats");
  const glutenFreeClaim = mentionsGlutenFree(packText);
  // declared on the label, not merely "contains" in the map (oats alone put it there too)
  const glutenDeclared = declaredSet.has("gluten") || detectedFromList.some((d) => d.id === "gluten");
  let glutenSignalStatus: Presence | null = null;
  if ((strongGluten.length || glutenDeclared) && !glutenFreeClaim)
    glutenSignalStatus = "contains";
  else if (oatsOnly.length || allergenPresence("gluten") === "may_contain") glutenSignalStatus = "likely_contains";
  if (glutenSignalStatus && PRESENCE_RANK[glutenSignalStatus] > PRESENCE_RANK[glutenStatus]) {
    glutenStatus = glutenSignalStatus;
    glutenConfidence = glutenSignalStatus === "contains" ? "high" : "medium";
    // the model's evidence argued for a different status
    glutenEvidence.length = 0;
    for (const i of [...strongGluten, ...oatsOnly].slice(0, 3)) {
      const ev = `Ingredient: ${label(i)}`;
      if (!glutenEvidence.includes(ev)) glutenEvidence.push(ev);
    }
    if (!glutenEvidence.length)
      glutenEvidence.push(
        glutenDeclared ? "Gluten declared as an allergen" : "“May contain” gluten statement",
      );
  }
  if (glutenStatus === "no_indication" && ingredients.length === 0 && !glutenFreeClaim) {
    glutenStatus = "unclear";
    glutenConfidence = "low";
  }
  if (glutenStatus === "contains" && !allergenMap.has("gluten")) addAllergen("gluten", "contains", glutenEvidence[0] ?? null);
  if (glutenFreeClaim && !glutenEvidence.some((e) => !e.startsWith("Ingredient:") && /gluten[\s-]?free/i.test(e)))
    glutenEvidence.push("Labelled gluten-free");

  // ---- 6. lactose (same approach; butter/ghee alone is only "likely")
  const lactoseRaw = get("lactose", "dairy");
  let lactoseStatus = presence(pick(lactoseRaw, "status") ?? lactoseRaw) ?? "unclear";
  const lactoseEvidence = strList(pick(lactoseRaw, "evidence"), 6, 160);
  const lactoseFreeClaim = mentionsLactoseFree(packText);
  const dairyIngredients = ingredients.filter((i) => i.dairy);
  if (!lactoseFreeClaim) {
    const lowLactoseOnly =
      dairyIngredients.length > 0 &&
      dairyIngredients.every((i) => /butter|beurre|ghee|mantequilla|burro|butterfat|زبدة|سمن/.test(fold(bothNames(i))));
    let signal: Presence | null = null;
    if (dairyIngredients.length) signal = lowLactoseOnly ? "likely_contains" : "contains";
    else if (allergenPresence("milk") === "contains") signal = "contains";
    else if (allergenPresence("milk") === "may_contain") signal = "likely_contains";
    if (signal && PRESENCE_RANK[signal] > PRESENCE_RANK[lactoseStatus]) {
      lactoseStatus = signal;
      lactoseEvidence.length = 0;
      for (const i of dairyIngredients.slice(0, 3)) {
        const ev = `Ingredient: ${label(i)}`;
        if (!lactoseEvidence.includes(ev)) lactoseEvidence.push(ev);
      }
      if (!dairyIngredients.length)
        lactoseEvidence.push(
          allergenPresence("milk") === "contains" ? "Milk declared as an allergen" : "“May contain” milk statement",
        );
    }
  } else if (!lactoseEvidence.some((e) => !e.startsWith("Ingredient:") && /lactose[\s-]?free/i.test(e))) {
    lactoseEvidence.push("Labelled lactose-free");
  }
  if (lactoseStatus === "no_indication" && ingredients.length === 0 && !lactoseFreeClaim) lactoseStatus = "unclear";

  // ---- 7. additives
  const additives: Additive[] = [];
  const additiveKeys = new Set<string>();
  const addAdditive = (a: Additive) => {
    const key = additiveKey(a.code, a.name);
    if (additiveKeys.has(key)) return;
    additiveKeys.add(key);
    additives.push(a);
  };
  const printedCodes = new Set(
    ingredients.length ? ingredients.flatMap((i) => findENumbers(bothNames(i))) : findENumbers(rawText ?? ""),
  );
  for (const item of arr(get("additives", "e_numbers"))) {
    const name = str(isObj(item) ? pick(item, "name", "additive") : item, 80);
    const nameIsJustCode = !!name && /^(e|ins)[\s-]?\d{3,4}[a-j]?\s?\(?[ivx]*\)?$/i.test(name);
    const modelCode =
      canonicalENumber(str(isObj(item) ? pick(item, "code", "e_number", "id") : item) ?? "") ??
      (name ? canonicalENumber(name) : null);
    const realName = name && !nameIsJustCode ? name : null;
    // vitamins/minerals the model mistook for additives
    if (realName && isNutrientFortificant(realName) && !(modelCode && printedCodes.has(modelCode))) continue;
    // correct the code from the name when we know better; drop guesses for ambiguous names
    const implied = realName ? codeForName(realName) : undefined;
    const code = modelCode && printedCodes.has(modelCode) ? modelCode : implied !== undefined ? implied : modelCode;
    const finalName = realName ?? (code ? additiveName(code) : null) ?? code;
    if (!finalName) continue;
    addAdditive({
      code,
      name: finalName,
      category: (isObj(item) ? str(pick(item, "category", "class", "type"), 60) : null) ?? (code ? additiveCategory(code) : null),
      purpose: isObj(item) ? str(pick(item, "purpose", "function", "role"), 200) : null,
      explanation: isObj(item) ? str(pick(item, "explanation", "description", "info", "note"), 400) : null,
    });
  }
  // what the model missed: printed codes, then well-known additive names in the ingredients
  for (const code of printedCodes) {
    addAdditive({ code, name: additiveName(code) ?? code, category: additiveCategory(code), purpose: null, explanation: null });
  }
  for (const ing of ingredients) {
    for (const part of ingredientParts(ing.name_en ?? ing.name)) {
      const code = codeForName(part);
      if (code === undefined || isNutrientFortificant(part)) continue;
      const fp = fold(part);
      const already =
        additiveKeys.has(additiveKey(code, part)) ||
        additives.some((a) => fold(a.name).includes(fp) || fp.includes(fold(a.name)));
      if (already) continue;
      addAdditive({
        code,
        name: code ? (additiveName(code) ?? part) : part.charAt(0).toUpperCase() + part.slice(1),
        category: code ? additiveCategory(code) : /starch|amidon/.test(fp) ? "Modified starch" : /caramel/.test(fp) ? "Colour" : null,
        purpose: null,
        explanation: null,
      });
    }
  }
  // keep ingredient codes consistent with the additive list
  for (const ing of ingredients) {
    if (ing.e_number && !additiveKeys.has(ing.e_number) && !printedCodes.has(ing.e_number)) ing.e_number = null;
  }

  // ---- 8. nutrition
  const nutrition = buildNutrition(get("nutrition", "nutrition_facts", "nutritional_information"), productText, warn);

  // ---- 9. sugar (computed from per-100 sugars; the model's opinion is only a fallback)
  const basis: Basis = nutrition?.basis ?? (isDrink(productText) ? "100ml" : "100g");
  const unit = basis === "100ml" ? "ml" : "g";
  const sugarPer100 = nutrition?.per_100?.sugars_g ?? null;
  const oldSugar = get("sugar");
  let sugarLevelValue: Level | "unknown" = nutrition?.levels.sugars ?? sugarLevel(pick(oldSugar, "level")) ?? "unknown";
  let sugarExplanation: string | null;
  if (sugarPer100 !== null) {
    const t = LEVEL_THRESHOLDS[basis].sugars;
    sugarLevelValue = levelOf(sugarPer100, t) ?? "unknown";
    const lead = `${sugarPer100} g of sugars per 100 ${unit}`;
    sugarExplanation =
      sugarLevelValue === "high"
        ? `${lead}, above the ${t.high} g “high” threshold used on UK front-of-pack labels.`
        : sugarLevelValue === "low"
          ? `${lead}, at or below the ${t.low} g “low” threshold used on UK front-of-pack labels.`
          : `${lead}, between the ${t.low} g “low” and ${t.high} g “high” thresholds used on UK front-of-pack labels.`;
  } else {
    sugarExplanation =
      str(pick(oldSugar, "explanation"), 300) ??
      (ingredients.length || nutrition ? "No sugar value per 100 g/ml is printed on the visible label." : null);
  }

  // ---- 10. highlights (computed levels first; model claims about levels are replaced)
  const highlights: LabelAnalysis["highlights"] = [];
  if (nutrition?.per_100) {
    const p = nutrition.per_100;
    const levelNames: Record<LevelKey, [string, number | null]> = {
      fat: ["fat", p.fat_g],
      saturated_fat: ["saturated fat", p.saturated_fat_g],
      sugars: ["sugars", p.sugars_g],
      salt: ["salt", p.salt_g],
    };
    for (const [k, lvl] of Object.entries(nutrition.levels) as [LevelKey, Level | null][]) {
      const [nameOf, value] = levelNames[k];
      if (lvl === "high") highlights.push({ tone: "caution", text: `High in ${nameOf} (${value} g per 100 ${unit})` });
    }
    if (nutrition.levels.sugars === "low")
      highlights.push({ tone: "positive", text: `Low in sugars (${p.sugars_g} g per 100 ${unit})` });
  }
  const levelClaim =
    /(high|low|rich|medium|moderate)\b[^.]{0,25}\b(sugars?|fat|salt|sodium|saturate)|(sugars?|fat|salt|sodium|saturates?)\b[^.]{0,15}\b(is |are )?(high|low|moderate)\b/;
  for (const h of arr(get("highlights", "key_points"))) {
    if (highlights.length >= MAX_HIGHLIGHTS) break;
    const t = str(isObj(h) ? pick(h, "text", "point", "message") : h, 140);
    if (!t || (nutrition && levelClaim.test(fold(t)))) continue;
    if (!highlights.some((x) => fold(x.text) === fold(t)))
      highlights.push({ tone: isObj(h) ? tone(pick(h, "tone", "type", "sentiment")) : "neutral", text: t });
  }

  // ---- 11. detection & quality
  const substantive = ingredients.length > 0 || nutrition !== null || !!rawText;
  const labelDetected = substantive || (bool(get("label_detected", "is_food_label", "is_label")) ?? false);
  const quality = imageQuality(get("image_quality", "quality", "readability")) ?? (substantive ? "fair" : "poor");

  if (!labelDetected) {
    warn("This photo doesn't look like a food label. For best results, photograph the ingredient list or nutrition table up close.");
  } else {
    if (quality === "poor")
      warn("The label was hard to read, so some details may be missing or inaccurate. A sharper, closer photo will help.");
    else if (quality === "fair" && (nutrition || ingredients.length))
      warn("Parts of the label were hard to read. Double-check key numbers against the pack.");
    if (ingredients.length === 0) warn("No ingredient list was readable, so allergen, gluten and additive checks are incomplete.");
  }
  if (opts.repaired) warn("The analysis was cut short; some sections may be incomplete.");

  // every allergen needs at least one source, including ones added by the gluten rule
  for (const a of allergenMap.values())
    if (a.sources.length === 0) a.sources.push(a.declared ? "Declared on the label" : "Listed on the label");

  // ---- 12. dates, storage, manufacturer, origin
  const dates = get("dates");
  const storage = get("storage");
  const manufacturer = get("manufacturer");
  const language = str(get("language", "lang"), 10);

  return {
    label_detected: labelDetected,
    image_quality: quality,
    language: language && /^[a-z]{2,3}(-[a-z]{2,4})?$/i.test(language) ? language.toLowerCase() : null,
    product,
    summary: str(get("summary", "description", "overview"), 700),
    highlights: highlights.slice(0, MAX_HIGHLIGHTS),
    ingredients,
    allergens: [...allergenMap.values()].sort(
      (a, b) =>
        (a.presence === b.presence ? 0 : a.presence === "contains" ? -1 : 1) ||
        ALLERGEN_IDS.indexOf(a.id) - ALLERGEN_IDS.indexOf(b.id),
    ),
    gluten: { status: glutenStatus, confidence: glutenConfidence, evidence: glutenEvidence.slice(0, 6) },
    lactose: { status: lactoseStatus, evidence: lactoseEvidence.slice(0, 6) },
    additives: additives.slice(0, MAX_ADDITIVES),
    nutrition,
    sugar: { level: sugarLevelValue, per_100: sugarPer100, basis, explanation: sugarExplanation },
    claims,
    certifications,
    dates: {
      best_before: str(pick(dates, "best_before", "bbe", "best_before_end", "dlc", "dluo") ?? get("best_before"), 60),
      expiration: str(pick(dates, "expiration", "expiry", "use_by", "expiration_date") ?? get("expiration", "use_by"), 60),
      production: str(pick(dates, "production", "manufactured", "production_date", "packed_on"), 60),
      lot:
        str(pick(dates, "lot", "batch", "lot_number") ?? get("lot", "batch"), 60)
          ?.replace(/^(lot|batch|lote|n° ?de lot)(?![a-z])\s*(no\.?|n°|number)?\s*[:#.]?\s*/i, "")
          .trim() || null,
    },
    storage: {
      instructions: str(pick(storage, "instructions", "storage_instructions") ?? (typeof storage === "string" ? storage : null), 240),
      temperature: str(pick(storage, "temperature", "temp"), 60),
    },
    manufacturer: {
      name: str(pick(manufacturer, "name", "company") ?? (typeof manufacturer === "string" ? manufacturer : null), 120),
      address: str(pick(manufacturer, "address"), 240),
      country: str(pick(manufacturer, "country"), 60),
    },
    origin: str(get("origin", "country_of_origin", "made_in"), 80),
    raw_text: rawText,
    warnings,
  };
}

const RESULT_KEYS = new Set([
  "product", "ingredients", "nutrition", "label_detected", "allergens", "summary", "raw_text", "gluten", "additives",
]);

/** unwraps {result: {...}}, [{...}], {"data": {...}} … (up to 3 levels) to the analysis object */
function unwrap(input: unknown): Obj {
  let v = input;
  for (let depth = 0; depth < 3; depth++) {
    if (Array.isArray(v)) v = v.find(isObj);
    if (!isObj(v)) return {};
    const o = v;
    const keys = Object.keys(o);
    if (keys.some((k) => RESULT_KEYS.has(keyOf(k)))) return o;
    const inner = keys.length <= 2 ? keys.map((k) => o[k]).find((x) => isObj(x) || Array.isArray(x)) : undefined;
    if (!inner) return o;
    v = inner;
  }
  return isObj(v) ? v : {};
}
