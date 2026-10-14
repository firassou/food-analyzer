// A medicine's official product information (its SmPC, "RCP", from the French public medicines
// database: see server/medicines.ts) read for the reader's health conditions. Deterministic,
// pure and client-safe: the model is never asked. What the regulator wrote is quoted as it is:
// - a condition named in 4.3 "Contre-indications" → "avoid, ask your doctor or pharmacist";
//   but a 4.3 clause about taking it WITH another medicine ("l'association à l'aliskiren est
//   contre-indiquée chez le diabétique") only reads "check": the medicine alone isn't contraindicated;
// - named in 4.4 "Mises en garde et précautions d'emploi" → "check with your doctor or pharmacist";
// - pregnancy: what 4.3 and 4.6 say, sentence by sentence, "avoid" when one says contraindicated or
//   not recommended (and isn't the negation of it), "check" otherwise.
// A condition the medicine treats ("Traitement du diabète…" in 4.1) isn't warned about by the
// precautions written for the people it treats; its own contraindications still count.
// What can't be read fully (a section cut, an empty 4.4 or 4.6, another condition with no French
// term) makes the check incomplete: then nothing found is "not checked", never "nothing found".

import { fold } from "./knowledge";
import type { ConditionId, Profile } from "./profile";
import type { AnalyzeErrorCode, OfficialInfo } from "./types";

export type { OfficialInfo };

/** POST /api/official: a saved medicine's official product information, null when none was found */
export type OfficialResponse = { ok: true; official: OfficialInfo | null } | { ok: false; error: string; code: AnalyzeErrorCode };

/** where it was found; "combination" is a 4.3 clause about taking it with another medicine */
export type OfficialSection = "contraindications" | "combination" | "warnings" | "pregnancy";

export interface OfficialFinding {
  level: "avoid" | "check";
  /** a condition from the list, or null for another one */
  condition: ConditionId | null;
  /** another condition, by the name the reader saved */
  other: string | null;
  section: OfficialSection;
  /** the official sentence, as published (French) */
  quote: string;
}

export interface OfficialCheck {
  findings: OfficialFinding[];
  /** false when part of what the reader's conditions need couldn't be read: finding nothing then says nothing */
  complete: boolean;
}

