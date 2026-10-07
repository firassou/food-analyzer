// A food, drink or water against the medicines on the reader's shelf: a short list of
// long-established pairs of the kind leaflets state (caffeine and ciprofloxacin, dairy and
// tetracycline, grapefruit and some statins, alcohol and metronidazole…). Deterministic, pure
// and client-safe: the model is not asked.
//
// Like the two-medicine check it is one-sided. A finding is worth a question to the
// pharmacist; NO finding means nothing at all, and the UI must say so. The signals come from
// what was read or computed on the label (ingredients, allergens, the drink's caffeine, the
// water's minerals), never from a guess about the recipe.

import { type GroupId, substanceOf, type Substance } from "./interactions";
import { fold } from "./knowledge";
import { hitsOf } from "./profile";
import type { LabelAnalysis, Medicine } from "./types";

export const FOOD_INTERACTION_IDS = [
  "caffeine_quinolone",
  "caffeine_levothyroxine",
  "minerals_binding",
  "dairy_binding",
  "grapefruit_statin",
  "alcohol_nitroimidazole",
  "alcohol_sedative",
  "alcohol_paracetamol",
  "potassium_salt",
] as const;
export type FoodInteractionId = (typeof FOOD_INTERACTION_IDS)[number];

/**
 * What it is about the food that matters. Alcohol comes in two strengths: a drink that is one
 * ("alcohol"), or a food that lists some ("alcohol_food": a sauce with wine, a liqueur filling).
 */
export type Signal = "caffeine" | "minerals" | "dairy" | "grapefruit" | "alcohol" | "alcohol_food" | "potassium";

type Severity = "avoid" | "caution";

// the id of the sentence, the signal, the medicine groups it concerns (any of them), how serious
const RULES: [FoodInteractionId, Signal, GroupId[], Severity][] = [
  ["alcohol_nitroimidazole", "alcohol", ["nitroimidazole"], "avoid"],
  ["alcohol_sedative", "alcohol", ["benzodiazepine", "opioid"], "avoid"],
  ["alcohol_nitroimidazole", "alcohol_food", ["nitroimidazole"], "caution"],
  ["alcohol_sedative", "alcohol_food", ["benzodiazepine", "opioid"], "caution"],
  ["grapefruit_statin", "grapefruit", ["statin_3a4"], "caution"],
  // caffeine is cleared by CYP1A2, which ciprofloxacin and enoxacin block; the other quinolones barely do
  ["caffeine_quinolone", "caffeine", ["cyp1a2_inhibitor"], "caution"],
  ["caffeine_levothyroxine", "caffeine", ["levothyroxine"], "caution"],
  ["minerals_binding", "minerals", ["bound_by_minerals"], "caution"],
  // dairy has a real effect on the quinolones and on tetracycline itself, a modest one on doxycycline
  ["dairy_binding", "dairy", ["quinolone", "tetracycline"], "caution"],
  ["alcohol_paracetamol", "alcohol", ["paracetamol"], "caution"],
  ["alcohol_paracetamol", "alcohol_food", ["paracetamol"], "caution"],
  ["potassium_salt", "potassium", ["acei_arb", "potassium"], "caution"],
];

const GRAPEFRUIT = /(?<![\p{L}])(grapefruits?|pamplemousses?|pomelos?|pompelmo|toronja|pampelmuse)(?![\p{L}])|جريب ?فروت|غريب ?فروت|ليمون هندي/u;
// a flavouring may carry none of the fruit's compounds, and a flavouring made with alcohol is not a drink
const FLAVOURING = /(?<![\p{L}])(flavou?r(ing|ed|s)?|aromes?|aromatis(e|ee|es)?|aroma|extracts?|extraits?|gout|saveur|essence)(?![\p{L}])|نكهة|منكه/u;
const POTASSIUM_CHLORIDE = /(?<![\p{L}])(potassium chloride|chlorure de potassium|cloruro de potasio|cloruro di potassio|kaliumchlorid)(?![\p{L}])|كلوريد البوتاسيوم/u;
const CAFFEINE = /(?<![\p{L}])(caffeine|cafeine|cafeina|caffeina|koffein|guarana)(?![\p{L}])|كافيين/u;
const CAFFEINE_FREE =
  /(caffeine|cafeine|cafeina|caffeina|koffein)[- ]?(free|libre|frei|senza)|(sans|sin|senza|ohne) (caffeine|cafeine|cafeina|caffeina|koffein)|decaf|decafeine|بدون كافيين|خالي من الكافيين/u;
// minerals that bind a medicine in the gut, as the supplements a food is fortified with
const MINERAL_SUPPLEMENT =
  /(?<![\p{L}])(iron|reduced iron|fer|ferrous \w+|ferric \w+|zinc( \w+)?|tricalcium phosphate|calcium (carbonate|lactate|citrate|gluconate|phosphate)|carbonate de calcium|magnesium (oxide|carbonate|citrate)|oxyde de magnesium)(?![\p{L}])/u;

