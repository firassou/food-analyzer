import "server-only";
import { fold } from "../analysis/knowledge";
import { withExcipients } from "../analysis/medicine";
import type { LabelAnalysis } from "../analysis/types";
import type { Locale } from "../i18n/locales";

// When a medicine is recognised but its excipients aren't on the photo (they are
// rarely on the front of the box), they are looked up in the French public medicines
// database (ANSM / HAS / Assurance Maladie), which publishes the official summary of
// product characteristics of every medicine authorised in France. Many medicines sold
// in the Maghreb carry the same brand and composition; a product made elsewhere may
// differ, and the result says so. Only the medicine's name is sent.

const SITE = "https://base-donnees-publique.medicaments.gouv.fr";
export const MEDICINE_SOURCE = "Base de données publique des médicaments";
/** the lookup is a bonus: it must not hold up a finished analysis for long */
const TIMEOUT_MS = 7000;
const USER_AGENT = "FoodAnalyzer/0.1 (https://github.com/firassou/food-analyzer)";

export interface MedicineEntry {
  /** "DOLIPRANE 500 mg, comprimé" */
  name: string;
  /** section 6.1 of the summary of product characteristics, as published */
  excipients: string;
  url: string;
}

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
}

export const wantedMedicine = (r: LabelAnalysis): WantedMedicine => ({
  name: r.product.name,
  strengths: r.medicine?.active.map((a) => a.strength).filter((s): s is string => !!s) ?? [],
  form: r.medicine?.form ?? null,
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

const ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", eacute: "é", egrave: "è", agrave: "à", ecirc: "ê", ccedil: "ç", rsquo: "’" };
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

export async function findMedicine(wanted: WantedMedicine, signal: AbortSignal): Promise<MedicineEntry | null> {
  const first = brandWords(wanted.name ?? "")[0];
  if (!first) return null;
  const term = encodeURIComponent(first);
  const res = await get(`${SITE}/api/options_autocompilation?searchType=medicine&term=${term}&startBy=${term}`, signal);
  const data: unknown = res ? await res.json().catch(() => null) : null;
  const entries = (Array.isArray(data) ? data : []).filter(
    (e): e is { value: string; url: string } =>
      typeof e?.value === "string" && typeof e?.url === "string" && /^\/medicament\/\d+\/extrait$/.test(e.url),
  );
  const entry = pickEntry(wanted, entries);
  if (!entry) return null;
  const page = await get(SITE + entry.url, signal);
  const excipients = page && parseExcipients(await page.text());
  return excipients ? { name: entry.value, excipients, url: SITE + entry.url } : null;
}

/** the photo's reading, completed by the official excipient list */
export function completeMedicine(result: LabelAnalysis, found: MedicineEntry, locale: Locale): LabelAnalysis {
  return withExcipients(result, { ingredients: found.excipients, raw_text: found.excipients }, locale, {
    name: MEDICINE_SOURCE,
    product: found.name,
    url: found.url,
  });
}
