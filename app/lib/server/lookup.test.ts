import { afterEach, describe, expect, it, vi } from "vitest";
import { normalize } from "../analysis/normalize";
import { completeFromDatabase, distance, findProduct, fromDatabase, lookupEnabled, needsLookup, parseProduct } from "./lookup";

const ENTRY = {
  code: "3017620422003",
  product_name: "Nutella",
  brands: "Nutella, Ferrero",
  quantity: "400 g",
  lang: "fr",
  ingredients_text: "Sucre, huile de palme, _NOISETTES_ 13%, _LAIT_ écrémé en poudre 8,7%, cacao maigre, émulsifiants: lécithines (_SOJA_), vanilline.",
  ingredients_text_en: "Sugar, palm oil, hazelnuts 13%, skimmed milk powder 8.7%, fat-reduced cocoa, emulsifier: lecithins (soya), vanillin.",
  allergens_tags: ["en:milk", "en:nuts", "en:soybeans", "en:unknown-thing"],
  traces_tags: ["en:gluten"],
  nutriments: { "energy-kcal_100g": 539, fat_100g: 30.9, "saturated-fat_100g": 10.6, carbohydrates_100g: 57.5, sugars_100g: 56.3, proteins_100g: 6.3, salt_100g: 0.107 },
};

const respond = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
const signal = () => new AbortController().signal;

afterEach(() => vi.unstubAllGlobals());

describe("parseProduct", () => {
  it("prefers the reader's language, then English", () => {
    expect(parseProduct(ENTRY, "fr")?.ingredients).toMatch(/^Sucre, huile de palme, NOISETTES/);
    expect(parseProduct(ENTRY, "ar")?.ingredients).toMatch(/^Sugar, palm oil/);
  });
  it("maps allergen tags and nutriments, and ignores entries without ingredients", () => {
    const p = parseProduct(ENTRY, "en")!;
    expect(p.allergens).toEqual(["milk", "tree_nuts", "soy"]);
    expect(p.traces).toEqual(["gluten"]);
    expect(p.brand).toBe("Nutella");
    expect(p.nutrients).toMatchObject({ energy_kcal: 539, sugars_g: 56.3, protein_g: 6.3 });
    expect(p.url).toBe("https://world.openfoodfacts.org/product/3017620422003");
    expect(parseProduct({ ...ENTRY, ingredients_text: "", ingredients_text_en: null }, "en")).toBeNull();
    expect(parseProduct(null, "en")).toBeNull();
  });
});

describe("distance", () => {
  const candidate = parseProduct(ENTRY, "en")!;
  it("needs every word of the name, and an agreeing brand", () => {
    expect(distance({ name: "Nutella", brand: "Ferrero" }, candidate)).toBe(0);
    expect(distance({ name: "Nutella", brand: null }, candidate)).toBe(0);
    expect(distance({ name: "Nutella B-ready", brand: "Ferrero" }, candidate)).toBeNull();
    expect(distance({ name: "Nutella", brand: "Carrefour" }, candidate)).toBeNull();
    expect(distance({ name: null, brand: "Ferrero" }, candidate)).toBeNull();
  });
  it("counts the words the entry adds, and rejects a much longer name", () => {
    expect(distance({ name: "Nutella", brand: null }, { ...candidate, name: "Nutella B-ready" })).toBe(1);
    expect(distance({ name: "Nutella", brand: null }, { ...candidate, name: "Nutella biscuits chocolate hazelnut" })).toBeNull();
  });
});

describe("needsLookup", () => {
  it("only for a recognised packaged product without a read ingredient list", () => {
    expect(needsLookup(normalize({ label_detected: true, product: { name: "Nutella" } }))).toBe(true);
    expect(needsLookup(normalize({ product: { name: "Nutella" }, kind: "label", estimated_ingredients: ["sugar"] }))).toBe(true);
    expect(needsLookup(normalize({ product: { name: "Nutella" }, ingredients: ["sugar"] }))).toBe(false);
    expect(needsLookup(normalize({ label_detected: true }))).toBe(false);
    expect(needsLookup(normalize({ kind: "dish", product: { name: "Cake" }, estimated_ingredients: ["flour"] }))).toBe(false);
    expect(needsLookup(normalize({ kind: "water", product: { name: "Spring water" } }))).toBe(false);
  });
  it("can be switched off", () => {
    expect(lookupEnabled({})).toBe(true);
    expect(lookupEnabled({ PRODUCT_LOOKUP: "off" })).toBe(false);
  });
});

