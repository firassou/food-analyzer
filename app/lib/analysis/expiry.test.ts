import { describe, expect, it } from "vitest";
import { expiryOf, expiryStatus, parseExpiry } from "./expiry";
import { normalize } from "./normalize";

const ymd = (d: Date | undefined) => (d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` : null);

describe("parseExpiry", () => {
  it.each([
    ["11/2027", "2027-11-30", "month"],
    ["EXP 11/2027", "2027-11-30", "month"],
    ["02-2028", "2028-02-29", "month"], // leap year
    ["11/27", "2027-11-30", "month"],
    ["2027-11", "2027-11-30", "month"],
    ["30/11/2027", "2027-11-30", "day"],
    ["30.11.27", "2027-11-30", "day"],
    ["2027-11-05", "2027-11-05", "day"],
    ["Use by 05 nov 2027", "2027-11-05", "day"],
    ["nov. 2027", "2027-11-30", "month"],
    ["Novembre 2027", "2027-11-30", "month"],
    ["à consommer avant le 15 février 2028", "2028-02-15", "day"],
    ["EXP ٣٠/١١/٢٠٢٧", "2027-11-30", "day"],
  ])("reads %s", (text, end, precision) => {
    const p = parseExpiry(text);
    expect(ymd(p?.end)).toBe(end);
    expect(p?.precision).toBe(precision);
  });

  it.each(["", "Lot 24A113", "best before: see lid", "31/02/2027", "13/2027", "00/2027", "11/1999", "12345"])("refuses %j", (text) => {
    expect(parseExpiry(text)).toBeNull();
  });
});

describe("expiryStatus", () => {
  const now = new Date(2026, 9, 7, 15, 30); // 7 Oct 2026, mid-afternoon
  it("counts whole calendar days", () => {
    expect(expiryStatus(new Date(2026, 9, 7), now)).toEqual({ days: 0, status: "soon" });
    expect(expiryStatus(new Date(2026, 9, 6), now)).toEqual({ days: -1, status: "expired" });
    expect(expiryStatus(new Date(2026, 10, 6), now)).toEqual({ days: 30, status: "soon" });
    expect(expiryStatus(new Date(2026, 10, 7), now)).toEqual({ days: 31, status: "later" });
  });
});

describe("expiryOf", () => {
  const now = new Date(2026, 9, 7);
  it("prefers the expiry date, falls back to best before, and is null without a readable date", () => {
    const both = normalize({ kind: "label", dates: { expiration: "10/2026", best_before: "12/2030" } });
    expect(expiryOf(both, now)).toMatchObject({ kind: "expiration", status: "soon", raw: "10/2026" });
    const onlyBest = normalize({ kind: "label", dates: { best_before: "05/2030" } });
    expect(expiryOf(onlyBest, now)).toMatchObject({ kind: "best_before", status: "later" });
    expect(expiryOf(normalize({ kind: "label", dates: { expiration: "see lid" } }), now)).toBeNull();
    expect(expiryOf(normalize({ kind: "label" }), now)).toBeNull();
  });
});
