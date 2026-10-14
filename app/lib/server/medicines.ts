import "server-only";
import { fold } from "../analysis/knowledge";
import { TOPICAL } from "../analysis/foodMedicine";
import { needsExcipients, withExcipients } from "../analysis/medicine";
import type { LabelAnalysis, OfficialInfo, OfficialInteraction } from "../analysis/types";
import type { Locale } from "../i18n/locales";

// Every recognised medicine is looked up in the French public medicines database (ANSM /
// HAS / Assurance Maladie), which publishes the official summary of product
// characteristics of every medicine authorised in France. From it come:
// - its excipients (section 6.1), when they aren't on the photo (they rarely are on the
//   front of the box); only from this very medicine, never from another one;
// - its contraindications (4.3), warnings (4.4) and pregnancy section (4.6), which the
//   health-condition checks quote. A brand not sold in France falls back to a French
//   generic with the same active substances and strength (generics share the reference
//   medicine's safety sections), and the result says which medicine was used.
// Many medicines sold in the Maghreb carry the same brand and composition; a product made
// elsewhere may differ, and the result says so. Only the medicine's and substance's names are sent.

const SITE = "https://base-donnees-publique.medicaments.gouv.fr";
export const MEDICINE_SOURCE = "Base de données publique des médicaments";
/** the lookup is a bonus: it must not hold up a finished analysis for long */
const TIMEOUT_MS = 7000;
const USER_AGENT = "FoodAnalyzer/0.1 (https://github.com/firassou/food-analyzer)";

/** this very medicine's entry, with its excipients (section 6.1) */
export interface BrandEntry {
  /** "DOLIPRANE 500 mg, comprimé" */
  name: string;
  /** as published; null when it has none */
  excipients: string | null;
  url: string;
}

export interface MedicineEntry {
  /** null when the brand isn't in the database (its official information may still come from a generic) */
  brand: BrandEntry | null;
  /** sections 4.1, 4.3, 4.4 and 4.6, from this medicine or a generic of it; null when none were found */
  official: OfficialInfo | null;
}

type Sections = Pick<OfficialInfo, "indications" | "contraindications" | "warnings" | "pregnancy" | "interactions" | "complete">;

const words = (s: string) => fold(s).split(/[^\p{L}]+/u).filter((t) => t.length >= 3);
/** "500 mg" → ["500"], "0,5 mg/5 ml" → ["0.5", "5"] */
const numbers = (s: string) => (s.replace(/(\d),(\d)/g, "$1.$2").match(/\d+(\.\d+)?/g) ?? []).map((n) => String(Number(n)));
/** the brand: the words before the first figure or comma ("Doliprane 500 mg comprimés" → doliprane) */
const brandWords = (name: string) => words(name.split(/[\d,]/)[0]);
/** the database is in French: common forms printed in English are compared in French */
const FORM_FR: Record<string, string> = { tablet: "comprime", caplet: "comprime", capsule: "gelule", syrup: "sirop", powder: "poudre", drops: "gouttes", cream: "creme", ointment: "pommade", suppository: "suppositoire", suppositories: "suppositoire", oral: "buvable", coated: "pellicule", injection: "injectable" };
/** tablets / comprimés / comprimé: compare the stems */
const stem = (t: string) => (FORM_FR[t] ?? FORM_FR[t.replace(/s$/, "")] ?? t).slice(0, 6);
const FORM_NOISE = new Set(["pour", "par", "les", "des", "avec", "for", "and", "the", "film", "dose"]);
const formStems = (s: string) => [...new Set(words(s).filter((t) => !FORM_NOISE.has(t)).map(stem))];

export interface WantedMedicine {
  name: string | null;
  strengths: string[];
  form: string | null;
  /** the active substances' names, as read */
  substances?: string[];
}

export const wantedMedicine = (r: LabelAnalysis): WantedMedicine => ({
  name: r.product.name,
  strengths: r.medicine?.active.map((a) => a.strength).filter((s): s is string => !!s) ?? [],
  form: r.medicine?.form ?? null,
  substances: r.medicine?.active.map((a) => a.name_local ?? a.name).filter(Boolean) ?? [],
});

/**
 * The entry that is this medicine, or null. The brand must match word for word and the
 * strength figure for figure: another strength or another brand's excipients would be
 * worse than none. Among those, the closest pharmaceutical form wins.
 */
