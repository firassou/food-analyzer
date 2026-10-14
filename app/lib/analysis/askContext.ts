// What the reader may choose to tell Ask AI about themselves: what they avoid, the medicines they
// have scanned, and what the app's own rules found for this product. Built on the device from the
// profile and the saved scans, and sent only when the reader has turned it on (it is off by
// default): the profile never leaves the device otherwise. Pure and client-safe.
//
// The findings are the point. The model is told to treat them as facts and not to contradict them,
// so an answer about "can I eat this with my pills?" rests on the rule that fired, not on what the
// model happens to remember.

import { checkConditions, CONDITION_NAMES, type ConditionRuleId } from "./conditions";
import { checkFoodWithMedicines, type ShelfMedicine } from "./foodMedicine";
import { checkProfile, isEmptyProfile, type Profile, type ProfileFinding } from "./profile";
import { ALLERGEN_NAMES, type LabelAnalysis } from "./types";

export interface AskContext {
  /** who is asking, as plain English lines */
  reader: string[];
  /** what the app's rules found for this product and this reader, as plain English lines */
  checks: string[];
}

export const MAX_CONTEXT_LINES = 24;
export const MAX_CONTEXT_LINE_CHARS = 240;

const topicText = (f: ProfileFinding) =>
  f.topic.type === "allergen" ? `${ALLERGEN_NAMES[f.topic.id].toLowerCase()} (allergy or intolerance)`
  : f.topic.type === "lactose" ? "lactose (intolerance)"
  : f.topic.type === "sugar" ? "sugar (the reader watches it)"
  : `${f.topic.diet} diet`;

const words = (id: string) => id.replace(/_/g, " ");

/** what each health-condition rule found, in plain English */
const RULE_FACTS: Record<ConditionRuleId, string> = {
  bleeding_nsaid: "an NSAID or aspirin, which adds bleeding risk",
  bleeding_anticoagulant: "an anticoagulant or antiplatelet medicine, which adds bleeding risk",
  bleeding_ssri: "an SSRI or SNRI antidepressant, which can add bleeding risk",
  bleeding_injection: "an intramuscular injection, which can cause a muscle bleed",
  bleeding_supplement: "a supplement that can add bleeding risk (omega-3, ginkgo, garlic or high-dose vitamin E)",
  diabetes_sugar_excipient: "sugar (sucrose or glucose) in a syrup, liquid or chewable medicine",
  diabetes_corticosteroid: "a corticosteroid, which can raise blood sugar",
  diabetes_sugar_food: "high in sugars (UK FSA level)",
  diabetes_sugar_drink: "a lot of sugar in one container (25 g or more)",
  diabetes_sugary_drink: "a sugary drink (5 g of sugars per 100 ml or more), its volume not read",
  bp_nsaid: "an NSAID, which can raise blood pressure",
  bp_decongestant: "a decongestant, which can raise blood pressure",
  bp_sodium_tablet: "an effervescent tablet, which carries a lot of sodium",
  bp_liquorice: "liquorice, which can raise blood pressure",
  bp_salt: "high in salt (UK FSA level)",
  bp_sodium_water: "a water rich in sodium (over 200 mg/L)",
  bp_caffeine: "a high-caffeine or energy drink",
  kidney_nsaid: "an NSAID, which can harm the kidneys",
  kidney_potassium: "a medicine that raises potassium",
  kidney_methotrexate: "methotrexate, which the kidneys clear",
  kidney_potassium_salt: "potassium chloride (a salt substitute)",
  ulcer_nsaid: "an NSAID or aspirin, which can harm the stomach lining",
  ulcer_corticosteroid: "a corticosteroid, which can irritate the stomach",
  ulcer_alcohol: "an alcoholic drink",
  asthma_nsaid: "an NSAID or aspirin, which can set off asthma in some people",
  asthma_beta_blocker: "a non-selective beta-blocker, which can narrow the airways",
  g6pd_fava: "fava (broad) beans, which can bring on haemolysis",
  g6pd_drug: "a medicine known to bring on haemolysis in G6PD deficiency",
  g6pd_aspirin: "aspirin at a pain-relief strength",
  pregnancy_nsaid: "an NSAID, to avoid in pregnancy (contra-indicated from the 6th month)",
  pregnancy_low_aspirin: "low-dose aspirin, which is sometimes prescribed in pregnancy",
  pregnancy_drug: "a medicine known to harm the unborn child",
  pregnancy_alcohol: "alcohol",
  pregnancy_alcohol_medicine: "alcohol (ethanol) in a medicine",
  pregnancy_caffeine: "a high-caffeine or energy drink",
  pregnancy_liquorice: "liquorice",
  liver_paracetamol: "paracetamol, whose dose may need lowering",
  liver_alcohol: "alcohol",
  liver_alcohol_medicine: "alcohol (ethanol) in a medicine",
};

