import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseModelJson } from "./parse";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

describe("parseModelJson", () => {
  it("parses plain JSON without marking it repaired", () => {
    expect(parseModelJson('{"a": 1, "b": [true, null]}')).toEqual({ value: { a: 1, b: [true, null] }, repaired: false });
  });

  it("strips prose and code fences", () => {
    const out = parseModelJson(fixture("eu-biscuit.txt"));
    expect(out?.repaired).toBe(false);
    expect((out?.value as { product: { brand: string } }).product.brand).toBe("Brightbake");
  });

  it("strips <think> blocks and an orphan </think>", () => {
    expect(parseModelJson('<think>hmm {"x": 0}</think>{"a": 1}')?.value).toEqual({ a: 1 });
    expect(parseModelJson('still thinking about {"x": 0}</think>\n{"a": 2}')?.value).toEqual({ a: 2 });
    expect((parseModelJson(fixture("fr-peut-contenir.txt"))?.value as { language: string }).language).toBe("fr");
  });

  it("skips bracketed prose before the JSON", () => {
    expect(parseModelJson('Result [JSON] below, see [1]:\n{"a": 1}')?.value).toEqual({ a: 1 });
  });

  it("converts Python literals, single quotes and trailing commas", () => {
    expect(parseModelJson("{'a': True, 'b': None, 'c': False, 'd': NaN, 'e': [1, 2,],}")?.value).toEqual({
      a: true,
      b: null,
      c: false,
      d: null,
      e: [1, 2],
    });
    const out = parseModelJson(fixture("python-literals.txt"));
    expect(out?.repaired).toBe(false);
    const v = out?.value as { label_detected: boolean; ingredients: unknown[]; nutrition: unknown };
    expect(v.label_detected).toBe(true);
    expect(v.ingredients).toHaveLength(7);
    expect(v.nutrition).toBeNull();
  });

  it("keeps apostrophes and literal words inside strings", () => {
    expect(parseModelJson(`{'a': 'it's True', "b": "None of it",}`)?.value).toEqual({ a: "it's True", b: "None of it" });
  });

  it("removes // comments outside strings but keeps URLs inside them", () => {
    expect(parseModelJson('{"a": 1, // a comment\n "u": "http://x.y"}')?.value).toEqual({ a: 1, u: "http://x.y" });
  });

  it("handles curly-quoted strings and raw newlines in strings", () => {
    expect(parseModelJson("{“a”: “b”, \"c\": \"line1\nline2\"}")?.value).toEqual({ a: "b", c: "line1\nline2" });
    // straight quotes inside a curly-quoted string are content
    expect(parseModelJson('{"a": “say "hi"”}')?.value).toEqual({ a: 'say "hi"' });
  });

  it("keeps curly quotes that are content of a normal string", () => {
    expect(parseModelJson('{"a": "the “high” threshold"}')?.value).toEqual({ a: "the “high” threshold" });
  });

  it("repairs output truncated mid-string", () => {
    const out = parseModelJson(fixture("truncated.txt"));
    expect(out?.repaired).toBe(true);
    const v = out?.value as { ingredients: unknown[]; claims: string[]; summary?: string };
    expect(v.ingredients).toHaveLength(4);
    expect(v.claims).toEqual(["High in fibre"]);
    expect(v.summary).toMatch(/^Crispy rye crackers/);
  });

  it("repairs a dangling colon or key", () => {
    expect(parseModelJson('{"a": 1, "b":')).toEqual({ value: { a: 1, b: null }, repaired: true });
    expect(parseModelJson('{"a": 1, "b"')).toEqual({ value: { a: 1 }, repaired: true });
    expect(parseModelJson('{"a": [1, 2, {"c": tru')?.value).toMatchObject({ a: [1, 2] });
  });

  it("parses a top-level array", () => {
    expect(parseModelJson('[{"a": 1}]')?.value).toEqual([{ a: 1 }]);
  });

  it("returns null for text with no JSON", () => {
    expect(parseModelJson("Sorry, I can't read this image.")).toBeNull();
    expect(parseModelJson("")).toBeNull();
    expect(parseModelJson(undefined as unknown as string)).toBeNull();
  });
});
