// The reader's health conditions (and pregnancy) checked against a result: a medicine that
// adds bleeding risk in hemophilia, a sugary syrup for a diabetic, a salty food or an
// effervescent tablet with high blood pressure. Deterministic, pure and client-safe, in the
// style of interactions.ts and foodMedicine.ts: the model is never asked what is dangerous.
//
// Each rule cites where it comes from: the BNF (British National Formulary, its "Hepatic /
// Renal impairment", "Pregnancy" and "G6PD deficiency" sections and its cautions), the ANSM
// (French medicines agency), the WFH Guidelines for the Management of Hemophilia (3rd ed.,
// 2020), the EMA excipients annex (EMA/CHMP/302620/2017), EU Regulation 1169/2011 Annex III
// (liquorice and caffeine statements), the FSA front-of-pack levels and Directive 2009/54/EC.
//
// The lists are short and one-sided, like profile.ts: a missed rule is acceptable, a false
// alarm on every product is not. A finding is "avoid, ask your doctor or pharmacist" or
// "check with your doctor or pharmacist"; NO finding means nothing was found, never "safe".

import { TOPICAL, foodSignals } from "./foodMedicine";
import { type GroupId, substanceOf, type Substance } from "./interactions";
import { fold } from "./knowledge";
import { officialFindings, type OfficialFinding } from "./official";
import { CONDITION_IDS, type ConditionId, type Profile } from "./profile";
import type { LabelAnalysis } from "./types";

export { CONDITION_IDS, type ConditionId };

export const CONDITION_RULE_IDS = [
  "bleeding_nsaid",
  "bleeding_anticoagulant",
  "bleeding_ssri",
  "bleeding_injection",
  "bleeding_supplement",
  "diabetes_sugar_excipient",
  "diabetes_corticosteroid",
  "diabetes_sugar_food",
  "diabetes_sugar_drink",
  "diabetes_sugary_drink",
  "bp_nsaid",
  "bp_decongestant",
  "bp_sodium_tablet",
  "bp_liquorice",
  "bp_salt",
  "bp_sodium_water",
  "bp_caffeine",
  "kidney_nsaid",
  "kidney_potassium",
  "kidney_methotrexate",
  "kidney_potassium_salt",
  "ulcer_nsaid",
  "ulcer_corticosteroid",
  "ulcer_alcohol",
  "asthma_nsaid",
  "asthma_beta_blocker",
  "g6pd_fava",
  "g6pd_drug",
  "g6pd_aspirin",
  "pregnancy_nsaid",
  "pregnancy_low_aspirin",
  "pregnancy_drug",
  "pregnancy_alcohol",
  "pregnancy_alcohol_medicine",
  "pregnancy_caffeine",
  "pregnancy_liquorice",
  "liver_paracetamol",
  "liver_alcohol",
  "liver_alcohol_medicine",
] as const;
export type ConditionRuleId = (typeof CONDITION_RULE_IDS)[number];

/** the guidance a rule rests on; their names are in the dictionaries (`profile.verdict.health.sources`) */
export const SOURCE_IDS = ["bnf", "ansm", "wfh", "ema", "eu1169", "fsa", "who", "nice", "mineral_water", "nhs"] as const;
export type SourceId = (typeof SOURCE_IDS)[number];

