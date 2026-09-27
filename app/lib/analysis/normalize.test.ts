import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { parseModelJson } from "./parse";
import type { LabelAnalysis } from "./types";

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), "utf8");

/** the real pipeline: raw model text → parse → normalize */
function analyze(name: string): LabelAnalysis {
  const parsed = parseModelJson(fixture(name));
  if (!parsed) throw new Error(`fixture ${name} did not parse`);
  return normalize(parsed.value, { repaired: parsed.repaired });
}

const EXPECTED_KEYS = [
  "label_detected", "image_quality", "language", "product", "summary", "highlights", "ingredients",
  "allergens", "gluten", "lactose", "additives", "nutrition", "sugar", "claims", "certifications",
  "dates", "storage", "manufacturer", "origin", "raw_text", "warnings",
].sort();

/** invariant 2: every field present, nothing undefined anywhere */
function expectComplete(r: LabelAnalysis) {
  expect(Object.keys(r).sort()).toEqual(EXPECTED_KEYS);
  expect(Object.keys(r.product).sort()).toEqual(["brand", "category", "name", "quantity"]);
  expect(Object.keys(r.dates).sort()).toEqual(["best_before", "expiration", "lot", "production"]);
  expect(Object.keys(r.storage).sort()).toEqual(["instructions", "temperature"]);
  expect(Object.keys(r.manufacturer).sort()).toEqual(["address", "country", "name"]);
  expect(Object.keys(r.sugar).sort()).toEqual(["basis", "explanation", "level", "per_100"]);
  const walk = (v: unknown, path: string) => {
    expect(v, path).not.toBeUndefined();
    if (v && typeof v === "object") for (const [k, x] of Object.entries(v)) walk(x, `${path}.${k}`);
  };
  walk(r, "result");
  expect(new Set(r.warnings).size).toBe(r.warnings.length);
}

const byId = (r: LabelAnalysis) => Object.fromEntries(r.allergens.map((a) => [a.id, a]));

describe("invariants", () => {
  const garbage: unknown[] = [
    undefined, null, 0, 42, NaN, "", "not json", true, [], [null], [1, 2], {}, { result: null },
    { ingredients: 5 }, { ingredients: "a, b (c, d); e" }, { ingredients: [null, 3, {}, { name: {} }] },
    { allergens: "milk, eggs" }, { allergens: [{ name: "peanut", evidence: "may contain" }] },
    { nutrition: "lots" }, { nutrition: { per_100: { fat_g: "-3", energy: { kj: "abc" } } } },
    { nutrition: { per_100: [], per_serving: { fat: {} } } }, { gluten: 1 }, { gluten: { status: [] } },
    { additives: [{ code: {} }, "E", "INS 9999", 7] }, { dates: "yesterday", storage: 3, manufacturer: [] },
    { highlights: "a; b; c; d; e; f; g" }, { label_detected: "maybe", image_quality: 3, language: {} },
    { data: { result: [{ product: "x" }] } }, { a: { b: { c: { d: { e: {} } } } } },
    JSON.parse('{"__proto__": {"x": 1}, "constructor": 1}'),
  ];
  it.each(garbage.map((g, i) => [i, g]))("never throws and returns a complete object (#%i)", (_i, input) => {
    const r = normalize(input);
    expectComplete(r);
  });

  it("returns a complete object for every fixture", () => {
    for (const f of ["eu-biscuit", "us-per-serving", "fr-peut-contenir", "arabic", "drink", "non-label", "truncated", "python-literals"])
      expectComplete(analyze(`${f}.txt`));
  });

  it("uses null / [] / unclear for unknowns", () => {
    const r = normalize({});
    expect(r.label_detected).toBe(false);
    expect(r.product).toEqual({ name: null, brand: null, category: null, quantity: null });
    expect(r.ingredients).toEqual([]);
    expect(r.gluten).toEqual({ status: "unclear", confidence: "medium", evidence: [] });
    expect(r.lactose).toEqual({ status: "unclear", evidence: [] });
    expect(r.nutrition).toBeNull();
    expect(r.sugar).toEqual({ level: "unknown", per_100: null, basis: "100g", explanation: null });
  });
});

