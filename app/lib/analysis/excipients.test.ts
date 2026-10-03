import { describe, expect, it } from "vitest";
import { findExcipients } from "./excipients";

const ids = (text: string) => findExcipients(text).map((e) => e.id);

describe("findExcipients", () => {
  it("finds the excipients a patient should know about, in several languages", () => {
    expect(ids("Excipients: lactose monohydraté, amidon de blé, stéarate de magnésium")).toEqual(["wheat_starch", "lactose"]);
    expect(ids("sucrose, sorbitol (E420), methyl parahydroxybenzoate (E218), ethanol 96%")).toEqual([
      "sugars",
      "fructose_sorbitol",
      "parabens",
      "alcohol",
    ]);
    expect(ids("aspartam (E951), jaune orangé S (E110), métabisulfite de sodium")).toEqual(["aspartame", "sulphites", "azo_colours"]);
    expect(ids("لاكتوز، نشا القمح")).toEqual(["wheat_starch", "lactose"]);
    expect(ids("Comprimés effervescents")).toEqual(["effervescent_sodium"]);
    expect(ids("huile d'arachide, lécithine de soja")).toEqual(["peanut_oil", "soya"]);
  });

  it("separates wheat starch from starch whose source is named or not stated", () => {
    expect(ids("maize starch, pregelatinised starch")).toEqual(["starch_unspecified"]);
    expect(ids("amidon de maïs, cellulose")).toEqual([]);
    expect(ids("sodium starch glycolate, potato starch")).toEqual([]);
    expect(ids("amidon de blé")).toEqual(["wheat_starch"]);
    expect(findExcipients("Amidon prégélatinisé")[0]).toEqual({ id: "starch_unspecified", matched: "amidon" });
  });

  it("isn't fooled by look-alikes", () => {
    expect(ids("cetostearyl alcohol, polyvinyl alcohol, alcool cétylique")).toEqual([]); // fatty alcohols aren't ethanol
    expect(ids("Sirop sans alcool")).toEqual([]);
    expect(ids("benzyl alcohol")).toEqual(["benzyl_alcohol"]);
    expect(ids("magnesium stearate, microcrystalline cellulose, titanium dioxide (E171)")).toEqual([]);
    expect(ids("sodium sulphate")).toEqual([]); // a sulphate is not a sulphite
  });
});
