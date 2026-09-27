import { describe, expect, it } from "vitest";
import {
  additiveCategory,
  additiveName,
  canonicalENumber,
  codeForName,
  detectAllergens,
  findENumbers,
  fold,
  glutenSignal,
  isDairy,
  isDrink,
  isNutrientFortificant,
  LEVEL_THRESHOLDS,
  levelOf,
  mayContainStatements,
  mentionsGlutenFree,
  mentionsLactoseFree,
} from "./knowledge";
import type { AllergenId } from "./types";

const has = (text: string, id: AllergenId) => detectAllergens(text).includes(id);

describe("fold", () => {
  it("lowercases and strips Latin accents and ligatures", () => {
    expect(fold("Œufs, Crème, Blé, Weißmehl, Æble")).toBe("oeufs, creme, ble, weissmehl, aeble");
  });
  it("leaves Arabic letters intact (hamza is recomposed)", () => {
    expect(fold("سكر أبيض")).toBe("سكر أبيض");
    expect(fold("آثار")).toBe("آثار");
  });
});

// Each allergen: a positive match, a false friend that must not match, a non-English form.
describe("allergen rules", () => {
  it("gluten", () => {
    expect(has("wheat flour", "gluten")).toBe(true);
    expect(has("buckwheat flour", "gluten")).toBe(false);
    expect(has("farine de sarrasin", "gluten")).toBe(false);
    expect(has("gluten free oats", "gluten")).toBe(true); // the oats still count
    expect(has("gluten free", "gluten")).toBe(false);
    expect(has("farine de blé", "gluten")).toBe(true);
    expect(has("Weizenmehl", "gluten")).toBe(true); // German compound
    expect(has("Buchweizenmehl", "gluten")).toBe(false);
    expect(has("دقيق القمح", "gluten")).toBe(true);
    expect(has("maltodextrin", "gluten")).toBe(false);
  });

  it("milk", () => {
    expect(has("skimmed milk powder", "milk")).toBe(true);
    expect(has("cocoa butter", "milk")).toBe(false);
    expect(has("coconut milk", "milk")).toBe(false);
    expect(has("peanut butter", "milk")).toBe(false);
    expect(has("cream of tartar", "milk")).toBe(false);
    expect(has("butternut squash", "milk")).toBe(false);
    expect(has("bean curd", "milk")).toBe(false);
    expect(has("lait écrémé", "milk")).toBe(true);
    expect(has("beurre de cacao", "milk")).toBe(false);
    expect(has("حليب مجفف", "milk")).toBe(true);
    expect(has("Vollmilchschokolade", "milk")).toBe(true);
    expect(has("Milchschokolade", "milk")).toBe(true);
    expect(has("Kakaobutter", "milk")).toBe(false);
    expect(has("صنع في لبنان", "milk")).toBe(false);
  });

  it("eggs", () => {
    expect(has("free range eggs", "eggs")).toBe(true);
    expect(has("eggplant", "eggs")).toBe(false);
    expect(has("œufs frais", "eggs")).toBe(true);
    expect(has("بيض", "eggs")).toBe(true);
    expect(has("سكر أبيض", "eggs")).toBe(false);
    expect(has("شوكولاتة بيضاء", "eggs")).toBe(false);
  });

  it("peanuts", () => {
    expect(has("roasted peanuts", "peanuts")).toBe(true);
    expect(has("pea protein", "peanuts")).toBe(false);
    expect(has("Erdnüsse", "peanuts")).toBe(true);
    expect(has("الفول السوداني", "peanuts")).toBe(true);
  });

  it("tree nuts", () => {
    expect(has("hazelnuts", "tree_nuts")).toBe(true);
    for (const f of ["coconut", "nutmeg", "doughnut", "nutrition information", "peanut", "ground nut", "chestnut", "noix de coco"])
      expect(has(f, "tree_nuts"), f).toBe(false);
    expect(has("noisettes", "tree_nuts")).toBe(true);
    expect(has("fruits à coque", "tree_nuts")).toBe(true);
    expect(has("لوز", "tree_nuts")).toBe(true);
    expect(has("جوز الهند", "tree_nuts")).toBe(false);
  });

  it("soy, sesame, fish, crustaceans, molluscs", () => {
    expect(has("soy lecithin", "soy")).toBe(true);
    expect(has("soja", "soy")).toBe(true);
    expect(has("Sojalecithin", "soy")).toBe(true);
    expect(has("sesame seeds", "sesame")).toBe(true);
    expect(has("سمسم", "sesame")).toBe(true);
    expect(has("anchovies", "fish")).toBe(true);
    expect(has("thon", "fish")).toBe(true);
    expect(has("marathon", "fish")).toBe(false);
    expect(has("prawns", "crustaceans")).toBe(true);
    expect(has("crevettes", "crustaceans")).toBe(true);
    expect(has("mussels", "molluscs")).toBe(true);
    expect(has("calamares", "molluscs")).toBe(true);
  });

  it("celery, mustard, sulphites, lupin", () => {
    expect(has("celery", "celery")).toBe(true);
    expect(has("céleri", "celery")).toBe(true);
    expect(has("mustard seeds", "mustard")).toBe(true);
    expect(has("Senf", "mustard")).toBe(true);
    expect(has("sodium metabisulphite", "sulphites")).toBe(true);
    expect(has("preservative (E223)", "sulphites")).toBe(true);
    expect(has("E-224", "sulphites")).toBe(true);
    expect(has("E2230", "sulphites")).toBe(false);
    expect(has("E229", "sulphites")).toBe(false);
    expect(has("anhydride sulfureux", "sulphites")).toBe(true);
    expect(has("lupin flour", "lupin")).toBe(true);
    expect(has("altramuces", "lupin")).toBe(true);
  });
});