export function pickEntry<T extends { value: string }>(wanted: WantedMedicine, entries: T[]): T | null {
  const brand = brandWords(wanted.name ?? "");
  if (brand.length === 0) return null;
  const strength = new Set(numbers(`${wanted.name ?? ""} ${wanted.strengths.join(" ")}`));
  const form = new Set(formStems(`${wanted.form ?? ""} ${(wanted.name ?? "").replace(/^[^\d]*/, "")}`));
  const candidates: { entry: T; score: number }[] = [];
  for (const entry of entries) {
    const entryBrand = brandWords(entry.value);
    if (!brand.every((t) => entryBrand.includes(t))) continue;
    const extra = entryBrand.filter((t) => !brand.includes(t)).length;
    if (extra > 1) continue;
    const entryStrength = numbers(entry.value.split(",")[0]);
    // the photo's strength must be the entry's; with none on the photo, only entries without one qualify
    if (entryStrength.length !== 0 ? !entryStrength.every((n) => strength.has(n)) : strength.size > 0) continue;
    const entryForm = formStems(entry.value.replace(/^[^,]*,?/, ""));
    const shared = entryForm.filter((t) => form.has(t)).length;
    candidates.push({ entry, score: shared * 10 - extra * 3 - (entryForm.length - shared) });
  }
  if (candidates.length <= 1) return candidates[0]?.entry ?? null;
  // several forms (tablet, sachet, suppository…) don't share their excipients: the form must decide
  if (form.size === 0) return null;
  candidates.sort((x, y) => y.score - x.score);
  return candidates[0].score > candidates[1].score && candidates[0].score > 0 ? candidates[0].entry : null;
}

const ENTITIES: Record<string, string> = {
  nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", eacute: "é", egrave: "è", agrave: "à", ecirc: "ê", ccedil: "ç", rsquo: "’",
  Eacute: "É", Egrave: "È", Agrave: "À", acirc: "â", icirc: "î", ocirc: "ô", ucirc: "û", ugrave: "ù", euml: "ë", iuml: "ï", oelig: "œ",
  laquo: "«", raquo: "»", lsquo: "‘", ldquo: "“", rdquo: "”", ndash: "–", mdash: "—", hellip: "…", deg: "°", middot: "·", micro: "µ", ge: "≥", le: "≤",
};
const decode = (text: string) =>
  text
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name] ?? ENTITIES[name.toLowerCase()] ?? all);
const plain = (html: string) =>
  html
    // one printed line per paragraph: lines of a list become a comma-separated list
    .replace(/<\/(p|li|div|tr)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (all, name) => ENTITIES[name.toLowerCase()] ?? all)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .map((line) => (/[:;,.]$/.test(line) ? line : `${line},`))
    .join(" ");

/** a section longer than this is cut and the information marked incomplete (the longest seen, 4.4 of a combination, is ~17 000) */
const MAX_SECTION_CHARS = 60_000;

/** one paragraph of a section: its class ("AmmListePuces2", "AmmAnnexeTitre3"…) and its text */
interface Block {
  cls: string;
  text: string;
}

/**
 * The paragraphs of one section of a medicine's page, found by its anchor ("RcpContreindications")
 * or, when a page lacks it, by its numbered heading; it runs to the next section heading, without
 * its own. `complete` is false when it had to be cut.
 */