/** where each rule comes from, shown next to the finding */
export const RULE_SOURCES: Record<ConditionRuleId, SourceId[]> = {
  bleeding_nsaid: ["wfh", "bnf"],
  bleeding_anticoagulant: ["wfh", "bnf"],
  bleeding_ssri: ["bnf"],
  bleeding_injection: ["wfh"],
  bleeding_supplement: ["wfh", "bnf"],
  diabetes_sugar_excipient: ["ema"],
  diabetes_corticosteroid: ["bnf"],
  diabetes_sugar_food: ["fsa"],
  diabetes_sugar_drink: ["who"],
  diabetes_sugary_drink: ["fsa"],
  bp_nsaid: ["bnf"],
  bp_decongestant: ["bnf", "ansm"],
  bp_sodium_tablet: ["ema"],
  bp_liquorice: ["eu1169"],
  bp_salt: ["fsa"],
  bp_sodium_water: ["mineral_water"],
  bp_caffeine: ["nhs"],
  kidney_nsaid: ["bnf", "nice"],
  kidney_potassium: ["bnf"],
  kidney_methotrexate: ["bnf"],
  kidney_potassium_salt: ["bnf"],
  ulcer_nsaid: ["bnf"],
  ulcer_corticosteroid: ["bnf"],
  ulcer_alcohol: ["bnf"],
  asthma_nsaid: ["bnf"],
  asthma_beta_blocker: ["bnf"],
  g6pd_fava: ["who"],
  g6pd_drug: ["bnf"],
  g6pd_aspirin: ["bnf"],
  pregnancy_nsaid: ["ansm", "bnf"],
  pregnancy_low_aspirin: ["ansm", "bnf"],
  pregnancy_drug: ["ansm", "bnf"],
  pregnancy_alcohol: ["nhs"],
  pregnancy_alcohol_medicine: ["ema"],
  pregnancy_caffeine: ["eu1169", "nhs"],
  pregnancy_liquorice: ["nhs"],
  liver_paracetamol: ["bnf"],
  liver_alcohol: ["bnf"],
  liver_alcohol_medicine: ["ema"],
};

/** the conditions in plain English, for Ask AI */
export const CONDITION_NAMES: Record<ConditionId, string> = {
  hemophilia: "hemophilia or another bleeding disorder",
  diabetes: "diabetes",
  hypertension: "high blood pressure",
  coeliac: "coeliac disease",
  kidney_disease: "kidney disease",
  stomach_ulcer: "stomach ulcer",
  asthma: "asthma",
  g6pd_deficiency: "G6PD deficiency",
  pregnancy: "pregnancy",
  liver_disease: "liver disease",
};

type Level = "avoid" | "check";

export interface ConditionFinding {
  /** "avoid": avoid it, ask your doctor or pharmacist. "check": check with them. */
  level: Level;
  condition: ConditionId;
  ruleId: ConditionRuleId;
  /** what it was found in, as printed (max 4) */
  because: string[];
}

export interface ConditionCheck {
  /**
   * "unchecked": the substance or the ingredients weren't read, or, for a medicine, its official
   * product information wasn't found: nothing can be said, never "nothing found"
   */
  status: "avoid" | "check" | "ok" | "unchecked";
  findings: ConditionFinding[];
  /** what the medicine's official product information says about the conditions (medicines only) */
  official: OfficialFinding[];
  /** the official document those quotes come from; null when none was found (or not a medicine) */
  officialSource: { product: string; url: string; match: "brand" | "substance" } | null;
}

const MAX_BECAUSE = 4;

// ---------------------------------------------------------------- medicines

const isAspirin = (s: Substance) => s.key === "aspirin";

/** a strength in milligrams ("500 mg", "0,5 g", "1 000 mg", "1,000 mg"); null for anything else (IU, µg, unread) */
export function milligrams(strength: string | null): number | null {
  // thousands first: "1 000" and "1,000" are a thousand, not 0 or 1 (a misread aspirin dose lowers the risk)
  const m = /(?:((?<![\d.,])[1-9]\d{0,2}(?:[ \u00a0\u202f.,]\d{3})+(?!\d))|(\d+(?:[.,]\d+)?))\s*(mg|g)(?![\p{L}])/iu.exec(strength ?? "");
  if (!m) return null;
  const grams = m[3].toLowerCase() === "g";
  // no medicine holds thousands of grams: "2,500 g" is 2.5 g
  const n =
    m[1] && !grams ? Number(m[1].replace(/[ \u00a0\u202f.,]/gu, ""))
    : m[1] ? Number(m[1].replace(/[ \u00a0\u202f]/gu, "").replace(",", "."))
    : Number(m[2].replace(",", "."));
  return grams ? n * 1000 : n;
}
const units = (strength: string | null) => {
  const m = /(\d+(?:[.,]\d+)?)\s*(iu|ui|u\.i\.)/iu.exec(strength ?? "");
  return m ? Number(m[1].replace(",", ".")) : null;
};

