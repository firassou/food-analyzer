// Aisle mode: the camera looks along a shelf and every product whose barcode is in view gets a
// badge for the reader's profile. Nothing here is a model call: the barcode goes to the product
// database, the answer through the same checks as everything else. Pure and client-safe; the
// camera, the network and the screen are in the component.

import { checkProfile, isEmptyProfile, type Profile } from "./profile";
import type { LabelAnalysis } from "./types";

/** what a badge says: the profile's verdict, or only the product when there is no profile to check */
export type AisleVerdict = "avoid" | "check" | "ok" | "unchecked" | "plain";

export function aisleVerdict(result: LabelAnalysis, profile: Profile): AisleVerdict {
  if (isEmptyProfile(profile)) return "plain";
  // a plain water or a photo of something else has nothing to check
  return checkProfile(result, profile)?.status ?? "plain";
}

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Where a box found in the video frame lands on screen when the video fills its container
 * with `object-fit: cover` (scaled to cover, the overflow cropped evenly on both sides).
 */
export function fitBox(box: Box, video: { width: number; height: number }, view: { width: number; height: number }): Box {
  const scale = Math.max(view.width / video.width, view.height / video.height);
  const offsetX = (view.width - video.width * scale) / 2;
  const offsetY = (view.height - video.height * scale) / 2;
  return { x: box.x * scale + offsetX, y: box.y * scale + offsetY, width: box.width * scale, height: box.height * scale };
}

export type LookupState = "queued" | "loading" | "done" | "missing" | "error";

export interface Lookup {
  state: LookupState;
  /** the product, once found */
  result: LabelAnalysis | null;
  /** when it may be asked again, after an error */
  retryAt: number;
  /** the last time it was in view, to ask for the newest first */
  seen: number;
}

export interface AisleLimits {
  /** lookups started in any rolling minute: the product route allows 30 per client, and the reader may scan on top */
  perMinute: number;
  /** requests in flight at once */
  concurrency: number;
  /** barcodes remembered; the oldest seen are forgotten beyond it */
  maxCodes: number;
  /** wait before asking again after an error */
  retryMs: number;
  /** wait after the server said "too many" */
  backoffMs: number;
}

export const AISLE_LIMITS: AisleLimits = { perMinute: 20, concurrency: 2, maxCodes: 60, retryMs: 15_000, backoffMs: 30_000 };

/**
 * Which barcode to look up next. Remembers every answer for the session, never asks for a code
 * twice (unless it failed, later), stays under a per-minute budget and a small concurrency, and
 * asks for what was seen most recently first.
 */
export class AisleBook {
  private entries = new Map<string, Lookup>();
  private started: number[] = [];
  private pausedUntil = 0;

  constructor(private limits: AisleLimits = AISLE_LIMITS) {}

  get(code: string): Lookup | undefined {
    return this.entries.get(code);
  }

  /** a barcode is in view */
  see(code: string, now: number) {
    const known = this.entries.get(code);
    if (known) {
      known.seen = now;
      return;
    }
    this.entries.set(code, { state: "queued", result: null, retryAt: 0, seen: now });
    if (this.entries.size > this.limits.maxCodes) {
      const oldest = [...this.entries].filter(([, e]) => e.state !== "loading").sort((a, b) => a[1].seen - b[1].seen)[0];
      if (oldest) this.entries.delete(oldest[0]);
    }
  }

  /** the next code to ask for, marked as loading; null when nothing is due or the budget is spent */
  next(now: number): string | null {
    if (now < this.pausedUntil) return null;
    this.started = this.started.filter((t) => now - t < 60_000);
    if (this.started.length >= this.limits.perMinute) return null;
    const all = [...this.entries];
    if (all.filter(([, e]) => e.state === "loading").length >= this.limits.concurrency) return null;
    const due = all
      .filter(([, e]) => e.state === "queued" || (e.state === "error" && now >= e.retryAt))
      .sort((a, b) => b[1].seen - a[1].seen)[0];
    if (!due) return null;
    due[1].state = "loading";
    this.started.push(now);
    return due[0];
  }

  /** the database answered: a product, or null when it doesn't know the code */
  done(code: string, result: LabelAnalysis | null) {
    const e = this.entries.get(code);
    if (!e) return;
    e.state = result ? "done" : "missing";
    e.result = result;
  }

  /** the lookup failed; `busy` means the server asked us to slow down */
  failed(code: string, now: number, busy = false) {
    const e = this.entries.get(code);
    if (!e) return;
    e.state = "error";
    e.retryAt = now + (busy ? this.limits.backoffMs : this.limits.retryMs);
    if (busy) this.pausedUntil = now + this.limits.backoffMs;
  }
}
