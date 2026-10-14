import { describe, expect, it } from "vitest";
import { OFFICIAL } from "./__fixtures__/official";
import { normalize } from "./normalize";
import { checkPair } from "./officialInteractions";
import type { OfficialInteraction } from "./types";

const med = (name: string, active: (string | [string, string])[], interactions?: OfficialInteraction[]) => {
  const r = normalize({ kind: "medicine", label_detected: true, product: { name }, medicine: { active: active.map((a) => (typeof a === "string" ? { name: a } : { name: a[0], strength: a[1] })) } });
  if (interactions) r.official = { ...OFFICIAL, product: name.toUpperCase(), interactions };
  return r;
};
const summary = (check: ReturnType<typeof checkPair>) => check.official.map((f) => `${f.severity}${f.byDose ? " by dose" : ""} (${f.source.product}) ${f.parts.map((p) => p.level).join("+")}`);

// excerpts of the published texts (base-donnees-publique.medicaments.gouv.fr, October 2026)
const ADVIL: OfficialInteraction[] = [
  { level: null, with: "", text: "Certains médicaments ou classes thérapeutiques sont susceptibles de favoriser la survenue d'une hyperkaliémie." },
  { level: "not_recommended", with: "Autres AINS", text: "Majoration du risque ulcérogène et hémorragique digestif." },
  { level: "not_recommended", with: "Anticoagulants oraux", text: "Augmentation du risque hémorragique de l'anticoagulant oral." },
  { level: "not_recommended", with: "Lithium", text: "Augmentation de la lithémie pouvant atteindre des valeurs toxiques." },
  { level: "precaution", with: "Inhibiteurs de l'enzyme de conversion (IEC)", text: "Insuffisance rénale aiguë chez le patient à risque." },
  { level: "consider", with: "Bêta-bloquants (sauf esmolol)", text: "Réduction de l'effet antihypertenseur." },
];
const PREVISCAN: OfficialInteraction[] = [
  { level: "contraindicated", with: "Acide acétylsalicylique (aspirine à forte dose)", text: "Pour des doses anti-inflammatoires d'acide acétylsalicylique (≥ 1 g par prise et/ou ≥ 3 g par jour)." },
  { level: "contraindicated", with: "AINS pyrazolés", text: "Pour toutes les formes de phénylbutazone : augmentation du risque hémorragique." },
  { level: "not_recommended", with: "AINS (sauf AINS pyrazolés voir associations contre-indiquées)", text: "Augmentation du risque hémorragique de l'anticoagulant oral." },
  { level: "consider", with: "Acide acétylsalicylique", text: "À doses antiagrégantes (de 50 mg à 375 mg par jour) : augmentation du risque hémorragique." },
  { level: "precaution", with: "Paracétamol", text: "En cas de prise de paracétamol aux doses maximales, risque d'augmentation de l'INR." },
];

