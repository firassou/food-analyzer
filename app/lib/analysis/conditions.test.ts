import { describe, expect, it } from "vitest";
import { checkConditions, CONDITION_RULE_IDS, milligrams } from "./conditions";
import { OFFICIAL } from "./__fixtures__/official";
import { normalize } from "./normalize";
import { EMPTY_PROFILE, type ConditionId, type Profile } from "./profile";
import type { OfficialInfo } from "./types";

const withOfficial = <T extends object>(r: T, official: Partial<OfficialInfo> = {}) => ({ ...r, official: { ...OFFICIAL, ...official } });
const who = (...conditions: ConditionId[]): Profile => ({ ...EMPTY_PROFILE, conditions });
const med = (name: string, active: (string | [string, string])[], extra: { form?: string; ingredients?: string[] } = {}) =>
  normalize({
    kind: "medicine",
    label_detected: true,
    image_quality: "good",
    product: { name },
    ingredients: extra.ingredients ?? [],
    medicine: { form: extra.form ?? null, active: active.map((a) => (typeof a === "string" ? { name: a } : { name: a[0], strength: a[1] })) },
  });
const food = (ingredients: unknown[], extra: object = {}) =>
  normalize({ kind: "label", label_detected: true, image_quality: "good", product: { name: "X" }, ingredients, gluten: { status: "no_indication" }, lactose: { status: "no_indication" }, ...extra });
const drink = (name: string, ingredients: unknown[] = [], extra: object = {}) =>
  normalize({ kind: "drink", label_detected: true, image_quality: "good", product: { name }, ingredients, ...extra });
const water = (minerals: object) => normalize({ kind: "water", label_detected: true, image_quality: "good", product: { name: "Eau minérale" }, water: { minerals } });

/** "status", then "level:condition:rule" for each finding */
const summary = (r: ReturnType<typeof checkConditions>) => r && [r.status, ...r.findings.map((f) => `${f.level}:${f.condition}:${f.ruleId}`)];
const rules = (r: ReturnType<typeof checkConditions>) => r?.findings.map((f) => f.ruleId) ?? [];

describe("checkConditions: when it says anything", () => {
  it("is null with no conditions, so nothing changes for anyone else", () => {
    expect(checkConditions(med("Advil", ["Ibuprofen"]), EMPTY_PROFILE)).toBeNull();
    expect(checkConditions(med("Advil", ["Ibuprofen"]), { ...EMPTY_PROFILE, conditions: [] })).toBeNull();
    // another condition is only looked for in a medicine's official product information
    expect(checkConditions(food(["sugar"]), { ...EMPTY_PROFILE, otherConditions: ["Crohn's disease"] })).toBeNull();
    expect(checkConditions(med("Advil", ["Ibuprofen"]), { ...EMPTY_PROFILE, otherConditions: ["Crohn's disease"] })?.status).toBe("unchecked");
  });

  it("leaves coeliac disease to the gluten check", () => {
    expect(checkConditions(food(["wheat flour"], { allergens: { declared: ["gluten"] } }), who("coeliac"))).toBeNull();
  });

  it("is null for a photo of something else", () => {
    expect(checkConditions(normalize({}), who("hemophilia"))).toBeNull();
  });

  it("won't say 'nothing found' when the substance or the ingredients weren't read", () => {
    expect(summary(checkConditions(med("Boîte", []), who("hemophilia")))).toEqual(["unchecked"]);
    expect(summary(checkConditions(normalize({ kind: "label", label_detected: true, product: { name: "Choco" } }), who("diabetes")))).toEqual(["unchecked"]);
    expect(summary(checkConditions(normalize({ kind: "water", label_detected: true, product: { name: "Eau" } }), who("hypertension")))).toEqual(["unchecked"]);
  });

  it("every rule id is unique", () => {
    expect(new Set(CONDITION_RULE_IDS).size).toBe(CONDITION_RULE_IDS.length);
  });
});