describe("fixture: EU biscuit with may-contain", () => {
  const r = analyze("eu-biscuit.txt");

  it("reads the product and strips the ℮ mark", () => {
    expect(r.product).toEqual({ name: "Choc Chip Hazelnut Cookies", brand: "Brightbake", category: "Biscuits", quantity: "200 g" });
    expect(r.language).toBe("en");
    expect(r.dates.lot).toBe("L2345B");
  });

  it("keeps only printed percentages and printed/implied E-numbers", () => {
    const [flour, , chips, palm, nuts, raising] = r.ingredients;
    expect(chips.percent).toBe(22);
    expect(palm.percent).toBeNull(); // model said 12, not printed
    expect(nuts.percent).toBe(5);
    expect(raising.e_number).toBe("E500ii"); // printed "E 500 (ii)" beats the model's E500
    expect(chips.e_number).toBeNull(); // a compound ingredient has no single code
    expect(flour).toMatchObject({ gluten: true, dairy: false, allergens: ["gluten"] });
    expect(chips).toMatchObject({ dairy: false, allergens: ["soy"] }); // cocoa butter is not milk
  });

  it("moves a declared allergen found only in the may-contain sentence", () => {
    const a = byId(r);
    expect(r.allergens.map((x) => [x.id, x.presence])).toEqual([
      ["gluten", "contains"],
      ["tree_nuts", "contains"],
      ["soy", "contains"],
      ["milk", "may_contain"],
      ["peanuts", "may_contain"],
    ]);
    expect(a.gluten).toMatchObject({ declared: true, sources: ["Wheat flour"] });
    expect(a.milk.sources).toEqual(["“May contain milk and peanuts”"]);
    expect(a.milk.declared).toBe(false);
  });

  it("raises lactose to likely from the may-contain statement", () => {
    expect(r.lactose).toEqual({ status: "likely_contains", evidence: ["“May contain” milk statement"] });
    expect(r.gluten.status).toBe("contains");
  });

  it("corrects additive codes from names", () => {
    expect(r.additives.map((a) => [a.code, a.name])).toEqual([
      ["E322", "Soy lecithin"],
      ["E500ii", "Sodium bicarbonate"],
    ]);
  });

  it("computes nutrition levels, sugar text and highlights", () => {
    expect(r.nutrition?.per_100).toMatchObject({ energy_kj: 2050, energy_kcal: 490, salt_g: 0.8, sodium_mg: 320 });
    expect(r.nutrition?.per_100_calculated).toBe(false);
    expect(r.nutrition?.levels).toEqual({ fat: "high", saturated_fat: "high", sugars: "high", salt: "medium" });
    expect(r.sugar.explanation).toBe(
      "30 g of sugars per 100 g, above the 22.5 g “high” threshold used on UK front-of-pack labels.",
    );
    expect(r.highlights).toEqual([
      { tone: "caution", text: "High in fat (22 g per 100 g)" },
      { tone: "caution", text: "High in saturated fat (10 g per 100 g)" },
      { tone: "caution", text: "High in sugars (30 g per 100 g)" },
      { tone: "neutral", text: "Made with 22% chocolate chips" }, // model's "High in sugar" dropped
    ]);
    expect(r.warnings).toEqual([]);
  });
});

describe("fixture: US per-serving Nutrition Facts panel", () => {
  const r = analyze("us-per-serving.txt");

  it("derives per 100 g from the serving size", () => {
    const n = r.nutrition!;
    expect(n.per_100_calculated).toBe(true);
    expect(n.serving_size).toBe("2/3 cup (55g)");
    expect(n.per_100).toMatchObject({ energy_kcal: 418, fat_g: 14.5, sugars_g: 21.8, sodium_mg: 291, salt_g: 0.7 });
    expect(n.per_serving).toMatchObject({ energy_kcal: 230, sodium_mg: 160, salt_g: 0.4 });
    expect(n.levels).toEqual({ fat: "medium", saturated_fat: "medium", sugars: "medium", salt: "medium" });
  });

  it("raises gluten to likely for oats only", () => {
    expect(r.gluten).toEqual({ status: "likely_contains", confidence: "medium", evidence: ["Ingredient: Whole grain oats"] });
  });

  it("drops guessed codes for ambiguous additives and drops fortificants", () => {
    expect(r.ingredients.find((i) => i.name === "Modified corn starch")?.e_number).toBeNull();
    expect(r.ingredients.find((i) => i.name === "Caramel color")?.e_number).toBeNull();
    expect(r.additives.map((a) => [a.code, a.name, a.category])).toEqual([
      [null, "Modified corn starch", "Thickener"],
      [null, "Caramel color", "Colour"],
    ]);
  });

  it("warns about fair image quality", () => {
    expect(r.warnings).toEqual(["Parts of the label were hard to read. Double-check key numbers against the pack."]);
  });
});

