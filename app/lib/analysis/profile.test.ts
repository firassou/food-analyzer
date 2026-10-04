import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { checkProfile, EMPTY_PROFILE, isEmptyProfile, sanitizeProfile, type Profile } from "./profile";

const profile = (p: Partial<Profile>): Profile => ({ ...EMPTY_PROFILE, ...p });
const label = (ingredients: unknown[], extra: object = {}) =>
  normalize({ kind: "label", label_detected: true, image_quality: "good", product: { name: "X" }, ingredients, gluten: { status: "no_indication" }, lactose: { status: "no_indication" }, ...extra });
const summary = (r: ReturnType<typeof checkProfile>) => r && [r.status, ...r.findings.map((f) => `${f.level}:${f.topic.type === "allergen" ? f.topic.id : f.topic.type === "diet" ? f.topic.diet : f.topic.type}`)];

describe("sanitizeProfile", () => {
  it("keeps only known values", () => {
    expect(sanitizeProfile({ allergens: ["milk", "nonsense", 3], diets: ["halal", "keto"], lactose: "yes", sugar: true })).toEqual({ allergens: ["milk"], lactose: false, sugar: true, diets: ["halal"] });
    expect(isEmptyProfile(sanitizeProfile(null))).toBe(true);
    expect(isEmptyProfile(sanitizeProfile("garbage"))).toBe(true);
  });
});

