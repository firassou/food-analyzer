// Two medicines taken together, read in their official product information (section 4.5 of the
// SmPC, "RCP", from the French public medicines database): each one's text is searched for the
// other's active substances, and for the classes they belong to ("Anticoagulants oraux", "IEC",
// "AINS"), as the ANSM interaction thesaurus names them. The level is the regulator's heading:
// contraindicated or not recommended → "avoid"; precautions for use or to take into account →
// "caution". Deterministic, pure and client-safe; the text is quoted as published.
//
// The matcher is partial by nature (a class can be written many ways): finding nothing is only
// reported as such when both sections were read whole, and it never hides the app's own rule for
// a pair unless the official text says at least as much about those same substances.

import { milligrams } from "./conditions";
import { checkTogether, type GroupId, substanceOf, type TogetherCheck } from "./interactions";
import { fold } from "./knowledge";
import type { LabelAnalysis, Medicine, OfficialInfo, OfficialInteraction } from "./types";

export interface OfficialPairFinding {
  /** the most serious of its parts */
  severity: "avoid" | "caution";
  /** whose official text says it */
  source: Pick<OfficialInfo, "product" | "url" | "match">;
  /** the other medicine's substance it was found for */
  substance: string;
  /** the text sets levels by dose ("à doses anti-inflammatoires", "≥ 1 g par prise"): which applies depends on the dose taken */
  byDose: boolean;
  /** what the text says, entry by entry, as published (French) */
  parts: { level: OfficialInteraction["level"]; quote: string }[];
}

export interface PairCheck extends TogetherCheck {
  /** what their official product information says about taking them together */
  official: OfficialPairFinding[];
  /** both medicines' section 4.5 was read whole: finding nothing then means the app found no mention in either */
  officialBoth: boolean;
}

