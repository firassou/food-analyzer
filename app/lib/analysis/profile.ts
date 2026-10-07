// The optional personal profile: what the reader avoids, checked against a result.
// Pure and client-safe. The profile never leaves the device and nothing here calls
// the model: every finding comes from the already-normalized result (allergens,
// gluten, lactose, sugar level) and from the ingredient rules below.

import { fold } from "./knowledge";
import { ALLERGEN_IDS, type AllergenId, type LabelAnalysis } from "./types";

export const DIETS = ["vegetarian", "vegan", "halal"] as const;
export type Diet = (typeof DIETS)[number];

export interface Profile {
  allergens: AllergenId[];
  /** lactose intolerance (not the same as a milk allergy) */
  lactose: boolean;
  /** watches sugar: products high in sugars are pointed out */
  sugar: boolean;
  diets: Diet[];
}

export const EMPTY_PROFILE: Profile = { allergens: [], lactose: false, sugar: false, diets: [] };

export const isEmptyProfile = (p: Profile) => p.allergens.length === 0 && !p.lactose && !p.sugar && p.diets.length === 0;

/** a stored profile, whatever shape it comes back in */
export function sanitizeProfile(raw: unknown): Profile {
  const x = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const list = (v: unknown) => (Array.isArray(v) ? v : []);
  return {
    allergens: ALLERGEN_IDS.filter((id) => list(x.allergens).includes(id)),
    lactose: x.lactose === true,
    sugar: x.sugar === true,
    diets: DIETS.filter((d) => list(x.diets).includes(d)),
  };
}

export type ProfileTopic =
  | { type: "allergen"; id: AllergenId }
  | { type: "lactose" }
  | { type: "sugar" }
  | { type: "diet"; diet: Diet };

export interface ProfileFinding {
  /** "avoid": it is in there. "check": it may be, or its source isn't stated. */
  level: "avoid" | "check";
  topic: ProfileTopic;
  /** the ingredients behind it, as printed (max 4) */
  because: string[];
}

export interface ProfileCheck {
  /** "unchecked": the ingredients weren't read, so nothing can be said */
  status: "avoid" | "check" | "ok" | "unchecked";
  findings: ProfileFinding[];
}

// ---------------------------------------------------------------- ingredient rules
//
// Matched on fold(name + English name). Deliberately short lists of unambiguous words:
// a missed exotic ingredient is acceptable (the verdict says "nothing found", never
// "safe"), a false alarm on every other product is not.

const word = (terms: string, arabic?: string) =>
  new RegExp(`(?<![\\p{L}])(?:${terms})(?![\\p{L}])${arabic ? `|${arabic}` : ""}`, "u");

const PORK = word("pork|porc|lard|lardons?|bacon|ham|jambon|saindoux|prosciutto|pancetta|chorizo|salami|saucisson|cochon", "خنزير");
const MEAT = word(
  "meat|viandes?|beef|boeuf|chicken|poulet|turkey|dinde|lamb|agneau|mutton|mouton|veal|veau|duck|canard|poultry|volaille|tallow|suif|animal fat|graisse animale|beef fat|graisse de (boeuf|canard|oie)|bone (broth|phosphate)|bouillon de (boeuf|poule|volaille)",
  "لحم|دجاج",
);
const GELATIN = word("gelatine?|gelatina", "جيلاتين");
const CARMINE = word("carmine?s?|cochineal|cochenille|carminic acid|acide carminique");
const SHELLAC = word("shellac|gomme[- ]laque");
const BEE = word("honey|miel|beeswax|cire d'abeille|royal jelly|gelee royale|propolis", "عسل");
const RENNET = word("rennet|presure");
const ALCOHOL = word("alcohol|alcool|ethanol|wine|vin|rum|rhum|beer|biere|liqueur|kirsch|brandy|cognac|whisky|whiskey|vodka|marsala|champagne", "كحول|نبيذ");
// what looks like alcohol and isn't
const NOT_ALCOHOL =
  /(?<![\p{L}])(sans alcool|alcohol[- ]free|non[- ]alcoholic|vinaigre de (vin|cidre|alcool)|(wine|cider|spirit) vinegar|(cetyl|stearyl|cetostearyl|benzyl|polyvinyl) alcohol|alcool (cetylique|stearylique|cetostearylique|benzylique|polyvinylique)|sugar alcohols?)(?![\p{L}])/gu;
// fats and emulsifiers that can be of animal or plant origin: the label rarely says which
const FAT_ADDITIVES = word("mono-? ?(and|et|-) ?di-?glycerides?( of fatty acids| d'acides gras)?|mono-? ?et diglycerides d'acides gras|stearic acid|acide stearique");
const FAT_CODES = /^E(47[0-9][a-f]?|570|422)$/i;

export type Hit = "pork" | "meat" | "gelatin" | "carmine" | "shellac" | "bee" | "rennet" | "alcohol" | "fat_additive" | "bone";

export function hitsOf(name: string, code: string | null): Hit[] {
  const text = fold(name);
  const out: Hit[] = [];
  if (PORK.test(text)) out.push("pork");
  if (MEAT.test(text)) out.push("meat");
  if (GELATIN.test(text) || code === "E441") out.push("gelatin");
  if (CARMINE.test(text) || code === "E120") out.push("carmine");
  if (SHELLAC.test(text) || code === "E904") out.push("shellac");
  if (BEE.test(text) || code === "E901") out.push("bee");
  if (RENNET.test(text)) out.push("rennet");
  if (ALCOHOL.test(text.replace(NOT_ALCOHOL, " "))) out.push("alcohol");
  if (FAT_ADDITIVES.test(text) || (code !== null && FAT_CODES.test(code))) out.push("fat_additive");
  if (code === "E542") out.push("bone");
  return out;
}

