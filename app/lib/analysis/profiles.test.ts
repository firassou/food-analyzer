import { OFFICIAL } from "./__fixtures__/official";
import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { activeProfile, addPerson, checkEveryone, checkPerson, emptyBook, MAX_PROFILES, removePerson, renamePerson, sanitizeBook, switchPerson, updateActive } from "./profiles";
import { EMPTY_PROFILE } from "./profile";

describe("profile book", () => {
  it("starts with one unnamed person", () => {
    const book = emptyBook();
    expect(book.profiles).toHaveLength(1);
    expect(activeProfile(book).name).toBe("");
  });

  it("turns the old single profile into the first person", () => {
    const book = sanitizeBook(null, { allergens: ["milk", "bogus"], lactose: true });
    expect(activeProfile(book)).toMatchObject({ allergens: ["milk"], lactose: true, name: "" });
  });

  it("survives any stored shape", () => {
    for (const raw of [null, 3, "x", [], {}, { profiles: "no" }, { profiles: [null, 4, {}] }]) {
      const book = sanitizeBook(raw);
      expect(book.profiles.length).toBeGreaterThanOrEqual(1);
      expect(book.profiles.some((p) => p.id === book.active)).toBe(true);
    }
    const dup = sanitizeBook({ active: "zzz", profiles: [{ id: "a", name: "  Sam  " }, { id: "a", name: "dup" }, { id: "bad id!", name: "x" }] });
    expect(dup.profiles.map((p) => p.id)).toEqual(["a"]);
    expect(dup.profiles[0].name).toBe("Sam");
    expect(dup.active).toBe("a");
  });

  it("adds, switches, renames and updates people independently", () => {
    let book = updateActive(emptyBook(), { allergens: ["peanuts"], lactose: false, sugar: false, diets: [] });
    book = addPerson(book, "kid", "Lina");
    expect(book.active).toBe("kid");
    book = updateActive(book, { allergens: ["milk"], lactose: true, sugar: false, diets: ["halal"] });
    expect(activeProfile(book).allergens).toEqual(["milk"]);
    book = switchPerson(book, "me");
    expect(activeProfile(book).allergens).toEqual(["peanuts"]);
    book = renamePerson(book, "kid", "x".repeat(80));
    expect(book.profiles[1].name).toHaveLength(24);
    expect(switchPerson(book, "nobody")).toBe(book);
  });

  it("stops at the maximum and keeps at least one person", () => {
    let book = emptyBook();
    for (let i = 0; i < 10; i++) book = addPerson(book, `p${i}`);
    expect(book.profiles).toHaveLength(MAX_PROFILES);
    expect(addPerson(book, "me")).toBe(book);
    for (const p of [...book.profiles]) book = removePerson(book, p.id);
    expect(book.profiles).toHaveLength(1);
    expect(activeProfile(book).allergens).toEqual([]);
  });

  it("moves to another person when the active one is removed", () => {
    let book = addPerson(emptyBook(), "kid", "Lina");
    book = removePerson(book, "kid");
    expect(book.active).toBe("me");
  });
});

describe("checkEveryone", () => {
  const biscuit = normalize({
    kind: "label",
    label_detected: true,
    image_quality: "good",
    product: { name: "X" },
    ingredients: ["wheat flour", "sugar", "milk powder"],
    allergens: { declared: ["gluten", "milk"], may_contain: ["peanuts"] },
  });
  const empty = { allergens: [], lactose: false, sugar: false, diets: [] };

  it("checks each person against their own profile, the most worried first", () => {
    let book = updateActive(emptyBook(), { ...empty, allergens: ["fish"] });
    book = addPerson(book, "kid", "Lina");
    book = updateActive(book, { ...empty, allergens: ["peanuts"] });
    book = addPerson(book, "dad", "Sam");
    book = updateActive(book, { ...empty, allergens: ["milk"] });
    expect(checkEveryone(biscuit, book).map((x) => [x.person.id, x.check.status])).toEqual([
      ["dad", "avoid"],
      ["kid", "check"],
      ["me", "ok"],
    ]);
  });

  it("leaves out people who avoid nothing, and everyone when nobody does", () => {
    const book = addPerson(updateActive(emptyBook(), { ...empty, allergens: ["milk"] }), "kid");
    expect(checkEveryone(biscuit, book).map((x) => x.person.id)).toEqual(["me"]);
    expect(checkEveryone(biscuit, emptyBook())).toEqual([]);
  });
});

