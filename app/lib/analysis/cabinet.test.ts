import { OFFICIAL } from "./__fixtures__/official";
import { describe, expect, it } from "vitest";
import { attentionCount, checkShelf, checkShelfConditions, datedEntries, MAX_SHELF_MEDICINES, type ShelfEntry } from "./cabinet";
import { EMPTY_PROFILE, type ConditionId } from "./profile";
import type { NamedProfile } from "./profiles";
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

describe("checkShelfConditions", () => {
  const person = (id: string, conditions: ConditionId[]): NamedProfile => ({ ...EMPTY_PROFILE, id, name: id, conditions });

  it("lists, for each person with conditions, the medicines with a finding", () => {
    const advil = med("Advil", ["Ibuprofen"]);
    const doliprane = med("Doliprane", ["Paracetamol"]);
    const out = checkShelfConditions([advil, doliprane], [person("me", ["hemophilia"]), person("kid", []), person("dad", ["liver_disease"])]);
    expect(out.map((p) => [p.person.id, p.items.map((i) => [i.entry.result.product.name, i.findings.map((f) => f.ruleId)])])).toEqual([
      ["me", [["Advil", ["bleeding_nsaid"]]]],
      ["dad", [["Doliprane", ["liver_paracetamol"]]]],
    ]);
  });

  it("is empty when nobody has a condition", () => {
    expect(checkShelfConditions([med("Advil", ["Ibuprofen"])], [person("me", [])])).toEqual([]);
  });

  it("keeps a person whose medicines raised nothing, so the shelf can say so", () => {
    const doliprane = { ...med("Doliprane", ["Paracetamol"]), result: { ...med("Doliprane", ["Paracetamol"]).result, official: OFFICIAL } };
    expect(checkShelfConditions([doliprane], [person("me", ["asthma"])])).toEqual([{ person: person("me", ["asthma"]), items: [], unchecked: [] }]);
  });

  it("names the medicines whose official product information is missing: they weren't checked", () => {
    const doliprane = med("Doliprane", ["Paracetamol"]);
    expect(checkShelfConditions([doliprane], [person("me", ["asthma"])])[0].unchecked).toEqual([doliprane]);
  });

  it("quotes what the official product information says", () => {
    const advil = med("Advil", ["Ibuprofen"]);
    const official = { ...advil, result: { ...advil.result, official: { ...OFFICIAL, contraindications: ["antécédents d'asthme déclenchés par la prise d'ibuprofène,"] } } };
    const [me] = checkShelfConditions([official], [person("me", ["asthma"])]);
    expect(me.items[0].official.map((f) => [f.level, f.section])).toEqual([["avoid", "contraindications"]]);
  });
});
