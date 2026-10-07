import { describe, expect, it } from "vitest";
import { normalize } from "./normalize";
import { activeProfile, addPerson, checkEveryone, emptyBook, MAX_PROFILES, removePerson, renamePerson, sanitizeBook, switchPerson, updateActive } from "./profiles";

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