// a medicine that is not taken by mouth or injected: what the systemic rules are not about
// a spray or gel for the mouth or throat is absorbed like a tablet (flurbiprofen throat spray)
const ORAL = /(?<![\p{L}])(oral|buccal\w*|buccale?s?|sublingu\w*|throat|gorge|bouche|oromucos\w*)(?![\p{L}])|فموي|للحلق/u;
const INHALED = /(?<![\p{L}])(inhal\w*|aerosol\w*|nebuli\w*|turbuhaler|diskus|inhaler)(?![\p{L}])|استنشاق/u;
const INTRAMUSCULAR = /(?<![\p{L}])(intramuscula\w*|i\.m\.?|voie im)(?![\p{L}])|\(im\)|عضل/u;
// sucrose and glucose only count in quantity: syrups, oral liquids, granules, lozenges, chewables (EMA annex: 5 g a dose)
const SUGARY_FORM =
  /(?<![\p{L}])(syrups?|sirops?|jarabes?|sciroppo|sirup|oral (solution|suspension|drops)|solution buvable|suspension buvable|gouttes buvables|granul\w*|sachets?|powder for oral \w+|poudre pour (solution|suspension) buvable|lozenges?|pastilles?|chewable|a croquer|a sucer|gummies|gummy)(?![\p{L}])|شراب|استحلاب|للمضغ/u;
// supplements that add bleeding risk (WFH 2020); garlic and fish oil only as a supplement, never in a meal
const BLEEDING_SUPPLEMENT =
  /(?<![\p{L}])(omega[- ]?3\w*|fish oils?|huiles? de poissons?|huile de foie de morue|cod liver oil|krill oil|huile de krill|ginkgo|garlic|ail|ajo|aglio|knoblauch)(?![\p{L}])|ثوم|أوميغا|اوميغا|زيت السمك|جنكة|جينكو/u;
const VITAMIN_E = /(?<![\p{L}])(vitamine? e|(alpha[- ])?tocopher\w*)(?![\p{L}])|فيتامين (هـ|ه|إي)/u;
const SUPPLEMENT_PRODUCT =
  /(?<![\p{L}])(food supplements?|dietary supplements?|supplements?|complements? alimentaires?|integrator[ei]|nahrungserganzungsmittel|suplementos?)(?![\p{L}])|مكمل/u;

interface MedicineRule {
  id: ConditionRuleId;
  condition: ConditionId;
  level: Level;
  groups: GroupId[];
  /** only for a medicine taken by mouth or injected: not a gel, cream, eye drop or inhaler */
  systemic?: boolean;
  /** a further condition on the substance (its strength) */
  when?: (s: Substance, strength: string | null) => boolean;
}

