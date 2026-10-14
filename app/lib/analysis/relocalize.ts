// A result shown in another interface language, without reading the photo again.
// Everything normalize.ts writes itself is rebuilt from messages.ts, exactly as normalize
// would have written it in that language. Only the model's own free text (summary, usual
// dose, additive explanations…) needs a translation, which `lookup` supplies: what it doesn't
// know is listed in `missing`, so the caller can have it translated and run this again.
// Pure and client-safe.

import type { Locale } from "../i18n/locales";
import { LEVEL_THRESHOLDS } from "./knowledge";
import { analysisMessages, type AnalysisMessages, PREVIOUS_WARNINGS, type WaterValues } from "./messages";
import { shortName } from "./normalize";
import type { Ingredient, LabelAnalysis, LevelKey } from "./types";

/** the translation of one piece of the model's free text, if it is known */
export type Lookup = (text: string) => string | undefined;

export interface Relocalized {
  result: LabelAnalysis;
  /** free text with no translation yet: it stays in the old language until `lookup` knows it */
  missing: string[];
}

export function relocalize(result: LabelAnalysis, from: Locale, to: Locale, lookup: Lookup): Relocalized {
  if (from === to) return { result, missing: [] };
  const a = analysisMessages(from);
  const b = analysisMessages(to);
  const missing = new Set<string>();
  const free = (s: string): string => {
    const known = lookup(s);
    if (known !== undefined) return known;
    missing.add(s);
    return s;
  };
  const freeOrNull = (s: string | null) => (s === null ? null : free(s));

  // the reader's language gets its own translation of a name; English reads name_en, and a
  // name printed in the reader's language needs none (see the prompt's name_local)
  const printedInTarget = result.language?.slice(0, 2) === to;
  const ingredientLocal = (i: Ingredient) => (to === "en" || printedInTarget ? null : free(i.name_en ?? i.name));
  const ingredients = result.ingredients.map((i) => ({ ...i, name_local: ingredientLocal(i) }));
  // the label normalize gives an ingredient in evidence and allergen sources, before and after
  const labelBefore = (i: Ingredient) => shortName(i.name_local ?? i.name_en ?? i.name);
  const labelAfter = (i: Ingredient) => shortName(i.name_local ?? i.name_en ?? i.name);
  const labels = new Map(result.ingredients.map((i, n) => [labelBefore(i), labelAfter(ingredients[n])]));

  const fixed = catalog(result, a, b);
  // scans saved before a warning was reworded hold its earlier wording: it becomes today's, in the new language
  for (const [key, olds] of Object.entries(PREVIOUS_WARNINGS[from] ?? {}))
    for (const old of olds ?? []) fixed.set(old, b.warnings[key as keyof AnalysisMessages["warnings"]] as string);
  for (const [before, after] of labels) fixed.set(a.evidence.ingredient(before), b.evidence.ingredient(after));
  // a sentence normalize wrote is rebuilt; anything else is the model's and gets translated
  const sentence = (s: string) => fixed.get(s) ?? free(s);

  const additives = result.additives.map((x) => ({
    ...x,
    name_local: to === "en" ? null : free(x.name),
    category: x.category === null ? null : (fixed.get(x.category) ?? free(x.category)),
    purpose: freeOrNull(x.purpose),
    explanation: freeOrNull(x.explanation),
  }));
  // a drink lists its colours and sweeteners by the additive's shown name
  const shownName = new Map(result.additives.map((x, n) => [x.name_local ?? x.name, additives[n].name_local ?? additives[n].name]));

  const water = result.water && {
    ...result.water,
    facts: result.water.facts.map((f) => {
      const w = result.water!;
      const values: WaterValues = { ph: w.ph, residue: w.dry_residue_mg_l, hardness: w.hardness_mg_l, minerals: w.minerals };
      return { ...f, text: b.water[f.id](values), tip: b.waterTips[f.id](values), source: b.waterSources[f.id] };
    }),
  };

  const marks = result.medicine?.marks;
  const medicine = result.medicine && {
    ...result.medicine,
    // the reading itself is never translated; only a note the app wrote (two possible readings) is rebuilt
    marks: marks && marks.note !== null && fixed.has(marks.note) ? { ...marks, note: fixed.get(marks.note)! } : (marks ?? null),
    active: result.medicine.active.map((x) => ({ ...x, name_local: to === "en" ? null : free(x.name) })),
    uses: result.medicine.uses.map(free),
    typical_dose: freeOrNull(result.medicine.typical_dose),
    how_to_take: freeOrNull(result.medicine.how_to_take),
    not_for: result.medicine.not_for.map(free),
    warnings: result.medicine.warnings.map(free),
    side_effects: result.medicine.side_effects.map(free),
    excipients: result.medicine.excipients.map((e) => ({
      ...e,
      note: b.excipients[e.id],
      source: e.id === "starch_unspecified" ? b.excipientSources.pack : b.excipientSources.ema,
    })),
  };

  return {
    result: {
      ...result,
      product: { ...result.product, category: freeOrNull(result.product.category) },
      summary: freeOrNull(result.summary),
      highlights: result.highlights.map((h) => ({ ...h, text: sentence(h.text) })),
      ingredients,
      allergens: result.allergens.map((x) => ({
        ...x,
        name: b.allergenNames[x.id],
        // a source is a sentence of normalize's, an ingredient's label, or a quote from the pack (kept as printed)
        sources: x.sources.map((s) => fixed.get(s) ?? labels.get(s) ?? s),
      })),
      gluten: { ...result.gluten, evidence: result.gluten.evidence.map(sentence) },
      lactose: { ...result.lactose, evidence: result.lactose.evidence.map(sentence) },
      additives,
      water,
      drink: result.drink && {
        ...result.drink,
        colours: result.drink.colours.map((c) => shownName.get(c) ?? c),
        sweeteners: result.drink.sweeteners.map((c) => shownName.get(c) ?? c),
      },
      medicine,
      sugar: { ...result.sugar, explanation: result.sugar.explanation === null ? null : sentence(result.sugar.explanation) },
      claims: result.claims.map(free),
      warnings: result.warnings.map(sentence),
    },
    missing: [...missing],
  };
}