describe("fixture: French label with “peut contenir”", () => {
  const r = analyze("fr-peut-contenir.txt");

  it("separates contains from may-contain", () => {
    expect(r.allergens.map((x) => [x.id, x.presence])).toEqual([
      ["gluten", "contains"],
      ["milk", "contains"],
      ["eggs", "contains"],
      ["tree_nuts", "may_contain"],
      ["soy", "may_contain"],
    ]);
    expect(byId(r).soy.sources[0]).toMatch(/^“Peut contenir des traces de fruits a coque et de soja”$/);
  });

  it("reads comma decimals and keeps the printed percent", () => {
    expect(r.ingredients[2].percent).toBe(18);
    expect(r.nutrition?.per_100).toMatchObject({ fat_g: 24.5, fiber_g: 1.8, salt_g: 0.62, sodium_mg: 248 });
  });

  it("finds additives inside a colon list without giving the ingredient one code", () => {
    expect(r.ingredients[6].e_number).toBeNull();
    expect(r.additives.map((a) => a.code)).toEqual(["E450", "E500"]);
  });

  it("keeps lactose at contains (skimmed milk is not butter-only)", () => {
    expect(r.lactose.status).toBe("contains");
    expect(r.dates.lot).toBe("24117");
  });
});

describe("fixture: Arabic label", () => {
  const r = analyze("arabic.txt");

  it("detects Arabic allergens without false friends", () => {
    expect(r.allergens.map((x) => [x.id, x.presence])).toEqual([
      ["gluten", "contains"],
      ["sesame", "contains"],
      ["peanuts", "may_contain"],
    ]);
    // "white sugar" (سكر أبيض) is not eggs; "made in Lebanon" (لبنان) is not milk
    expect(r.ingredients.flatMap((i) => i.allergens)).not.toContain("eggs");
    expect(r.lactose.status).toBe("no_indication");
  });

  it("handles a label with no nutrition table", () => {
    expect(r.language).toBe("ar");
    expect(r.nutrition).toBeNull();
    expect(r.sugar).toMatchObject({ level: "unknown", explanation: "No sugar value per 100 g/ml is printed on the visible label." });
  });
});

describe("fixture: drink per 100 ml", () => {
  const r = analyze("drink.txt");

  it("infers the 100 ml basis and uses drink thresholds", () => {
    expect(r.nutrition?.basis).toBe("100ml");
    expect(r.nutrition?.per_100).toMatchObject({ energy_kj: 180, energy_kcal: 43, fat_g: 0, sugars_g: 10.5, sodium_mg: 8 });
    expect(r.nutrition?.levels).toEqual({ fat: "low", saturated_fat: "low", sugars: "medium", salt: "low" });
    expect(r.sugar.explanation).toBe(
      "10.5 g of sugars per 100 ml, between the 2.5 g “low” and 11.25 g “high” thresholds used on UK front-of-pack labels.",
    );
  });

  it("adds printed and named additives the model missed", () => {
    expect(r.additives.map((a) => a.code)).toEqual(["E110", "E331", "E330", "E202"]);
    expect(r.ingredients.map((i) => i.e_number)).toEqual([null, null, null, "E330", "E331", "E202", "E110"]);
  });
});

describe("fixture: not a label", () => {
  const r = analyze("non-label.txt");
  it("keeps label_detected false and explains", () => {
    expect(r.label_detected).toBe(false);
    expect(r.summary).toMatch(/cat/);
    expect(r.warnings).toEqual([
      "This photo doesn't look like a food label. For best results, photograph the ingredient list or nutrition table up close.",
    ]);
    expect(r.gluten).toEqual({ status: "unclear", confidence: "low", evidence: [] });
    expect(r.lactose.status).toBe("unclear");
  });
});

