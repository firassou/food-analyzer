import { describe, expect, it } from "vitest";
import { OFFICIAL } from "./__fixtures__/official";
import { officialFindings } from "./official";
import { EMPTY_PROFILE, type ConditionId, type Profile } from "./profile";
import type { OfficialInfo } from "./types";

// excerpts of the published texts (base-donnees-publique.medicaments.gouv.fr, October 2026)
const ADVIL: OfficialInfo = {
  ...OFFICIAL,
  product: "ADVIL 400 mg, comprimé enrobé",
  indications: ["Traitement de courte durée de la fièvre et/ou des douleurs telles que maux de tête, états grippaux, douleurs dentaires, courbatures et règles douloureuses."],
  contraindications: [
    "Ce médicament est contre-indiqué dans les situations suivantes:",
    "antécédents d'asthme déclenchés par la prise d'ibuprofène ou de substances d'activité proche telles que: autres AINS, acide acétylsalicylique,",
    "ulcère peptique évolutif, antécédents d'ulcère peptique, hémorragie digestive ou antécédents d'hémorragie digestive récurrente (2 épisodes distincts, ou plus, d'hémorragie ou d'ulcération objectivés),",
    "insuffisance hépatique sévère,",
    "insuffisance rénale sévère,",
    "lupus érythémateux disséminé,",
    "grossesse, à partir du début du 6ème mois (24 semaines d’aménorrhée) (voir rubrique 4.6),",
  ],
  warnings: [
    "Les AINS doivent être utilisés avec prudence chez les patients présentant des antécédents d'hypertension et/ou d'insuffisance cardiaque.",
    "Comme les autres AINS, l'ibuprofène peut inhiber l'agrégation plaquettaire : prudence chez les patients atteints de troubles de la coagulation.",
  ],
  pregnancy: ["Grossesse", "A partir du début du 6ème mois de grossesse, ce médicament est contre-indiqué."],
};
const GLUCOPHAGE: OfficialInfo = {
  ...OFFICIAL,
  product: "GLUCOPHAGE 850 mg, comprimé pelliculé",
  indications: ["Traitement du diabète de type 2, en particulier en cas de surcharge pondérale, lorsque le régime alimentaire et l’exercice physique ne sont pas suffisants."],
  contraindications: [
    "Tout type d'acidose métabolique aiguë (telle que l’acidose lactique, l’acidocétose diabétique).",
    "Précoma diabétique.",
    "Insuffisance rénale sévère (DFG < 30 mL/min).",
    "Insuffisance hépatocellulaire, intoxication alcoolique aiguë, alcoolisme.",
  ],
  warnings: ["Les patients diabétiques doivent continuer à suivre leur régime alimentaire."],
  pregnancy: ["Un diabète non contrôlé pendant la grossesse est associé à un risque accru d'anomalies congénitales.", "La metformine peut être utilisée pendant la grossesse si nécessaire."],
};
const TERALITHE: OfficialInfo = {
  ...OFFICIAL,
  product: "TERALITHE 250 mg, comprimé sécable",
  indications: ["Prévention des rechutes des troubles bipolaires.", "Traitement curatif des états d'excitation maniaque ou hypomaniaque."],
  contraindications: ["Insuffisance rénale en cas d'impossibilité d'exercer une surveillance très stricte de la lithiémie.", "chez les patients présentant une allergie au blé (autre que la maladie cœliaque)."],
  warnings: ["Un risque suicidaire existe chez les patients atteints de troubles bipolaires."],
  pregnancy: ["Grossesse", "Le lithium est déconseillé pendant la grossesse, en particulier au cours du premier trimestre."],
};

const who = (...conditions: ConditionId[]): Profile => ({ ...EMPTY_PROFILE, conditions });
const summary = (official: OfficialInfo, profile: Profile) => officialFindings(official, profile).findings.map((f) => `${f.level}:${f.condition ?? f.other}:${f.section}`);

