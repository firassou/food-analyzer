import { describe, expect, it } from "vitest";
import { addExcipientPhoto, needsExcipients, withExcipients } from "./medicine";
import { analysisMessages } from "./messages";
import { normalize } from "./normalize";

const w = analysisMessages("en").warnings;

// the front of a box: name, substance and pen marks, no composition
const front = normalize({
  kind: "medicine",
  image_quality: "good",
  product: { name: "Doliprane 500 mg", brand: "Sanofi" },
  medicine: {
    form: "comprimés",
    active: [{ name: "paracetamol", strength: "500 mg" }],
    marks: { morning: 1, midday: 0, evening: 1, confidence: "high" },
    uses: ["Pain", "Fever"],
    typical_dose: "1 to 2 tablets, up to 3 g a day",
  },
});

describe("needsExcipients", () => {
  it("is true only for a medicine whose excipients weren't read on the photo", () => {
    expect(front.gluten.status).toBe("unclear");
    expect(front.warnings).toContain(w.medicineNoExcipients);
    expect(needsExcipients(front)).toBe(true);
    expect(needsExcipients(normalize({ kind: "medicine", ingredients: ["lactose", "talc"], medicine: { active: ["x"] } }))).toBe(false);
    expect(needsExcipients(normalize({ kind: "label", product: { name: "Biscuits" } }))).toBe(false);
  });
});

describe("withExcipients (database entry)", () => {
  const db = { name: "Base de données publique des médicaments", product: "DOLIPRANE 500 mg, comprimé", url: "https://example.test/1" };
  const done = withExcipients(front, { ingredients: "Povidone, amidon de blé, lactose, stéarate de magnésium", raw_text: null }, "en", db);

  it("keeps the first reading and computes the notes from the list", () => {
    expect(done.kind).toBe("medicine");
    expect(done.product.name).toBe("Doliprane 500 mg");
    expect(done.medicine?.marks).toMatchObject({ morning: 1, evening: 1 });
    expect(done.medicine?.uses).toEqual(["Pain", "Fever"]);
    expect(done.ingredients.map((i) => i.name)).toEqual(["Povidone", "amidon de blé", "lactose", "stéarate de magnésium"]);
    expect(done.medicine?.excipients.map((e) => e.id)).toEqual(["wheat_starch", "lactose"]);
    expect(done.gluten.status).toBe("contains");
  });
  it("says where the list comes from, and still offers the photo", () => {
    expect(done.ingredient_source).toBe("database");
    expect(done.database).toEqual(db);
    expect(done.warnings).toContain(w.medicineDatabase(db.product));
    expect(done.warnings).not.toContain(w.medicineNoExcipients);
    expect(done.warnings).toContain(w.medicineMarks);
    expect(needsExcipients(done)).toBe(true);
  });
  it("reports no gluten source with medium confidence at most", () => {
    const clean = withExcipients(front, { ingredients: "Povidone, talc", raw_text: null }, "en", db);
    expect([clean.gluten.status, clean.gluten.confidence]).toEqual(["no_indication", "medium"]);
  });
});

describe("addExcipientPhoto", () => {
  const side = normalize({
    kind: "medicine",
    ingredients: [{ name: "amidon de maïs" }, { name: "aspartam (E951)" }],
    medicine: { form: "comprimé effervescent", active: [] },
    raw_text: "Excipients : amidon de maïs, aspartam (E951)",
  });

  it("merges the excipients read on a second photo into the first result", () => {
    const merged = addExcipientPhoto(front, side, "en")!;
    expect(merged.ingredient_source).toBe("label");
    expect(merged.database).toBeNull();
    expect(merged.product.name).toBe("Doliprane 500 mg");
    expect(merged.medicine?.active).toEqual([{ name: "paracetamol", name_local: null, strength: "500 mg" }]);
    expect(merged.medicine?.form).toBe("comprimés");
    expect(merged.medicine?.excipients.map((e) => e.id)).toEqual(["aspartame"]);
    expect(merged.gluten.status).toBe("no_indication");
    expect(merged.warnings).not.toContain(w.medicineNoExcipients);
    expect(needsExcipients(merged)).toBe(false);
  });
  it("replaces a database list, and its warning, by what the box says", () => {
    const db = { name: "DB", product: "DOLIPRANE 500 mg, comprimé", url: "https://example.test/1" };
    const fromDb = withExcipients(front, { ingredients: "amidon de blé", raw_text: null }, "en", db);
    const merged = addExcipientPhoto(fromDb, side, "en")!;
    expect(merged.database).toBeNull();
    expect(merged.warnings.some((x) => x.includes(db.product))).toBe(false);
    expect(merged.gluten.status).toBe("no_indication");
  });
  it("changes nothing when the second photo shows no excipient list", () => {
    expect(addExcipientPhoto(front, front, "en")).toBeNull();
    expect(addExcipientPhoto(front, normalize({}), "en")).toBeNull();
    expect(addExcipientPhoto(front, normalize({ kind: "dish", estimated_ingredients: [{ name: "flour" }] }), "en")).toBeNull();
  });
});
