import { describe, expect, it } from "vitest";
import { checkFoodWithMedicines, foodSignals, type ShelfMedicine } from "./foodMedicine";
import { normalize } from "./normalize";

const food = (ingredients: unknown[], extra: object = {}) =>
  normalize({ kind: "label", label_detected: true, image_quality: "good", product: { name: "X" }, ingredients, gluten: { status: "no_indication" }, lactose: { status: "no_indication" }, ...extra });
const drink = (name: string, ingredients: unknown[] = [], extra: object = {}) =>
  normalize({ kind: "drink", label_detected: true, image_quality: "good", product: { name }, ingredients, ...extra });
const med = (name: string, ...active: string[]): ShelfMedicine => ({
  name,
  medicine: normalize({ kind: "medicine", label_detected: true, image_quality: "good", product: { name }, medicine: { active: active.map((a) => ({ name: a })) } }).medicine!,
});
const ids = (r: ReturnType<typeof checkFoodWithMedicines>) => r.findings.map((f) => `${f.severity}:${f.id}:${f.substance}`);

describe("foodSignals", () => {
  it("reads caffeine, grapefruit, potassium salt and alcohol from what is listed", () => {
    expect(foodSignals(drink("Cola", [{ name: "caffeine" }], { drink: { caffeine: true } }))).toContain("caffeine");
    expect(foodSignals(food(["Pamplemousse rose", "sugar"]))).toContain("grapefruit");
    expect(foodSignals(food(["salt", "potassium chloride"]))).toContain("potassium");
    expect(foodSignals(food(["cream", "rum"]))).toContain("alcohol_food");
    expect(foodSignals(drink("Red wine", []))).toContain("alcohol");
  });

  it("does not mistake what only looks like it", () => {
    expect(foodSignals(food(["wine vinegar", "sugar"]))).not.toContain("alcohol");
    expect(foodSignals(food(["sugar", "gelatine"], { product: { name: "Wine gums" } }))).not.toContain("alcohol");
    expect(foodSignals(drink("Bière sans alcool", []))).not.toContain("alcohol");
    expect(foodSignals(food(["sugar", "natural grapefruit flavouring"]))).not.toContain("grapefruit");
    expect(foodSignals(food(["sugar", "arôme pamplemousse"]))).not.toContain("grapefruit");
    expect(foodSignals(food(["sugar", "potassium sorbate"]))).not.toContain("potassium");
  });

  it("reads alcohol as a drink's own or a food's, and not from a flavouring or a cetyl alcohol", () => {
    expect(foodSignals(drink("Cidre brut", [{ name: "pommes" }]))).toContain("alcohol");
    expect(foodSignals(drink("Gin tonic", []))).toContain("alcohol");
    expect(foodSignals(food(["cream", "marsala wine"]))).toContain("alcohol_food");
    expect(foodSignals(food(["cream", "marsala wine"]))).not.toContain("alcohol");
    expect(foodSignals(food(["sugar", "vanilla extract (alcohol)"]))).not.toContain("alcohol_food");
    expect(foodSignals(food(["sugar", "natural flavouring (alcohol)"]))).not.toContain("alcohol_food");
    expect(foodSignals(drink("Ginger beer", []))).not.toContain("alcohol");
    expect(foodSignals(drink("Alcohol-free beer 0,0 %", []))).not.toContain("alcohol");
    expect(foodSignals(food(["sugar", "كحول سيتيلي"]))).not.toContain("alcohol_food");
    // "10,0 %" is a strength, not "0,0 %"
    expect(foodSignals(drink("Vin rouge 10,0 % vol", []))).toContain("alcohol");
  });

  it("reads caffeine only when it is there", () => {
    expect(foodSignals(drink("Cola", [{ name: "caffeine" }]))).toContain("caffeine");
    expect(foodSignals(drink("Cola sans caféine", [{ name: "caféine" }], { claims: ["sans caféine"] }))).not.toContain("caffeine");
    expect(foodSignals(drink("Energy", [{ name: "taurine" }]))).not.toContain("caffeine");
    expect(foodSignals(drink("Energy", [{ name: "guarana" }]))).toContain("caffeine");
  });

  it("sends nothing from a guessed recipe", () => {
    const guess = food([], { kind: "dish", estimated_ingredients: [{ name: "red wine", confidence: "high" }, { name: "cream", confidence: "high" }, { name: "grapefruit", confidence: "low" }] });
    expect(guess.ingredient_source).toBe("estimated");
    expect(foodSignals(guess).size).toBe(0);
  });

  it("is silent for a medicine or a photo of something else", () => {
    expect(foodSignals(normalize({ kind: "medicine", medicine: { active: [{ name: "x" }] }, ingredients: ["rum"] })).size).toBe(0);
    expect(foodSignals(normalize({})).size).toBe(0);
  });

  it("flags a water rich in calcium and a food fortified with iron", () => {
    expect(foodSignals(normalize({ kind: "water", product: { name: "Eau minérale" }, water: { minerals: { calcium: 480 } } }))).toContain("minerals");
    expect(foodSignals(food(["wheat flour", "iron", "folic acid"]))).toContain("minerals");
  });

  it("flags dairy only when the milk is in it, not just a trace", () => {
    expect(foodSignals(food(["milk powder"], { allergens: { declared: ["milk"] } }))).toContain("dairy");
    expect(foodSignals(food(["sugar"], { allergens: { may_contain: ["milk"] } }))).not.toContain("dairy");
  });
});

