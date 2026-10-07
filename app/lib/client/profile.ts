// The optional personal profiles, kept in this browser only (localStorage) and never
// sent anywhere: results are checked against the active one on the device. Every access
// is guarded, like the history: without storage the app simply has no profile.

import { useSyncExternalStore } from "react";
import type { Profile } from "../analysis/profile";
import {
  activeProfile,
  addPerson,
  emptyBook,
  type NamedProfile,
  type ProfileBook,
  removePerson,
  renamePerson,
  sanitizeBook,
  switchPerson,
  updateActive,
} from "../analysis/profiles";

const KEY = "food-analyzer:profile:v2";
/** before several people could share a device there was a single profile here */
const LEGACY_KEY = "food-analyzer:profile:v1";

const EMPTY = emptyBook();
let cache: ProfileBook | null = null;
const listeners = new Set<() => void>();

function read(): ProfileBook {
  try {
    const stored = window.localStorage.getItem(KEY);
    if (stored) return sanitizeBook(JSON.parse(stored));
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    return sanitizeBook(null, legacy ? JSON.parse(legacy) : undefined);
  } catch {
    return EMPTY;
  }
}

const snapshot = () => (cache ??= read());

function subscribe(notify: () => void) {
  listeners.add(notify);
  // another tab changed the profiles
  const onStorage = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cache = read();
    notify();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

function commit(book: ProfileBook) {
  cache = book;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(book));
  } catch {
    // storage unavailable: the profiles last until the page is closed
  }
  listeners.forEach((notify) => notify());
}

/** everyone on this device and who is active; one empty person on the server and until the browser has loaded it */
export function useProfileBook(): ProfileBook {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** the active person's profile, which results are checked against */
export function useProfile(): NamedProfile {
  return activeProfile(useProfileBook());
}

/** replaces what the active person avoids */
export function saveProfile(profile: Profile) {
  commit(updateActive(snapshot(), profile));
}

const newId = () => `p-${Math.random().toString(36).slice(2, 8)}`;

/** adds a person and switches to them */
export const addProfilePerson = (name = "") => commit(addPerson(snapshot(), newId(), name));
export const renameProfilePerson = (id: string, name: string) => commit(renamePerson(snapshot(), id, name));
export const removeProfilePerson = (id: string) => commit(removePerson(snapshot(), id));
export const switchProfilePerson = (id: string) => commit(switchPerson(snapshot(), id));
