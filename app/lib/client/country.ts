// The reader's country, for suggestions that can be bought where they are. Detected from the time
// zone and the browser's languages, overridable in the profile screen; kept in this browser only.
// Every access is guarded, like the history.

import { useSyncExternalStore } from "react";
import { detectCountry, isCountry } from "../analysis/country";

const KEY = "food-analyzer:country:v1";
const listeners = new Set<() => void>();

function stored(): string | null {
  try {
    const v = window.localStorage.getItem(KEY);
    return isCountry(v) ? v : null;
  } catch {
    return null;
  }
}

function detected(): string | null {
  try {
    return detectCountry(Intl.DateTimeFormat().resolvedOptions().timeZone, navigator.languages ?? [navigator.language]);
  } catch {
    return null;
  }
}

function subscribe(notify: () => void) {
  listeners.add(notify);
  const onStorage = (e: StorageEvent) => e.key === KEY && notify();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", onStorage);
  };
}

/** the country suggestions are for: the reader's choice, else the detected one; null when neither is known */
export function useCountry(): string | null {
  return useSyncExternalStore(subscribe, () => stored() ?? detected() ?? "", () => "") || null;
}

/** what the reader chose themselves; null means "detect it" */
export function useCountryChoice(): string | null {
  return useSyncExternalStore(subscribe, () => stored() ?? "", () => "") || null;
}

/** what detection alone says (what "automatic" currently means) */
export function useDetectedCountry(): string | null {
  return useSyncExternalStore(subscribe, () => detected() ?? "", () => "") || null;
}

export function saveCountry(code: string | null) {
  try {
    if (code && isCountry(code)) window.localStorage.setItem(KEY, code);
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the choice lasts until the page is closed
  }
  listeners.forEach((notify) => notify());
}
