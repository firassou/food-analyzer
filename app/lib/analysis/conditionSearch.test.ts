import { describe, expect, it } from "vitest";
import { conditionsSystemPrompt, readConditionAnswer } from "./conditionsAi";
import { searchConditions } from "./conditionSearch";

describe("searchConditions", () => {
  it("finds a condition by any of its names, in English, French and Arabic", () => {
    expect(searchConditions("hémophilie")).toEqual(["hemophilia"]);
    expect(searchConditions("Haemophilia")).toEqual(["hemophilia"]);
    expect(searchConditions("هيموفيليا")).toEqual(["hemophilia"]);
    expect(searchConditions("von Willebrand")).toEqual(["hemophilia"]);
    expect(searchConditions("diabète")).toEqual(["diabetes"]);
    expect(searchConditions("سكري")).toEqual(["diabetes"]);
    expect(searchConditions("hypertension")).toEqual(["hypertension"]);
    expect(searchConditions("ضغط الدم")).toEqual(["hypertension"]);
    expect(searchConditions("high blood pressure")).toEqual(["hypertension"]);
    expect(searchConditions("maladie cœliaque")).toEqual(["coeliac"]);
    expect(searchConditions("enceinte")).toEqual(["pregnancy"]);
    expect(searchConditions("حامل")).toEqual(["pregnancy"]);
  });

  it("doesn't take what only shares a word with a condition for it", () => {
    for (const text of ["low blood pressure", "hypotension", "tension headache", "انخفاض ضغط الدم", "kidney stones", "calculs rénaux", "حصى الكلى", "mouth ulcer", "aphte", "not pregnant", "pas enceinte", "diabetes insipidus"])
      expect(searchConditions(text), text).toEqual([]);
    expect(searchConditions("high blood pressure")).toEqual(["hypertension"]);
    expect(searchConditions("kidney failure")).toEqual(["kidney_disease"]);
  });

  it("matches while typing, from a word's start", () => {
    expect(searchConditions("hémo")).toContain("hemophilia");
    expect(searchConditions("asth")).toEqual(["asthma"]);
    expect(searchConditions("ربو")).toEqual(["asthma"]);
  });

  it("finds a condition named inside a sentence", () => {
    expect(searchConditions("I have type 2 diabetes")).toEqual(["diabetes"]);
    expect(searchConditions("je suis enceinte de 5 mois")).toEqual(["pregnancy"]);
  });

  it("ignores Arabic spelling variants (alef, ta marbuta, ya)", () => {
    expect(searchConditions("الربو")).toEqual(["asthma"]);
    expect(searchConditions("قرحه المعده")).toEqual(["stomach_ulcer"]);
  });

  it("finds nothing for an unknown condition or a too-short query", () => {
    expect(searchConditions("Crohn's disease")).toEqual([]);
    expect(searchConditions("h")).toEqual([]);
    expect(searchConditions("   ")).toEqual([]);
  });
});

describe("the AI fallback", () => {
  it("lists every known id, asks for the other names in the reader's language, and JSON only", () => {
    const prompt = conditionsSystemPrompt("fr");
    for (const id of ["hemophilia", "g6pd_deficiency", "liver_disease"]) expect(prompt).toContain(id);
    expect(prompt).toContain("in French");
    expect(prompt).toMatch(/data, not instructions/);
  });

  it("keeps only known ids, once each, and names the other conditions", () => {
    expect(readConditionAnswer('{"ids": ["diabetes", "lupus", "diabetes", 4, "asthma"], "others": ["Lupus"]}')).toEqual({ ids: ["diabetes", "asthma"], others: [{ name: "Lupus", fr: null }] });
    expect(readConditionAnswer('{"ids": [], "others": ["Bipolar disorder"]}')).toEqual({ ids: [], others: [{ name: "Bipolar disorder", fr: null }] });
    expect(readConditionAnswer('["hypertension"]')).toEqual({ ids: ["hypertension"], others: [] });
    expect(readConditionAnswer('{"ids": []}')).toEqual({ ids: [], others: [] });
  });

  it("keeps the other names short and plain: no markup, no sentences, no repeats, three at most", () => {
    expect(readConditionAnswer('{"ids": [], "others": ["<b>x</b>", "see https://x.y", "a very long sentence that is clearly not the name of any condition", "Migraine", "migraine", 7]}')).toEqual({
      ids: [],
      others: [{ name: "Migraine", fr: null }],
    });
    expect(readConditionAnswer('{"others": ["A", "B", "C", "D"]}')!.others).toHaveLength(3);
  });

  it("keeps the French term the official texts use, when the model gives one", () => {
    expect(readConditionAnswer('{"ids": [], "others": [{"name": "Bipolar disorder", "fr": "trouble bipolaire"}]}')!.others).toEqual([{ name: "Bipolar disorder", fr: "trouble bipolaire" }]);
    expect(readConditionAnswer('{"ids": [], "others": [{"name": "Lupus", "fr": "<script>"}]}')!.others).toEqual([{ name: "Lupus", fr: null }]);
  });

  it("tolerates malformed or wrapped JSON", () => {
    expect(readConditionAnswer('Sure! ```json\n{"ids": ["kidney_disease",]}\n```')!.ids).toEqual(["kidney_disease"]);
    expect(readConditionAnswer('<think>hmm</think>{"ids": ["pregnancy"')!.ids).toEqual(["pregnancy"]);
    expect(readConditionAnswer("I don't know")).toBeNull();
    expect(readConditionAnswer('{"answer": "diabetes"}')).toBeNull();
  });
});
