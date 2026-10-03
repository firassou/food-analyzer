// Past scans, kept in this browser only (localStorage). Every access is guarded:
// storage can be missing, full or disabled (private mode), and the app must work
// the same without it, just with no history.

import { useSyncExternalStore } from "react";
import type { AnalyzeMeta, LabelAnalysis } from "../analysis/types";

export interface HistoryEntry {
  id: string;
  /** when it was scanned (ms since epoch) */
  at: number;
  /** a small JPEG data URL of the photo; null for a barcode scan */
  thumb: string | null;
  result: LabelAnalysis;
  meta: AnalyzeMeta;
}

// bump the version when LabelAnalysis changes in a way old entries can't satisfy
const KEY = "food-analyzer:history:v2";
const MAX_ENTRIES = 30;
const THUMB_SIDE = 480;

const EMPTY: HistoryEntry[] = [];
let cache: HistoryEntry[] | null = null;
const listeners = new Set<() => void>();

const looksValid = (e: unknown): e is HistoryEntry => {
  const x = e as Partial<HistoryEntry> | null;
  return (
    !!x &&
    typeof x.id === "string" &&
    typeof x.at === "number" &&
    typeof x.result?.kind === "string" &&
    Array.isArray(x.result.ingredients) &&
    Array.isArray(x.result.warnings) &&
    typeof x.meta?.duration_ms === "number"
  );
};

function read(): HistoryEntry[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter(looksValid) : EMPTY;
  } catch {
    return EMPTY;
  }
}

/** writes the list; when storage is full, drops the oldest entries until it fits */
function write(entries: HistoryEntry[]): HistoryEntry[] {
  let kept = entries;
  for (;;) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(kept));
      return kept;
    } catch {
      // quota exceeded, or storage unavailable: keep fewer; with nothing left, keep it in memory only
      if (kept.length <= 1) return entries;
      kept = kept.slice(0, Math.ceil(kept.length / 2));
    }
  }
}

function commit(next: HistoryEntry[]) {
  cache = write(next);
  listeners.forEach((notify) => notify());
}

const snapshot = () => (cache ??= read());

function subscribe(notify: () => void) {
  listeners.add(notify);
  // another tab changed the history
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

/** the saved scans, newest first; empty on the server and until the browser has loaded them */
export function useHistory(): HistoryEntry[] {
  return useSyncExternalStore(subscribe, snapshot, () => EMPTY);
}

/** adds a scan, or replaces the one with the same id (the same photo analyzed again) */
export function saveScan(entry: HistoryEntry) {
  commit([entry, ...snapshot().filter((e) => e.id !== entry.id)].slice(0, MAX_ENTRIES));
}

export function removeScan(id: string) {
  commit(snapshot().filter((e) => e.id !== id));
}

export function clearHistory() {
  commit([]);
}

export const newScanId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** a small copy of the photo to show next to a saved scan; null if it can't be made */
export async function makeThumb(image: Blob): Promise<string | null> {
  try {
    const bitmap = await createImageBitmap(image);
    const scale = Math.min(1, THUMB_SIDE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}