/** folded, with curly apostrophes made straight ("d’ulcère" is "d'ulcere") */
const norm = (text: string) => fold(text).replace(/[’‘´`]/g, "'");

// how each condition is written in a French SmPC, on normalized text (no accents, lower case, straight apostrophes)
const TERMS: Partial<Record<ConditionId, RegExp>> = {
  hemophilia:
    /hemophil|willebrand|(trouble|anomalie|deficit|affection)s? (congenitaux? |constitutionnels? )?(de|d'|du) ?(la |l')?(coagulation|hemostase)|maladies? hemorragiques?|coagulopathi|diathese hemorragique|deficit (congenital )?en facteur|tendance (aux saignements|hemorragique)|syndrome hemorragique|(risque|risques) (accru |eleve )?(de saignements?|hemorragiques?)|augmentant le risque (de saignement|hemorragique)/,
  diabetes: /diabet/,
  hypertension: /hypertension(?! (arterielle )?(pulmonaire|intracranienne|portale|oculaire|intraoculaire|intra-oculaire))|hypertendu|(?<![\p{L}])hta(?![\p{L}])|pression arterielle (elevee|non controlee)/u,
  kidney_disease:
    /insuffisan\w* renal|insuffisant renal|atteinte renale|(alteration|atteinte|diminution) de la fonction renale|fonction renale (alteree|diminuee|reduite|deterioree)|maladie renale|nephropath|dialys|clairance de la creatinine|filtration glomerulaire/,
  stomach_ulcer:
    /ulceres? (gastr|duoden|pept|digest|de l'estomac|evolutif)|ulcerations? (gastr|duoden|pept|digest)|antecedents? d'ulcere|maladie ulcereuse|ulcere/,
  asthma: /asthm|bronchospasm/,
  g6pd_deficiency: /g6pd|glucose[- ]?6[- ]?phosphate[- ]?deshydrogenase|favism/,
  pregnancy: /grossesse|femmes? enceintes?|(?<![\p{L}])enceintes?(?![\p{L}])/u,
  liver_disease:
    /insuffisan\w* hepat|insuffisance hepatocellulaire|atteinte hepatique|(affection|maladie|trouble)s? (du foie|hepatiques?)|hepatopath|cirrhos|hepatite|fonction hepatique (alteree|diminuee|reduite)/,
  // coeliac disease is the gluten check's: the annex sentence about wheat starch says it suits them
};

// what names the condition without being about it: complications of diabetes it may treat, an
// ulcer that isn't the stomach's, a section cross-reference ("voir rubrique 4.6")
const NOT: Partial<Record<ConditionId, RegExp>> = {
  diabetes: /(acidocetose|coma|precoma|retinopathie|neuropathie|nephropathie|cetoacidose|pied) diabetique/g,
  stomach_ulcer: /ulceres? (cornee?n?s?|buccal\w*|de (la )?(jambe|bouche|cornee)|aphteu\w*|cutane\w*|varique\w*)/g,
  pregnancy: /\(?voir (la )?rubriques? [\d.,\s et]+\)?/g,
};

/** a 4.3 clause about taking it together with another medicine, not about the medicine alone */
const COMBINED =
  /association|associe a|co-?administration|concomitante?|avec (des |les |un |une )?medicaments? contenant|patients? traites? (par|avec)|aliskiren|antiviraux|en meme temps que/;

/** "Traitement du diabète", "Prévention des rechutes des troubles bipolaires": the condition is what it treats */
const TREATS = /(traitement|traiter|prevention|prevenir|controle|prise en charge)[^.;:]{0,60}$/;

const MAX_QUOTE = 320;

const sentences = (paragraph: string) => paragraph.split(/(?<=[.;:])\s+(?=[A-ZÀ-Ý«(])/u);
const cut = (s: string) => (s.length > MAX_QUOTE ? `${s.slice(0, MAX_QUOTE).replace(/\s+\S*$/, "")}…` : s);

/** the sentence of a paragraph that says it */
function quoteOf(paragraph: string, says: (text: string) => boolean): string {
  return cut(sentences(paragraph).find(says) ?? paragraph);
}

/**
 * A French medical term as a rule, by the stems of its words ("épilepsie" finds "épileptique"):
 * its first word, and when it has more, at least one of the others ("lupus érythémateux disséminé"
 * finds "lupus érythémateux systémique"). Null when no word is long enough to stand alone.
 */
function termRule(term: string): { rule: RegExp; head: RegExp } | null {
  const stems = norm(term)
    .split(/[^\p{L}]+/u)
    .filter((w) => w.length >= 4 && !["maladie", "syndrome", "trouble", "troubles", "deficit", "chronique", "aigue"].includes(w))
    .map((w) => w.slice(0, Math.max(5, w.length - 3)));
  if (stems.length === 0) return null;
  const word = (s: string) => `(?<![\\p{L}])${s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`;
  const [head, ...rest] = stems;
  return {
    rule: new RegExp(`(?=[\\s\\S]*${word(head)})${rest.length ? `(?=[\\s\\S]*(?:${rest.map(word).join("|")}))` : ""}`, "u"),
    head: new RegExp(word(head), "u"),
  };
}

// pregnancy: what makes a sentence a "don't", and what turns it around ("n'est pas contre-indiqué")
const PREGNANCY_AVOID =
  /contre-indiquee?s?|deconseillee?s?|ne (doit|doivent|devra|devrait) (pas|jamais) (etre )?(utilisee?s?|administree?s?|prescrite?s?|prise?s?|prendre|utiliser|administrer)|(ne pas|a ne pas) (utiliser|administrer|prendre)|(doit|doivent) etre evitee?s?|eviter (l'utilisation|l'administration|la prise|ce medicament|le traitement|son utilisation|de (l'|le )?(utiliser|prendre|administrer))/;
const PREGNANCY_NOT_AVOID =
  /n'est pas contre-indique|ne sont pas contre-indiques|pas de contre-indication|aucune contre-indication|ne (doit|doivent) pas (interrompre|arreter)|ne pas (interrompre|arreter)|peut etre (utilise|prescrit|envisage|administre|pris)/;
const ABOUT_PREGNANCY = /grossesse|enceinte/;

/** what the official text says about each of the reader's conditions */
export function officialFindings(official: OfficialInfo | null | undefined, profile: Profile): OfficialCheck {
  if (!official) return { findings: [], complete: false };
  let complete = official.complete !== false && official.warnings.length > 0;
  const findings: OfficialFinding[] = [];
  const indications = official.indications.flatMap(sentences).map(norm);
  /** `at` finds where in a sentence the condition is named (the rule itself may only look ahead) */
  const rules: { condition: ConditionId | null; other: string | null; rule: RegExp; at: RegExp; not?: RegExp }[] = [];
  for (const id of profile.conditions ?? []) if (TERMS[id]) rules.push({ condition: id, other: null, rule: TERMS[id]!, at: TERMS[id]!, not: NOT[id] });
  for (const name of profile.otherConditions ?? []) {
    // the official text is French: without the French term, the condition can't be looked for
    const term = profile.otherTerms?.[name] ? termRule(profile.otherTerms[name]) : null;
    if (term) rules.push({ condition: null, other: name, rule: term.rule, at: term.head });
    else complete = false;
  }

  for (const { condition, other, rule, at, not } of rules) {
    const says = (text: string) => rule.test(not ? norm(text).replace(not, " ") : norm(text));
    // the condition is what it treats: named right after "traitement de…"
    const treats = indications.some((s) => {
      const clean = not ? s.replace(not, " ") : s;
      const m = rule.test(clean) ? at.exec(clean) : null;
      return m !== null && TREATS.test(clean.slice(0, m.index));
    });
    const contra = official.contraindications.filter(says);
    const alone = contra.find((p) => !COMBINED.test(norm(p)));
    if (alone) {
      findings.push({ level: "avoid", condition, other, section: "contraindications", quote: quoteOf(alone, says) });
      continue;
    }
    if (condition === "pregnancy") {
      const told = [...official.contraindications, ...official.pregnancy]
        .flatMap(sentences)
        .filter((s) => ABOUT_PREGNANCY.test(norm(s)) && s.split(/\s+/).length >= 4);
      const avoid = told.find((s) => PREGNANCY_AVOID.test(norm(s)) && !PREGNANCY_NOT_AVOID.test(norm(s)));
      const quoted = avoid ?? told[0];
      if (quoted) findings.push({ level: avoid ? "avoid" : "check", condition, other, section: "pregnancy", quote: cut(quoted) });
      // a 4.6 that couldn't be read says nothing either way
      else complete = false;
      continue;
    }
    if (contra.length > 0) {
      findings.push({ level: "check", condition, other, section: "combination", quote: quoteOf(contra[0], says) });
      continue;
    }
    // the precautions written for the people it treats aren't a warning against it
    if (treats) continue;
    const warning = official.warnings.find(says);
    if (warning) findings.push({ level: "check", condition, other, section: "warnings", quote: quoteOf(warning, says) });
  }
  return { findings: findings.sort((a, b) => Number(b.level === "avoid") - Number(a.level === "avoid")), complete };
}