describe("gluten, dairy and free-from helpers", () => {
  it("glutenSignal separates strong sources from oats", () => {
    expect(glutenSignal("wheat flour")).toBe("strong");
    expect(glutenSignal("whole grain oats")).toBe("oats");
    expect(glutenSignal("flocons d'avoine")).toBe("oats");
    expect(glutenSignal("oats, barley malt")).toBe("strong");
    expect(glutenSignal("buckwheat")).toBeNull();
    expect(glutenSignal("rice")).toBeNull();
    expect(glutenSignal("شوفان")).toBe("oats");
    expect(glutenSignal("Haferflocken")).toBe("oats");
    expect(glutenSignal("Dinkelmehl")).toBe("strong");
  });

  it("isDairy", () => {
    expect(isDairy("butter")).toBe(true);
    expect(isDairy("cocoa butter")).toBe(false);
    expect(isDairy("Sahne")).toBe(true);
  });

  it("detects free-from claims in several languages", () => {
    expect(mentionsGlutenFree("Gluten-free")).toBe(true);
    expect(mentionsGlutenFree("Sans gluten")).toBe(true);
    expect(mentionsGlutenFree("خالي من الغلوتين")).toBe(true);
    expect(mentionsGlutenFree("contains gluten")).toBe(false);
    expect(mentionsLactoseFree("laktosefrei")).toBe(true);
    expect(mentionsLactoseFree("sin lactosa")).toBe(true);
    expect(mentionsLactoseFree("lactose")).toBe(false);
  });
});

describe("isDrink", () => {
  it("recognises drinks but not foods named after them", () => {
    expect(isDrink("Soft drink")).toBe(true);
    expect(isDrink("Jus d'orange")).toBe(true);
    expect(isDrink("عصير برتقال")).toBe(true);
    expect(isDrink("Rich tea biscuits")).toBe(false);
    expect(isDrink("Water crackers")).toBe(false);
    expect(isDrink("Biscuits")).toBe(false);
  });
});

describe("isDrink with explicit drink words", () => {
  it("lets drink, milkshake and boisson win over food words like chocolate", () => {
    expect(isDrink("Hot chocolate drink")).toBe(true);
    expect(isDrink("Chocolate milkshake")).toBe(true);
    expect(isDrink("Boisson chocolatée au lait")).toBe(true);
    expect(isDrink("Milk chocolate bar")).toBe(false);
  });
});