describe("hemophilia and other bleeding disorders", () => {
  const h = who("hemophilia");

  it("avoid: an ibuprofen box, in English or French, or by its brand", () => {
    expect(summary(checkConditions(med("Advil", ["Ibuprofen"]), h))).toEqual(["avoid", "avoid:hemophilia:bleeding_nsaid"]);
    expect(summary(checkConditions(med("Nurofen", ["Ibuprofène"], { form: "comprimé pelliculé" }), h))).toEqual(["avoid", "avoid:hemophilia:bleeding_nsaid"]);
    expect(checkConditions(med("Advil", ["Ibuprofen"]), h)!.findings[0].because).toEqual(["Ibuprofen"]);
  });

  it("avoid: aspirin, an anticoagulant or an antiplatelet", () => {
    expect(rules(checkConditions(med("Aspirine du Rhône", ["Acide acétylsalicylique"]), h))).toEqual(["bleeding_nsaid"]);
    expect(rules(checkConditions(med("Kardegic", [["Aspirine", "75 mg"]]), h))).toEqual(["bleeding_nsaid"]);
    expect(summary(checkConditions(med("Plavix", ["Clopidogrel"]), h))).toEqual(["avoid", "avoid:hemophilia:bleeding_anticoagulant"]);
    expect(rules(checkConditions(med("Eliquis", ["Apixaban"]), h))).toEqual(["bleeding_anticoagulant"]);
    expect(rules(checkConditions(med("Brilique", ["Ticagrelor"]), h))).toEqual(["bleeding_anticoagulant"]);
  });

  it("nothing for paracetamol, once its official product information was read", () => {
    expect(summary(checkConditions(withOfficial(med("Doliprane", ["Paracétamol"])), h))).toEqual(["ok"]);
    // without it, nothing can be said
    expect(summary(checkConditions(med("Doliprane", ["Paracétamol"]), h))).toEqual(["unchecked"]);
  });

  it("not for a gel rubbed on the skin", () => {
    expect(summary(checkConditions(withOfficial(med("Voltarene", ["Diclofénac"], { form: "gel" })), h))).toEqual(["ok"]);
  });

  it("check: an SSRI or SNRI, an intramuscular injection, and some supplements", () => {
    expect(summary(checkConditions(med("Prozac", ["Fluoxetine"]), h))).toEqual(["check", "check:hemophilia:bleeding_ssri"]);
    expect(rules(checkConditions(med("Effexor", ["Venlafaxine"]), h))).toEqual(["bleeding_ssri"]);
    expect(rules(checkConditions(med("Vaccin", ["Hepatitis B antigen"], { form: "suspension injectable intramusculaire" }), h))).toEqual(["bleeding_injection"]);
    expect(rules(checkConditions(med("Omacor", ["Omega-3-acid ethyl esters"]), h))).toEqual(["bleeding_supplement"]);
    expect(rules(checkConditions(med("Tanakan", ["Ginkgo biloba extract"]), h))).toEqual(["bleeding_supplement"]);
    expect(rules(checkConditions(med("Toco", [["Vitamin E", "500 mg"]]), h))).toEqual(["bleeding_supplement"]);
  });

  it("not for an ordinary dose of vitamin E, nor for garlic or fish oil in a food", () => {
    expect(rules(checkConditions(med("Multi", [["Vitamin E", "12 mg"]]), h))).toEqual([]);
    expect(rules(checkConditions(food(["tomatoes", "garlic", "olive oil"]), h))).toEqual([]);
    expect(rules(checkConditions(food(["sardines", "fish oil", "salt"]), h))).toEqual([]);
    expect(rules(checkConditions(food(["fish oil", "gelatin"], { product: { name: "Omega 3 food supplement" } }), h))).toEqual(["bleeding_supplement"]);
  });

  it("does not mistake an 'aspirin-free' claim or a statin salt for one", () => {
    expect(rules(checkConditions(med("Lipitor", ["Atorvastatin calcium"]), h))).toEqual([]);
    expect(rules(checkConditions(med("Dafalgan", ["Paracetamol"], { ingredients: ["aspirin-free"] }), h))).toEqual([]);
  });
});