/** true when there is anything to tell: a profile, or at least one medicine with a readable substance */
export function hasPersonalContext(profile: Profile, shelf: ShelfMedicine[]): boolean {
  return !isEmptyProfile(profile) || shelf.some((m) => (m.medicine?.active.length ?? 0) > 0);
}

export function buildAskContext(result: LabelAnalysis, profile: Profile, shelf: ShelfMedicine[]): AskContext {
  const reader: string[] = [];
  const checks: string[] = [];

  if (!isEmptyProfile(profile)) {
    const parts = [
      profile.allergens.length > 0 && `allergic or intolerant to ${profile.allergens.map((id) => ALLERGEN_NAMES[id].toLowerCase()).join(", ")}`,
      profile.lactose && "lactose intolerant",
      profile.sugar && "watches sugar",
      profile.diets.length > 0 && `follows a ${profile.diets.join(" and ")} diet`,
    ].filter(Boolean);
    if (parts.length > 0) reader.push(`The reader is ${parts.join("; ")}.`);
    if (profile.conditions?.length) reader.push(`The reader's health conditions: ${profile.conditions.map((c) => CONDITION_NAMES[c]).join("; ")}.`);
    // typed by the reader: data, never instructions (the prompt says so for the whole block)
    if (profile.otherConditions?.length)
      reader.push(`Other health conditions of the reader (only checked against a medicine's official product information): ${profile.otherConditions.join("; ")}.`);
  }
  const medicines = shelf
    .filter((m) => (m.medicine?.active.length ?? 0) > 0)
    .map((m) => `${m.name} (${m.medicine!.active.map((a) => [a.name, a.strength].filter(Boolean).join(" ")).join(", ")})`);
  if (medicines.length > 0) reader.push(`Medicines the reader has scanned: ${medicines.join("; ")}.`);

  const profileCheck = checkProfile(result, profile);
  if (profileCheck) {
    checks.push(`Profile check for this product: ${profileCheck.status === "avoid" ? "AVOID" : profileCheck.status === "check" ? "CHECK" : profileCheck.status === "ok" ? "nothing the reader avoids was found" : "not checked (the ingredients were not read)"}.`);
    for (const f of profileCheck.findings) {
      checks.push(`- ${f.level === "avoid" ? "Contains" : "May contain or unclear"}: ${topicText(f)}${f.because.length > 0 ? ` — ${f.because.join(", ")}` : ""}`);
    }
  }
  const conditionCheck = checkConditions(result, profile);
  if (conditionCheck) {
    checks.push(
      `Health condition check for this product: ${
        conditionCheck.status === "avoid" ? "AVOID"
        : conditionCheck.status === "check" ? "CHECK"
        : conditionCheck.status === "ok" ?
          result.kind === "medicine" ?
            "its official product information names none of the reader's conditions"
          : "nothing found for the reader's conditions (sugar, salt, alcohol, caffeine and the other limits health authorities set)"
        : result.kind === "medicine" ? "not checked (its official product information was not found)"
        : "not checked (the ingredients were not read)"
      }.`,
    );
    const source = conditionCheck.officialSource;
    if (source) checks.push(`Official product information used: ${source.product}${source.match === "substance" ? " (a French medicine with the same active substance and strength)" : ""}.`);
    for (const f of conditionCheck.official) {
      const section = f.section === "contraindications" ? "contraindication (4.3)" : f.section === "warnings" ? "warning (4.4)" : "pregnancy (4.6)";
      checks.push(`- Official ${section} for ${f.condition ? CONDITION_NAMES[f.condition] : f.other}: "${f.quote}"`);
    }
    for (const f of conditionCheck.findings) {
      checks.push(
        `- ${f.level === "avoid" ? "Avoid, ask a doctor or pharmacist" : "Check with a doctor or pharmacist"}: ${CONDITION_NAMES[f.condition]} — ${RULE_FACTS[f.ruleId]}${f.because.length > 0 ? ` — ${f.because.join(", ")}` : ""}`,
      );
    }
  }
  for (const f of checkFoodWithMedicines(result, shelf).findings) {
    checks.push(`Medicine check: ${f.severity === "avoid" ? "ask before combining" : "needs a precaution"} — ${words(f.id)} — ${f.medicine} (${f.substance}).`);
  }
  return { reader: reader.slice(0, MAX_CONTEXT_LINES), checks: checks.slice(0, MAX_CONTEXT_LINES) };
}
