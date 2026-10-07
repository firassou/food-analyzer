// What the reader may choose to tell Ask AI about themselves: what they avoid, the medicines they
// have scanned, and what the app's own rules found for this product. Built on the device from the
// profile and the saved scans, and sent only when the reader has turned it on (it is off by
// default): the profile never leaves the device otherwise. Pure and client-safe.
//
// The findings are the point. The model is told to treat them as facts and not to contradict them,
// so an answer about "can I eat this with my pills?" rests on the rule that fired, not on what the
// model happens to remember.

import { checkFoodWithMedicines, type ShelfMedicine } from "./foodMedicine";
import { checkProfile, isEmptyProfile, type Profile, type ProfileFinding } from "./profile";
import { ALLERGEN_NAMES, type LabelAnalysis } from "./types";

export interface AskContext {
  /** who is asking, as plain English lines */
  reader: string[];
  /** what the app's rules found for this product and this reader, as plain English lines */
  checks: string[];
}

export const MAX_CONTEXT_LINES = 24;
export const MAX_CONTEXT_LINE_CHARS = 240;

const topicText = (f: ProfileFinding) =>
  f.topic.type === "allergen" ? `${ALLERGEN_NAMES[f.topic.id].toLowerCase()} (allergy or intolerance)`
  : f.topic.type === "lactose" ? "lactose (intolerance)"
  : f.topic.type === "sugar" ? "sugar (the reader watches it)"
  : `${f.topic.diet} diet`;

const words = (id: string) => id.replace(/_/g, " ");

/** true when there is anything to tell: a profile, or at least one medicine with a readable substance */
export function hasPersonalContext(profile: Profile, shelf: ShelfMedicine[]): boolean {
  return !isEmptyProfile(profile) || shelf.some((m) => (m.medicine?.active.length ?? 0) > 0);
}

export function buildAskContext(result: LabelAnalysis, profile: Profile, shelf: ShelfMedicine[]): AskContext {
  const reader: string[] = [];
  const checks: string[] = [];

  if (!isEmptyProfile(profile)) {
    const parts = [
      profile.allergens.length > 0 && `allergic or intolerant to ${profile.allergens.map((id) => ALLERGEN_NAMES[id].toLowerCase()).join(", ")}`,
      profile.lactose && "lactose intolerant",
      profile.sugar && "watches sugar",
      profile.diets.length > 0 && `follows a ${profile.diets.join(" and ")} diet`,
    ].filter(Boolean);
    reader.push(`The reader is ${parts.join("; ")}.`);
  }
  const medicines = shelf
    .filter((m) => (m.medicine?.active.length ?? 0) > 0)
    .map((m) => `${m.name} (${m.medicine!.active.map((a) => [a.name, a.strength].filter(Boolean).join(" ")).join(", ")})`);
  if (medicines.length > 0) reader.push(`Medicines the reader has scanned: ${medicines.join("; ")}.`);

  const profileCheck = checkProfile(result, profile);
  if (profileCheck) {
    checks.push(`Profile check for this product: ${profileCheck.status === "avoid" ? "AVOID" : profileCheck.status === "check" ? "CHECK" : profileCheck.status === "ok" ? "nothing the reader avoids was found" : "not checked (the ingredients were not read)"}.`);
    for (const f of profileCheck.findings) {
      checks.push(`- ${f.level === "avoid" ? "Contains" : "May contain or unclear"}: ${topicText(f)}${f.because.length > 0 ? ` — ${f.because.join(", ")}` : ""}`);
    }
  }
  for (const f of checkFoodWithMedicines(result, shelf).findings) {
    checks.push(`Medicine check: ${f.severity === "avoid" ? "ask before combining" : "needs a precaution"} — ${words(f.id)} — ${f.medicine} (${f.substance}).`);
  }
  return { reader: reader.slice(0, MAX_CONTEXT_LINES), checks: checks.slice(0, MAX_CONTEXT_LINES) };
}