const norm = (text: string) => fold(text).replace(/[’‘´`]/g, "'").replace(/β/g, "beta");

// the classes 4.5 names, as the thesaurus writes them, and the groups of interactions.ts they cover
const CLASSES: [RegExp, GroupId[]][] = [
  // "AINS pyrazolés" is phenylbutazone only: named by its substance, not its class
  [/(?<![\p{L}])ains(?![\p{L}])(?! pyrazol)|anti-?inflammatoires? non[- ]?steroidiens?(?![\p{L}])(?! pyrazol)/u, ["nsaid"]],
  [/antivitamines? k|(?<![\p{L}])avk(?![\p{L}])/u, ["vka"]],
  [/anticoagulants? oraux directs?|(?<![\p{L}])aod(?![\p{L}])|inhibiteurs? directs? (de la thrombine|du facteur x)/u, ["doac"]],
  [/anticoagulants? oraux(?! directs?(?![\p{L}]))/u, ["oral_anticoagulant"]],
  [/heparines?|(?<![\p{L}])hbpm(?![\p{L}])/u, ["heparin"]],
  [/(?<![\p{L}])anticoagulants?(?![\p{L}])(?! oraux)/u, ["anticoagulant"]],
  [/anti-?agregants? plaquettaires?/, ["antiplatelet", "salicylate"]],
  [/(?<![\p{L}])iec(?![\p{L}])|inhibiteurs? de l'enzyme de conversion/u, ["acei"]],
  [/antagonistes? (des recepteurs )?de l'angiotensine|(?<![\p{L}])aiia(?![\p{L}])|(?<![\p{L}])ara ?ii(?![\p{L}])|sartans?/u, ["arb"]],
  [/beta-?bloquants?/, ["beta_blocker"]],
  [/antihypertenseurs?|abaissant la pression arterielle|hypotenseurs?/, ["antihypertensive"]],
  [/antagonistes? (du |des canaux )?calci|inhibiteurs? calciques?|calcium-?bloquants?/, ["calcium_blocker"]],
  [/diuretiques? (epargneurs?|hyperkaliemiants?)/, ["potassium_sparing"]],
  [/diuretiques? hypokaliemiants?|(?<![\p{L}])hypokaliemiants?/u, ["hypokalemic"]],
  // (?![\p{L}]) first: "diurétiques" mustn't backtrack to "diurétique" to slip past the lookahead
  [/diuretiques?(?![\p{L}])(?! (epargneurs?|hyperkaliemiants?|hypokaliemiants?))/u, ["diuretic"]],
  [/hyperkaliemiants?|sels de potassium/, ["potassium", "potassium_sparing", "acei", "arb", "heparin", "trimethoprim"]],
  [/(?<![\p{L}])isrs(?![\p{L}])|inhibiteurs? selectifs? de la recapture de la serotonine/u, ["ssri"]],
  [/mixtes? adrenergiques?-serotoninergiques?/, ["snri"]],
  [/syndrome serotoninergique|(?<!adrenergiques?-)serotoninergiques?/, ["serotonergic"]],
  [/imao[- ]?b(?![\p{L}])|monoamine-?oxydase (de type )?b(?![\p{L}])/u, ["maoi_b"]],
  [/(?<![\p{L}])imao(?![- ]?[ab](?![\p{L}]))|inhibiteurs? (non selectifs? )?de la monoamine-?oxydase(?! (de type )?b(?![\p{L}]))/u, ["maoi"]],
  [/benzodiazepines?|apparentes aux benzodiazepines/, ["benzodiazepine"]],
  [/medicaments? sedatifs?|depresseurs? du (snc|systeme nerveux central)/, ["sedative"]],
  [/morphiniques?|opioides?|opiaces?/, ["opioid"]],
  [/(?<![\p{L}])statines?|inhibiteurs? de l'hmg/u, ["statin"]],
  [/inhibiteurs? (puissants? |forts? )?(du |de )?(cyp ?3a4?|cytochrome p ?450 3a4?)(?![\p{L}])/u, ["cyp3a4_inhibitor"]],
  [/inducteurs? enzymatiques?/, ["antiepileptic_inducer"]],
  [/(fluoro)?quinolones?/, ["quinolone"]],
  [/(?<![\p{L}])cyclines?|tetracyclines?/u, ["tetracycline_class"]],
  [/macrolides?/, ["macrolide"]],
  [/antifongiques? azoles?|(?<![\p{L}])azoles?(?![\p{L}])/u, ["azole"]],
  [/derives? nitres?|nitrates?|donneurs? de no/, ["nitrate"]],
  [/inhibiteurs? de la phosphodiesterase( de type)? 5/, ["pde5"]],
  [/glucocorticoides?|corticoides?|corticosteroides?/, ["corticosteroid"]],
  [/antidiabetiques?/, ["antidiabetic"]],
  [/(?<![\p{L}])hypoglycemiants?|sulfamides? hypoglycemiants?|sulfonylurees?/u, ["hypoglycemic"]],
  [/insulines?/, ["insulin"]],
  [/neuroleptiques?|antipsychotiques?/, ["neuroleptic"]],
  [/antihistaminiques? h1/, ["antihistamine_h1"]],
  [/hormones? thyroidiennes?/, ["thyroid"]],
  [/(?<![\p{L}])ipp(?![\p{L}])|inhibiteurs? de la pompe a protons?/u, ["ppi"]],
  [/antisecretoires?|anti-?h2|antihistaminiques? h2/, ["antisecretory"]],
  [/torsades? de pointes|torsadogenes?|allong\w* (de )?l'intervalle qt|allongement du qt/, ["qt_prolonging"]],
  [/topiques? gastro-intestinaux|antiacides?|adsorbants?|sels de (fer|calcium|magnesium|zinc)|(?<![\p{L}])fer(?![\p{L}])|(?<!du |des canaux |antagonistes? )calcium(?!-?bloquant)|(?<![\p{L}])zinc(?![\p{L}])/u, ["mineral", "antacid"]],
  [/lithium/, ["lithium"]],
  [/methotrexate/, ["methotrexate"]],
];

// words that don't name a substance unless they come first ("potassium chloride" is potassium; "lithium carbonate" isn't a carbonate)
const SALT_WORDS = new Set(["sodium", "sodique", "potassium", "potassique", "calcium", "calcique", "magnesium", "chlorhydrate", "hydrochloride", "chloride", "chlorure", "maleate", "fumarate", "succinate", "tartrate", "citrate", "sulfate", "phosphate", "acetate", "carbonate", "besilate", "mesilate", "monohydrate", "dihydrate", "trihydrate", "anhydre", "lysine", "arginine"]);
// "acide" names nothing on its own ("acide fusidique")
const NEVER_A_NAME = new Set(["acide", "acid"]);
// English names that differ from the French ones the texts use
const SYNONYMS: [RegExp, string][] = [
  [/aspirin|acetylsalicyl/, "acetylsalicyl|aspirine"],
  [/paracetamol|acetaminophen/, "paracetamol"],
  [/cyclosporin|ciclosporin/, "ciclosporin"],
  [/rifampin|rifampicin/, "rifampicin"],
  [/glyburide|glibenclamid/, "glibenclamid"],
  [/valpro/, "valpro"],
];

/** class names that contain a substance's name without naming it */
const NAMES_NO_SUBSTANCE = /antagonistes? (du |des canaux )?calci\w*|inhibiteurs? calciques?|calcium-?bloquants?|epargneurs? de potassium|sels de potassium/g;

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** how the other medicine's substances can be named in a French text: their stems ("warfarin" finds "warfarine", "fusidic" finds "fusidique") */
function namesOf(active: Medicine["active"]) {
  return active.map((a) => {
    const text = norm(`${a.name} ${a.name_local ?? ""}`);
    const synonym = SYNONYMS.find(([rule]) => rule.test(text))?.[1];
    const words = text.split(/[^\p{L}]+/u).filter((w) => w.length >= 5 || ["fer", "zinc"].includes(w));
    const kept = words.filter((w, i) => !NEVER_A_NAME.has(w) && !(i > 0 && SALT_WORDS.has(w)));
    // an English "-ic" adjective is "-ique" in French
    const stems = [...new Set(kept.map((w) => (w.endsWith("ic") ? `${escape(w.slice(0, -2))}i(?:c|que)` : escape(w.replace(/e$/, "")))))];
    const rule = synonym ?? stems.join("|");
    // an ion named first is the medicine ("potassium chloride"), but "canrénoate de potassium" is another drug's salt
    const ion = SALT_WORDS.has(kept[0] ?? "") ? "(?<!de |d')" : "";
    return { shown: a.name_local ?? a.name, name: rule ? new RegExp(`(?<![\\p{L}])${ion}(?:${rule})`, "u") : null, groups: substanceOf(a).groups };
  });
}

const SEVERITY: Record<NonNullable<OfficialInteraction["level"]>, "avoid" | "caution"> = {
  contraindicated: "avoid",
  not_recommended: "avoid",
  precaution: "caution",
  consider: "caution",
};
// what makes prose (no thesaurus heading) an "avoid"
const PROSE_AVOID = /contre-indique|deconseille|(doit|doivent) etre evitee?s?|a eviter|ne (doit|doivent) pas etre (utilise|associe|administre|pris|co-?administre)|(ne pas|a ne pas) (associer|utiliser)/;
// prose that is about taking it with something: only there is a class read ("contre-indiqué avec les IMAO")
const PROSE_ABOUT_COMBINING = /contre-indique|deconseille|association|associe|concomitant|co-?administration|en meme temps|avec (les|des|un|une|le|la|l')/;

const MAX_QUOTE = 420;
const cut = (s: string) => (s.length > MAX_QUOTE ? `${s.slice(0, MAX_QUOTE).replace(/\s+\S*$/, "")}…` : s);

// a level set by the dose: "à doses anti-inflammatoires", "(≥ 1 g par prise", "doses supérieures à 20 mg"
const BY_DOSE = /doses? (anti-?inflammatoires?|antalgiques?|antipyretiques?|antiagregantes?|elevees?|faibles?|curatives?|preventives?|superieures?|inferieures?)|[≥≤<>] ?\d+(?:[.,]\d+)? ?(mg|g|µg)(?![\p{L}])|forte dose|faible dose/u;
// "≥ 1 g par prise": a threshold a single dose can be measured against
const PER_DOSE_THRESHOLD = /[≥>] ?(\d+(?:[.,]\d+)?) ?(mg|g) par prise/;
/** a paragraph of prose worth quoting: a sentence, not a table cell ("Clarithromycine 500 mg 2x/jour, 9 jours") */
const SENTENCE = (text: string) => text.split(/\s+/).length >= 8 && /[.;:]/.test(text);
const MAX_PROSE = 2;
const RANK = { contraindicated: 0, not_recommended: 1, precaution: 2, consider: 3 } as const;

/** a "(sauf …)" that excludes outright; "(sauf hydrocortisone en traitement substitutif)" is conditional and excludes nothing */
const outrightException = (except: string) => except !== "" && !/(?<![\p{L}])(en|a|dans|pour|si|lors|chez|au-dela|a partir)(?![\p{L}])/u.test(except);

type Part = OfficialPairFinding["parts"][number] & { avoid: boolean; dose: boolean; bySubstance: boolean };

/** what `a`'s official section 4.5 says about the substances of `b`: one finding per substance */
function findIn(a: LabelAnalysis, b: LabelAnalysis): OfficialPairFinding[] {
  const entries = a.official?.interactions;
  if (!a.official || !entries?.length || !b.medicine?.active.length) return [];
  const source = { product: a.official.product, url: a.official.url, match: a.official.match };
  const out: OfficialPairFinding[] = [];
  for (const [i, other] of namesOf(b.medicine.active).entries()) {
    const classOf = (text: string) => CLASSES.some(([rule, groups]) => rule.test(text) && groups.some((g) => other.groups.has(g)));
    const parts: Part[] = [];
    for (const entry of entries) {
      const prose = entry.with === "";
      if (prose && !SENTENCE(entry.text)) continue;
      const target = norm(prose ? entry.text : entry.with);
      // "Bêta-bloquants (sauf esmolol)", "IMAO (sauf IMAO-B)": what is excepted outright isn't concerned
      const except = /\(sauf ([^)]*)\)/.exec(target)?.[1] ?? "";
      if (outrightException(except) && ((other.name?.test(except) ?? false) || classOf(except))) continue;
      const named = target.replace(/\(sauf [^)]*\)/g, " ");
      // "antagonistes du calcium" names a class, not calcium
      const bySubstance = other.name?.test(named.replace(NAMES_NO_SUBSTANCE, " ")) ?? false;
      // in prose, a class is only read where the sentence is about taking them together
      const byClass = (!prose || PROSE_ABOUT_COMBINING.test(named)) && classOf(named);
      if (!bySubstance && !byClass) continue;
      const head = norm(`${entry.with} ${entry.text.slice(0, 200)}`);
      const part: Part = {
        level: entry.level,
        quote: cut(prose ? entry.text : `${entry.with} : ${entry.text}`),
        avoid: entry.level ? SEVERITY[entry.level] === "avoid" : PROSE_AVOID.test(norm(entry.text)),
        dose: BY_DOSE.test(head),
        bySubstance,
      };
      // the severity is read before the cap: a later "déconseillée" replaces an earlier, milder paragraph
      if (prose && parts.filter((p) => p.level === null).length >= MAX_PROSE) {
        const mild = parts.findIndex((p) => p.level === null && !p.avoid);
        if (part.avoid && mild >= 0) parts[mild] = part;
        continue;
      }
      parts.push(part);
    }
    if (parts.length === 0) continue;
    // the text names the substance itself ("+ Acide acétylsalicylique"): its general class lines ("+ AINS") give way
    if (parts.some((p) => p.bySubstance && p.level !== null)) parts.splice(0, parts.length, ...parts.filter((p) => p.bySubstance || p.level === null));
    parts.sort((p, q) => (p.level ? RANK[p.level] : 4) - (q.level ? RANK[q.level] : 4));
    // "depends on the dose" only when the thesaurus sets several levels by dose for it, no "avoid" stands without a
    // dose condition, and the strength read doesn't already reach an "avoid" threshold ("≥ 1 g par prise" for aspirin 1 g)
    const strength = milligrams(b.medicine.active[i].strength);
    const reached = parts.some((p) => {
      const m = p.avoid && p.dose ? PER_DOSE_THRESHOLD.exec(norm(p.quote)) : null;
      const threshold = m ? Number(m[1].replace(",", ".")) * (m[2] === "g" ? 1000 : 1) : null;
      return threshold !== null && strength !== null && strength >= threshold;
    });
    const dosed = parts.filter((p) => p.dose && p.level !== null);
    const byDose = new Set(dosed.map((p) => p.level)).size > 1 && !parts.some((p) => p.avoid && !p.dose) && !reached;
    out.push({
      severity: parts.some((p) => p.avoid) ? "avoid" : "caution",
      source,
      substance: other.shown,
      byDose,
      parts: parts.map(({ level, quote }) => ({ level, quote })),
    });
  }
  return out;
}

/** a section 4.5 that was read, and read whole */
const read = (r: LabelAnalysis) => (r.official?.interactions?.length ?? 0) > 0 && r.official?.complete !== false;

/**
 * Two medicines taken in the same period: the same substance or family (interactions.ts), and
 * what their official product information says. One of the app's own interaction rules gives way
 * only to an official finding about the same substances that is at least as serious.
 */
export function checkPair(a: LabelAnalysis, b: LabelAnalysis): PairCheck {
  const base = checkTogether(a.medicine, b.medicine);
  if (!base.checked) return { ...base, official: [], officialBoth: false };
  const official = [...findIn(a, b), ...findIn(b, a)].sort((p, q) => Number(q.severity === "avoid" && !q.byDose) - Number(p.severity === "avoid" && !p.byDose));
  const findings = base.findings.filter((f) => {
    if (f.type !== "interaction") return true;
    const covered = official.filter((o) => f.substances.includes(o.substance));
    return !covered.some((o) => f.severity === "caution" || (o.severity === "avoid" && !o.byDose));
  });
  return { checked: true, findings, official, officialBoth: read(a) && read(b) };
}