describe("checkProfile", () => {
  const biscuit = label(["wheat flour", "sugar", "butter", "hazelnuts"], { allergens: { declared: ["gluten", "milk", "tree_nuts"], may_contain: ["peanuts"] } });

  it("says nothing without a profile, for water, or for a photo of something else", () => {
    expect(checkProfile(biscuit, EMPTY_PROFILE)).toBeNull();
    expect(checkProfile(normalize({ kind: "water", water: { ph: 7 } }), profile({ allergens: ["milk"] }))).toBeNull();
    expect(checkProfile(normalize({}), profile({ allergens: ["milk"] }))).toBeNull();
  });

  it("flags the reader's allergens: contained → avoid, traces → check", () => {
    expect(summary(checkProfile(biscuit, profile({ allergens: ["milk", "peanuts", "fish"] })))).toEqual(["avoid", "avoid:milk", "check:peanuts"]);
    expect(summary(checkProfile(biscuit, profile({ allergens: ["peanuts"] })))).toEqual(["check", "check:peanuts"]);
    expect(summary(checkProfile(biscuit, profile({ allergens: ["gluten"] })))).toEqual(["avoid", "avoid:gluten"]);
    expect(checkProfile(biscuit, profile({ allergens: ["milk"] }))!.findings[0].because.length).toBeGreaterThan(0);
  });

  it("is ok when the list was read and nothing matches", () => {
    expect(summary(checkProfile(biscuit, profile({ allergens: ["fish", "sesame"] })))).toEqual(["ok"]);
  });

  it("won't say ok when the ingredients weren't read", () => {
    const front = normalize({ kind: "label", label_detected: true, product: { name: "Choco Bar" } });
    expect(summary(checkProfile(front, profile({ allergens: ["milk"], diets: ["vegan"] })))).toEqual(["unchecked"]);
  });

  it("treats lactose and sugar on their own", () => {
    // butter holds little lactose: "likely", so a check
    expect(summary(checkProfile(biscuit, profile({ lactose: true })))).toEqual(["check", "check:lactose"]);
    expect(summary(checkProfile(label(["skimmed milk powder", "sugar"]), profile({ lactose: true })))).toEqual(["avoid", "avoid:lactose"]);
    const soda = normalize({ kind: "drink", label_detected: true, product: { name: "Cola" }, nutrition: { basis: "100ml", per_100_printed: true, per_100: { sugars_g: 12 } } });
    expect(summary(checkProfile(soda, profile({ sugar: true })))).toEqual(["check", "check:sugar"]);
    const light = normalize({ kind: "drink", label_detected: true, product: { name: "Cola zero" }, nutrition: { basis: "100ml", per_100_printed: true, per_100: { sugars_g: 0 } } });
    expect(summary(checkProfile(light, profile({ sugar: true })))).toEqual(["ok"]);
    expect(summary(checkProfile(light, profile({ sugar: true, allergens: ["milk"] })))).toEqual(["unchecked"]);
  });

  it("applies the diets", () => {
    const sweets = label(["glucose syrup", "sugar", "gélatine", "colour: carmine", "glazing agent: shellac", "miel"]);
    expect(summary(checkProfile(sweets, profile({ diets: ["vegetarian"] })))).toEqual(["avoid", "avoid:vegetarian"]);
    expect(checkProfile(sweets, profile({ diets: ["vegetarian"] }))!.findings[0].because).toEqual(["gélatine", "colour: carmine"]);
    expect(checkProfile(sweets, profile({ diets: ["vegan"] }))!.findings[0].because).toEqual(["gélatine", "colour: carmine", "glazing agent: shellac", "miel"]);
    // gelatine and carmine: the source decides, so halal is a "check"
    expect(summary(checkProfile(sweets, profile({ diets: ["halal"] })))).toEqual(["check", "check:halal"]);
    expect(summary(checkProfile(label(["pâtes", "lardons (porc)", "crème"]), profile({ diets: ["vegetarian", "halal"] })))).toEqual(["avoid", "avoid:vegetarian", "avoid:halal"]);
    expect(summary(checkProfile(label(["cocoa", "rhum 2%"]), profile({ diets: ["halal", "vegan"] })))).toEqual(["avoid", "avoid:halal"]);
  });

  it("knows vegan from the allergens too, and isn't fooled by look-alikes", () => {
    expect(summary(checkProfile(biscuit, profile({ diets: ["vegan"] })))).toEqual(["avoid", "avoid:vegan"]);
    expect(summary(checkProfile(biscuit, profile({ diets: ["vegetarian", "halal"] })))).toEqual(["ok"]);
    const harmless = label(["vinaigre de vin", "cetyl alcohol", "boisson sans alcool", "hamburger buns", "larder mix", "vinaigrette"]);
    expect(summary(checkProfile(harmless, profile({ diets: ["halal", "vegan", "vegetarian"] })))).toEqual(["ok"]);
  });

  it("lets a halal or vegan claim answer the 'source not stated' doubts only", () => {
    const emulsified = ["emulsifier: E471", "sugar"];
    expect(summary(checkProfile(label(emulsified), profile({ diets: ["vegan", "halal"] })))).toEqual(["check", "check:vegan", "check:halal"]);
    expect(summary(checkProfile(label(emulsified, { certifications: ["Halal"], claims: ["Vegan"] }), profile({ diets: ["halal", "vegan"] })))).toEqual(["ok"]);
    expect(summary(checkProfile(label(["porc"], { certifications: ["Halal"] }), profile({ diets: ["halal"] })))).toEqual(["avoid", "avoid:halal"]);
  });

  it("only goes as far as 'check' on an estimate", () => {
    const cake = normalize({ kind: "dish", product: { name: "Cake" }, estimated_ingredients: [{ name: "wheat flour", confidence: "high" }, { name: "butter", confidence: "high" }, { name: "eggs", confidence: "high" }] });
    const r = checkProfile(cake, profile({ allergens: ["eggs"], diets: ["vegan"] }))!;
    expect(r.status).toBe("check");
    expect(r.findings.every((f) => f.level === "check")).toBe(true);
  });

  it("works on a medicine's excipients", () => {
    const caps = normalize({ kind: "medicine", ingredients: ["lactose monohydraté", "gélatine", "stéarate de magnésium"], medicine: { active: ["omeprazole"] } });
    expect(summary(checkProfile(caps, profile({ lactose: true, diets: ["vegetarian"] })))).toEqual(["avoid", "avoid:lactose", "avoid:vegetarian"]);
  });
});
