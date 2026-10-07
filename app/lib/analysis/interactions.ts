// Two medicines taken together: the same substance twice, two of the same family, or
// one of a short list of serious, long-established interactions (the kind every
// national formulary lists: BNF appendix 1, ANSM "Thésaurus des interactions
// médicamenteuses"). Deterministic, pure and client-safe: the model is not asked.
//
// The list is deliberately short and one-sided: a finding is worth a question to the
// pharmacist, and NO finding means nothing at all. The UI must always say so.

import { fold } from "./knowledge";
import type { Medicine } from "./types";

// Families, as stems matched on the folded substance name (so "ibuprofène", "ibuprofen
// lysine" and "Ibuprofen" are one substance).
const FAMILIES = {
  nsaid: "ibuprofen|ketoprofen|dexketoprofen|diclofenac|aceclofenac|naproxen|piroxicam|tenoxicam|meloxicam|celecoxib|etoricoxib|indomet(h)?acin|flurbiprofen|niflumi|mefenami|tiaprofeni|nimesulid|aspirin|acetylsalicyl",
  anticoagulant: "warfarin|acenocoumarol|fluindion|rivaroxaban|apixaban|dabigatran|edoxaban|enoxaparin|heparin|tinzaparin|fondaparinux",
  acei_arb: "captopril|enalapril|ramipril|perindopril|lisinopril|quinapril|fosinopril|trandolapril|benazepril|zofenopril|losartan|valsartan|irbesartan|candesartan|telmisartan|olmesartan",
  statin: "simvastatin|atorvastatin|rosuvastatin|pravastatin|fluvastatin|lovastatin|pitavastatin",
  ssri: "fluoxetin|paroxetin|sertralin|escitalopram|citalopram|fluvoxamin|venlafaxin|duloxetin",
  benzodiazepine: "diazepam|lorazepam|alprazolam|bromazepam|clonazepam|prazepam|oxazepam|clobazam|lormetazepam|nitrazepam|tetrazepam|clorazepat|zolpidem|zopiclon",
  opioid: "tramadol|codein|dihydrocodein|morphin|oxycodon|fentanyl|buprenorphin|hydromorphon|tapentadol",
  pde5: "sildenafil|tadalafil|vardenafil|avanafil",
} as const;
export type FamilyId = keyof typeof FAMILIES;
export const FAMILY_IDS = Object.keys(FAMILIES) as FamilyId[];

// Other groups an interaction refers to.
const GROUPS = {
  ...FAMILIES,
  vka: "warfarin|acenocoumarol|fluindion",
  // raise the effect of vitamin K antagonists
  vka_booster: "miconazol|fluconazol|metronidazol|clarithromycin|erythromycin|ciprofloxacin|levofloxacin|ofloxacin|sulfamethoxazol|amiodaron",
  quinolone: "ciprofloxacin|levofloxacin|ofloxacin|norfloxacin|moxifloxacin|enoxacin",
  tetracycline: "tetracyclin|lymecyclin",
  // caffeine is cleared by CYP1A2, which these block
  cyp1a2_inhibitor: "ciprofloxacin|enoxacin",
  // alcohol brings on a violent reaction
  nitroimidazole: "metronidazol|tinidazol|ornidazol|secnidazol",
  levothyroxine: "levothyrox|liothyronin",
  paracetamol: "paracetamol|acetaminophen",
  methotrexate: "methotrexat",
  lithium: "lithium",
  potassium: "spironolacton|eplerenon|amilorid|triamteren|potassium chlorid|chlorure de potassium",
  // broken down by CYP3A4, so strong inhibitors raise their level
  statin_3a4: "simvastatin|atorvastatin|lovastatin",
  cyp3a4_inhibitor: "clarithromycin|erythromycin|telithromycin|itraconazol|ketoconazol|posaconazol|voriconazol|ritonavir",
  nitrate: "trinitrin|nitroglycerin|glyceryl trinitrat|isosorbid|nicorandil|molsidomin",
  maoi: "moclobemid|selegilin|rasagilin|iproniazid|phenelzin|tranylcypromin|linezolid",
  tramadol: "tramadol",
  // bound in the gut by calcium, iron, magnesium, aluminium and zinc
  bound_by_minerals: "levothyrox|ciprofloxacin|levofloxacin|ofloxacin|norfloxacin|moxifloxacin|doxycyclin|tetracyclin|minocyclin|lymecyclin|alendron|risedron|ibandron",
} as const;
export type GroupId = keyof typeof GROUPS | "mineral";

