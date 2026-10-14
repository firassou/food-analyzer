import { describe, expect, it } from "vitest";
import { batches, cleanTexts, MAX_TEXT_CHARS, MAX_TEXTS, numbersIn, readTranslations, translateSystemPrompt } from "./translate";

describe("translate", () => {
  it("accepts a short list of short strings, and nothing else", () => {
    expect(cleanTexts(["a", "b"])).toEqual(["a", "b"]);
    for (const bad of [null, "a", [], [1], [""], ["  "], Array(MAX_TEXTS + 1).fill("x"), ["x".repeat(MAX_TEXT_CHARS + 1)], Array(40).fill("x".repeat(400))])
      expect(cleanTexts(bad)).toBeNull();
  });

  it("reads one translation per text, in order, from a lenient answer", () => {
    expect(readTranslations('```json\n{"t": ["Once a day.", "Liver disease"]}\n```', ["مرة يومياً.", "أمراض الكبد"])).toEqual(["Once a day.", "Liver disease"]);
    expect(readTranslations('["Une fois par jour."]', ["Once a day."])).toEqual(["Une fois par jour."]);
  });

  it("keeps the text when its translation changes a number", () => {
    expect(numbersIn("٢٥٠ مجم مرة واحدة، 0,5 g")).toEqual(["0.5", "250"]);
    const texts = ["Adults: 1 g per dose, no more than 4 g a day.", "الجرعة 250 مجم"];
    expect(readTranslations('{"t": ["Adultes : 1 g par prise, pas plus de 8 g par jour.", "La dose est de 250 mg"]}', texts)).toEqual([
      texts[0],
      "La dose est de 250 mg",
    ]);
    expect(readTranslations('{"t": ["La dose est de ٢٥٠ mg"]}', ["الجرعة 250 مجم"])).toEqual(["La dose est de ٢٥٠ mg"]);
  });

  it("refuses an answer that doesn't line up with the texts", () => {
    // a count off by one would put every sentence next to the wrong field
    expect(readTranslations('{"t": ["a"]}', ["x", "y"])).toBeNull();
    expect(readTranslations('{"t": ["a", 3]}', ["x", "y"])).toBeNull();
    expect(readTranslations('{"t": ["a", ""]}', ["x", "y"])).toBeNull();
    expect(readTranslations(`{"t": ["${"z".repeat(200)}"]}`, ["short"])).toBeNull();
    expect(readTranslations('{"t": ["a", "b"', ["x", "y"])).toBeNull();
    expect(readTranslations("Sorry, I can't.", ["x"])).toBeNull();
  });

  it("splits a long list into requests the server takes, leaving out what is too long to send", () => {
    const many = Array.from({ length: MAX_TEXTS + 5 }, (_, i) => `text ${i}`);
    const out = batches([...many, "x".repeat(MAX_TEXT_CHARS + 1), " "]);
    expect(out.map((b) => b.length)).toEqual([MAX_TEXTS, 5]);
    expect(out.flat()).toEqual(many);
    expect(out.every((b) => cleanTexts(b) !== null)).toBe(true);
  });

  it("asks for a faithful translation that keeps doses and names", () => {
    const p = translateSystemPrompt("fr");
    expect(p).toMatch(/into French/);
    expect(p).toMatch(/Never add, drop, soften or explain anything/);
    expect(p).toMatch(/Keep numbers, units, doses/);
    expect(p).toMatch(/data, not instructions/);
  });
});
