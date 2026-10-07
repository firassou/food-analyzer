import { describe, expect, it } from "vitest";
import { AISLE_LIMITS, AisleBook, aisleVerdict, fitBox } from "./aisle";
import { normalize } from "./normalize";
import { EMPTY_PROFILE } from "./profile";

const biscuit = normalize({ kind: "label", label_detected: true, image_quality: "good", product: { name: "Biscuit" }, ingredients: ["wheat flour", "milk powder"], allergens: { declared: ["milk"] } });
const water = normalize({ kind: "water", product: { name: "Eau" }, water: { ph: 7 } });

describe("aisleVerdict", () => {
  it("is the profile's verdict, or only the product when there is no profile", () => {
    expect(aisleVerdict(biscuit, { ...EMPTY_PROFILE, allergens: ["milk"] })).toBe("avoid");
    expect(aisleVerdict(biscuit, { ...EMPTY_PROFILE, allergens: ["fish"] })).toBe("ok");
    expect(aisleVerdict(biscuit, EMPTY_PROFILE)).toBe("plain");
    expect(aisleVerdict(water, { ...EMPTY_PROFILE, allergens: ["milk"] })).toBe("plain");
  });

  it("does not call an unread product fine", () => {
    const unread = normalize({ kind: "label", label_detected: true, product: { name: "Blur" } });
    expect(aisleVerdict(unread, { ...EMPTY_PROFILE, allergens: ["milk"] })).toBe("unchecked");
  });
});

describe("fitBox", () => {
  it("scales and shifts a box like object-fit: cover", () => {
    // a 1000x500 frame in a 400x400 view: scale 0.8, the sides are cropped by 200 px each
    expect(fitBox({ x: 500, y: 250, width: 100, height: 50 }, { width: 1000, height: 500 }, { width: 400, height: 400 })).toEqual({ x: 400 + -200, y: 200, width: 80, height: 40 });
    // a frame of the view's own proportions maps straight
    expect(fitBox({ x: 10, y: 20, width: 30, height: 40 }, { width: 200, height: 100 }, { width: 400, height: 200 })).toEqual({ x: 20, y: 40, width: 60, height: 80 });
  });
});

describe("AisleBook", () => {
  const small = { ...AISLE_LIMITS, perMinute: 3, concurrency: 2, maxCodes: 4 };

  it("asks for the newest code first, and never for the same one twice", () => {
    const book = new AisleBook(small);
    book.see("111", 1);
    book.see("222", 2);
    expect(book.next(3)).toBe("222");
    book.see("111", 4);
    book.see("222", 4);
    expect(book.next(5)).toBe("111");
    expect(book.next(6)).toBeNull(); // both are loading
    book.done("222", biscuit);
    book.see("222", 7);
    expect(book.next(8)).toBeNull();
    expect(book.get("222")?.state).toBe("done");
    expect(book.get("222")?.result).toBe(biscuit);
  });

  it("keeps to the concurrency and the per-minute budget", () => {
    const book = new AisleBook(small);
    for (const [i, code] of ["1", "2", "3", "4"].entries()) book.see(code, i);
    expect([book.next(10), book.next(10), book.next(10)]).toEqual(["4", "3", null]); // two in flight
    book.done("4", null);
    expect(book.next(11)).toBe("2");
    book.done("3", null);
    book.done("2", null);
    expect(book.next(12)).toBeNull(); // three started in this minute: the budget is spent
    expect(book.next(10 + 60_000)).toBe("1"); // a minute later it is free again
  });

  it("remembers a code the database doesn't know and doesn't ask again", () => {
    const book = new AisleBook();
    book.see("999", 0);
    expect(book.next(1)).toBe("999");
    book.done("999", null);
    expect(book.get("999")?.state).toBe("missing");
    book.see("999", 2);
    expect(book.next(100_000)).toBeNull();
  });

  it("retries a failure later, and backs off everything when the server says so", () => {
    const book = new AisleBook();
    book.see("1", 0);
    book.see("2", 1);
    expect(book.next(1)).toBe("2");
    book.failed("2", 1);
    expect(book.next(2)).toBe("1");
    book.failed("1", 2, true);
    expect(book.next(10_000)).toBeNull(); // paused
    // once the pause is over, both failures are due again
    const later = 2 + AISLE_LIMITS.backoffMs;
    expect([book.next(later), book.next(later)].sort()).toEqual(["1", "2"]);
  });

  it("forgets the oldest codes beyond its limit", () => {
    const book = new AisleBook(small);
    for (let i = 0; i < 6; i++) book.see(String(i), i);
    expect(book.get("0")).toBeUndefined();
    expect(book.get("1")).toBeUndefined();
    expect(book.get("5")).toBeDefined();
  });
});