describe("officialFindings", () => {
  it("is empty without an official text", () => {
    expect(officialFindings(null, who("asthma"))).toEqual({ findings: [], complete: false });
    expect(officialFindings(undefined, who("asthma"))).toEqual({ findings: [], complete: false });
  });

  it("avoid: a condition named in the contraindications, quoted as published", () => {
    expect(summary(ADVIL, who("asthma", "stomach_ulcer", "kidney_disease", "liver_disease"))).toEqual([
      "avoid:asthma:contraindications",
      "avoid:stomach_ulcer:contraindications",
      "avoid:kidney_disease:contraindications",
      "avoid:liver_disease:contraindications",
    ]);
    expect(officialFindings(ADVIL, who("liver_disease")).findings[0].quote).toBe("insuffisance hépatique sévère,");
  });

  it("check: a condition named in the warnings only", () => {
    expect(summary(ADVIL, who("hypertension", "hemophilia"))).toEqual(["check:hypertension:warnings", "check:hemophilia:warnings"]);
    expect(officialFindings(ADVIL, who("hemophilia")).findings[0].quote).toContain("troubles de la coagulation");
  });

  it("nothing for a condition the text doesn't name", () => {
    expect(summary(ADVIL, who("g6pd_deficiency", "diabetes"))).toEqual([]);
  });

  it("pregnancy: from the contraindications, else from section 4.6, for every medicine", () => {
    expect(summary(ADVIL, who("pregnancy"))).toEqual(["avoid:pregnancy:contraindications"]);
    expect(summary(TERALITHE, who("pregnancy"))).toEqual(["avoid:pregnancy:pregnancy"]);
    expect(officialFindings(TERALITHE, who("pregnancy")).findings[0].quote).toBe("Le lithium est déconseillé pendant la grossesse, en particulier au cours du premier trimestre.");
    expect(summary(GLUCOPHAGE, who("pregnancy"))).toEqual(["check:pregnancy:pregnancy"]);
  });

  it("a medicine for diabetes isn't 'avoid' for a diabetic: its complications and precautions aren't the condition", () => {
    expect(summary(GLUCOPHAGE, who("diabetes"))).toEqual([]);
    expect(summary(GLUCOPHAGE, who("kidney_disease", "liver_disease"))).toEqual(["avoid:kidney_disease:contraindications", "avoid:liver_disease:contraindications"]);
  });

  it("coeliac disease is left to the gluten check (the wheat-starch sentence says it suits them)", () => {
    expect(summary(TERALITHE, who("coeliac"))).toEqual([]);
  });

  it("another condition is found by its French term, by the stems of its words", () => {
    const bipolar: Profile = { ...EMPTY_PROFILE, otherConditions: ["Bipolar disorder"], otherTerms: { "Bipolar disorder": "trouble bipolaire" } };
    // lithium treats it ("Prévention des rechutes des troubles bipolaires"): its precautions are for the people it treats
    expect(summary(TERALITHE, bipolar)).toEqual([]);
    const lupus: Profile = { ...EMPTY_PROFILE, otherConditions: ["Lupus"], otherTerms: { Lupus: "lupus érythémateux systémique" } };
    // "disséminé" in the text, "systémique" in the term: the first word and one other are enough
    expect(summary(ADVIL, lupus)).toEqual(["avoid:Lupus:contraindications"]);
    const epilepsy: Profile = { ...EMPTY_PROFILE, otherConditions: ["Epilepsy"], otherTerms: { Epilepsy: "épilepsie" } };
    expect(summary({ ...ADVIL, warnings: ["Prudence chez les patients épileptiques."] }, epilepsy)).toEqual(["check:Epilepsy:warnings"]);
  });

  it("another condition without its French term can't be looked for: the check is incomplete", () => {
    const check = officialFindings(ADVIL, { ...EMPTY_PROFILE, otherConditions: ["Epilepsy"] });
    expect(check).toEqual({ findings: [], complete: false });
  });
});