describe("findProduct", () => {
  it("uses the barcode when there is one", async () => {
    const fetchMock = vi.fn(async (url: string) => respond({ product: ENTRY, url }));
    vi.stubGlobal("fetch", fetchMock);
    const p = await findProduct({ barcode: "3017620422003", name: null, brand: null }, "en", signal());
    expect(p?.name).toBe("Nutella");
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/v2/product/3017620422003.json");
  });
  it("falls back to a name search and skips hits that don't match", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url.includes("/api/v2/") ? respond({}, 404) : respond({ products: [{ ...ENTRY, product_name: "Nutella B-ready" }, ENTRY] }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const p = await findProduct({ barcode: "00000000", name: "Nutella", brand: "Ferrero" }, "en", signal());
    expect(p?.name).toBe("Nutella");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(await findProduct({ barcode: null, name: "Something else", brand: null }, "en", signal())).toBeNull();
  });
  it("throws on a server error so the caller can keep the photo's reading", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => respond({}, 503)));
    await expect(findProduct({ barcode: null, name: "Nutella", brand: null }, "en", signal())).rejects.toThrow(/503/);
  });
});

describe("completeFromDatabase", () => {
  it("re-runs the checks on the entry and says where the list came from", () => {
    const photo = normalize({ label_detected: true, image_quality: "good", product: { name: "Nutella", brand: "Ferrero" } }, { repaired: true });
    const r = completeFromDatabase(photo, parseProduct(ENTRY, "en")!, "en");
    expect(r.ingredient_source).toBe("database");
    expect(r.database).toEqual({ name: "Open Food Facts", product: "Nutella – Nutella", url: "https://world.openfoodfacts.org/product/3017620422003" });
    expect(r.ingredients.map((i) => i.name).slice(0, 3)).toEqual(["Sugar", "palm oil", "hazelnuts 13%"]);
    expect(r.allergens.filter((a) => a.presence === "contains").map((a) => a.id)).toEqual(["milk", "tree_nuts", "soy"]);
    expect(r.allergens.find((a) => a.id === "gluten")?.presence).toBe("may_contain");
    expect(r.additives.map((a) => a.code)).toContain("E322");
    expect(r.nutrition?.levels.sugars).toBe("high");
    expect(r.product).toMatchObject({ name: "Nutella", brand: "Ferrero", quantity: "400 g", barcode: "3017620422003" });
    expect(r.warnings[0]).toMatch(/completed from the Open Food Facts entry “Nutella – Nutella”/);
    // the photo's own warnings survive, the "couldn't read the list" one doesn't
    expect(r.warnings).toContain("The analysis was cut short; some sections may be incomplete.");
    expect(r.warnings.join(" ")).not.toMatch(/Take a photo of the whole product/);
  });
  it("keeps nutrition that was read on the photo", () => {
    const photo = normalize({ product: { name: "Nutella" }, nutrition: { basis: "100g", per_100: { sugars_g: 12, fat_g: 1 } } });
    const r = completeFromDatabase(photo, parseProduct(ENTRY, "en")!, "en");
    expect(r.nutrition?.per_100?.sugars_g).toBe(12);
  });
});

describe("fromDatabase", () => {
  it("builds a whole result from a scanned barcode and says it isn't from a photo", () => {
    const r = fromDatabase(parseProduct(ENTRY, "en")!, "en");
    expect(r.kind).toBe("label");
    expect(r.label_detected).toBe(true);
    expect(r.ingredient_source).toBe("database");
    expect(r.product.name).toBe("Nutella");
    expect(r.nutrition?.per_100?.sugars_g).toBe(56.3);
    expect(r.warnings).toEqual([
      "This comes from the Open Food Facts entry “Nutella – Nutella”, a community database, not from a photo of your pack: check it against the label.",
    ]);
    expect(r.database).toEqual({ name: "Open Food Facts", product: "Nutella – Nutella", url: "https://world.openfoodfacts.org/product/3017620422003" });
  });
  it("treats a product sold by volume as a drink", () => {
    const r = fromDatabase({ ...parseProduct(ENTRY, "en")!, quantity: "33 cl", ingredients: "water, sugar, colour E150d" }, "en");
    expect(r.kind).toBe("drink");
    expect(r.nutrition?.basis).toBe("100ml");
    expect(r.drink?.volume_ml).toBe(330);
  });
});