describe("diabetes", () => {
  const d = who("diabetes");

  it("check: a cola with a lot of sugar in the can", () => {
    const cola = drink("Cola", ["water", "sugar", "caffeine"], { product: { name: "Cola", quantity: "330 ml" }, nutrition: { basis: "100ml", per_100: { sugars_g: 10.6 } } });
    expect(cola.drink?.sugar_per_container_g).toBeGreaterThan(25);
    expect(summary(checkConditions(cola, d))).toEqual(["check", "check:diabetes:diabetes_sugar_drink"]);
  });

  it("check: a food high in sugars, not a food low in them", () => {
    const jam = food(["sugar", "strawberries"], { nutrition: { basis: "100g", per_100: { sugars_g: 55 } } });
    expect(summary(checkConditions(jam, d))).toEqual(["check", "check:diabetes:diabetes_sugar_food"]);
    const crackers = food(["wheat flour", "salt"], { nutrition: { basis: "100g", per_100: { sugars_g: 2 } } });
    expect(summary(checkConditions(crackers, d))).toEqual(["ok"]);
  });

  it("check: sucrose in a syrup, not in a coated tablet", () => {
    expect(rules(checkConditions(med("Toplexil", ["Oxomemazine"], { form: "sirop", ingredients: ["saccharose", "eau"] }), d))).toEqual(["diabetes_sugar_excipient"]);
    expect(rules(checkConditions(med("X", ["Loratadine"], { form: "comprimé enrobé", ingredients: ["saccharose", "talc"] }), d))).toEqual([]);
  });

  it("check: a corticosteroid taken by mouth, not a cream or an inhaler", () => {
    expect(rules(checkConditions(med("Solupred", ["Prednisolone"]), d))).toEqual(["diabetes_corticosteroid"]);
    expect(rules(checkConditions(med("Hydrocortisone cream", ["Hydrocortisone acetate"], { form: "cream" }), d))).toEqual([]);
    expect(rules(checkConditions(med("Pulmicort", ["Budesonide"], { form: "suspension pour inhalation" }), d))).toEqual([]);
  });
});

describe("high blood pressure", () => {
  const bp = who("hypertension");

  it("check: an effervescent paracetamol (sodium)", () => {
    expect(summary(checkConditions(med("Doliprane 1000 mg", ["Paracétamol"], { form: "comprimé effervescent" }), bp))).toEqual(["check", "check:hypertension:bp_sodium_tablet"]);
  });

  it("check: a high-sodium water, not a low one", () => {
    expect(summary(checkConditions(water({ sodium: 1200, calcium: 100 }), bp))).toEqual(["check", "check:hypertension:bp_sodium_water"]);
    expect(checkConditions(water({ sodium: 1200 }), bp)!.findings[0].because).toEqual(["1200 mg/L"]);
    expect(summary(checkConditions(water({ sodium: 5, calcium: 80 }), bp))).toEqual(["ok"]);
  });

  it("check: an NSAID and a decongestant", () => {
    expect(rules(checkConditions(med("Advil", ["Ibuprofen"]), bp))).toEqual(["bp_nsaid"]);
    expect(rules(checkConditions(med("Humex rhume", ["Paracétamol", "Pseudoéphédrine"]), bp))).toEqual(["bp_decongestant"]);
    expect(rules(checkConditions(med("Otrivin", ["Xylometazoline hydrochloride"], { form: "nasal spray" }), bp))).toEqual(["bp_decongestant"]);
  });

  it("check: salty food, liquorice and an energy drink", () => {
    const crisps = food(["potatoes", "sunflower oil", "salt"], { nutrition: { basis: "100g", per_100: { salt_g: 2.1 } } });
    expect(rules(checkConditions(crisps, bp))).toEqual(["bp_salt"]);
    expect(rules(checkConditions(food(["sugar", "extrait de réglisse", "gélatine"]), bp))).toEqual(["bp_liquorice"]);
    expect(rules(checkConditions(food(["sugar", "arôme réglisse"]), bp))).toEqual([]);
    expect(rules(checkConditions(drink("Monster Energy", ["water", "sugar", "caffeine", "taurine"], { product: { name: "Monster", category: "Energy drink" } }), bp))).toEqual(["bp_caffeine"]);
    expect(rules(checkConditions(drink("Cola", ["water", "sugar", "caffeine"]), bp))).toEqual([]);
  });
});