describe("fixture: truncated output", () => {
  const r = analyze("truncated.txt");
  it("keeps what was recovered and warns", () => {
    expect(r.ingredients).toHaveLength(4);
    expect(r.ingredients[0].percent).toBe(70);
    expect(r.warnings).toContain("The analysis was cut short; some sections may be incomplete.");
    expect(r.highlights).toContainEqual({ tone: "positive", text: "Low in sugars (1.9 g per 100 g)" });
  });
});

describe("fixture: Python literals, buckwheat, cocoa butter, coconut, E-number variants", () => {
  const r = analyze("python-literals.txt");
  it("finds no false allergens", () => {
    expect(r.allergens).toEqual([]);
    expect(r.ingredients.every((i) => !i.gluten && !i.dairy)).toBe(true);
    expect(r.gluten).toEqual({ status: "no_indication", confidence: "high", evidence: ["Buckwheat is not wheat", "Labelled gluten-free"] });
  });
  it("canonicalises E 500 (ii) and INS 330", () => {
    expect(r.ingredients.map((i) => i.e_number).filter(Boolean)).toEqual(["E500ii", "E330"]);
    expect(r.additives.map((a) => [a.code, a.name])).toEqual([
      ["E500ii", "Sodium bicarbonate"],
      ["E330", "Citric acid"],
    ]);
  });
});

