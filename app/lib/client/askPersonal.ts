// Whether Ask AI may be told about the reader (their profile and scanned medicines). Off until the
// reader turns it on, per device; every storage access is guarded, and without storage it is off.

import { useSyncExternalStore } from "react";

const KEY = "food-analyzer:ask-personal:v1";

function read(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "on";
  } catch {
    return false;
  }
}

let cache: boolean | null = null;
const listeners = new Set<() => void>();
const snapshot = () => (cache ??= read());

function subscribe(notify: () => void) {
  listeners.add(notify);
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

export function setAskPersonal(on: boolean) {
  cache = on;
  try {
    if (on) window.localStorage.setItem(KEY, "on");
    else window.localStorage.removeItem(KEY);
  } catch {
    // storage unavailable: the choice lasts until the page is closed
  }
  listeners.forEach((notify) => notify());
}

export function useAskPersonal(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
