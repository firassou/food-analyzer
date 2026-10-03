import { describe, expect, it } from "vitest";
import { matchLocale } from "./locales";
import { MESSAGES } from "./messages";

describe("matchLocale", () => {
  it("follows the device's preferred supported language", () => {
    expect(matchLocale("fr-TN,fr;q=0.9,ar;q=0.8,en;q=0.7")).toBe("fr");
    expect(matchLocale("ar-TN")).toBe("ar");
    expect(matchLocale("de-DE,de;q=0.9,ar;q=0.5,fr;q=0.8")).toBe("fr"); // q-values, not order
    expect(matchLocale("en;q=0, fr")).toBe("fr");
  });
  it("defaults to English", () => {
    expect(matchLocale(null)).toBe("en");
    expect(matchLocale("")).toBe("en");
    expect(matchLocale("de-DE, es;q=0.8, *;q=0.1")).toBe("en");
  });
});

describe("dictionaries", () => {
  // the Messages type guarantees the keys; this guards placeholders and markup
  const tokens = (s: string) => (s.match(/\{\w+\}|<\/?b>/g) ?? []).sort().join();
  const walk = (a: unknown, b: unknown, path: string): void => {
    if (typeof a === "string") {
      expect(tokens(b as string), path).toBe(tokens(a));
      expect((b as string).trim().length, path).toBeGreaterThan(0);
    } else if (Array.isArray(a)) {
      expect((b as unknown[]).length, path).toBe(a.length);
      a.forEach((x, i) => walk(x, (b as unknown[])[i], `${path}[${i}]`));
    } else if (a && typeof a === "object") {
      for (const k of Object.keys(a)) walk((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
    }
  };
  it.each(["fr", "ar"] as const)("%s keeps every placeholder of the English text", (locale) => {
    walk(MESSAGES.en, MESSAGES[locale], locale);
  });
});