describe("checkFoodWithMedicines", () => {
  it("names the medicine and substance behind each finding, the serious first", () => {
    const r = checkFoodWithMedicines(drink("Beer", [{ name: "malt" }, { name: "caffeine" }]), [med("Cipro", "Ciprofloxacin"), med("Flagyl", "Metronidazole")]);
    expect(ids(r)).toEqual(["avoid:alcohol_nitroimidazole:Metronidazole", "caution:caffeine_quinolone:Ciprofloxacin"]);
    expect(r.findings[0].medicine).toBe("Flagyl");
  });

  it("matches across spellings and salts", () => {
    expect(ids(checkFoodWithMedicines(food(["grapefruit juice"]), [med("Zocor", "Simvastatine")]))).toEqual(["caution:grapefruit_statin:Simvastatine"]);
    expect(ids(checkFoodWithMedicines(food(["salt", "chlorure de potassium"]), [med("Triatec", "Ramipril")]))).toEqual(["caution:potassium_salt:Ramipril"]);
    expect(ids(checkFoodWithMedicines(food(["milk powder"], { allergens: { declared: ["milk"] } }), [med("Tetralysal", "Lymecycline")]))).toEqual(["caution:dairy_binding:Lymecycline"]);
  });

  it("keeps a food's alcohol to a precaution and a drink's to a warning", () => {
    expect(ids(checkFoodWithMedicines(food(["cream", "marsala wine"]), [med("Flagyl", "Metronidazole")]))).toEqual(["caution:alcohol_nitroimidazole:Metronidazole"]);
    expect(ids(checkFoodWithMedicines(drink("Red wine", []), [med("Flagyl", "Metronidazole")]))).toEqual(["avoid:alcohol_nitroimidazole:Metronidazole"]);
  });

  it("limits caffeine to the quinolones that block its clearance, and dairy to the ones it binds", () => {
    const cola = drink("Cola", [{ name: "caffeine" }]);
    expect(ids(checkFoodWithMedicines(cola, [med("Ciflox", "Ciprofloxacine")]))).toEqual(["caution:caffeine_quinolone:Ciprofloxacine"]);
    expect(ids(checkFoodWithMedicines(cola, [med("Tavanic", "Levofloxacin")]))).toEqual([]);
    const milk = food(["milk powder"], { allergens: { declared: ["milk"] } });
    expect(ids(checkFoodWithMedicines(milk, [med("Vibramycin", "Doxycycline")]))).toEqual([]);
    expect(ids(checkFoodWithMedicines(milk, [med("Cipro", "Ciprofloxacin")]))).toEqual(["caution:dairy_binding:Ciprofloxacin"]);
  });

  it("does not warn a cream or gel about drinking", () => {
    const gel = { name: "Rozex", medicine: { ...med("Rozex", "Metronidazole").medicine!, form: "gel" } };
    expect(checkFoodWithMedicines(drink("Red wine", []), [gel])).toEqual({ checked: true, findings: [] });
  });

  it("finds nothing for a pair that isn't on the list, and says it checked", () => {
    const r = checkFoodWithMedicines(food(["sugar", "grapefruit"]), [med("Doliprane", "Paracetamol")]);
    expect(r).toEqual({ checked: true, findings: [] });
  });

  it("reports unchecked when no medicine's substance was read", () => {
    expect(checkFoodWithMedicines(food(["rum"]), [])).toEqual({ checked: false, findings: [] });
    const unread = { name: "Box", medicine: null };
    expect(checkFoodWithMedicines(food(["rum"]), [unread]).checked).toBe(false);
  });

  it("finds nothing for a food with no signal", () => {
    expect(checkFoodWithMedicines(food(["rice", "salt"]), [med("Flagyl", "Metronidazole")])).toEqual({ checked: true, findings: [] });
  });
});