describe("officialFindings: what the safety review found", () => {
  it("reads curly apostrophes like straight ones", () => {
    const text = { ...OFFICIAL, contraindications: ["Antécédents d’ulcère gastroduodénal."], warnings: ["Troubles de l’hémostase : prudence."] };
    expect(summary(text, who("stomach_ulcer", "hemophilia"))).toEqual(["avoid:stomach_ulcer:contraindications", "check:hemophilia:warnings"]);
  });

  it("a contraindication only WITH another medicine is a 'check', not an 'avoid'", () => {
    const ramipril = {
      ...OFFICIAL,
      contraindications: ["L’association de ramipril à des médicaments contenant de l’aliskiren est contre-indiquée chez les patients présentant un diabète sucré ou une insuffisance rénale (DFG < 60 mL/min/1,73 m²)."],
      warnings: ["Une surveillance de la kaliémie est recommandée."],
    };
    expect(summary(ramipril, who("diabetes", "kidney_disease"))).toEqual(["check:diabetes:combination", "check:kidney_disease:combination"]);
  });

  it("finds the wordings the regulator uses", () => {
    const text = {
      ...OFFICIAL,
      contraindications: ["Maladie hémorragique constitutionnelle ou acquise.", "Affection hépatique évolutive.", "HTA sévère non contrôlée."],
      warnings: ["Maladie ulcéreuse gastroduodénale : prudence.", "Altération de la fonction rénale."],
    };
    expect(summary(text, who("hemophilia", "liver_disease", "hypertension", "stomach_ulcer", "kidney_disease"))).toEqual([
      "avoid:hemophilia:contraindications",
      "avoid:liver_disease:contraindications",
      "avoid:hypertension:contraindications",
      "check:stomach_ulcer:warnings",
      "check:kidney_disease:warnings",
    ]);
    expect(summary({ ...OFFICIAL, warnings: ["Hypertension artérielle pulmonaire."] }, who("hypertension"))).toEqual([]);
    expect(summary({ ...OFFICIAL, warnings: ["Ulcère cornéen."] }, who("stomach_ulcer"))).toEqual([]);
  });

  it("pregnancy: a negated 'contraindicated' or a sentence about something else is no 'avoid'; the bare heading is never quoted", () => {
    const p = who("pregnancy");
    const with46 = (pregnancy: string[]) => ({ ...OFFICIAL, warnings: ["x"], pregnancy });
    expect(summary(with46(["Grossesse", "Ce médicament n'est pas contre-indiqué pendant la grossesse."]), p)).toEqual(["check:pregnancy:pregnancy"]);
    expect(summary(with46(["Les femmes enceintes ne doivent pas interrompre leur traitement."]), p)).toEqual(["check:pregnancy:pregnancy"]);
    expect(summary(with46(["L'utilisation de ce médicament doit être évitée pendant la grossesse."]), p)).toEqual(["avoid:pregnancy:pregnancy"]);
    expect(officialFindings(with46(["Grossesse", "Les données chez la femme enceinte sont limitées."]), p).findings[0].quote).toBe("Les données chez la femme enceinte sont limitées.");
  });

  it("a 4.6 or 4.4 that couldn't be read, or a section that was cut, makes the check incomplete", () => {
    expect(officialFindings({ ...OFFICIAL, warnings: ["x"], pregnancy: ["Grossesse"] }, who("pregnancy")).complete).toBe(false);
    expect(officialFindings({ ...OFFICIAL, warnings: [] }, who("asthma")).complete).toBe(false);
    expect(officialFindings({ ...OFFICIAL, warnings: ["x"], complete: false }, who("asthma")).complete).toBe(false);
    expect(officialFindings({ ...OFFICIAL, warnings: ["x"] }, who("asthma")).complete).toBe(true);
  });

  it("'treats' means named right after 'traitement de…', not merely named in 4.1", () => {
    const ramipril = {
      ...OFFICIAL,
      indications: ["Prévention cardiovasculaire : réduction de la morbidité chez les patients présentant un diabète avec au moins un facteur de risque."],
      warnings: ["Patients diabétiques : surveiller la glycémie."],
    };
    expect(summary(ramipril, who("diabetes"))).toEqual(["check:diabetes:warnings"]);
  });
});