describe("health conditions in the book", () => {
  const advil = normalize({ kind: "medicine", label_detected: true, image_quality: "good", product: { name: "Advil" }, medicine: { active: [{ name: "Ibuprofen" }] } });
  const doliprane = normalize({ kind: "medicine", label_detected: true, image_quality: "good", product: { name: "Doliprane" }, medicine: { active: [{ name: "Paracetamol" }] } });
  const salty = normalize({ kind: "water", label_detected: true, image_quality: "good", product: { name: "Vichy" }, water: { minerals: { sodium: 1200 } } });

  it("keeps each person's conditions through storage and drops junk", () => {
    const book = sanitizeBook({ active: "me", profiles: [{ id: "me", name: "", allergens: [], conditions: ["hemophilia", "flu"], otherConditions: ["Crohn"] }] });
    expect(activeProfile(book).conditions).toEqual(["hemophilia"]);
    expect(activeProfile(book).otherConditions).toEqual(["Crohn"]);
  });

  it("clears conditions when the profile is replaced or cleared", () => {
    let book = updateActive(emptyBook(), { ...EMPTY_PROFILE, conditions: ["asthma"], otherConditions: ["Crohn"] });
    expect(activeProfile(book).conditions).toEqual(["asthma"]);
    book = updateActive(book, EMPTY_PROFILE);
    expect(activeProfile(book).conditions).toBeUndefined();
    expect(activeProfile(book).otherConditions).toBeUndefined();
    book = removePerson(updateActive(book, { ...EMPTY_PROFILE, conditions: ["asthma"] }), "me");
    expect(activeProfile(book).conditions).toBeUndefined();
  });

  it("folds the condition findings into the person's verdict", () => {
    const check = checkPerson(advil, { ...EMPTY_PROFILE, conditions: ["hemophilia"] })!;
    expect(check.status).toBe("avoid");
    expect(check.findings).toEqual([]);
    expect(check.conditions?.map((f) => f.ruleId)).toEqual(["bleeding_nsaid"]);
    // a medicine is only "nothing found" once its official product information was read
    expect(checkPerson(doliprane, { ...EMPTY_PROFILE, conditions: ["hemophilia"] })!.status).toBe("unchecked");
    expect(checkPerson({ ...doliprane, official: OFFICIAL }, { ...EMPTY_PROFILE, conditions: ["hemophilia"] })!.status).toBe("ok");
  });

  it("checks a water against conditions though the watchlist has nothing to say about it", () => {
    expect(checkPerson(salty, { ...EMPTY_PROFILE, allergens: ["milk"] })).toBeNull();
    expect(checkPerson(salty, { ...EMPTY_PROFILE, allergens: ["milk"], conditions: ["hypertension"] })!.status).toBe("check");
  });

  it("is the watchlist check, unchanged, without conditions", () => {
    const watchlist = { ...EMPTY_PROFILE, allergens: ["milk" as const] };
    const milk = normalize({ kind: "label", label_detected: true, product: { name: "X" }, ingredients: ["milk"], allergens: { declared: ["milk"] } });
    expect(checkPerson(milk, watchlist)).toEqual({ status: "avoid", findings: expect.any(Array) });
    expect(checkPerson(milk, EMPTY_PROFILE)).toBeNull();
  });

  it("is unchecked rather than ok when either part couldn't be checked", () => {
    const unread = normalize({ kind: "medicine", label_detected: true, product: { name: "Box" }, medicine: { active: [] }, ingredients: ["lactose"] });
    expect(checkPerson(unread, { ...EMPTY_PROFILE, allergens: ["fish"], conditions: ["asthma"] })!.status).toBe("unchecked");
  });

  it("says high sugar once for a diabetic who also watches sugar", () => {
    const jam = normalize({ kind: "label", label_detected: true, product: { name: "Jam" }, ingredients: ["sugar", "strawberries"], nutrition: { basis: "100g", per_100: { sugars_g: 55 } } });
    const check = checkPerson(jam, { ...EMPTY_PROFILE, sugar: true, conditions: ["diabetes"] })!;
    expect(check.findings.filter((f) => f.topic.type === "sugar")).toEqual([]);
    expect(check.conditions?.map((f) => f.ruleId)).toEqual(["diabetes_sugar_food"]);
  });

  it("lists a person with only conditions in everyone's verdicts", () => {
    let book = updateActive(emptyBook(), { ...EMPTY_PROFILE, allergens: ["fish"] });
    book = addPerson(book, "kid", "Lina");
    book = updateActive(book, { ...EMPTY_PROFILE, conditions: ["hemophilia"] });
    expect(checkEveryone(advil, book).map((x) => [x.person.id, x.check.status])).toEqual([
      ["kid", "avoid"],
      ["me", "unchecked"],
    ]);
  });
});