const MEDICINE_RULES: MedicineRule[] = [
  // WFH 2020 §2: avoid aspirin and NSAIDs; anticoagulants and antiplatelets add to the bleeding risk
  { id: "bleeding_nsaid", condition: "hemophilia", level: "avoid", groups: ["nsaid"], systemic: true },
  { id: "bleeding_anticoagulant", condition: "hemophilia", level: "avoid", groups: ["anticoagulant", "antiplatelet"] },
  // BNF, SSRIs and SNRIs: caution in bleeding disorders
  { id: "bleeding_ssri", condition: "hemophilia", level: "check", groups: ["ssri"] },
  // BNF, corticosteroids: may raise blood glucose
  { id: "diabetes_corticosteroid", condition: "diabetes", level: "check", groups: ["corticosteroid"], systemic: true },
  // BNF, NSAIDs: caution in hypertension (fluid retention)
  { id: "bp_nsaid", condition: "hypertension", level: "check", groups: ["nsaid"], systemic: true },
  // BNF sympathomimetics and the ANSM vasoconstrictor alerts: caution in hypertension, nasal ones included
  { id: "bp_decongestant", condition: "hypertension", level: "check", groups: ["decongestant"] },
  // BNF renal impairment, NICE NG203: avoid NSAIDs in chronic kidney disease
  { id: "kidney_nsaid", condition: "kidney_disease", level: "avoid", groups: ["nsaid"], systemic: true },
  // BNF renal impairment: methotrexate is cleared by the kidneys; avoid or lower the dose
  { id: "kidney_methotrexate", condition: "kidney_disease", level: "avoid", groups: ["methotrexate"] },
  // BNF: potassium-sparing diuretics and potassium supplements raise potassium, a risk when the kidneys clear less
  { id: "kidney_potassium", condition: "kidney_disease", level: "check", groups: ["potassium"] },
  // BNF, NSAIDs: contra-indicated in active peptic ulceration; corticosteroids: caution
  { id: "ulcer_nsaid", condition: "stomach_ulcer", level: "avoid", groups: ["nsaid"], systemic: true },
  { id: "ulcer_corticosteroid", condition: "stomach_ulcer", level: "check", groups: ["corticosteroid"], systemic: true },
  // BNF, NSAIDs: caution in asthma; beta-blockers: avoid in asthma (eye drops too)
  { id: "asthma_nsaid", condition: "asthma", level: "check", groups: ["nsaid"], systemic: true },
  { id: "asthma_beta_blocker", condition: "asthma", level: "avoid", groups: ["beta_blocker_nonselective"] },
  // BNF, G6PD deficiency: definite risk of haemolysis; aspirin acceptable up to about 1 g a day (an unread strength is asked about)
  { id: "g6pd_drug", condition: "g6pd_deficiency", level: "avoid", groups: ["g6pd_trigger"] },
  { id: "g6pd_aspirin", condition: "g6pd_deficiency", level: "check", groups: ["nsaid"], when: (s, strength) => isAspirin(s) && (milligrams(strength) ?? Infinity) >= 300 },
  // ANSM: NSAIDs contra-indicated from the 6th month (topical ones too), to avoid before; low-dose aspirin is prescribed in pregnancy
  { id: "pregnancy_nsaid", condition: "pregnancy", level: "avoid", groups: ["nsaid"], when: (s, strength) => !(isAspirin(s) && (milligrams(strength) ?? Infinity) <= 100) },
  { id: "pregnancy_low_aspirin", condition: "pregnancy", level: "check", groups: ["nsaid"], when: (s, strength) => isAspirin(s) && (milligrams(strength) ?? Infinity) <= 100 },
  // ANSM, BNF: retinoids, valproate, topiramate, mycophenolate, misoprostol, thalidomide and its kin, vitamin K
  // antagonists, ACE inhibitors/ARBs, methotrexate, tetracyclines and lithium harm the unborn child
  { id: "pregnancy_drug", condition: "pregnancy", level: "avoid", groups: ["teratogen", "vka", "acei_arb", "methotrexate", "tetracycline_class", "lithium"] },
  // BNF hepatic impairment: paracetamol's dose may need lowering
  { id: "liver_paracetamol", condition: "liver_disease", level: "check", groups: ["paracetamol"] },
];

// ---------------------------------------------------------------- foods, drinks and water