/**
 * Every sentence normalize could have written for this result, in both languages. Fixed
 * sentences come from walking both message tables side by side; the ones built from values
 * (sugar, levels, nutrition issues, the database entry) are rebuilt from the result's values.
 */
function catalog(result: LabelAnalysis, a: AnalysisMessages, b: AnalysisMessages): Map<string, string> {
  const map = new Map<string, string>();
  const add = (x: string, y: string) => {
    if (x && !map.has(x)) map.set(x, y);
  };
  const walk = (x: unknown, y: unknown) => {
    if (typeof x === "string" && typeof y === "string") return add(x, y);
    if (!x || !y || typeof x !== "object" || typeof y !== "object" || Array.isArray(x)) return;
    for (const k of Object.keys(x)) walk((x as Record<string, unknown>)[k], (y as Record<string, unknown>)[k]);
  };
  walk(a, b);
  // English keeps its class names as they are (an empty table); the others translate them
  for (const k of new Set([...Object.keys(a.categories), ...Object.keys(b.categories)])) add(a.categories[k] ?? k, b.categories[k] ?? k);

  const issues = [a.issues, b.issues].map((m) => [m.sugarsOverCarbs, m.saturatesOverFat, m.macrosOver100, m.energyMismatch]);
  for (let mask = 1; mask < 16; mask++) {
    const pick = (list: string[]) => list.filter((_, i) => mask & (1 << i));
    add(a.warnings.nutritionInconsistent(pick(issues[0])), b.warnings.nutritionInconsistent(pick(issues[1])));
  }
  const product = result.database?.product;
  if (product) {
    add(a.warnings.database(product), b.warnings.database(product));
    add(a.warnings.databaseScan(product), b.warnings.databaseScan(product));
    add(a.warnings.medicineDatabase(product), b.warnings.medicineDatabase(product));
  }

  const basis = result.sugar.basis;
  const unit = basis === "100ml" ? "ml" : "g";
  const sugars = result.sugar.per_100;
  if (sugars !== null) {
    const t = LEVEL_THRESHOLDS[basis].sugars;
    for (const level of ["low", "medium", "high"] as const) add(a.sugar[level](sugars, unit, t), b.sugar[level](sugars, unit, t));
  }
  const p = result.nutrition?.per_100;
  if (p) {
    const values: Record<LevelKey, number | null> = { fat: p.fat_g, saturated_fat: p.saturated_fat_g, sugars: p.sugars_g, salt: p.salt_g };
    for (const k of Object.keys(values) as LevelKey[]) add(a.highlights.high(k, values[k], unit), b.highlights.high(k, values[k], unit));
    add(a.highlights.lowSugars(p.sugars_g, unit), b.highlights.lowSugars(p.sugars_g, unit));
  }
  return map;
}