describe("kidney disease, stomach ulcer, asthma, liver disease", () => {
  it("kidney: avoid an NSAID, check potassium", () => {
    expect(summary(checkConditions(med("Advil", ["Ibuprofen"]), who("kidney_disease")))).toEqual(["avoid", "avoid:kidney_disease:kidney_nsaid"]);
    expect(rules(checkConditions(med("Aldactone", ["Spironolactone"]), who("kidney_disease")))).toEqual(["kidney_potassium"]);
    expect(rules(checkConditions(food(["potassium chloride", "sodium chloride"]), who("kidney_disease")))).toEqual(["kidney_potassium_salt"]);
    expect(rules(checkConditions(food(["sugar", "potassium sorbate"]), who("kidney_disease")))).toEqual([]);
  });

  it("stomach ulcer: avoid aspirin, check a corticosteroid and a drink of alcohol", () => {
    expect(rules(checkConditions(med("Aspirine du Rhône", ["Aspirine"]), who("stomach_ulcer")))).toEqual(["ulcer_nsaid"]);
    expect(rules(checkConditions(med("Cortancyl", ["Prednisone"]), who("stomach_ulcer")))).toEqual(["ulcer_corticosteroid"]);
    expect(rules(checkConditions(drink("Red wine", []), who("stomach_ulcer")))).toEqual(["ulcer_alcohol"]);
    expect(rules(checkConditions(drink("Bière sans alcool", []), who("stomach_ulcer")))).toEqual([]);
  });

  it("asthma: check an NSAID, avoid a non-selective beta-blocker, eye drops included", () => {
    expect(summary(checkConditions(med("Advil", ["Ibuprofen"]), who("asthma")))).toEqual(["check", "check:asthma:asthma_nsaid"]);
    expect(rules(checkConditions(med("Avlocardyl", ["Propranolol"]), who("asthma")))).toEqual(["asthma_beta_blocker"]);
    expect(rules(checkConditions(med("Timoptol", ["Timolol"], { form: "collyre" }), who("asthma")))).toEqual(["asthma_beta_blocker"]);
    expect(rules(checkConditions(med("Tenormin", ["Atenolol"]), who("asthma")))).toEqual([]);
  });

  it("liver: check paracetamol and alcohol", () => {
    expect(summary(checkConditions(med("Doliprane", ["Paracétamol"]), who("liver_disease")))).toEqual(["check", "check:liver_disease:liver_paracetamol"]);
    expect(rules(checkConditions(food(["cream", "rum"]), who("liver_disease")))).toEqual(["liver_alcohol"]);
  });
});

describe("G6PD deficiency", () => {
  const g = who("g6pd_deficiency");

  it("avoid: fava beans, in any language, and the known drugs", () => {
    expect(summary(checkConditions(food(["fèves", "huile d'olive", "cumin"]), g))).toEqual(["avoid", "avoid:g6pd_deficiency:g6pd_fava"]);
    expect(rules(checkConditions(food(["فول مدمس", "ملح"]), g))).toEqual(["g6pd_fava"]);
    expect(rules(checkConditions(food(["broad beans", "water"]), g))).toEqual(["g6pd_fava"]);
    expect(rules(checkConditions(med("Furadantine", ["Nitrofurantoïne"]), g))).toEqual(["g6pd_drug"]);
    expect(rules(checkConditions(med("Disulone", ["Dapsone"]), g))).toEqual(["g6pd_drug"]);
  });

  it("does not take peanuts, soy, cocoa beans or folic acid for fava", () => {
    expect(rules(checkConditions(food(["فول سوداني", "ملح"]), g))).toEqual([]);
    expect(rules(checkConditions(food(["فول الصويا"]), g))).toEqual([]);
    expect(rules(checkConditions(food(["sucre", "fèves de cacao", "beurre de cacao"]), g))).toEqual([]);
    expect(rules(checkConditions(food(["دقيق", "حمض الفوليك"]), g))).toEqual([]);
  });

  it("check: aspirin at a pain-relief strength, not at a low one", () => {
    expect(rules(checkConditions(med("Aspirine du Rhône", [["Aspirine", "500 mg"]]), g))).toEqual(["g6pd_aspirin"]);
    expect(rules(checkConditions(med("Kardegic", [["Aspirine", "75 mg"]]), g))).toEqual([]);
  });

  it("caps a guessed dish at check", () => {
    const ful = normalize({ kind: "dish", label_detected: true, product: { name: "Ful medames" }, estimated_ingredients: [{ name: "fava beans", confidence: "high" }] });
    expect(ful.ingredient_source).toBe("estimated");
    expect(summary(checkConditions(ful, g))).toEqual(["check", "check:g6pd_deficiency:g6pd_fava"]);
  });
});

