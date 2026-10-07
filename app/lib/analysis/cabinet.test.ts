import { describe, expect, it } from "vitest";
import { attentionCount, checkShelf, datedEntries, MAX_SHELF_MEDICINES, type ShelfEntry } from "./cabinet";
import { normalize } from "./normalize";

let n = 0;
const med = (name: string, active: string[], extra: Record<string, unknown> = {}): ShelfEntry => ({
  id: `m${++n}`,
  at: 1000 + n,
  result: normalize({ kind: "medicine", product: { name }, medicine: { active: active.map((a) => ({ name: a })) }, ...extra }),
});
const food = (name: string, dates: Record<string, string>): ShelfEntry => ({
  id: `f${++n}`,
  at: 1000 + n,
  result: normalize({ kind: "label", product: { name }, dates }),
});

describe("checkShelf", () => {
  it("compares every medicine with every other and keeps only what stands out", () => {
    const entries = [med("Doliprane", ["paracetamol"]), med("Efferalgan", ["paracetamol"]), med("Spasfon", ["phloroglucinol"])];
    const shelf = checkShelf(entries);
    expect(shelf.medicines).toHaveLength(3);
    expect(shelf.compared).toBe(3);
    expect(shelf.pairs).toHaveLength(1);
    expect(shelf.pairs[0].findings[0].type).toBe("duplicate");
  });

  it("counts the same product scanned twice once, and never flags it against itself", () => {
    const shelf = checkShelf([med("Doliprane", ["paracetamol"]), med("doliprane", ["Paracetamol"])]);
    expect(shelf.medicines).toHaveLength(1);
    expect(shelf.pairs).toEqual([]);
    expect(shelf.compared).toBe(0);
  });

  it("puts the serious pairs first and says how many medicines couldn't be read", () => {
    const entries = [med("A", ["ibuprofen"]), med("B", ["warfarin"]), med("C", ["tramadol"]), med("D", ["sertraline"]), med("Mystery", [])];
    const shelf = checkShelf(entries);
    expect(shelf.unread).toBe(1);
    expect(shelf.pairs[0].findings.some((f) => f.severity === "avoid")).toBe(true);
    const severities = shelf.pairs.map((p) => p.findings.some((f) => f.severity === "avoid"));
    expect(severities).toEqual([...severities].sort((x, y) => Number(y) - Number(x)));
  });

  it("ignores food and caps how many medicines are compared", () => {
    expect(checkShelf([food("Biscuits", {})]).medicines).toEqual([]);
    const many = Array.from({ length: 20 }, (_, i) => med(`Drug ${i}`, [`substance${i}`]));
    expect(checkShelf(many).medicines).toHaveLength(MAX_SHELF_MEDICINES);
  });
});

describe("datedEntries", () => {
  const now = new Date(2026, 9, 7);
  it("sorts by how soon each runs out, expired first, and drops what has no date", () => {
    const entries = [food("Later", { expiration: "01/2030" }), food("Gone", { expiration: "01/2026" }), food("Soon", { expiration: "10/2026" }), food("No date", {})];
    const dated = datedEntries(entries, now);
    expect(dated.map((d) => d.entry.result.product.name)).toEqual(["Gone", "Soon", "Later"]);
    expect(dated.map((d) => d.expiry.status)).toEqual(["expired", "soon", "later"]);
    expect(attentionCount(dated)).toBe(2);
  });
});
