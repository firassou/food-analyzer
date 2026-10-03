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
  "kind", "ingredient_source", "database", "water", "drink",
].sort();

/** invariant 2: every field present, nothing undefined anywhere */
function expectComplete(r: LabelAnalysis) {
  expect(Object.keys(r).sort()).toEqual(EXPECTED_KEYS);
  expect(Object.keys(r.product).sort()).toEqual(["barcode", "brand", "category", "name", "quantity"]);
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
    for (const f of ["eu-biscuit", "us-per-serving", "fr-peut-contenir", "arabic", "drink", "non-label", "truncated", "python-literals", "fr-yogurt-traces"])
      expectComplete(analyze(`${f}.txt`));
  });

  it("uses null / [] / unclear for unknowns", () => {
    const r = normalize({});
    expect(r.label_detected).toBe(false);
    expect(r.product).toEqual({ name: null, brand: null, category: null, quantity: null, barcode: null });
    expect(r.kind).toBe("other");
    expect(r.ingredient_source).toBe("label");
    expect([r.water, r.drink, r.database]).toEqual([null, null, null]);
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
    expect(r.product).toEqual({ name: "Choc Chip Hazelnut Cookies", brand: "Brightbake", category: "Biscuits", quantity: "200 g", barcode: null });
    expect(r.kind).toBe("label");
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

describe("fr-yogurt-traces: may-contain glued to an ingredient, allergen in both model lists", () => {
  const r = analyze("fr-yogurt-traces.txt");

  it("keeps tree nuts as a trace, not an ingredient allergen", () => {
    expect(byId(r).tree_nuts?.presence).toBe("may_contain");
    expect(byId(r).tree_nuts?.declared).toBe(false);
    expect(r.ingredients.at(-1)?.allergens).toEqual([]);
  });

  it("still reports the real ingredient allergens", () => {
    expect(byId(r).milk?.presence).toBe("contains");
    expect(r.lactose.status).toBe("contains");
  });
});

describe("review regressions", () => {
  it("keeps a declared allergen that a precaution sentence also mentions", () => {
    const r = normalize({
      label_detected: true,
      allergens: { declared: ["milk"], may_contain: [] },
      raw_text: "Contains milk. Made in a factory that also handles nuts and milk.",
    });
    expect(byId(r).milk?.presence).toBe("contains");
    expect(byId(r).milk?.declared).toBe(true);
    expect(byId(r).tree_nuts?.presence).toBe("may_contain");
  });

  it("keeps a model allergen listed in both lists when the label text declares it", () => {
    const r = normalize({
      label_detected: true,
      allergens: { declared: ["soy"], may_contain: ["soy"] },
      raw_text: "Allergens: soy. May contain traces of soy and sesame.",
    });
    expect(byId(r).soy?.presence).toBe("contains");
  });

  it("lists oats-only gluten as may contain, consistent with the gluten status", () => {
    const r = normalize({ label_detected: true, ingredients: [{ name: "rolled oats" }, { name: "salt" }] });
    expect(r.gluten.status).toBe("likely_contains");
    expect(byId(r).gluten?.presence).toBe("may_contain");
    expect(r.ingredients[0].gluten).toBe(true);
  });
});

describe("locale", () => {
  it("writes its own sentences in the requested language and keeps the rules unchanged", () => {
    const raw = fixture("eu-biscuit.txt");
    const en = normalize(parseModelJson(raw)!.value);
    const fr = normalize(parseModelJson(raw)!.value, { locale: "fr" });
    const ar = normalize(parseModelJson(raw)!.value, { locale: "ar" });
    for (const r of [fr, ar]) {
      expect(r.allergens.map((a) => [a.id, a.presence])).toEqual(en.allergens.map((a) => [a.id, a.presence]));
      expect(r.gluten.status).toBe(en.gluten.status);
      expect(r.additives.map((a) => a.code)).toEqual(en.additives.map((a) => a.code));
      expect(r.nutrition).toEqual(en.nutrition);
    }
    expect(fr.highlights[0].text).toBe("Riche en matières grasses (22 g pour 100 g)");
    expect(fr.allergens.find((a) => a.id === "milk")?.name).toBe("Lait");
    expect(fr.sugar.explanation).toContain("au-dessus du seuil « élevé » de 22,5 g");
    expect(ar.highlights[0].text).toContain("نسبة مرتفعة من الدهون");
  });

  it("falls back to English for an unknown locale and keeps name_local", () => {
    const r = normalize(
      { ingredients: [{ name: "دقيق القمح", name_en: "wheat flour", name_local: "farine de blé" }] },
      { locale: "xx" as never },
    );
    expect(r.ingredients[0].name_local).toBe("farine de blé");
    expect(r.gluten.evidence).toEqual(["Ingredient: farine de blé"]);
    expect(r.warnings.join(" ")).toMatch(/^[\x20-\x7e’“”]+$/);
  });

  it("drops a model highlight about a computed level in French too", () => {
    const r = normalize(
      { nutrition: { per_100: { sugars_g: 30 } }, highlights: [{ text: "Riche en sucres" }, { text: "Sans huile de palme" }] },
      { locale: "fr" },
    );
    expect(r.highlights.map((h) => h.text)).toEqual(["Riche en sucres (30 g pour 100 g)", "Sans huile de palme"]);
  });
});

describe("fixture: bottled water", () => {
  const r = analyze("water.txt");

  it("is water, with the printed composition and computed remarks", () => {
    expect(r.kind).toBe("water");
    expect(r.product.barcode).toBe("6191507400012");
    // a misread digit fails the check digit and is dropped rather than looked up
    expect(normalize({ product: { name: "X", barcode: "6191507400014" } }).product.barcode).toBeNull();
    expect(normalize({ product: { name: "X", barcode: 3017620422003 } }).product.barcode).toBe("3017620422003");
    expect(r.water?.ph).toBe(7.4);
    expect(r.water?.minerals).toMatchObject({ calcium: 78, magnesium: 14, sodium: 12, fluoride: null });
    expect(r.water?.hardness_mg_l).toBe(252); // 78 × 2.497 + 14 × 4.118
    expect(r.water?.facts.map((f) => f.id)).toEqual(["ph_neutral", "mineral_low", "hardness_very_hard", "low_sodium", "nitrate_low"]);
    expect(r.water?.facts[0]).toEqual({
      id: "ph_neutral",
      tone: "positive",
      text: "pH 7.4: within the 6.5–9.5 range set for drinking water in the EU.",
      tip: "Right where drinking water should be. Nothing to think about.",
      source: "EU rules on drinking and mineral waters",
    });
    // every remark comes with a plain-language word, in the reader's language
    expect(r.water?.facts.every((f) => f.tip.length > 20)).toBe(true);
    const rich = normalize({ kind: "water", product: { name: "Eau minérale" }, water: { minerals: { calcium: 480, nitrate: 60 } } }, { locale: "fr" });
    expect(rich.water?.facts.map((f) => [f.id, f.tone])).toEqual([["nitrate_high", "caution"], ["calcium_rich", "neutral"]]);
    // 480 mg/L against 950 mg a day; the stones myth is answered, not repeated
    expect(rich.water?.facts[1].tip).toMatch(/^Un litre apporte environ 51 % du calcium/);
    expect(rich.water?.facts[1].tip).toMatch(/le calcium de l'eau n'en est pas la cause/);
    expect(rich.water?.facts[1].source).toMatch(/EFSA.*urologie/);
    expect(rich.water?.facts[0].tip).toMatch(/jamais pour les biberons/);
    const salty = normalize({ kind: "water", product: { name: "Mineral water" }, water: { ph: 5.2, minerals: { sodium: 1200, magnesium: 105 } } });
    const tips = Object.fromEntries(salty.water!.facts.map((f) => [f.id, f.tip]));
    expect(tips.sodium_rich).toMatch(/about 60 % of the 2 g of sodium/);
    expect(tips.magnesium_rich).toMatch(/about 30 % of an adult's daily magnesium/);
    expect(tips.ph_acidic).toMatch(/enamel starts to soften below about pH 5.5/);
    expect(salty.water!.facts.every((f) => f.source.length > 5)).toBe(true);
  });

  it("has no gluten or lactose question and no missing-ingredients warning", () => {
    expect(r.gluten.status).toBe("no_indication");
    expect(r.lactose.status).toBe("no_indication");
    expect(r.allergens).toEqual([]);
    expect(r.warnings).toEqual([]);
    expect(r.sugar.basis).toBe("100ml");
    expect(r.drink).toBeNull();
  });

  it("ignores impossible values and never invents a composition", () => {
    const odd = normalize({ kind: "water", product: { name: "Spring water" }, water: { ph: 71, minerals: { calcium: -3, sodium: "9 mg/l" } } });
    expect(odd.water).toMatchObject({ ph: null, minerals: { calcium: null, sodium: 9 } });
    const bare = normalize({ kind: "water", product: { name: "Spring water" }, water: null });
    expect(bare.kind).toBe("water");
    expect(bare.water).toBeNull();
  });

  it("treats a sweetened or flavoured water as a drink", () => {
    const r2 = normalize({
      kind: "water",
      product: { name: "Lemon flavoured water", quantity: "50 cl" },
      ingredients: ["water", "sugar", "lemon juice", "citric acid"],
      nutrition: { basis: "100ml", per_100: { sugars_g: 4.5 } },
      water: { ph: 3.2 },
    });
    expect(r2.kind).toBe("drink");
    expect(r2.water).toBeNull();
    expect(r2.drink).toMatchObject({ volume_ml: 500, sugar_per_container_g: 22.5 });
  });

  it("flags an acidic sparkling water as normal, a still one as acidic", () => {
    const fizzy = normalize({ kind: "water", product: { name: "Eau minérale naturelle gazeuse" }, water: { ph: 5.6 } });
    expect(fizzy.water?.facts.map((f) => [f.id, f.tone])).toEqual([["ph_sparkling", "neutral"]]);
    const still = normalize({ kind: "water", product: { name: "Mineral water" }, water: { ph: 5.6 } });
    expect(still.water?.facts.map((f) => [f.id, f.tone])).toEqual([["ph_acidic", "caution"]]);
  });
});

describe("fixture: a dish with no label", () => {
  const r = analyze("dish.txt");

  it("keeps the estimate apart from read ingredients", () => {
    expect(r.kind).toBe("dish");
    expect(r.label_detected).toBe(false);
    expect(r.ingredient_source).toBe("estimated");
    expect(r.ingredients.map((i) => [i.name, i.confidence])).toContainEqual(["hazelnuts", "low"]);
    expect(r.warnings).toEqual([
      "These ingredients are an estimate from the look of the food, not read from a label. The real recipe may differ: don't rely on this if you have allergies.",
      "The calories and nutrients are a rough estimate for a typical recipe and portion of this dish. The real figures can differ a lot.",
    ]);
  });

  it("gives rough nutrition, flagged as an estimate and scaled to the portion", () => {
    expect(r.nutrition).toMatchObject({ estimated: true, basis: "100g", serving_size: "1 slice (≈ 120 g)" });
    expect(r.nutrition?.per_100?.energy_kcal).toBe(380);
    expect(r.nutrition?.per_serving).toMatchObject({ energy_kcal: 456, sugars_g: 38.4, fat_g: 24 });
    // a guess is never turned into a "High in …" statement
    expect(r.highlights).toEqual([]);
    expect(r.sugar.explanation).toBe("A rough figure for a typical recipe of this dish, not a measured one.");
  });

  it("ignores estimated nutrition for anything that isn't a dish", () => {
    const label = normalize({ kind: "label", ingredients: ["rice"], estimated_nutrition: { per_100: { energy_kcal: 350 } } });
    expect(label.nutrition).toBeNull();
    const read = normalize({ ingredients: ["rice"], nutrition: { per_100: { energy_kcal: 350 } } });
    expect(read.nutrition?.estimated).toBe(false);
  });

  it("never claims more than 'likely' from an estimate", () => {
    expect(r.allergens.map((a) => [a.id, a.presence])).toEqual([
      ["gluten", "may_contain"],
      ["milk", "may_contain"],
      ["eggs", "may_contain"],
      ["tree_nuts", "may_contain"],
    ]);
    expect(r.gluten).toMatchObject({ status: "likely_contains", confidence: "medium" });
    expect(r.lactose.status).toBe("likely_contains");
  });

  it("uses read ingredients, not the estimate, whenever a list was read", () => {
    const both = normalize({ kind: "label", ingredients: ["rice", "salt"], estimated_ingredients: [{ name: "wheat flour" }] });
    expect(both.ingredient_source).toBe("label");
    expect(both.ingredients.map((i) => i.name)).toEqual(["rice", "salt"]);
    expect(both.ingredients[0].confidence).toBeNull();
  });
});

describe("drinks and unreadable products", () => {
  it("summarises a drink: sugar per container, colours, sweeteners, caffeine", () => {
    const r = analyze("drink.txt");
    expect(r.kind).toBe("drink");
    expect(r.drink?.colours).toEqual(["Sunset yellow FCF"]);
    expect(r.drink?.sweeteners).toEqual([]);
    const cola = normalize({
      product: { name: "Cola zero", category: "Soft drink", quantity: "33 cl" },
      ingredients: ["carbonated water", "colour E150d", "sweeteners: aspartame, acesulfame K", "caffeine"],
      nutrition: { basis: "100ml", per_100: { sugars_g: 0 } },
    });
    expect(cola.drink).toEqual({
      volume_ml: 330,
      sugar_per_container_g: 0,
      colours: ["Sulphite ammonia caramel"],
      sweeteners: ["Aspartame", "Acesulfame K"],
      caffeine: true,
    });
  });

  it("asks for a photo of the whole product when a known pack has no readable list", () => {
    const r = normalize({ label_detected: true, image_quality: "good", kind: "label", product: { name: "Choco Pops", brand: "Acme" } });
    expect(r.warnings).toEqual([
      "The ingredient list couldn't be read, so allergen, gluten and additive checks are incomplete. Take a photo of the whole product, with its name and barcode visible, so it can be looked up.",
    ]);
  });

  it("marks a recalled product recipe as an estimate", () => {
    const r = normalize({
      label_detected: false,
      kind: "label",
      product: { name: "Choco Pops", brand: "Acme" },
      estimated_ingredients: [{ name: "wheat flour", confidence: "high" }, { name: "sugar" }],
    });
    expect(r.kind).toBe("label");
    expect(r.ingredient_source).toBe("estimated");
    expect(r.warnings[0]).toMatch(/usual ingredients of this product/);
    expect(r.gluten.status).toBe("likely_contains");
  });

  it("labels ingredients completed from a product database", () => {
    const database = { name: "Open Food Facts", product: "Choco Pops – Acme", url: "https://example.org/p/1" };
    const r = normalize(
      { label_detected: true, image_quality: "good", product: { name: "Choco Pops" }, ingredients: "wheat flour, sugar, cocoa" },
      { database },
    );
    expect(r.ingredient_source).toBe("database");
    expect(r.database).toEqual(database);
    expect(r.gluten.status).toBe("contains");
    expect(r.warnings).toEqual([
      "The ingredient list wasn't readable on the photo. It was completed from the Open Food Facts entry “Choco Pops – Acme”: check that it matches your pack.",
    ]);
  });
});
