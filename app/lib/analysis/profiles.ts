// Several people can share one device (a family's phone): each has a named profile and the
// reader switches between them. Pure and client-safe, like profile.ts: this is only the
// bookkeeping; what a profile means for a result is still `checkProfile`.

import { checkConditions, type ConditionCheck, type ConditionFinding } from "./conditions";
import { checkProfile, EMPTY_PROFILE, sanitizeProfile, type Profile, type ProfileCheck } from "./profile";
import type { LabelAnalysis } from "./types";

export interface NamedProfile extends Profile {
  id: string;
  /** what the reader typed; empty for the first, unnamed profile */
  name: string;
}

export interface ProfileBook {
  /** the id of the profile results are checked against */
  active: string;
  profiles: NamedProfile[];
}

export const MAX_PROFILES = 6;
export const MAX_NAME = 24;
export const FIRST_PROFILE_ID = "me";

const firstProfile = (from: Profile = EMPTY_PROFILE): NamedProfile => ({ ...from, id: FIRST_PROFILE_ID, name: "" });

export const emptyBook = (): ProfileBook => ({ active: FIRST_PROFILE_ID, profiles: [firstProfile()] });

const cleanName = (v: unknown) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, MAX_NAME) : "");

/**
 * A stored book, whatever shape it comes back in. `legacy` is the old single profile
 * (before several were possible): it becomes the first person.
 */
export function sanitizeBook(raw: unknown, legacy?: unknown): ProfileBook {
  const x = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;
  const seen = new Set<string>();
  const profiles: NamedProfile[] = [];
  for (const item of Array.isArray(x.profiles) ? x.profiles : []) {
    const p = (typeof item === "object" && item !== null ? item : {}) as Record<string, unknown>;
    const id = typeof p.id === "string" && /^[\w-]{1,24}$/.test(p.id) ? p.id : null;
    if (!id || seen.has(id) || profiles.length >= MAX_PROFILES) continue;
    seen.add(id);
    profiles.push({ ...sanitizeProfile(p), id, name: cleanName(p.name) });
  }
  if (profiles.length === 0) return legacy ? { active: FIRST_PROFILE_ID, profiles: [firstProfile(sanitizeProfile(legacy))] } : emptyBook();
  return { active: profiles.some((p) => p.id === x.active) ? (x.active as string) : profiles[0].id, profiles };
}

export const activeProfile = (book: ProfileBook): NamedProfile => book.profiles.find((p) => p.id === book.active) ?? book.profiles[0];

/** adds a person and makes them the active one; refused (unchanged) at the maximum */
export function addPerson(book: ProfileBook, id: string, name = ""): ProfileBook {
  if (book.profiles.length >= MAX_PROFILES || book.profiles.some((p) => p.id === id)) return book;
  return { active: id, profiles: [...book.profiles, { ...EMPTY_PROFILE, id, name: cleanName(name) }] };
}

export function renamePerson(book: ProfileBook, id: string, name: string): ProfileBook {
  return { ...book, profiles: book.profiles.map((p) => (p.id === id ? { ...p, name: cleanName(name) } : p)) };
}

/** removes a person; the last one can't be removed (it is cleared instead) */
export function removePerson(book: ProfileBook, id: string): ProfileBook {
  if (book.profiles.length <= 1) return { ...book, profiles: book.profiles.map((p) => ({ id: p.id, name: "", ...EMPTY_PROFILE })) };
  const profiles = book.profiles.filter((p) => p.id !== id);
  return { active: book.active === id ? profiles[0].id : book.active, profiles };
}

export const switchPerson = (book: ProfileBook, id: string): ProfileBook => (book.profiles.some((p) => p.id === id) ? { ...book, active: id } : book);

/** replaces what the active person avoids */
export function updateActive(book: ProfileBook, profile: Profile): ProfileBook {
  const clean = sanitizeProfile(profile);
  // rebuilt rather than merged: a field the new profile leaves out (no conditions) must go
  return { ...book, profiles: book.profiles.map((p) => (p.id === book.active ? { id: p.id, name: p.name, ...clean } : p)) };
}

/** the watchlist check with the health-condition findings folded in */
export interface PersonVerdict extends ProfileCheck {
  /** present only when the person has health conditions the rules know */
  conditions?: ConditionFinding[];
  /** what a medicine's official product information says about them (present with `conditions`) */
  official?: ConditionCheck["official"];
  officialSource?: ConditionCheck["officialSource"];
}

const RANK = { avoid: 0, check: 1, unchecked: 2, ok: 3 } as const;

/**
 * What a result means for one person: what they avoid and their health conditions, as one
 * verdict. Null when neither has anything to say (no profile, or a water for a watchlist).
 */
export function checkPerson(result: LabelAnalysis, profile: Profile): PersonVerdict | null {
  const watch = checkProfile(result, profile);
  const health = checkConditions(result, profile);
  if (!health) return watch;
  const fromHealth = { conditions: health.findings, official: health.official, officialSource: health.officialSource };
  if (!watch) return { status: health.status, findings: [], ...fromHealth };
  // diabetes already says "high in sugars": the watchlist's sugar line would repeat it
  const sugarSaid = health.findings.some((f) => f.ruleId === "diabetes_sugar_food" || f.ruleId === "diabetes_sugar_drink");
  const findings = sugarSaid ? watch.findings.filter((f) => f.topic.type !== "sugar") : watch.findings;
  const watchStatus = findings.some((f) => f.level === "avoid") ? "avoid" : findings.length ? "check" : watch.status === "unchecked" ? "unchecked" : "ok";
  // the more worrying of the two; one part unchecked can't be called "nothing found"
  const status = RANK[watchStatus] < RANK[health.status] ? watchStatus : health.status;
  return { status, findings, ...fromHealth };
}

export interface PersonCheck {
  person: NamedProfile;
  check: PersonVerdict;
}

/**
 * One result against everyone who has said something they avoid, the one with the most to
 * worry about first. Empty when nobody has: a blank profile has nothing to check.
 */
export function checkEveryone(result: LabelAnalysis, book: ProfileBook): PersonCheck[] {
  return book.profiles
    .map((person) => ({ person, check: checkPerson(result, person) }))
    .filter((x): x is PersonCheck => x.check !== null)
    .sort((a, b) => RANK[a.check.status] - RANK[b.check.status]);
}