describe("E-numbers", () => {
  it("canonicalises spacing, dashes, INS and roman suffixes", () => {
    expect(canonicalENumber("E 500 (ii)")).toBe("E500ii");
    expect(canonicalENumber("e500ii")).toBe("E500ii");
    expect(canonicalENumber("INS 330")).toBe("E330");
    expect(canonicalENumber("E-150d")).toBe("E150d");
    expect(canonicalENumber("E150D")).toBe("E150d");
    expect(canonicalENumber("E 471")).toBe("E471");
    expect(canonicalENumber("E1422")).toBe("E1422");
  });

  it("rejects codes outside E100–E1599 and non-codes", () => {
    expect(canonicalENumber("E99")).toBeNull();
    expect(canonicalENumber("E1600")).toBeNull();
    expect(canonicalENumber("vitamine 500")).toBeNull();
    expect(canonicalENumber("")).toBeNull();
  });

  it("finds every printed code once", () => {
    expect(findENumbers("raising agent: E 500 (ii), acid (INS 330), colour E150d, E500ii again")).toEqual([
      "E500ii",
      "E330",
      "E150d",
    ]);
    expect(findENumbers("E471 vegetable fat")).toEqual(["E471"]);
  });

  it("names codes, falling back from roman suffixes but not from letters", () => {
    expect(additiveName("E150d")).toBe("Sulphite ammonia caramel");
    expect(additiveName("E500ii")).toBe("Sodium bicarbonate");
    expect(additiveName("E500i")).toBe("Sodium carbonates");
    expect(additiveName("E450iii")).toBe("Diphosphates");
    expect(additiveName("E150")).toBeNull();
    expect(additiveName("E999")).toBeNull();
  });

  it("categorises by number range", () => {
    expect(additiveCategory("E110")).toBe("Colour");
    expect(additiveCategory("E202")).toBe("Preservative");
    expect(additiveCategory("E330")).toBe("Antioxidant / acidity regulator");
    expect(additiveCategory("E471")).toBe("Thickener, stabiliser or emulsifier");
    expect(additiveCategory("E500ii")).toBe("Acidity regulator / anti-caking agent");
    expect(additiveCategory("E621")).toBe("Flavour enhancer");
    expect(additiveCategory("E951")).toBe("Glazing agent, gas or sweetener");
    expect(additiveCategory("E1422")).toBe("Modified starch");
    expect(additiveCategory("E1520")).toBe("Other additive");
  });
});

describe("codeForName", () => {
  it("maps named additives to codes (EN and FR)", () => {
    expect(codeForName("sodium bicarbonate")).toBe("E500ii");
    expect(codeForName("bicarbonate de sodium")).toBe("E500ii");
    expect(codeForName("soy lecithin")).toBe("E322");
    expect(codeForName("acide citrique")).toBe("E330");
    expect(codeForName("Citric acid")).toBe("E330");
    expect(codeForName("carbonates de sodium")).toBe("E500");
    expect(codeForName("diphosphates")).toBe("E450");
    expect(codeForName("potassium sorbate")).toBe("E202");
  });

  it("returns null for ambiguous additives and undefined for plain foods", () => {
    expect(codeForName("modified corn starch")).toBeNull();
    expect(codeForName("amidon modifié")).toBeNull();
    expect(codeForName("caramel color")).toBeNull();
    expect(codeForName("sugar")).toBeUndefined();
    expect(codeForName("wheat flour")).toBeUndefined();
    expect(codeForName("carminative herbs")).toBeUndefined();
  });
});

describe("isNutrientFortificant", () => {
  it("flags vitamins and minerals, not additives", () => {
    expect(isNutrientFortificant("Reduced iron")).toBe(true);
    expect(isNutrientFortificant("Vitamin B12")).toBe(true);
    expect(isNutrientFortificant("vitamine C")).toBe(true);
    expect(isNutrientFortificant("Folic acid")).toBe(true);
    expect(isNutrientFortificant("Thiamin mononitrate")).toBe(true);
    expect(isNutrientFortificant("Citric acid")).toBe(false);
    expect(isNutrientFortificant("Iron oxides")).toBe(false);
  });
});

describe("FSA levels", () => {
  it("uses ≤ low and > high boundaries", () => {
    const sugars = LEVEL_THRESHOLDS["100g"].sugars;
    expect(levelOf(5, sugars)).toBe("low");
    expect(levelOf(5.1, sugars)).toBe("medium");
    expect(levelOf(22.5, sugars)).toBe("medium");
    expect(levelOf(22.6, sugars)).toBe("high");
    expect(levelOf(null, sugars)).toBeNull();
    expect(levelOf(Number.NaN, sugars)).toBeNull();
  });
  it("has halved drink thresholds (salt excepted at the low end)", () => {
    expect(LEVEL_THRESHOLDS["100ml"].sugars).toEqual({ low: 2.5, high: 11.25 });
    expect(LEVEL_THRESHOLDS["100ml"].salt).toEqual({ low: 0.3, high: 0.75 });
  });
});

describe("mayContainStatements", () => {
  it("extracts precautionary sentences in several languages", () => {
    expect(mayContainStatements("Ingredients: flour. May contain milk and peanuts. Store dry.")).toEqual([
      "may contain milk and peanuts",
    ]);
    expect(mayContainStatements("Peut contenir des traces de fruits à coque.")).toEqual([
      "peut contenir des traces de fruits a coque",
    ]);
    expect(mayContainStatements("Kann Spuren von Sesam enthalten.")).toHaveLength(1);
    expect(mayContainStatements("Puede contener trazas de soja.")).toHaveLength(1);
    expect(mayContainStatements("قد يحتوي على آثار من الفول السوداني")).toHaveLength(1);
  });
  it("finds nothing in a plain ingredient list", () => {
    expect(mayContainStatements("Ingredients: wheat flour, sugar, milk.")).toEqual([]);
  });
});