const stems = (alternatives: string) => new RegExp(`(?<![\\p{L}])(?:${alternatives})`, "u");
const GROUP_RULES = Object.entries(GROUPS).map(([id, alternatives]) => [id as GroupId, stems(alternatives)] as const);
// a mineral taken as the medicine itself, not the salt of another substance ("atorvastatin calcium")
const MINERAL =
  /^(calcium|iron|ferrous|ferric|fer|magnesium|alumini?um|zinc)(?![\p{L}])|^(carbonate|citrate|hydroxyde|hydroxide|oxyde|oxide|sulfate|fumarate|gluconate|lactate|pidolate)s? (de |d')?(calcium|fer|iron|magnesium|alumini?um|zinc)|ferreux|ferrique/u;
const SYNONYMS: [RegExp, string][] = [
  [/acetaminophen|paracetamol/u, "paracetamol"],
  [/aspirin|acetylsalicyl/u, "aspirin"],
];
// salts and hydrates: the same substance with or without them
const SALTS =
  /(?<![\p{L}])(hydrochloride|chlorhydrate|dihydrochloride|sodium|sodique|potassium|potassique|calcium|calcique|magnesium|maleate|fumarate|succinate|tartrate|citrate|sulfate|sulphate|phosphate|acetate|mesilate|mesylate|besilate|besylate|bromide|bromure|trihydrate|dihydrate|monohydrate|anhydrous|anhydre|lysine|arginine|de|d')(?![\p{L}])/gu;

export interface Substance {
  /** as shown to the reader */
  shown: string;
  /** the same for every spelling and salt of one substance */
  key: string;
  groups: Set<GroupId>;
}

export function substanceOf(a: Medicine["active"][number]): Substance {
  const text = fold(a.name);
  const groups = new Set<GroupId>();
  let key: string | null = SYNONYMS.find(([rule]) => rule.test(text))?.[1] ?? null;
  for (const [id, rule] of GROUP_RULES) {
    const m = rule.exec(text);
    if (!m) continue;
    groups.add(id);
    // the stem that matched names the substance, whatever its ending or salt
    key ??= m[0].replace(/\(h\)\?/g, "");
  }
  if (MINERAL.test(text)) groups.add("mineral");
  // French names add a final "e" (metformine, amoxicilline): the same substance
  key ??= text.replace(SALTS, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/e(?= |$)/g, "") || text;
  return { shown: a.name_local ?? a.name, key, groups };
}

export const INTERACTION_IDS = [
  "nsaid_anticoagulant",
  "nsaid_methotrexate",
  "nsaid_lithium",
  "nsaid_acei_arb",
  "acei_arb_potassium",
  "statin_cyp3a4",
  "nitrate_pde5",
  "ssri_maoi",
  "ssri_tramadol",
  "opioid_benzodiazepine",
  "vka_booster",
  "mineral_absorption",
] as const;
export type InteractionId = (typeof INTERACTION_IDS)[number];

/** "avoid": not to be combined unless the prescriber decided it. "caution": needs a precaution. */
type Severity = "avoid" | "caution";
const INTERACTIONS: [InteractionId, GroupId, GroupId, Severity][] = [
  ["nitrate_pde5", "nitrate", "pde5", "avoid"],
  ["ssri_maoi", "ssri", "maoi", "avoid"],
  ["nsaid_anticoagulant", "nsaid", "anticoagulant", "avoid"],
  ["nsaid_methotrexate", "nsaid", "methotrexate", "avoid"],
  ["statin_cyp3a4", "statin_3a4", "cyp3a4_inhibitor", "avoid"],
  ["vka_booster", "vka", "vka_booster", "avoid"],
  ["opioid_benzodiazepine", "opioid", "benzodiazepine", "caution"],
  ["ssri_tramadol", "ssri", "tramadol", "caution"],
  ["nsaid_lithium", "nsaid", "lithium", "caution"],
  ["nsaid_acei_arb", "nsaid", "acei_arb", "caution"],
  ["acei_arb_potassium", "acei_arb", "potassium", "caution"],
  ["mineral_absorption", "bound_by_minerals", "mineral", "caution"],
];

export type TogetherFinding =
  | { type: "duplicate"; severity: "avoid"; substances: [string, string]; paracetamol: boolean }
  | { type: "same_family"; severity: "avoid"; family: FamilyId; substances: [string, string] }
  | { type: "interaction"; severity: Severity; id: InteractionId; substances: [string, string] };

export interface TogetherCheck {
  /** false when a medicine's active substance wasn't read: nothing could be compared */
  checked: boolean;
  findings: TogetherFinding[];
}

/** what stands out when the two medicines are taken in the same period */
export function checkTogether(a: Medicine | null, b: Medicine | null): TogetherCheck {
  const first = (a?.active ?? []).map(substanceOf);
  const second = (b?.active ?? []).map(substanceOf);
  if (first.length === 0 || second.length === 0) return { checked: false, findings: [] };
  const findings: TogetherFinding[] = [];
  const seen = new Set<string>();
  const add = (id: string, finding: TogetherFinding) => {
    if (!seen.has(id)) findings.push(finding);
    seen.add(id);
  };
  for (const x of first)
    for (const y of second) {
      const substances: [string, string] = [x.shown, y.shown];
      if (x.key === y.key) {
        add(`dup:${x.key}`, { type: "duplicate", severity: "avoid", substances, paracetamol: x.key === "paracetamol" });
        continue;
      }
      for (const family of FAMILY_IDS)
        if (x.groups.has(family) && y.groups.has(family)) add(`fam:${family}`, { type: "same_family", severity: "avoid", family, substances });
      for (const [id, g1, g2, severity] of INTERACTIONS) {
        if (x.groups.has(g1) && y.groups.has(g2)) add(id, { type: "interaction", severity, id, substances });
        else if (x.groups.has(g2) && y.groups.has(g1)) add(id, { type: "interaction", severity, id, substances: [y.shown, x.shown] });
      }
    }
  // the serious ones first
  findings.sort((p, q) => Number(q.severity === "avoid") - Number(p.severity === "avoid"));
  return { checked: true, findings };
}
