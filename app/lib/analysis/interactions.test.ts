import { describe, expect, it } from "vitest";
import { checkTogether } from "./interactions";
import type { Medicine } from "./types";

const med = (...names: string[]): Medicine => ({
  form: null,
  active: names.map((name) => ({ name, name_local: null, strength: null })),
  marks: null,
  uses: [],
  typical_dose: null,
  how_to_take: null,
  not_for: [],
  warnings: [],
  side_effects: [],
  excipients: [],
});
const ids = (a: Medicine | null, b: Medicine | null) =>
  checkTogether(a, b).findings.map((f) => (f.type === "interaction" ? f.id : f.type === "same_family" ? `family:${f.family}` : `duplicate${f.paracetamol ? ":paracetamol" : ""}`));

describe("checkTogether", () => {
  it("finds the same substance under different spellings, salts and names", () => {
    expect(ids(med("Paracetamol"), med("acetaminophen", "caffeine"))).toEqual(["duplicate:paracetamol"]);
    expect(ids(med("paracétamol", "codéine"), med("Paracetamol"))).toEqual(["duplicate:paracetamol"]);
    expect(ids(med("ibuprofène"), med("ibuprofen lysine"))).toEqual(["duplicate"]);
    expect(ids(med("Metformin hydrochloride"), med("chlorhydrate de metformine"))).toEqual(["duplicate"]);
    expect(ids(med("amoxicilline", "acide clavulanique"), med("Amoxicillin trihydrate"))).toEqual(["duplicate"]);
    expect(ids(med("metformin hydrochloride"), med("Metformin"))).toEqual(["duplicate"]);
    expect(ids(med("acide acétylsalicylique"), med("Aspirin"))).toEqual(["duplicate"]);
  });

  it("finds two medicines of the same family", () => {
    expect(ids(med("ibuprofen"), med("diclofenac sodium"))).toEqual(["family:nsaid"]);
    expect(ids(med("ramipril"), med("losartan potassium"))).toEqual(["family:acei_arb"]);
    expect(ids(med("bromazépam"), med("zolpidem"))).toEqual(["family:benzodiazepine"]);
  });

  it("finds the listed interactions, in either order, serious ones first", () => {
    expect(ids(med("sildenafil"), med("trinitrine"))).toEqual(["nitrate_pde5"]);
    expect(ids(med("warfarin"), med("ibuprofen"))).toEqual(["nsaid_anticoagulant"]);
    expect(ids(med("clarithromycine"), med("simvastatine"))).toEqual(["statin_cyp3a4"]);
    expect(ids(med("clarithromycin"), med("rosuvastatin"))).toEqual([]);
    expect(ids(med("fluoxétine"), med("tramadol", "paracetamol"))).toEqual(["ssri_tramadol"]);
    expect(ids(med("acenocoumarol"), med("miconazole"))).toEqual(["vka_booster"]);
    expect(ids(med("ibuprofen"), med("ramipril"))).toEqual(["nsaid_acei_arb"]);
    expect(ids(med("codeine", "paracetamol"), med("alprazolam"))).toEqual(["opioid_benzodiazepine"]);
    expect(ids(med("enalapril"), med("spironolactone"))).toEqual(["acei_arb_potassium"]);
    const both = checkTogether(med("ibuprofen"), med("ramipril", "warfarin")).findings;
    expect(both.map((f) => f.severity)).toEqual(["avoid", "caution"]);
  });

  it("knows a mineral from a salt", () => {
    expect(ids(med("lévothyroxine sodique"), med("carbonate de calcium"))).toEqual(["mineral_absorption"]);
    expect(ids(med("ciprofloxacin"), med("ferrous sulfate"))).toEqual(["mineral_absorption"]);
    expect(ids(med("levothyroxine"), med("atorvastatin calcium"))).toEqual([]);
    expect(checkTogether(med("levothyroxine"), med("calcium carbonate")).findings[0].substances).toEqual(["levothyroxine", "calcium carbonate"]);
  });

  it("names the substances in the order of the sentence, and reports once", () => {
    expect(checkTogether(med("ibuprofen"), med("warfarin")).findings[0].substances).toEqual(["ibuprofen", "warfarin"]);
    expect(checkTogether(med("warfarin"), med("ibuprofen")).findings[0].substances).toEqual(["ibuprofen", "warfarin"]);
    expect(ids(med("ibuprofen", "ketoprofen"), med("naproxen"))).toEqual(["family:nsaid"]);
  });

  it("finds nothing between unrelated medicines, and says when it couldn't check", () => {
    expect(checkTogether(med("paracetamol"), med("amoxicillin"))).toEqual({ checked: true, findings: [] });
    expect(checkTogether(med("paracetamol"), med())).toEqual({ checked: false, findings: [] });
    expect(checkTogether(null, med("ibuprofen"))).toEqual({ checked: false, findings: [] });
  });
});