// what each diet makes of a hit
const RULES: Record<Diet, Partial<Record<Hit, "avoid" | "check">>> = {
  vegetarian: { pork: "avoid", meat: "avoid", gelatin: "avoid", carmine: "avoid", bone: "avoid", rennet: "check", fat_additive: "check" },
  vegan: { pork: "avoid", meat: "avoid", gelatin: "avoid", carmine: "avoid", bone: "avoid", shellac: "avoid", bee: "avoid", rennet: "check", fat_additive: "check" },
  // meat other than pork, gelatine and animal-or-plant fats depend on a halal source the label rarely states
  halal: { pork: "avoid", alcohol: "avoid", meat: "check", gelatin: "check", carmine: "check", bone: "check", fat_additive: "check" },
};

const CLAIMS: Record<Diet, RegExp> = {
  vegetarian: /(?<![\p{L}])(vegetarian|vegetarien(ne)?s?|vegan|vegetalien(ne)?s?|v-label)(?![\p{L}])|نباتي/u,
  vegan: /(?<![\p{L}])(vegan|vegetalien(ne)?s?|100 ?% vegetal)(?![\p{L}])/u,
  halal: /(?<![\p{L}])halal(?![\p{L}])|حلال/u,
};

const MAX_BECAUSE = 4;

/**
 * What a result means for this profile. Null when there is nothing to check: no
 * profile, plain water, or a photo of something else.
 */
export function checkProfile(result: LabelAnalysis, profile: Profile): ProfileCheck | null {
  if (isEmptyProfile(profile) || result.kind === "water" || result.kind === "other") return null;
  // an estimate (a dish, a recalled recipe) can make something likely, never certain
  const estimated = result.ingredient_source === "estimated";
  const cap = (level: "avoid" | "check") => (estimated ? "check" : level);
  const findings: ProfileFinding[] = [];

  for (const id of profile.allergens) {
    const entry = result.allergens.find((a) => a.id === id);
    let level: "avoid" | "check" | null = entry ? (entry.presence === "contains" ? "avoid" : "check") : null;
    if (id === "gluten") {
      if (result.gluten.status === "contains") level = "avoid";
      else if (result.gluten.status === "likely_contains") level ??= "check";
    }
    if (level) findings.push({ level: cap(level), topic: { type: "allergen", id }, because: (entry?.sources ?? []).slice(0, MAX_BECAUSE) });
  }

  if (profile.lactose && (result.lactose.status === "contains" || result.lactose.status === "likely_contains")) {
    findings.push({
      level: cap(result.lactose.status === "contains" ? "avoid" : "check"),
      topic: { type: "lactose" },
      because: result.lactose.evidence.slice(0, MAX_BECAUSE),
    });
  }

  if (profile.sugar && result.sugar.level === "high") findings.push({ level: "check", topic: { type: "sugar" }, because: [] });

  if (profile.diets.length) {
    const claimed = fold([...result.claims, ...result.certifications].join(" | "));
    const items = result.ingredients.map((i) => ({ shown: i.name, hits: hitsOf(`${i.name} ${i.name_en ?? ""}`, i.e_number) }));
    // additives found inside a compound ingredient: only what the ingredients didn't already show
    const seen = new Set(items.flatMap((item) => item.hits));
    for (const a of result.additives) {
      const hits = hitsOf(a.name, a.code).filter((hit) => !seen.has(hit));
      if (hits.length) items.push({ shown: a.code ?? a.name, hits });
    }
    // animal products the allergen check already knows about
    const has = (id: AllergenId) => result.allergens.some((a) => a.id === id && a.presence === "contains");
    for (const diet of profile.diets) {
      const because = { avoid: new Set<string>(), check: new Set<string>() };
      for (const { shown, hits } of items) for (const hit of hits) {
        const level = RULES[diet][hit];
        if (level) because[level].add(shown);
      }
      if (diet !== "halal") for (const id of ["fish", "crustaceans", "molluscs"] as const) if (has(id)) because.avoid.add(result.allergens.find((a) => a.id === id)!.name);
      if (diet === "vegan") for (const id of ["milk", "eggs"] as const) if (has(id)) because.avoid.add(result.allergens.find((a) => a.id === id)!.name);
      // a certified or claimed product answers the "source not stated" doubts, not a listed ingredient
      if (CLAIMS[diet].test(claimed)) because.check.clear();
      const level = because.avoid.size ? "avoid" : because.check.size ? "check" : null;
      if (level) findings.push({ level: cap(level), topic: { type: "diet", diet }, because: [...because[level]].slice(0, MAX_BECAUSE) });
    }
  }

  // "avoid" first
  findings.sort((a, b) => Number(b.level === "avoid") - Number(a.level === "avoid"));
  const status =
    findings.some((f) => f.level === "avoid") ? "avoid"
    : findings.length ? "check"
    // nothing was read: saying "nothing found" would be a false comfort
    : result.ingredients.length === 0 && !(onlySugar(profile) && result.sugar.level !== "unknown") ? "unchecked"
    : "ok";
  return { status, findings };
}

const onlySugar = (p: Profile) => p.sugar && p.allergens.length === 0 && !p.lactose && p.diets.length === 0;
