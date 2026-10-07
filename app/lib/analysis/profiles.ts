// Several people can share one device (a family's phone): each has a named profile and the
// reader switches between them. Pure and client-safe, like profile.ts: this is only the
// bookkeeping; what a profile means for a result is still `checkProfile`.

import { EMPTY_PROFILE, sanitizeProfile, type Profile } from "./profile";

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
  if (book.profiles.length <= 1) return { ...book, profiles: book.profiles.map((p) => ({ ...p, ...EMPTY_PROFILE, name: "" })) };
  const profiles = book.profiles.filter((p) => p.id !== id);
  return { active: book.active === id ? profiles[0].id : book.active, profiles };
}

export const switchPerson = (book: ProfileBook, id: string): ProfileBook => (book.profiles.some((p) => p.id === id) ? { ...book, active: id } : book);

/** replaces what the active person avoids */
export function updateActive(book: ProfileBook, profile: Profile): ProfileBook {
  const clean = sanitizeProfile(profile);
  return { ...book, profiles: book.profiles.map((p) => (p.id === book.active ? { ...p, ...clean } : p)) };
}