describe("rules", () => {
  it("unwraps result / data / array wrappers and the older 'analysis' schema", () => {
    const inner = { product: { name: "X" } };
    expect(normalize({ result: inner }).product.name).toBe("X");
    expect(normalize([inner]).product.name).toBe("X");
    expect(normalize({ data: { result: [inner] } }).product.name).toBe("X");
    expect(normalize({ label_detected: true, analysis: { summary: "old" } }).summary).toBe("old");
  });

  it("matches keys case- and format-insensitively and rejects placeholders", () => {
    const r = normalize({ Product: { "Brand Name": "Acme", name: "N/A", category: "—" }, Language: "English" });
    expect(r.product.brand).toBe("Acme");
    expect(r.product.name).toBeNull();
    expect(r.product.category).toBeNull();
    expect(r.language).toBeNull(); // not an ISO code
  });

  it("reconstructs ingredients from raw_text with a warning", () => {
    const r = normalize({ raw_text: "Ingredients: wheat flour, sugar, butter (12%). May contain nuts." });
    expect(r.ingredients.map((i) => i.name)).toEqual(["wheat flour", "sugar", "butter (12%)"]);
    expect(r.warnings).toContain("The ingredient list was reconstructed from the label text.");
    expect(r.label_detected).toBe(true);
    expect(byId(r).tree_nuts.presence).toBe("may_contain");
  });

  it("only raises gluten, never lowers it", () => {
    const r = normalize({ gluten: { status: "contains", confidence: "high", evidence: ["model says so"] }, ingredients: ["rice", "sugar"] });
    expect(r.gluten.status).toBe("contains");
    expect(byId(r).gluten.sources).toEqual(["model says so"]);
  });

  it("raises gluten to contains for a declared gluten allergen", () => {
    const r = normalize({ gluten: { status: "no_indication" }, ingredients: [{ name: "brioche", allergens: ["gluten"] }], allergens: { declared: ["gluten"] } });
    expect(r.gluten).toMatchObject({ status: "contains", confidence: "high" });
    expect(r.ingredients[0].allergens).toContain("gluten"); // trusted: declared and no sub-ingredients
  });

  it("does not raise gluten when the pack claims gluten-free", () => {
    const r = normalize({ gluten: { status: "no_indication" }, ingredients: ["gluten-free wheat starch"], claims: ["Gluten free"] });
    expect(r.gluten.status).toBe("no_indication");
    expect(r.gluten.evidence).toContain("Labelled gluten-free");
  });

  it("rates butter-only dairy as likely, and respects lactose-free claims", () => {
    expect(normalize({ lactose: { status: "no_indication" }, ingredients: ["flour", "butter"] }).lactose.status).toBe("likely_contains");
    expect(normalize({ lactose: { status: "no_indication" }, ingredients: ["milk", "butter"] }).lactose.status).toBe("contains");
    const free = normalize({ lactose: { status: "no_indication" }, ingredients: ["milk"], claims: ["Lactose free"] });
    expect(free.lactose).toEqual({ status: "no_indication", evidence: ["Labelled lactose-free"] });
  });

  it("parses sodium, energy and units", () => {
    const per100 = (p: object) => normalize({ nutrition: { per_100: p } }).nutrition?.per_100;
    expect(per100({ sodium: 0.4 })).toMatchObject({ sodium_mg: 400, salt_g: 1 });
    expect(per100({ sodium: "220" })).toMatchObject({ sodium_mg: 220 });
    expect(per100({ sodium: "220 mg" })).toMatchObject({ sodium_mg: 220 });
    expect(per100({ energy: 1500 })).toMatchObject({ energy_kj: 1500, energy_kcal: null });
    expect(per100({ energy: "360" })).toMatchObject({ energy_kcal: 360 });
    expect(per100({ fat: { value: 500, unit: "mg" } })).toMatchObject({ fat_g: 0.5 });
    expect(per100({ salt_g: "<0,5" })).toMatchObject({ salt_g: 0.5 });
  });

  it("treats a flat nutrition object as per 100", () => {
    const r = normalize({ nutrition: { fat: 20, sugars: 1, energy_kcal: 300 } });
    expect(r.nutrition?.per_100).toMatchObject({ fat_g: 20, sugars_g: 1 });
    expect(r.nutrition?.levels.fat).toBe("high");
  });

  it("drops impossible values with a warning", () => {
    const r = normalize({ nutrition: { per_100: { fat_g: 150, sugars_g: 10, energy_kcal: 1200 } } });
    expect(r.nutrition?.per_100).toMatchObject({ fat_g: null, energy_kcal: null, sugars_g: 10 });
    expect(r.warnings).toContain("Some nutrition values were unreadable or impossible and were left out.");
  });

  it("re-derives per 100 when it fails the energy check but the serving passes", () => {
    const r = normalize({
      nutrition: {
        serving_size: "1 bar (40 g)",
        per_100: { energy_kcal: 450, fat_g: 2, carbohydrates_g: 10, protein_g: 1 }, // rows misread: 62 kcal of macros
        per_serving: { energy_kcal: 180, fat_g: 7, carbohydrates_g: 24, protein_g: 4 },
      },
    });
    expect(r.nutrition?.per_100_calculated).toBe(true);
    expect(r.nutrition?.per_100).toMatchObject({ energy_kcal: 450, fat_g: 17.5 });
  });

  it("warns about inconsistent nutrition", () => {
    const r = normalize({ nutrition: { per_100: { carbohydrates_g: 10, sugars_g: 20, fat_g: 5, saturated_fat_g: 8 } } });
    expect(r.warnings.some((w) => w.includes("sugars exceed carbohydrates") && w.includes("saturates exceed total fat"))).toBe(true);
  });

  it("caps highlights and drops model level claims when nutrition exists", () => {
    const r = normalize({
      nutrition: { per_100: { fat_g: 30, saturated_fat_g: 12, sugars_g: 40, salt_g: 3 } },
      highlights: ["Low fat", "Good source of fibre", "Vegan", "Contains caffeine", "Made in Italy"],
    });
    expect(r.highlights).toHaveLength(5);
    expect(r.highlights.slice(0, 4).every((h) => h.tone === "caution")).toBe(true);
    expect(r.highlights.map((h) => h.text)).not.toContain("Low fat");
  });

  it("strips lot prefixes without eating words", () => {
    expect(normalize({ dates: { lot: "Batch no. 123" } }).dates.lot).toBe("123");
    expect(normalize({ dates: { lot: "LOTUS-99" } }).dates.lot).toBe("LOTUS-99");
  });

  it("forces label_detected when there is substantive content", () => {
    expect(normalize({ label_detected: false, ingredients: ["sugar"] }).label_detected).toBe(true);
  });

  it("adds each warning once", () => {
    const r = normalize({ image_quality: "poor", label_detected: true }, { repaired: true });
    expect(r.warnings).toEqual([
      "The label was hard to read, so some details may be missing or inaccurate. A sharper, closer photo will help.",
      "No ingredient list was readable, so allergen, gluten and additive checks are incomplete.",
      "The analysis was cut short; some sections may be incomplete.",
    ]);
  });
});
