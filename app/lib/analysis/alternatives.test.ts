import { describe, expect, it } from "vitest";
import { mainCategory, MAX_ALTERNATIVES, pickAlternatives, toCandidate } from "./alternatives";

const hit = (code: string, grade: string, sugar: number | null, name = `Product ${code}`, brands = "Brand") => ({
  code,
  product_name: name,
  nutriscore_grade: grade,
  brands,
  nutriments: sugar === null ? {} : { sugars_100g: sugar },
});

describe("toCandidate", () => {
  it("keeps a complete entry and refuses anything missing a code, a name or a grade", () => {
    expect(toCandidate(hit("3017620422003", "B", 12.5, "  Pur  beurre ", "NATURENVIE, Other"))).toEqual({
      code: "3017620422003",
      name: "Pur beurre",
      brand: "NATURENVIE",
      grade: "b",
      sugar: 12.5,
    });
    for (const bad of [null, 7, {}, hit("123", "a", 1), hit("3017620422003", "z", 1), hit("3017620422003", "a", 1, "")]) {
      expect(toCandidate(bad)).toBeNull();
    }
  });
});

describe("pickAlternatives", () => {
  const own = { code: "1111111111111", grade: "e" as const };

  it("keeps only strictly better grades, best first, then least sugar, and never the product itself", () => {
    const picked = pickAlternatives(own, [
      hit("1111111111111", "a", 1),
      hit("2222222222222", "c", 8),
      hit("3333333333333", "a", 5),
      hit("4444444444444", "a", 2),
      hit("5555555555555", "e", 1),
      hit("6666666666666", "b", 3),
    ]);
    expect(picked.map((c) => c.code)).toEqual(["4444444444444", "3333333333333", "6666666666666", "2222222222222"]);
  });

  it("is empty when nothing is better, and caps the list", () => {
    expect(pickAlternatives({ code: "1", grade: "a" }, [hit("2222222222222", "a", 1), hit("3333333333333", "e", 1)])).toEqual([]);
    const many = Array.from({ length: 30 }, (_, i) => hit(String(1000000000000 + i), "a", i));
    expect(pickAlternatives(own, many)).toHaveLength(MAX_ALTERNATIVES);
  });

  it("falls back to an A or B when the product has no grade, and drops repeated names", () => {
    const picked = pickAlternatives({ code: "1", grade: null }, [
      hit("2222222222222", "c", 1),
      hit("3333333333333", "b", 4, "Same", "X"),
      hit("4444444444444", "b", 6, "same", "x"),
      hit("5555555555555", "a", 9),
    ]);
    expect(picked.map((c) => c.code)).toEqual(["5555555555555", "3333333333333"]);
  });

  it("drops what has more sugar than the product, and what is too different to be a swap", () => {
    const sweet = { code: "1", grade: "e" as const, sugar: 56 };
    const picked = pickAlternatives(sweet, [
      hit("2222222222222", "d", 58), // better grade, more sugar
      hit("3333333333333", "a", 0), // a chilli paste in a sweet category
      hit("4444444444444", "c", 39), // a comparable, less sweet spread
      hit("5555555555555", "b", null), // sugar unknown: kept
    ]);
    expect(picked.map((c) => c.code)).toEqual(["5555555555555", "4444444444444"]);
    // a low-sugar product keeps its zero-sugar alternatives
    expect(pickAlternatives({ code: "1", grade: "d", sugar: 6 }, [hit("2222222222222", "a", 0)]).map((c) => c.code)).toEqual(["2222222222222"]);
  });

  it("survives garbage", () => {
    expect(pickAlternatives(own, [null, 3, "x", [], {}])).toEqual([]);
  });
});

describe("mainCategory", () => {
  it("takes the last English tag, which is the most specific", () => {
    expect(mainCategory(["en:breakfasts", "en:spreads", "en:sweet-spreads", "fr:Pâtes à tartiner"])).toBe("en:sweet-spreads");
    expect(mainCategory(["fr:x"])).toBeNull();
    expect(mainCategory("nope")).toBeNull();
    expect(mainCategory(["en:bad tag!"])).toBeNull();
  });
});