describe("pregnancy", () => {
  const p = who("pregnancy");

  it("avoid: an NSAID, even a gel, and the known harmful medicines", () => {
    expect(rules(checkConditions(med("Advil", ["Ibuprofen"]), p))).toEqual(["pregnancy_nsaid"]);
    expect(rules(checkConditions(med("Ketum", ["Kétoprofène"], { form: "gel" }), p))).toEqual(["pregnancy_nsaid"]);
    expect(rules(checkConditions(med("Curacne", ["Isotrétinoïne"]), p))).toEqual(["pregnancy_drug"]);
    expect(rules(checkConditions(med("Coumadine", ["Warfarine"]), p))).toEqual(["pregnancy_drug"]);
    expect(rules(checkConditions(med("Coversyl", ["Périndopril arginine"]), p))).toEqual(["pregnancy_drug"]);
    expect(rules(checkConditions(med("Dépakine", ["Valproate de sodium"]), p))).toEqual(["pregnancy_drug"]);
  });

  it("check, not avoid, for low-dose aspirin, which is prescribed in pregnancy", () => {
    expect(summary(checkConditions(med("Kardegic", [["Aspirine", "75 mg"]]), p))).toEqual(["check", "check:pregnancy:pregnancy_low_aspirin"]);
    expect(rules(checkConditions(med("Aspirine du Rhône", [["Aspirine", "500 mg"]]), p))).toEqual(["pregnancy_nsaid"]);
  });

  it("check: alcohol, an energy drink and liquorice", () => {
    expect(rules(checkConditions(drink("Cidre brut", []), p))).toEqual(["pregnancy_alcohol"]);
    expect(rules(checkConditions(drink("Red Bull", ["water", "sugar", "caffeine"], { claims: ["High caffeine content"] }), p))).toEqual(["pregnancy_caffeine"]);
    expect(rules(checkConditions(food(["sugar", "liquorice extract"]), p))).toEqual(["pregnancy_liquorice"]);
  });
});

describe("several conditions", () => {
  it("lists every condition's findings, avoid first", () => {
    expect(summary(checkConditions(med("Advil", ["Ibuprofen"]), who("hypertension", "hemophilia", "asthma")))).toEqual([
      "avoid",
      "avoid:hemophilia:bleeding_nsaid",
      "check:hypertension:bp_nsaid",
      "check:asthma:asthma_nsaid",
    ]);
  });
});

describe("milligrams", () => {
  it("reads a strength in mg or g, in any decimal style", () => {
    expect(milligrams("500 mg")).toBe(500);
    expect(milligrams("0,5 g")).toBe(500);
    expect(milligrams("1 g")).toBe(1000);
    expect(milligrams("75mg")).toBe(75);
    expect(milligrams("400 IU")).toBeNull();
    expect(milligrams(null)).toBeNull();
  });

  it("reads thousands separators as thousands, not as a decimal point", () => {
    expect(milligrams("1 000 mg")).toBe(1000);
    expect(milligrams("1\u202f000 mg")).toBe(1000);
    expect(milligrams("1,000 mg")).toBe(1000);
    expect(milligrams("1.000 mg")).toBe(1000);
    expect(milligrams("2,5 g")).toBe(2500);
    expect(milligrams("0,500 g")).toBe(500);
    expect(milligrams("2,500 g")).toBe(2500);
  });
});

