import { describe, expect, it } from "vitest";
import { askSystemPrompt, cleanContext, contextBlock } from "./ask";
import { buildAskContext, hasPersonalContext, MAX_CONTEXT_LINE_CHARS, MAX_CONTEXT_LINES } from "./askContext";
import { type ShelfMedicine } from "./foodMedicine";
import { normalize } from "./normalize";
import { EMPTY_PROFILE, type Profile } from "./profile";

const profile = (p: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...p });
const juice = normalize({ kind: "drink", label_detected: true, image_quality: "good", product: { name: "Pink juice" }, ingredients: [{ name: "Grapefruit juice" }, { name: "Water" }] });
const biscuit = normalize({ kind: "label", label_detected: true, image_quality: "good", product: { name: "Biscuit" }, ingredients: ["wheat flour", "milk powder"], allergens: { declared: ["gluten", "milk"] } });
const med = (name: string, ...active: string[]): ShelfMedicine => ({
  name,
  medicine: normalize({ kind: "medicine", label_detected: true, image_quality: "good", product: { name }, medicine: { active: active.map((a) => ({ name: a, strength: "20 mg" })) } }).medicine,
});

describe("buildAskContext", () => {
  it("says who is asking and what the rules found, in plain lines", () => {
    const c = buildAskContext(biscuit, profile({ allergens: ["milk"], diets: ["vegan"] }), [med("Zocor", "simvastatin")]);
    expect(c.reader[0]).toBe("The reader is allergic or intolerant to milk; follows a vegan diet.");
    expect(c.reader[1]).toBe("Medicines the reader has scanned: Zocor (simvastatin 20 mg).");
    expect(c.checks[0]).toBe("Profile check for this product: AVOID.");
    expect(c.checks.some((l) => /^- Contains: milk/.test(l))).toBe(true);
    expect(c.checks.some((l) => /vegan diet/.test(l))).toBe(true);
  });

  it("carries a food and medicine finding as a line the model can cite", () => {
    const c = buildAskContext(juice, EMPTY_PROFILE, [med("Zocor", "simvastatin")]);
    expect(c.checks).toEqual(["Medicine check: needs a precaution — grapefruit statin — Zocor (simvastatin)."]);
  });

  it("is empty for a reader with nothing to share, and says so", () => {
    expect(buildAskContext(juice, EMPTY_PROFILE, [])).toEqual({ reader: [], checks: [] });
    expect(hasPersonalContext(EMPTY_PROFILE, [])).toBe(false);
    expect(hasPersonalContext(EMPTY_PROFILE, [{ name: "x", medicine: null }])).toBe(false);
    expect(hasPersonalContext(profile({ sugar: true }), [])).toBe(true);
    expect(hasPersonalContext(EMPTY_PROFILE, [med("Zocor", "simvastatin")])).toBe(true);
  });

  it("does not claim a clean bill when the ingredients weren't read", () => {
    const unread = normalize({ kind: "label", label_detected: true, product: { name: "Blur" } });
    expect(buildAskContext(unread, profile({ allergens: ["milk"] }), []).checks[0]).toMatch(/not checked/);
  });
});

describe("cleanContext", () => {
  it("keeps short lines of text and nothing else", () => {
    expect(cleanContext({ reader: ["a", 3, null, "b"], checks: ["c"], extra: "x" })).toEqual({ reader: ["a", "3", "b"], checks: ["c"] });
    const long = cleanContext({ reader: ["x".repeat(5000)], checks: Array.from({ length: 100 }, () => "y") })!;
    expect(long.reader[0].length).toBeLessThanOrEqual(MAX_CONTEXT_LINE_CHARS);
    expect(long.checks).toHaveLength(MAX_CONTEXT_LINES);
  });

  it("is nothing for anything that isn't a context", () => {
    for (const v of [undefined, null, 3, "x", [], {}, { reader: [], checks: [] }, { reader: "no" }]) expect(cleanContext(v)).toBeUndefined();
  });
});

describe("the prompt with a context", () => {
  const context = { reader: ["The reader is allergic to milk."], checks: ["Profile check for this product: AVOID."] };

  it("adds the reader's lines and tells the model to treat the checks as facts", () => {
    const p = askSystemPrompt("en", "Name: Biscuit", "label", context);
    expect(p).toContain("<reader_context>\nThe reader is allergic to milk.\nApp checks:\nProfile check for this product: AVOID.\n</reader_context>");
    expect(p).toMatch(/never contradict them/);
    expect(p).toMatch(/having no line never means there is no problem/);
  });

  it("is the same prompt without one", () => {
    const p = askSystemPrompt("en", "Name: Biscuit", "label");
    expect(p).not.toContain("reader_context");
  });

  it("formats the block", () => {
    expect(contextBlock({ reader: ["a"], checks: [] })).toBe("a");
    expect(contextBlock({ reader: ["a"], checks: ["b"] })).toBe("a\nApp checks:\nb");
  });
});
