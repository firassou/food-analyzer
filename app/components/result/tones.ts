import type { Confidence, HighlightTone, Level, Presence } from "../../lib/analysis/types";
import type { Tone } from "../ui";

export const presenceTone: Record<Presence, Tone> = {
  contains: "red",
  likely_contains: "amber",
  no_indication: "green",
  unclear: "zinc",
};

export const levelTone: Record<Level | "unknown", Tone> = {
  low: "green",
  medium: "amber",
  high: "red",
  unknown: "zinc",
};

export const highlightTone: Record<HighlightTone, Tone> = { positive: "green", neutral: "zinc", caution: "amber" };
export const highlightMark: Record<HighlightTone, string> = { positive: "✓", neutral: "–", caution: "!" };

export const confidenceLevel: Record<Confidence, number> = { low: 1, medium: 2, high: 3 };

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
