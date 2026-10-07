// How long a treatment still has to run, from the duration the pharmacist wrote on the box
// ("7 jours", "2 weeks", "7 أيام") and the day it was scanned. Pure and client-safe.
//
// It is a reading, not the prescription: the duration comes from handwriting, and the count
// starts the day the box was scanned, which may not be the day the treatment began. The UI
// says so, and never presents it as a schedule to follow.

import { fold } from "./knowledge";
import type { LabelAnalysis } from "./types";

/** the part of a saved scan a course needs */
interface Scanned {
  id: string;
  at: number;
  result: LabelAnalysis;
}

export type CourseStatus = "ongoing" | "last_day" | "finished";

export interface Course<E extends Scanned = Scanned> {
  entry: E;
  /** the duration as written on the box */
  raw: string;
  days: number;
  /** units a day (morning + midday + evening + any time); 0 when the marks give none */
  perDay: number;
  /** the last day of the course (local calendar day, midnight) */
  last: Date;
  status: CourseStatus;
  /** whole days from today to the last day; 0 on it, negative once finished */
  left: number;
}

/** a longer course than this is more likely a misread than a treatment */
export const MAX_COURSE_DAYS = 365;

const UNITS: [RegExp, number][] = [
  [/^(mois|months?|mes(es)?|monate?)\b|^شهر|^أشهر|^اشهر/u, 30],
  [/^(semaines?|sem|weeks?|wks?|semanas?|settiman[ae]|wochen?)\b|^أسبوع|^اسبوع|^أسابيع|^اسابيع/u, 7],
  [/^(jours?|j|days?|d|dias?|giorn[oi]|tage?n?)\b|^يوم|^أيام|^ايام/u, 1],
];

const digits = (s: string) =>
  s.replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660)).replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));

/** "7 jours" → 7, "2 weeks" → 14, "x 10 j" → 10; null when no count of days can be read */
export function parseCourseDays(text: string | null | undefined): number | null {
  if (!text) return null;
  const s = fold(digits(text));
  // the first number followed by a unit of time; a bare number is not assumed to be days
  for (const m of s.matchAll(/(\d{1,3})\s*([^\d\s][^\d]*)/gu)) {
    const rest = m[2].trim();
    for (const [rule, factor] of UNITS)
      if (rule.test(rest)) {
        const days = Number(m[1]) * factor;
        return days >= 1 && days <= MAX_COURSE_DAYS ? days : null;
      }
  }
  return null;
}

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

/** the course a saved medicine scan describes, or null when no duration was written or read */
export function courseOf<E extends Scanned>(entry: E, now: Date): Course<E> | null {
  const marks = entry.result.medicine?.marks;
  const days = parseCourseDays(marks?.duration);
  if (!marks || !marks.duration || days === null) return null;
  const start = startOfDay(new Date(entry.at));
  const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + days - 1);
  const left = Math.round((last.getTime() - startOfDay(now).getTime()) / 86_400_000);
  return {
    entry,
    raw: marks.duration,
    days,
    perDay: marks.morning + marks.midday + marks.evening + marks.anytime,
    last,
    status: left < 0 ? "finished" : left === 0 ? "last_day" : "ongoing",
    left,
  };
}

/** the courses still running first, the soonest to end leading; finished ones last */
export function coursesOf<E extends Scanned>(entries: E[], now: Date): Course<E>[] {
  const rank = (c: Course<E>) => (c.status === "finished" ? 1 : 0);
  return entries
    .map((e) => courseOf(e, now))
    .filter((c): c is Course<E> => c !== null)
    .sort((a, b) => rank(a) - rank(b) || (rank(a) ? b.left - a.left : a.left - b.left));
}
