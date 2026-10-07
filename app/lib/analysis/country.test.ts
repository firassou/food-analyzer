import { describe, expect, it } from "vitest";
import { COUNTRIES, countryFromLanguages, countryFromTimeZone, countryTag, detectCountry } from "./country";

describe("detectCountry", () => {
  it("trusts the time zone over the language", () => {
    expect(detectCountry("Africa/Tunis", ["en-US", "fr"])).toBe("TN");
    expect(detectCountry("Europe/Paris", ["ar-TN"])).toBe("FR");
  });
  it("falls back to the first language that names a region", () => {
    expect(detectCountry("Asia/Unknown", ["fr", "fr-TN", "en-US"])).toBe("TN");
    expect(detectCountry(undefined, ["ar-DZ"])).toBe("DZ");
    expect(countryFromLanguages(["en", "fr"])).toBeNull();
    expect(countryFromLanguages(["es-419", "zh-Hans-CN"])).toBe("CN");
  });
  it("says nothing when it can't tell", () => {
    expect(detectCountry(null, [])).toBeNull();
    expect(countryFromTimeZone("Mars/Olympus")).toBeNull();
  });
  it("offers a sorted list of known countries", () => {
    expect(COUNTRIES).toContain("TN");
    expect(COUNTRIES).toEqual([...COUNTRIES].sort());
  });
});

describe("countryTag", () => {
  it("turns an English region name into an Open Food Facts tag", () => {
    expect(countryTag("TN", "Tunisia")).toBe("en:tunisia");
    expect(countryTag("US", "United States")).toBe("en:united-states");
    expect(countryTag("CI", "Côte d’Ivoire")).toBe("en:cote-d-ivoire");
  });
  it("refuses what isn't a country", () => {
    expect(countryTag("tn", "Tunisia")).toBeNull();
    expect(countryTag("TN", undefined)).toBeNull();
    expect(countryTag("TN", "!!!")).toBeNull();
  });
});