// EU 1169/2011 Annex III: glycyrrhizinic acid; a flavouring or deglycyrrhizinated liquorice is not it
const LIQUORICE = /(?<![\p{L}])(liquorice|licorice|reglisse|regaliz|liquirizia|lakritz\w*|sussholz\w*|glycyrrhiz\w*)(?![\p{L}])|عرق السوس/u;
const LIQUORICE_NOT = /(?<![\p{L}])(flavou?r\w*|aromes?|aroma|aromatis\w*|gout|saveur|deglycyrrhiz\w*)(?![\p{L}])|نكهة|منكه/u;
const LIQUORICE_STATEMENT = /contains liquorice|contient de la reglisse|contiene regaliz|contiene liquirizia|enthalt (sussholz|lakritz)|يحتوي على عرق السوس/u;
// EU 1169/2011 Annex III: "high caffeine content" above 150 mg/L, or a drink sold as an energy drink
const HIGH_CAFFEINE = /high caffeine content|teneur elevee en cafeine|elevado contenido de cafeina|alto contenuto di caffeina|erhohter koffeingehalt|(محتوى|نسبة) (عال|عالي|عالية|مرتفع|مرتفعة) من الكافيين/u;
const ENERGY_DRINK = /(?<![\p{L}])(energy drinks?|boissons? energisantes?|energisant\w*|bebidas? energeticas?|bevand[ae] energetic[ah]e?|energydrinks?)(?![\p{L}])|مشروب (ال)?طاقة|مشروبات (ال)?طاقة/u;
// fava (broad) beans; not peanuts, soybeans, cocoa, coffee or tonka "beans", nor folic acid (حمض الفوليك)
const FAVA = /(?<![\p{L}])(fava|faba|feves?|feverole?s?|broad beans?|habas?|fave|ackerbohnen?|dicke bohnen|vicia faba)(?![\p{L}])|فول(?![ء-ي])/u;
const NOT_FAVA = /feves? (de |d')?(cacao|cafe|tonka)|(cocoa|cacao|coffee|tonka) beans?|fave di cacao|habas? de cacao|(ال)?فول ?(ال)?سوداني|(ال)?فول ?(ال)?صويا/gu;
/** WHO: free sugars ideally below 25 g a day; one container at or above that is worth pointing out */
const SUGAR_PER_CONTAINER_G = 25;
/** g of sugars per 100 ml from which a drink of unknown volume is worth a question (half a 500 ml bottle reaches 25 g) */
const SUGARY_DRINK_PER_100ML = 5;

// ---------------------------------------------------------------- the check

/**
 * What a result means for the reader's health conditions. Null when there is nothing to check:
 * no condition with rules (coeliac disease is the gluten check's), or a photo of something else.
 */
export function checkConditions(result: LabelAnalysis, profile: Profile): ConditionCheck | null {
  const conditions = (profile.conditions ?? []).filter((c) => c !== "coeliac");
  // other conditions are only found in a medicine's official text
  const others = result.kind === "medicine" ? (profile.otherConditions ?? []) : [];
  if ((conditions.length === 0 && others.length === 0) || result.kind === "other") return null;
  const has = new Set<ConditionId>(conditions);
  // an estimate (a dish, a recalled recipe) can make something likely, never certain
  const estimated = result.kind !== "medicine" && result.ingredient_source === "estimated";
  const found = new Map<ConditionRuleId, Set<string>>();
  const add = (id: ConditionRuleId, ...because: string[]) => {
    const set = found.get(id) ?? new Set<string>();
    for (const b of because) set.add(b);
    found.set(id, set);
  };

  // ---- a medicine: its active substances, its form and its excipients
  const medicine = result.kind === "medicine" ? result.medicine : null;
  const active = medicine?.active ?? [];
  if (medicine) {
    const form = fold(medicine.form ?? "");
    const systemic = (!TOPICAL.test(form) || ORAL.test(form)) && !INHALED.test(form);
    const substances = active.map((a) => ({ s: substanceOf(a), strength: a.strength, text: fold(a.name) }));
    for (const rule of MEDICINE_RULES) {
      if (!has.has(rule.condition) || (rule.systemic && !systemic)) continue;
      for (const { s, strength } of substances)
        if (rule.groups.some((g) => s.groups.has(g)) && (!rule.when || rule.when(s, strength))) add(rule.id, s.shown);
    }
    if (has.has("hemophilia")) {
      // WFH 2020: intramuscular injections can cause a muscle bleed
      if (INTRAMUSCULAR.test(form)) add("bleeding_injection");
      for (const { s, strength, text } of substances) {
        const highVitaminE = VITAMIN_E.test(text) && ((milligrams(strength) ?? 0) >= 268 || (units(strength) ?? 0) >= 400);
        if (BLEEDING_SUPPLEMENT.test(text) || highVitaminE) add("bleeding_supplement", s.shown);
      }
    }
    const excipient = (id: string) => medicine.excipients.find((e) => e.id === id);
    // EMA annex: sucrose and glucose to be taken into account in diabetes
    const sugars = excipient("sugars");
    if (has.has("diabetes") && sugars && SUGARY_FORM.test(form)) add("diabetes_sugar_excipient", sugars.matched);
    // EMA annex: sodium, for a controlled sodium diet; effervescent tablets carry a lot of it
    const sodium = excipient("effervescent_sodium");
    if (has.has("hypertension") && sodium) add("bp_sodium_tablet", sodium.matched);
    // EMA annex, ethanol: to be taken into account in liver disease and in pregnancy
    const ethanol = excipient("alcohol");
    if (ethanol && systemic) {
      if (has.has("liver_disease")) add("liver_alcohol_medicine", ethanol.matched);
      if (has.has("pregnancy")) add("pregnancy_alcohol_medicine", ethanol.matched);
    }
  }

  // ---- what was listed: liquorice, fava beans, and supplements that add bleeding risk
  const names = result.ingredients.map((i) => ({ shown: i.name, text: fold(`${i.name} ${i.name_en ?? ""}`) }));
  const pack = fold([...result.claims, result.raw_text ?? "", result.product.name ?? "", result.product.category ?? ""].join(" | "));
  const liquorice = names.filter((n) => LIQUORICE.test(n.text) && !LIQUORICE_NOT.test(n.text)).map((n) => n.shown);
  if (liquorice.length > 0 || LIQUORICE_STATEMENT.test(pack)) {
    if (has.has("hypertension")) add("bp_liquorice", ...liquorice);
    if (has.has("pregnancy")) add("pregnancy_liquorice", ...liquorice);
  }
  if (has.has("g6pd_deficiency") && result.kind !== "medicine") {
    // WHO, G6PD deficiency: fava beans bring on haemolysis
    const fava = names.filter((n) => FAVA.test(n.text.replace(NOT_FAVA, " "))).map((n) => n.shown);
    if (fava.length > 0) add("g6pd_fava", ...fava);
  }
  if (has.has("hemophilia") && result.kind !== "medicine" && SUPPLEMENT_PRODUCT.test(pack)) {
    const supplements = names.filter((n) => BLEEDING_SUPPLEMENT.test(n.text)).map((n) => n.shown);
    if (supplements.length > 0) add("bleeding_supplement", ...supplements);
  }

  // ---- food, drink and water: alcohol, caffeine, potassium salt, sugar, salt, sodium
  if (result.kind !== "medicine") {
    const signals = foodSignals(result);
    const drinkOfAlcohol = signals.has("alcohol");
    const alcohol = drinkOfAlcohol || signals.has("alcohol_food");
    const highCaffeine = signals.has("caffeine") && (HIGH_CAFFEINE.test(pack) || ENERGY_DRINK.test(fold(`${result.product.name ?? ""} ${result.product.category ?? ""}`)));

    if (has.has("diabetes")) {
      const perContainer = result.drink?.sugar_per_container_g ?? null;
      if (perContainer !== null && perContainer >= SUGAR_PER_CONTAINER_G) add("diabetes_sugar_drink", `${Math.round(perContainer)} g`);
      else if (result.sugar.level === "high") add("diabetes_sugar_food");
      // a soft drink is rarely "high" per 100 ml (above 11.25 g), yet a can of it is: without the volume, ask
      else if (result.drink && perContainer === null && (result.sugar.per_100 ?? 0) >= SUGARY_DRINK_PER_100ML) add("diabetes_sugary_drink", `${result.sugar.per_100} g / 100 ml`);
    }
    if (has.has("hypertension")) {
      if (result.nutrition?.levels.salt === "high") add("bp_salt");
      const sodium = result.water?.minerals.sodium ?? null;
      if (result.water?.facts.some((f) => f.id === "sodium_rich") && sodium !== null) add("bp_sodium_water", `${sodium} mg/L`);
      if (highCaffeine) add("bp_caffeine");
    }
    if (has.has("kidney_disease") && signals.has("potassium")) add("kidney_potassium_salt");
    if (has.has("stomach_ulcer") && drinkOfAlcohol) add("ulcer_alcohol");
    if (has.has("pregnancy")) {
      if (alcohol) add("pregnancy_alcohol");
      if (highCaffeine) add("pregnancy_caffeine");
    }
    if (has.has("liver_disease") && alcohol) add("liver_alcohol");
  }

  // ---- in the order the reader listed their conditions, "avoid" first
  const levelOf = (id: ConditionRuleId): Level => MEDICINE_RULES.find((r) => r.id === id)?.level ?? FIXED_LEVELS[id] ?? "check";
  const findings: ConditionFinding[] = [];
  for (const condition of conditions)
    for (const id of CONDITION_RULE_IDS) {
      const because = found.get(id);
      if (!because || CONDITION_OF[id] !== condition) continue;
      const level = levelOf(id);
      findings.push({ level: estimated ? "check" : level, condition, ruleId: id, because: [...because].slice(0, MAX_BECAUSE) });
    }
  findings.sort((a, b) => Number(b.level === "avoid") - Number(a.level === "avoid"));

  // ---- a medicine's own official product information, quoted
  const officialInfo = result.kind === "medicine" ? (result.official ?? null) : null;
  const { findings: official, complete } = officialFindings(officialInfo, profile);

  const readable =
    // a medicine is only "checked" against its official product information: the rules above are a floor, not a review
    result.kind === "medicine" ? active.length > 0 && officialInfo !== null && complete
    : result.kind === "water" ? Object.values(result.water?.minerals ?? {}).some((v) => v !== null)
    : result.ingredients.length > 0 || result.nutrition?.per_100 != null;
  const all = [...findings, ...official];
  const status =
    all.some((f) => f.level === "avoid") ? "avoid"
    : all.length ? "check"
    // nothing was read: saying "nothing found" would be a false comfort
    : readable ? "ok"
    : "unchecked";
  return {
    status,
    findings,
    official,
    officialSource: officialInfo && { product: officialInfo.product, url: officialInfo.url, match: officialInfo.match },
  };
}

/** the level of the rules that aren't in MEDICINE_RULES */
const FIXED_LEVELS: Partial<Record<ConditionRuleId, Level>> = { g6pd_fava: "avoid" };

/** which condition each rule belongs to */
const CONDITION_OF: Record<ConditionRuleId, ConditionId> = Object.fromEntries(
  CONDITION_RULE_IDS.map((id) => [
    id,
    id.startsWith("bleeding_") ? "hemophilia"
    : id.startsWith("diabetes_") ? "diabetes"
    : id.startsWith("bp_") ? "hypertension"
    : id.startsWith("kidney_") ? "kidney_disease"
    : id.startsWith("ulcer_") ? "stomach_ulcer"
    : id.startsWith("asthma_") ? "asthma"
    : id.startsWith("g6pd_") ? "g6pd_deficiency"
    : id.startsWith("pregnancy_") ? "pregnancy"
    : "liver_disease",
  ]),
) as Record<ConditionRuleId, ConditionId>;
