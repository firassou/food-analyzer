// Recognising a photo that was already analyzed, so it isn't sent to the AI again: the same
// file (identical bytes) reopens its saved result, and a near-identical photo (same box, same
// framing) asks the reader first. A new box of the same medicine can carry a different dose in
// pen, so a look-alike is never reused without asking.

import type { HistoryEntry } from "./history";

export interface PhotoPrint {
  /** SHA-256 of the file as picked; null where the browser can't hash (an http:// page) */
  sha256: string | null;
  /** 64-bit difference hash of the picture, as 16 hex digits; null if it couldn't be drawn */
  dhash: string | null;
}

/** at most this many of 64 bits apart: the same scene photographed again, give or take */
const SIMILAR_BITS = 6;

export async function sha256(file: Blob): Promise<string | null> {
  try {
    if (!globalThis.crypto?.subtle) return null;
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

/**
 * dHash: the picture shrunk to 9×8 grey cells (each the mean of an 8×8 block, so noise and
 * JPEG artefacts average out), one bit per cell telling whether it is brighter than its
 * right-hand neighbour.
 */
export function differenceHash(source: CanvasImageSource): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = 72;
    canvas.height = 64;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, 72, 64);
    return hashOfGrey(greyCells(ctx.getImageData(0, 0, 72, 64).data, 72));
  } catch {
    return null;
  }
}

/** 9×8 cell means of a 72×64 RGBA picture */
export function greyCells(rgba: ArrayLike<number>, width: number): number[] {
  const cells = new Array<number>(72).fill(0);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 72; x++) {
      const i = (y * width + x) * 4;
      cells[Math.floor(y / 8) * 9 + Math.floor(x / 8)] += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
  return cells;
}

/**
 * a cell is "brighter" only by a clear margin (6 grey levels on average over its 64 pixels):
 * in flat areas, like the plain face of a box, neighbours are nearly equal and camera noise
 * would otherwise flip their bit from one photo to the next
 */
const MARGIN = 6 * 64;

export function hashOfGrey(cells: number[]): string {
  let hex = "";
  for (let row = 0; row < 8; row++) {
    for (let half = 0; half < 2; half++) {
      let nibble = 0;
      for (let k = 0; k < 4; k++) {
        const x = half * 4 + k;
        nibble = (nibble << 1) | (cells[row * 9 + x] > cells[row * 9 + x + 1] + MARGIN ? 1 : 0);
      }
      hex += nibble.toString(16);
    }
  }
  return hex;
}

/** bits that differ between two hashes; Infinity for anything that isn't a pair of hashes */
export function distance(a: string | null | undefined, b: string | null | undefined): number {
  if (!a || !b || a.length !== 16 || b.length !== 16 || !/^[0-9a-f]+$/.test(a + b)) return Infinity;
  let bits = 0;
  for (let i = 0; i < 16; i++) {
    let x = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (x) {
      bits += x & 1;
      x >>= 1;
    }
  }
  return bits;
}

/**
 * A saved scan of this photo: `same` for the identical file, `similar` for the closest
 * look-alike. Only scans worth reopening count (a photo of nothing isn't saved anyway).
 */
export function matchPhoto(print: PhotoPrint, history: HistoryEntry[]): { kind: "same" | "similar"; entry: HistoryEntry } | null {
  const saved = history.filter((e) => e.photo && e.result.kind !== "other");
  if (print.sha256) {
    const same = saved.find((e) => e.photo?.sha256 === print.sha256);
    if (same) return { kind: "same", entry: same };
  }
  let best: { entry: HistoryEntry; bits: number } | null = null;
  for (const entry of saved) {
    const bits = distance(print.dhash, entry.photo?.dhash);
    if (bits <= SIMILAR_BITS && (!best || bits < best.bits)) best = { entry, bits };
  }
  return best && { kind: "similar", entry: best.entry };
}
