import { describe, expect, it } from "vitest";
import { normalize } from "../analysis/normalize";
import { distance, greyCells, hashOfGrey, matchPhoto } from "./fingerprint";
import type { HistoryEntry } from "./history";

/** a 72×64 RGBA picture from a brightness function */
const picture = (shade: (x: number, y: number) => number) => {
  const px: number[] = [];
  for (let y = 0; y < 64; y++) for (let x = 0; x < 72; x++) px.push(shade(x, y), shade(x, y), shade(x, y), 255);
  return px;
};
const hashOf = (shade: (x: number, y: number) => number) => hashOfGrey(greyCells(picture(shade), 72));

const entry = (id: string, photo: HistoryEntry["photo"], kind = "medicine"): HistoryEntry => ({
  id,
  at: 0,
  thumb: null,
  result: normalize({ kind, product: { name: id }, medicine: { active: ["terbinafine"] } }),
  meta: { model: "m", provider: "p", attempts: 1, duration_ms: 1, locale: "en" },
  photo,
});

describe("photo fingerprints", () => {
  const box = (x: number, y: number) => (x > 20 && x < 50 && y > 10 && y < 40 ? 220 : 40) + ((x * 7 + y * 3) % 11);

  it("gives the same hash to the same scene a little brighter or noisier", () => {
    const a = hashOf(box);
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(distance(a, hashOf((x, y) => Math.min(255, box(x, y) + 12)))).toBe(0);
    expect(distance(a, hashOf((x, y) => box(x, y) + ((x + y) % 3)))).toBeLessThanOrEqual(4);
  });

  it("tells a different picture apart (more bits apart than a look-alike may be)", () => {
    expect(distance(hashOf(box), hashOf((x, y) => (y > 32 ? 200 : 30) + ((x * 5) % 13)))).toBeGreaterThan(6);
    expect(distance(hashOf(box), hashOf((x) => (x < 36 ? 230 : 20)))).toBeGreaterThan(6);
  });

  it("counts differing bits, and refuses anything that isn't a hash", () => {
    expect(distance("0000000000000000", "000000000000000f")).toBe(4);
    expect(distance("ffffffffffffffff", "0000000000000000")).toBe(64);
    for (const bad of [null, undefined, "", "xyz", "0".repeat(15), "g".repeat(16)]) expect(distance(bad, "0".repeat(16))).toBe(Infinity);
  });

  it("reopens the identical file, asks about a look-alike, and ignores the rest", () => {
    const saved = [
      entry("other", { sha256: "b", dhash: "ffffffff00000000" }),
      entry("close", { sha256: "c", dhash: "0000000000000003" }),
      entry("same", { sha256: "a", dhash: "8000000000000000" }),
      entry("old", undefined),
    ];
    expect(matchPhoto({ sha256: "a", dhash: "0000000000000000" }, saved)).toMatchObject({ kind: "same", entry: { id: "same" } });
    // the closest look-alike wins
    expect(matchPhoto({ sha256: "z", dhash: "0000000000000000" }, saved)).toMatchObject({ kind: "similar", entry: { id: "same" } });
    expect(matchPhoto({ sha256: null, dhash: "00000000000000ff" }, saved)).toMatchObject({ kind: "similar", entry: { id: "close" } });
    expect(matchPhoto({ sha256: null, dhash: "0f0f0f0f0f0f0f0f" }, saved)).toBeNull();
    expect(matchPhoto({ sha256: null, dhash: null }, saved)).toBeNull();
  });

  it("never matches a photo of nothing", () => {
    expect(matchPhoto({ sha256: "a", dhash: "0000000000000000" }, [entry("x", { sha256: "a", dhash: "0000000000000000" }, "other")])).toBeNull();
  });
});
