// The optional personal profile, kept in this browser only (localStorage) and never
// sent anywhere: results are checked against it on the device. Every access is
// guarded, like the history: without storage the app simply has no profile.

import { useSyncExternalStore } from "react";
import { EMPTY_PROFILE, sanitizeProfile, type Profile } from "../analysis/profile";

const KEY = "food-analyzer:profile:v1";

let cache: Profile | null = null;
const listeners = new Set<() => void>();

function read(): Profile {
  try {
    return sanitizeProfile(JSON.parse(window.localStorage.getItem(KEY) ?? "null"));
  } catch {
    return EMPTY_PROFILE;
  }
}

const snapshot = () => (cache ??= read());

function subscribe(notify: () => void) {
  listeners.add(notify);
  // another tab changed the profile
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

/** the profile; empty on the server and until the browser has loaded it */
export function useProfile(): Profile {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY_PROFILE);
}

export function saveProfile(profile: Profile) {
  cache = sanitizeProfile(profile);
  try {
    window.localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // storage unavailable: the profile lasts until the page is closed
  }
  listeners.forEach((notify) => notify());
}
