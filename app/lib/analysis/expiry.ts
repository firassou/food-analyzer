// Reading an expiry date as printed on a pack ("11/2027", "EXP 30.11.27", "nov. 2027") so a
// saved scan can say how long it has left. Pure and client-safe. A month with no day lasts
// to the end of that month, which is how packs use it.

import type { LabelAnalysis } from "./types";

export interface ParsedDate {
  /** the last day it is good (local calendar day, midnight) */
  end: Date;
  /** "month" when the pack gives no day */
  precision: "day" | "month";
}

export type ExpiryStatus = "expired" | "soon" | "later";

export interface Expiry extends ParsedDate {
  /** which printed date it came from */
  kind: "expiration" | "best_before";
  /** the text as read */
  raw: string;
  status: ExpiryStatus;
  /** whole days from today to `end`; negative once passed */
  days: number;
}

/** how close counts as "soon" */
export const SOON_DAYS = 30;

const MONTHS: Record<string, number> = {
  jan: 1, janv: 1, january: 1, janvier: 1,
  feb: 2, fev: 2, fevr: 2, february: 2, fevrier: 2,
  mar: 3, mars: 3, march: 3,
  apr: 4, avr: 4, april: 4, avril: 4,
  may: 5, mai: 5,
  jun: 6, juin: 6, june: 6,
  jul: 7, juil: 7, july: 7, juillet: 7,
  aug: 8, aout: 8, august: 8,
  sep: 9, sept: 9, september: 9, septembre: 9,
  oct: 10, october: 10, octobre: 10,
  nov: 11, november: 11, novembre: 11,
  dec: 12, december: 12, decembre: 12,
};

const normalize = (s: string) =>
  s
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0))
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const year = (y: string) => {
  const n = Number(y);
  return y.length === 2 ? 2000 + n : n;
};

function build(y: number, m: number, d: number | null): ParsedDate | null {
  if (!(y >= 2000 && y <= 2100) || !(m >= 1 && m <= 12)) return null;
  const last = new Date(y, m, 0).getDate();
  if (d !== null && !(d >= 1 && d <= last)) return null;
  return { end: new Date(y, m - 1, d ?? last), precision: d === null ? "month" : "day" };
}

/** the first date in `text`, or null */
export function parseExpiry(text: string): ParsedDate | null {
  const s = normalize(text);
  let m: RegExpMatchArray | null;
  // 2027-11-30, 2027/11/30
  if ((m = s.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/))) return build(+m[1], +m[2], +m[3]);
  // 30/11/2027, 30.11.27
  if ((m = s.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4}|\d{2})\b/))) return build(year(m[3]), +m[2], +m[1]);
  // 2027-11
  if ((m = s.match(/\b(20\d{2})[-/.](\d{1,2})\b/))) return build(+m[1], +m[2], null);
  // 11/2027, 11-27
  if ((m = s.match(/\b(\d{1,2})[-/.](\d{4}|\d{2})\b/))) return build(year(m[2]), +m[1], null);
  // 30 nov 2027, nov. 2027, novembre 27
  if ((m = s.match(/\b(?:(\d{1,2})[\s.-]*)?([a-z]{3,9})\.?[\s-]*(\d{4}|\d{2})\b/)) && MONTHS[m[2]] !== undefined) {
    return build(year(m[3]), MONTHS[m[2]], m[1] ? +m[1] : null);
  }
  return null;
}

/**
 * Models sometimes rewrite a printed "25-10-26" (day, month, two-digit year) as "2025-10-26",
 * taking the 25 for the year, and a date that is months away then reads as past. When the label's
 * own text shows exactly that printed date and it is a valid day-first one, the printed form
 * replaces the rewritten one. A label really printed year-first is the price: day-first is how
 * the places this app is used write it, and the printed text is what the reader sees on the pack.
 */
export function printedDate(value: string | null, rawText: string | null): string | null {
  if (!value || !rawText) return value;
  const iso = value.trim().match(/^20(\d{2})[-/.](\d{1,2})[-/.](\d{1,2})$/);
  if (!iso) return value;
  for (const m of normalize(rawText).matchAll(/(?<![\d])(\d{2})([-/.])(\d{1,2})\2(\d{1,2})(?![\d])/g)) {
    if (m[1] === iso[1] && +m[3] === +iso[2] && +m[4] === +iso[3] && parseExpiry(m[0]) !== null) return m[0];
  }
  return value;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function expiryStatus(end: Date, now: Date): { status: ExpiryStatus; days: number } {
  const days = Math.round((startOfDay(end).getTime() - startOfDay(now).getTime()) / 86_400_000);
  return { days, status: days < 0 ? "expired" : days <= SOON_DAYS ? "soon" : "later" };
}

/** when a scanned product runs out: the expiry date, else the best-before date; null when none could be read */
export function expiryOf(result: LabelAnalysis, now: Date): Expiry | null {
  const candidates = [
    ["expiration", result.dates?.expiration],
    ["best_before", result.dates?.best_before],
  ] as const;
  for (const [kind, stored] of candidates) {
    if (!stored) continue;
    // scans saved before the reading was corrected still hold the model's rewritten date
    const raw = printedDate(stored, result.raw_text) ?? stored;
    const parsed = parseExpiry(raw);
    if (parsed) return { ...parsed, kind, raw, ...expiryStatus(parsed.end, now) };
  }
  return null;
}