describe("found by the safety review", () => {
  it("aspirin 1 000 mg is not taken for low-dose aspirin in pregnancy, and is asked about in G6PD", () => {
    expect(rules(checkConditions(med("Aspirine", [["Acide acétylsalicylique", "1 000 mg"]]), who("pregnancy")))).toEqual(["pregnancy_nsaid"]);
    expect(rules(checkConditions(med("Aspirin", [["Aspirin", "1,000 mg"]]), who("g6pd_deficiency")))).toEqual(["g6pd_aspirin"]);
    // a strength that wasn't read is asked about, not passed
    expect(rules(checkConditions(med("Aspirin", ["Aspirin"]), who("g6pd_deficiency")))).toEqual(["g6pd_aspirin"]);
    expect(rules(checkConditions(med("Kardegic", [["Acetylsalicylate de lysine", "75 mg"]]), who("g6pd_deficiency")))).toEqual([]);
  });

  it("G6PD: quinolones and sulfonamides, from the same BNF list", () => {
    const g = who("g6pd_deficiency");
    expect(rules(checkConditions(med("Bactrim", ["Sulfamethoxazole", "Trimethoprim"]), g))).toEqual(["g6pd_drug"]);
    expect(rules(checkConditions(med("Ciflox", ["Ciprofloxacine"]), g))).toEqual(["g6pd_drug"]);
    expect(rules(checkConditions(med("Salazopyrine", ["Sulfasalazine"]), g))).toEqual(["g6pd_drug"]);
  });

  it("diabetes: a soft drink whose volume wasn't read is still asked about", () => {
    const d = who("diabetes");
    const cola = drink("Cola", ["water", "sugar"], { nutrition: { basis: "100ml", per_100: { sugars_g: 10.6 } } });
    expect(summary(checkConditions(cola, d))).toEqual(["check", "check:diabetes:diabetes_sugary_drink"]);
    const lightlySweet = drink("Eau aromatisée", ["water", "sugar"], { nutrition: { basis: "100ml", per_100: { sugars_g: 2 } } });
    expect(rules(checkConditions(lightlySweet, d))).toEqual([]);
  });

  it("alcohol in a medicine, for liver disease and pregnancy; not benzyl alcohol, not in a cream", () => {
    const syrup = med("Sirop", ["Codeine"], { form: "sirop", ingredients: ["éthanol 96%", "saccharose"] });
    expect(rules(checkConditions(syrup, who("liver_disease")))).toEqual(["liver_alcohol_medicine"]);
    expect(rules(checkConditions(syrup, who("pregnancy")))).toEqual(["pregnancy_alcohol_medicine"]);
    expect(rules(checkConditions(med("X", ["Paracetamol"], { form: "solution injectable", ingredients: ["alcool benzylique"] }), who("pregnancy")))).toEqual([]);
    expect(rules(checkConditions(med("Gel", ["Diclofenac"], { form: "gel", ingredients: ["ethanol"] }), who("liver_disease")))).toEqual([]);
  });

  it("asthma: beta-blocker eye drops (carteolol)", () => {
    expect(summary(checkConditions(med("Carteol", ["Cartéolol chlorhydrate"], { form: "collyre" }), who("asthma")))).toEqual(["avoid", "avoid:asthma:asthma_beta_blocker"]);
  });

  it("pregnancy: mycophenolate, misoprostol, topiramate, doxycycline and lithium", () => {
    const p = who("pregnancy");
    for (const s of ["Mycophénolate mofétil", "Misoprostol", "Topiramate", "Doxycycline", "Lithium carbonate"])
      expect(rules(checkConditions(med("X", [s]), p)), s).toEqual(["pregnancy_drug"]);
  });

  it("kidney disease: methotrexate", () => {
    expect(summary(checkConditions(med("Novatrex", ["Méthotrexate"]), who("kidney_disease")))).toEqual(["avoid", "avoid:kidney_disease:kidney_methotrexate"]);
  });

  it("an NSAID throat spray is taken like a tablet", () => {
    expect(rules(checkConditions(med("Strefen", ["Flurbiprofen"], { form: "oral spray" }), who("stomach_ulcer")))).toEqual(["ulcer_nsaid"]);
    expect(rules(checkConditions(med("X", ["Ketoprofen"], { form: "gel" }), who("stomach_ulcer")))).toEqual([]);
  });

  it("liquorice flavouring is not liquorice, in English too", () => {
    expect(rules(checkConditions(food(["sugar", "liquorice flavouring"]), who("hypertension")))).toEqual([]);
    expect(rules(checkConditions(food(["sugar", "liquorice extract"]), who("hypertension")))).toEqual(["bp_liquorice"]);
  });
});