// drinks and ingredients that are alcoholic by name, beyond the generic words `hitsOf` knows
const ALCOHOLIC =
  /(?<![\p{L}])(wine|vin|vino|vinho|wein|beer|biere|birra|cerveza|bier|cider|cidre|sidra|gin|tequila|sake|prosecco|champagne|porto|port wine|sherry|xeres|pastis|ouzo|rum|rhum|ron|vodka|whisk(e)?y|brandy|cognac|liqueur|liquore|kirsch|marsala|mead|hydromel)(?![\p{L}])|بيرة|نبيذ|خمر|مشروب كحولي/u;
// what is named after one and isn't, or says it has none
const NOT_ALCOHOLIC =
  /(root beer|ginger beer|biere de gingembre|sans alcool|alcohol[- ]free|non[- ]alcoholic|sin alcohol|senza alcol|alkoholfrei|vinaigre|vinegar|aceto|essig|vinagre|(?<![\d.,])0[.,]0 ?%|بدون كحول|خالي من الكحول|سيتيل|ستيريل|بنزيل|كحول سكري)/u;

const alcoholic = (text: string) => ALCOHOLIC.test(text) && !NOT_ALCOHOLIC.test(text);

/** the signals a result sends; empty for anything that isn't something to eat or drink */
export function foodSignals(result: LabelAnalysis): Set<Signal> {
  const out = new Set<Signal>();
  if (result.kind === "medicine" || result.kind === "other") return out;

  // a water rich in what binds a medicine in the gut (computed from the printed minerals)
  if (result.water?.facts.some((f) => f.id === "calcium_rich" || f.id === "magnesium_rich")) out.add("minerals");

  // from here on it rests on the list of ingredients: not on a guess at a recipe
  if (result.ingredient_source === "estimated") return out;

  if (result.allergens.some((a) => a.id === "milk" && a.presence === "contains")) out.add("dairy");

  const named = fold(`${result.product.name ?? ""} ${result.product.category ?? ""}`);
  const claims = fold(result.claims.join(" | "));
  const names = result.ingredients.map((i) => ({ i, text: fold(`${i.name} ${i.name_en ?? ""}`) }));
  const everything = `${names.map((n) => n.text).join(" | ")} | ${claims} | ${named}`;

  if ((names.some((n) => CAFFEINE.test(n.text)) || CAFFEINE.test(claims)) && !CAFFEINE_FREE.test(everything)) out.add("caffeine");

  let alcohol: Signal | null = null;
  for (const { i, text } of names) {
    if (GRAPEFRUIT.test(text) && !FLAVOURING.test(text)) out.add("grapefruit");
    if (POTASSIUM_CHLORIDE.test(text)) out.add("potassium");
    if (MINERAL_SUPPLEMENT.test(text)) out.add("minerals");
    if (!FLAVOURING.test(text) && !NOT_ALCOHOLIC.test(text) && (alcoholic(text) || hitsOf(`${i.name} ${i.name_en ?? ""}`, i.e_number).includes("alcohol"))) alcohol = "alcohol_food";
  }
  // a drink that names itself ("beer", "red wine") more often than it lists ethanol
  if (result.kind === "drink" && (alcohol || alcoholic(named))) alcohol = "alcohol";
  if (alcohol) out.add(alcohol);
  return out;
}

/** a cream, gel or eye drop is not what a warning about drinking or swallowing is about */
const TOPICAL = /(?<![\p{L}])(gel|cream|creme|ointment|pommade|lotion|collyre|eye drops?|ophthalmi\w*|nasal|spray|shampoo|patch|emplatre|ovules?|pessar\w*|topical|cutane\w*)(?![\p{L}])/u;

export interface ShelfMedicine {
  /** how the reader sees it: the product's name */
  name: string;
  /** null when the pack's substance wasn't read */
  medicine: Medicine | null;
}

export interface FoodFinding {
  id: FoodInteractionId;
  severity: Severity;
  /** the shelf medicine concerned, as named on its pack */
  medicine: string;
  /** the active substance that matched, as shown to the reader */
  substance: string;
}

export interface FoodCheck {
  /** false when no medicine on the shelf had a readable active substance: nothing could be compared */
  checked: boolean;
  findings: FoodFinding[];
}

/** what stands out between this food and the medicines on the shelf */
export function checkFoodWithMedicines(result: LabelAnalysis, shelf: ShelfMedicine[]): FoodCheck {
  const readable = shelf
    .map((m) => ({ name: m.name, topical: TOPICAL.test(fold(m.medicine?.form ?? "")), substances: (m.medicine?.active ?? []).map(substanceOf) }))
    .filter((m) => m.substances.length > 0);
  if (readable.length === 0) return { checked: false, findings: [] };
  const signals = foodSignals(result);
  const findings: FoodFinding[] = [];
  if (signals.size > 0)
    for (const m of readable) {
      if (m.topical) continue;
      const seen = new Set<FoodInteractionId>();
      for (const [id, signal, groups, severity] of RULES) {
        if (!signals.has(signal) || seen.has(id)) continue;
        const hit: Substance | undefined = m.substances.find((x) => groups.some((g) => x.groups.has(g)));
        if (!hit) continue;
        seen.add(id);
        findings.push({ id, severity, medicine: m.name, substance: hit.shown });
      }
    }
  // the serious ones first
  findings.sort((p, q) => Number(q.severity === "avoid") - Number(p.severity === "avoid"));
  return { checked: true, findings };
}
