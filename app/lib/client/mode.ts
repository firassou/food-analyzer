// Food mode or Medicine Mode: how the app looks and what a new photo is taken as. Kept in this
// browser (guarded localStorage, like the history), read with useSyncExternalStore.

import { useSyncExternalStore } from "react";

export type Mode = "food" | "medicine";

const KEY = "labelsight:mode:v1";
const listeners = new Set<() => void>();

function read(): Mode {
  try {
    return window.localStorage.getItem(KEY) === "medicine" ? "medicine" : "food";
  } catch {
    return "food";
  }
}

let cache: Mode | null = null;

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

/** the mode the reader chose; Food until they pick Medicine Mode (and on the server) */
export function useMode(): Mode {
  return useSyncExternalStore(subscribe, () => (cache ??= read()), () => "food");
}

export function setMode(mode: Mode) {
  cache = mode;
  try {
    window.localStorage.setItem(KEY, mode);
  } catch {
    // storage unavailable: the mode lasts until the page is closed
  }
  listeners.forEach((notify) => notify());
}