describe("checkPair: what the official product information says", () => {
  it("finds the other medicine by its substance or its class, with the regulator's level", () => {
    expect(summary(checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Teralithe", ["Lithium carbonate"], [])))).toEqual(["avoid (ADVIL) not_recommended"]);
    expect(summary(checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Triatec", ["Ramipril"], [])))).toEqual(["caution (ADVIL) precaution"]);
    expect(summary(checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Coumadine", ["Warfarin"], [])))).toEqual(["avoid (ADVIL) not_recommended"]);
  });

  it("reads both texts", () => {
    expect(summary(checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Previscan", ["Fluindione"], PREVISCAN)))).toEqual([
      "avoid (ADVIL) not_recommended",
      "avoid (PREVISCAN) not_recommended",
    ]);
  });

  it("a narrower class ('AINS pyrazolés') isn't the whole class, and an exception ('sauf esmolol') is left out", () => {
    const previscan = checkPair(med("Advil", ["Ibuprofen"], []), med("Previscan", ["Fluindione"], PREVISCAN));
    expect(previscan.official[0].parts.map((p) => p.level)).toEqual(["not_recommended"]);
    expect(checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Brevibloc", ["Esmolol"], [])).official).toEqual([]);
    expect(summary(checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Tenormine", ["Atenolol"], [])))).toEqual(["caution (ADVIL) consider"]);
  });

  it("levels set by dose are one finding that says it depends on the dose, with every level quoted", () => {
    const check = checkPair(med("Kardegic", ["Acetylsalicylate de lysine"], []), med("Previscan", ["Fluindione"], PREVISCAN));
    // its own aspirin lines: the general "+ AINS" line gives way to them
    expect(summary(check)).toEqual(["avoid by dose (PREVISCAN) contraindicated+consider"]);
    expect(check.official[0].parts[0].quote).toMatch(/^Acide acétylsalicylique \(aspirine à forte dose\) : Pour des doses anti-inflammatoires/);
  });

  it("quotes prose sentences, never table cells", () => {
    const tahor: OfficialInteraction[] = [
      { level: null, with: "", text: "Les concentrations plasmatiques d’atorvastatine sont augmentées de façon importante lors de l’association avec la clarithromycine." },
      { level: null, with: "", text: "Clarithromycine 500 mg 2x/jour, 9 jours" },
    ];
    const check = checkPair(med("Tahor", ["Atorvastatin"], tahor), med("Zeclar", ["Clarithromycin"], []));
    expect(check.official[0].parts.map((p) => p.quote)).toEqual([tahor[0].text]);
  });

  it("the app's own short list only speaks when the official texts say nothing about the pair", () => {
    const withOfficial = checkPair(med("Advil", ["Ibuprofen"], ADVIL), med("Coumadine", ["Warfarin"], []));
    expect(withOfficial.findings.filter((f) => f.type === "interaction")).toEqual([]);
    const without = checkPair(med("Advil", ["Ibuprofen"]), med("Coumadine", ["Warfarin"]));
    expect(without.findings.map((f) => f.type)).toEqual(["interaction"]);
    expect(without.officialBoth).toBe(false);
  });

  it("says when both official texts were read and found nothing", () => {
    const check = checkPair(med("Glucophage", ["Metformin"], [{ level: "consider", with: "Diurétiques de l'anse", text: "Acidose lactique." }]), med("Doliprane", ["Paracetamol"], [{ level: "precaution", with: "Antivitamines K", text: "Risque hémorragique." }]));
    expect(check.official).toEqual([]);
    expect(check.officialBoth).toBe(true);
  });
});

describe("checkPair: what the safety review found", () => {
  const entry = (level: OfficialInteraction["level"], w: string, text: string): OfficialInteraction => ({ level, with: w, text });

  it("never says 'no mention' when a section was cut", () => {
    const cut = med("Advil", ["Ibuprofen"], [entry("consider", "Diurétiques", "x.")]);
    cut.official!.complete = false;
    expect(checkPair(cut, med("Doliprane", ["Paracetamol"], [entry("precaution", "Antivitamines K", "Risque.")])).officialBoth).toBe(false);
  });

  it("reads a class in prose about taking them together ('contre-indiqué avec les IMAO')", () => {
    const tramadol = med("Tramadol", ["Tramadol"], [entry(null, "", "TRAMADOL ALMUS est contre-indiqué avec les IMAO, car un syndrome sérotoninergique peut survenir.")]);
    expect(summary(checkPair(tramadol, med("Moclamine", ["Moclobemide"])))).toEqual(["avoid (TRAMADOL) "]);
  });

  it("knows the thesaurus' other ways of naming a class", () => {
    const cases: [string, string, string][] = [
      ["Inhibiteurs puissants du CYP3A", "Zeclar", "Clarithromycin"],
      ["Antisécrétoires inhibiteurs de la pompe à protons (IPP)", "Mopral", "Omeprazole"],
      ["Substances susceptibles de donner des torsades de pointes", "Atarax", "Hydroxyzine"],
      ["Médicaments sédatifs", "Lyrica", "Pregabalin"],
      ["Médicaments abaissant la pression artérielle", "Amlor", "Amlodipine"],
      ["β-bloquants", "Tenormine", "Atenolol"],
      ["Anti-inflammatoires non-stéroïdiens", "Advil", "Ibuprofen"],
      ["Anti-agrégants plaquettaires", "Kardegic", "Acetylsalicylate de lysine"],
      ["Antagonistes du calcium", "Isoptine", "Verapamil"],
      ["HBPM", "Lovenox", "Enoxaparin"],
      ["Autres hypokaliémiants", "Lasilix", "Furosemide"],
      ["Hyperkaliémiants", "Triatec", "Ramipril"],
      ["Médicaments à l'origine d'un syndrome sérotoninergique", "Topalgic", "Tramadol"],
    ];
    for (const [w, name, substance] of cases)
      expect(checkPair(med("X", ["Prednisolone"], [entry("precaution", w, "Risque.")]), med(name, [substance])).official, w).toHaveLength(1);
  });

  it("doesn't take a class for another one", () => {
    const none: [string, string][] = [
      ["Anticoagulants oraux", "Enoxaparin"],
      ["Antivitamines K", "Apixaban"],
      ["Antagonistes du calcium", "Calcium carbonate"],
      ["Médicaments mixtes adrénergiques-sérotoninergiques", "Sertraline"],
      ["IMAO-B", "Moclobemide"],
      ["Sulfamides hypoglycémiants", "Metformin"],
      ["Diurétiques épargneurs de potassium", "Furosemide"],
      ["Topiques gastro-intestinaux, antiacides et adsorbants", "Lithium carbonate"],
    ];
    for (const [w, substance] of none) expect(checkPair(med("X", ["Prednisolone"], [entry("precaution", w, "Risque.")]), med("Y", [substance])).official, `${w} / ${substance}`).toEqual([]);
  });

  it("finds English names and an ion named first", () => {
    const tahor = med("Tahor", ["Atorvastatin"], [entry("contraindicated", "Acide fusidique", "Risque de rhabdomyolyse.")]);
    expect(summary(checkPair(tahor, med("Fucidine", ["Fusidic acid"])))).toEqual(["avoid (TAHOR) contraindicated"]);
    const aldactone = med("Aldactone", ["Spironolactone"], [entry("not_recommended", "Potassium", "Hyperkaliémie potentiellement létale.")]);
    expect(summary(checkPair(aldactone, med("Diffu-K", ["Potassium chloride"])))).toEqual(["avoid (ALDACTONE) not_recommended"]);
    // "canrénoate de potassium" is another drug's salt, not potassium
    const sparing = med("Aldactone", ["Spironolactone"], [entry("contraindicated", "Autres diurétiques épargneurs de potassium (amiloride, canrénoate de potassium)", "Hyperkaliémie.")]);
    expect(checkPair(sparing, med("Diffu-K", ["Potassium chloride"])).official).toEqual([]);
  });

  it("a conditional exception excludes nothing", () => {
    const previscan = med("Previscan", ["Fluindione"], [entry("precaution", "Glucocorticoïdes (sauf hydrocortisone en traitement substitutif)", "Risque hémorragique.")]);
    expect(checkPair(previscan, med("Hydrocortisone", ["Hydrocortisone"])).official).toHaveLength(1);
  });

  it("'depends on the dose' never hides a level that stands without a dose, nor a dose the strength already reaches", () => {
    const mtx = med("Advil", ["Ibuprofen"], [
      entry("contraindicated", "Méthotrexate", "Augmentation de la toxicité hématologique."),
      entry("precaution", "Méthotrexate, utilisé à des doses inférieures ou égales à 20 mg/semaine", "Contrôle de l'hémogramme."),
    ]);
    expect(summary(checkPair(mtx, med("Novatrex", ["Methotrexate"])))).toEqual(["avoid (ADVIL) contraindicated+precaution"]);
    const previscan = med("Previscan", ["Fluindione"], PREVISCAN);
    expect(summary(checkPair(med("Aspegic", [["Acetylsalicylate de lysine", "1 g"]]), previscan))).toEqual(["avoid (PREVISCAN) contraindicated+consider"]);
    expect(summary(checkPair(med("Kardegic", [["Acetylsalicylate de lysine", "75 mg"]]), previscan))).toEqual(["avoid by dose (PREVISCAN) contraindicated+consider"]);
  });

  it("a later 'déconseillée' in prose is kept, past the quote cap", () => {
    const inexium = med("Inexium", ["Esomeprazole"], [
      entry(null, "", "Le clopidogrel est un promédicament transformé par le CYP2C19 en métabolite actif."),
      entry(null, "", "Une diminution de l'exposition au métabolite actif du clopidogrel a été observée."),
      entry(null, "", "Par mesure de précaution, l'utilisation concomitante de clopidogrel doit être déconseillée."),
    ]);
    const check = checkPair(inexium, med("Plavix", ["Clopidogrel"]));
    expect(check.official[0].severity).toBe("avoid");
    expect(check.official[0].parts.some((p) => p.quote.includes("déconseillée"))).toBe(true);
  });

  it("the app's own 'avoid' stays unless the official text says as much about those substances", () => {
    const tahor = med("Tahor", ["Atorvastatin"], [entry(null, "", "Les concentrations d'atorvastatine sont augmentées lors de l'association avec la clarithromycine.")]);
    const check = checkPair(tahor, med("Zeclar", ["Clarithromycin"]));
    expect(check.findings.map((f) => `${f.type}:${f.severity}`)).toEqual(["interaction:avoid"]);
    expect(check.official).toHaveLength(1);
  });
});
