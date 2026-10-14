// "My shelf": what the saved scans say taken together. Every medicine checked against every
// other, and every printed date sorted by how soon it runs out. Pure and client-safe; the
// medicine rules are the same ones the two-medicine check uses.

import { checkConditions, type ConditionCheck, type ConditionFinding } from "./conditions";
import type { OfficialFinding } from "./official";
import { type Expiry, expiryOf } from "./expiry";
import type { TogetherFinding } from "./interactions";
import { checkPair, type OfficialPairFinding } from "./officialInteractions";
import { fold } from "./knowledge";
import type { NamedProfile } from "./profiles";
import type { LabelAnalysis } from "./types";

/** the part of a saved scan the shelf needs */
export interface ShelfEntry {
  id: string;
  at: number;
  result: LabelAnalysis;
}

/** more than this and the pairs outgrow the screen; the most recent ones are used */
export const MAX_SHELF_MEDICINES = 8;

export interface DatedEntry<E extends ShelfEntry> {
  entry: E;
  expiry: Expiry;
}

export interface PairFinding<E extends ShelfEntry> {
  a: E;
  b: E;
  findings: TogetherFinding[];
  /** what their official product information says about taking them together */
  official: OfficialPairFinding[];
}

export interface ShelfCheck<E extends ShelfEntry> {
  /** medicines whose active substance was read, one per product (the newest scan of each) */
  medicines: E[];
  /** medicines left out because their substance wasn't read */
  unread: number;
  /** only the pairs where something stood out, serious ones first */
  pairs: PairFinding<E>[];
  /** how many pairs could be compared */
  compared: number;
}

/** the same product scanned twice is one medicine: same name and same substances */
const productKey = (r: LabelAnalysis) =>
  `${fold(r.product.name ?? "")}|${(r.medicine?.active ?? [])
    .map((a) => fold(a.name))
    .sort()
    .join("+")}`;

export function checkShelf<E extends ShelfEntry>(entries: E[]): ShelfCheck<E> {
  const all = entries.filter((e) => e.result.kind === "medicine" && e.result.medicine).sort((p, q) => q.at - p.at);
  const read = all.filter((e) => (e.result.medicine?.active.length ?? 0) > 0);
  const seen = new Set<string>();
  const medicines = read
    .filter((e) => {
      const key = productKey(e.result);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_SHELF_MEDICINES);
  const pairs: PairFinding<E>[] = [];
  let compared = 0;
  for (let i = 0; i < medicines.length; i++)
    for (let j = i + 1; j < medicines.length; j++) {
      const check = checkPair(medicines[i].result, medicines[j].result);
      if (!check.checked) continue;
      compared++;
      if (check.findings.length + check.official.length > 0) pairs.push({ a: medicines[i], b: medicines[j], findings: check.findings, official: check.official });
    }
  const worst = (p: PairFinding<E>) => Number(p.findings.some((f) => f.severity === "avoid") || p.official.some((f) => f.severity === "avoid" && !f.byDose));
  pairs.sort((p, q) => worst(q) - worst(p));
  return { medicines, unread: all.length - read.length, pairs, compared };
}

export interface PersonShelfCheck<E extends ShelfEntry> {
  person: NamedProfile;
  /** only the medicines where something stood out for this person's conditions, serious ones first */
  items: { entry: E; findings: ConditionFinding[]; official: OfficialFinding[]; officialSource: ConditionCheck["officialSource"] }[];
  /** medicines that couldn't be checked: their substance or their official product information is missing */
  unchecked: E[];
}

/** the shelf's medicines against each person's health conditions; only people who have some */
export function checkShelfConditions<E extends ShelfEntry>(medicines: E[], people: NamedProfile[]): PersonShelfCheck<E>[] {
  const out: PersonShelfCheck<E>[] = [];
  for (const person of people) {
    const checks = medicines.map((entry) => ({ entry, check: checkConditions(entry.result, person) }));
    if (!checks.some((c) => c.check !== null)) continue;
    const items = checks
      .filter((c) => (c.check?.findings.length ?? 0) + (c.check?.official.length ?? 0) > 0)
      .map((c) => ({ entry: c.entry, findings: c.check!.findings, official: c.check!.official, officialSource: c.check!.officialSource }));
    const worst = (i: (typeof items)[number]) => Number([...i.findings, ...i.official].some((f) => f.level === "avoid"));
    items.sort((p, q) => worst(q) - worst(p));
    out.push({ person, items, unchecked: checks.filter((c) => c.check?.status === "unchecked").map((c) => c.entry) });
  }
  return out;
}

/** every saved scan with a readable date, the soonest first (already expired ones lead) */
export function datedEntries<E extends ShelfEntry>(entries: E[], now: Date): DatedEntry<E>[] {
  return entries
    .map((entry) => ({ entry, expiry: expiryOf(entry.result, now) }))
    .filter((d): d is DatedEntry<E> => d.expiry !== null)
    .sort((p, q) => p.expiry.end.getTime() - q.expiry.end.getTime());
}

/** how many are expired or about to be: what the badge and the reminder count */
export const attentionCount = (dated: DatedEntry<ShelfEntry>[]) => dated.filter((d) => d.expiry.status !== "later").length;