function sectionBlocks(html: string, anchor: string, heading: RegExp): { blocks: Block[]; complete: boolean } {
  let start = html.search(new RegExp(`name=["']?${anchor}["'\\s>]`));
  if (start < 0) {
    // the page's side menu lists the same headings: look in the document itself, from its first section anchor
    const firstAnchor = html.search(/name=["']?Rcp[A-Z]/);
    const body = firstAnchor >= 0 ? firstAnchor : Math.max(html.search(/class=["']?AmmAnnexeTitre/), 0);
    const found = html.slice(body).search(heading);
    start = found < 0 ? -1 : body + found;
  }
  if (start < 0) return { blocks: [], complete: true };
  const rest = html.slice(start);
  const afterHeading = rest.search(/<\/(p|h\d|a)>/i);
  // the next section: its anchor, a level-1 or level-2 heading, or a numbered heading ("4.5. Interactions")
  const ends = [/name=["']?Rcp[A-Z]/g, /class=["']?AmmAnnexeTitre[12]/g, />\s*(?:<[^>]+>\s*)*\d+\.\d+\.?\s+[A-ZÉ][^<]{3,}</g]
    .map((rule) => {
      rule.lastIndex = Math.max(afterHeading, 1);
      const m = rule.exec(rest);
      return m ? m.index : -1;
    })
    .filter((i) => i > 0);
  const end = ends.length ? rest.lastIndexOf("<", Math.min(...ends)) : rest.length;
  const body = rest.slice(afterHeading < 0 ? 0 : afterHeading, Math.max(end, 0));
  const blocks: Block[] = [];
  let total = 0;
  for (const raw of body.split(/<\/(?:p|li|div|tr|h\d)>|<br\s*\/?>/i)) {
    const text = decode(raw.replace(/<[^>]*>/g, " "))
      .replace(/\s+/g, " ")
      .trim()
      // list bullets: "·", "•", "§", "-", "o", the Symbol font's ""
      .replace(/^(?:[·•▪◦§\uf0b7\uf0a7]|-|o(?= ))\s*/u, "")
      .trim();
    if (!text || /^\d+\.\d+\.?\s/.test(text)) continue;
    if (total + text.length > MAX_SECTION_CHARS) return { blocks, complete: false };
    total += text.length;
    blocks.push({ cls: /class=["']?(\w+)/.exec(raw)?.[1] ?? "", text });
  }
  return { blocks, complete: true };
}

/** a section as paragraphs: a list's sub-items stay with their item */
export function parseSection(html: string, anchor: string, heading: RegExp): { paragraphs: string[]; complete: boolean } {
  const { blocks, complete } = sectionBlocks(html, anchor, heading);
  const paragraphs: string[] = [];
  for (const { cls, text } of blocks) {
    // a sub-item ("§ … et en cas d'antécédent d'ulcère") belongs to its item ("En cas d'association avec…"):
    // read alone, it would lose what it is conditional on
    if (/^AmmListePuces[2-9]$/.test(cls) && paragraphs.length > 0) paragraphs[paragraphs.length - 1] += ` ${text}`;
    else paragraphs.push(text);
  }
  return { paragraphs, complete };
}

const LEVELS: [RegExp, NonNullable<OfficialInteraction["level"]>][] = [
  [/contre[- ]?indiquee?s?/, "contraindicated"],
  [/deconseillee?s?/, "not_recommended"],
  [/precautions? d.emploi/, "precaution"],
  [/a prendre en compte/, "consider"],
];

/**
 * Section 4.5 as entries: under each heading of the ANSM thesaurus ("Associations déconseillées"),
 * one entry per "+ Anticoagulants oraux" line, with the paragraphs that follow it. A page written
 * as prose gives one entry per paragraph, with no level and nothing in `with`.
 */
export function parseInteractions(html: string): { interactions: OfficialInteraction[]; complete: boolean } {
  const { blocks, complete } = sectionBlocks(html, "RcpInteractionsMed", />\s*4\.5\.?\s*Interactions/i);
  const interactions: OfficialInteraction[] = [];
  let level: OfficialInteraction["level"] = null;
  let current: OfficialInteraction | null = null;
  for (const { cls, text } of blocks) {
    const folded = fold(text);
    // a heading: "Associations contre-indiquées", "Association déconseillée"…
    if (/^associations?\b/.test(folded) && text.length < 90) {
      level = LEVELS.find(([rule]) => rule.test(folded))?.[1] ?? null;
      current = null;
      continue;
    }
    // another heading ("Risque lié à l'hyperkaliémie"): no thesaurus level under it
    if (/^AmmAnnexeTitre/.test(cls)) {
      level = null;
      current = null;
      continue;
    }
    if (text.startsWith("+")) {
      current = { level, with: text.replace(/^\+\s*/, "").replace(/[\s:,]+$/, ""), text: "" };
      interactions.push(current);
    } else if (current) current.text = current.text ? `${current.text} ${text}` : text;
    else interactions.push({ level, with: "", text });
  }
  return { interactions, complete };
}

/** sections 4.1, 4.3, 4.4 and 4.6 of a medicine's page; null when it has no contraindications section */
export function parseOfficialSections(html: string): Sections | null {
  const indications = parseSection(html, "RcpIndicTherap", />\s*4\.1\.?\s*Indications/i);
  const contraindications = parseSection(html, "RcpContreindications", />\s*4\.3\.?\s*Contre/i);
  const warnings = parseSection(html, "RcpMisesEnGarde", />\s*4\.4\.?\s*Mises en garde/i);
  const pregnancy = parseSection(html, "RcpFertGrossAllait", />\s*4\.6\.?\s*(Fertilit|Grossesse)/i);
  const interactions = parseInteractions(html);
  // every medicine has 4.3, if only for hypersensitivity: a page without it can't be read for safety
  if (contraindications.paragraphs.length === 0) return null;
  return {
    indications: indications.paragraphs,
    contraindications: contraindications.paragraphs,
    warnings: warnings.paragraphs,
    pregnancy: pregnancy.paragraphs,
    interactions: interactions.interactions,
    complete: [indications, contraindications, warnings, pregnancy, interactions].every((x) => x.complete),
  };
}

/** section 6.1 "Liste des excipients" of a medicine's page; null when it has none */
export function parseExcipients(html: string): string | null {
  const start = html.search(/name=["']?RcpListeExcipients/);
  if (start < 0) return null;
  const rest = html.slice(start);
  const next = rest.search(/name=["']?RcpIncompatibilites/);
  // the section runs up to the tag that opens the next one
  const end = next < 0 ? 4000 : rest.lastIndexOf("<", next);
  const text = plain(rest.slice(rest.indexOf(">") + 1, end))
    .replace(/^\s*6\.1\.?\s*Liste des excipients\s*[,.]?\s*/i, "")
    .replace(/[.,;\s]+$/, "");
  // "Sans objet" / "Aucun": nothing to list
  return text.length >= 4 && text.length <= 1500 && !/^(sans objet|aucun|neant)/.test(fold(text)) ? text : null;
}

async function get(url: string, signal: AbortSignal): Promise<Response | null> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT, "X-Requested-With": "XMLHttpRequest" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(TIMEOUT_MS)]),
  });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`medicines database answered ${res.status}`);
  return res;
}

async function search(term: string, signal: AbortSignal): Promise<{ value: string; url: string }[]> {
  const q = encodeURIComponent(term);
  const res = await get(`${SITE}/api/options_autocompilation?searchType=medicine&term=${q}&startBy=${q}`, signal);
  const data: unknown = res ? await res.json().catch(() => null) : null;
  return (Array.isArray(data) ? data : []).filter(
    (e): e is { value: string; url: string } =>
      typeof e?.value === "string" && typeof e?.url === "string" && /^\/medicament\/\d+\/extrait$/.test(e.url),
  );
}

/** the French name of a substance ("ibuprofen" → "ibuprofene"), as the database spells it; null when unknown */
async function frenchSubstance(name: string, signal: AbortSignal): Promise<string | null> {
  const first = words(name)[0];
  if (!first || first.length < 4) return null;
  const q = encodeURIComponent(first);
  const res = await get(`${SITE}/api/options_autocompilation?searchType=substance&term=${q}&startBy=${q}`, signal);
  const data: unknown = res ? await res.json().catch(() => null) : null;
  const names = (Array.isArray(data) ? data : []).filter((n): n is string => typeof n === "string").map(fold);
  // the bare substance, not one of its salts ("amoxicilline", not "amoxicilline sodique")
  return names.find((n) => !n.includes(" ")) ?? null;
}

// homeopathic dilutions and food supplements carry no safety sections worth quoting
const NOT_A_MEDICINE = /(?<![\p{L}])(\d+\s?(ch|dh|k)|degre de dilution|teinture mere)(?![\p{L}])/u;
// the companies most French generics are sold under, to reach the plain generic in the 20 answers a search gives
const GENERIC_LABS = ["arrow", "biogaran", "sandoz", "teva", "viatris", "zentiva", "almus", "eg", "accord", "cristers"];

/** the units of a strength: "mg", "g", "%"…, so 1 g is never taken for 1 mg */
const unitsOf = (s: string) => new Set((fold(s).match(/(?<=\d\s?)(mg|g|µg|mcg|%|ui|iu|ml)(?![\p{L}])/gu) ?? []).map((u) => (u === "iu" ? "ui" : u === "mcg" ? "µg" : u)));

/**
 * A French generic of the same active substance and strength, for a brand not sold in France:
 * "IBUPROFENE ARROW 400 mg" for a Tunisian "Brufen 400 mg". The entry must name that substance
 * and no other, its strength (figures and units) must be the photo's, and a tablet is never matched
 * to a gel or the other way round. Only its safety sections are used.
 */
export function pickGeneric<T extends { value: string }>(substance: string, wanted: WantedMedicine, entries: T[]): T | null {
  const stemOf = (t: string) => t.replace(/e$/, "");
  const target = stemOf(substance);
  const strength = new Set(numbers(wanted.strengths.join(" ")));
  if (strength.size === 0) return null;
  const units = unitsOf(wanted.strengths.join(" "));
  const form = new Set(formStems(wanted.form ?? ""));
  // with no form read, a strength in % is a cream or gel, one in mg is taken
  const topical = wanted.form ? TOPICAL.test(fold(wanted.form)) : units.has("%");
  const scored: { entry: T; score: number }[] = [];
  for (const entry of entries) {
    // "KETOPROFENE ARROW 2,5 %, gel": the form follows ", ", a decimal comma doesn't
    const [head, entryFormText = ""] = entry.value.split(/,\s([\s\S]*)/);
    if (NOT_A_MEDICINE.test(fold(entry.value))) continue;
    const name = words(head.split(/\d/)[0]);
    // the substance first, then only the company: "IBUPROFENE ARROW CONSEIL", not "AMOXICILLINE ACIDE CLAVULANIQUE"
    if (!name[0] || stemOf(name[0]) !== target) continue;
    if (name.slice(1).some((t) => t.length > 3 && !GENERIC_LABS.includes(t) && !["conseil", "lab", "pharma", "sante"].includes(t))) continue;
    const entryStrength = numbers(head);
    if (entryStrength.length === 0 || !entryStrength.every((n) => strength.has(n))) continue;
    if (units.size > 0 && ![...unitsOf(head)].every((u) => units.has(u))) continue;
    if (TOPICAL.test(fold(entryFormText)) !== topical) continue;
    const entryForm = formStems(entryFormText);
    const shared = entryForm.filter((t) => form.has(t)).length;
    scored.push({ entry, score: shared * 10 - (entryForm.length - shared) });
  }
  scored.sort((x, y) => y.score - x.score);
  return scored[0]?.entry ?? null;
}

async function page(entry: { url: string }, signal: AbortSignal): Promise<string | null> {
  const res = await get(SITE + entry.url, signal);
  return res ? res.text() : null;
}

const official = (entry: { value: string; url: string }, match: OfficialInfo["match"], sections: Sections): OfficialInfo => ({
  source: MEDICINE_SOURCE,
  product: entry.value,
  url: SITE + entry.url,
  match,
  ...sections,
});

/** a French generic's safety sections, for a medicine of one active substance */
async function genericOfficial(wanted: WantedMedicine, signal: AbortSignal): Promise<OfficialInfo | null> {
  const substances = wanted.substances ?? [];
  if (substances.length !== 1) return null;
  const substance = await frenchSubstance(substances[0], signal);
  if (!substance) return null;
  const terms = [substance, ...GENERIC_LABS.slice(0, 4).map((lab) => `${substance} ${lab}`)];
  const lists = await Promise.all(terms.map((term) => search(term, signal).catch(() => [])));
  const entry = pickGeneric(substance, wanted, lists.flat());
  const html = entry && (await page(entry, signal));
  const sections = html && parseOfficialSections(html);
  return entry && sections ? official(entry, "substance", sections) : null;
}

/**
 * This medicine's entry (for its excipients) and its official safety sections: its own, or, when
 * the brand isn't in the database or its page carries none (medicines authorised by the EU publish
 * them elsewhere), a French generic's. Null when neither was found.
 */
export async function findMedicine(wanted: WantedMedicine, signal: AbortSignal): Promise<MedicineEntry | null> {
  const first = brandWords(wanted.name ?? "")[0];
  let brand: BrandEntry | null = null;
  let info: OfficialInfo | null = null;
  const entry = first ? pickEntry(wanted, await search(first, signal)) : null;
  if (entry) {
    const html = await page(entry, signal);
    if (html) {
      brand = { name: entry.value, excipients: parseExcipients(html), url: SITE + entry.url };
      const sections = parseOfficialSections(html);
      if (sections) info = official(entry, "brand", sections);
    }
  }
  info ??= await genericOfficial(wanted, signal);
  return brand?.excipients || info ? { brand: brand?.excipients ? brand : null, official: info } : null;
}

/** the photo's reading with its official product information, and its official excipient list when it wasn't read */
export function completeMedicine(result: LabelAnalysis, found: MedicineEntry, locale: Locale): LabelAnalysis {
  const info = found.official ?? result.official ?? null;
  const brand = found.brand;
  // the excipients are only completed when they weren't read, and only from this very medicine
  if (!brand?.excipients || !needsExcipients(result)) return { ...result, official: info };
  return withExcipients({ ...result, official: info }, { ingredients: brand.excipients, raw_text: brand.excipients }, locale, {
    name: MEDICINE_SOURCE,
    product: brand.name,
    url: brand.url,
  });
}
