// The settings search box for health conditions: what the reader types, matched against the
// names each known condition goes by in English, French and Arabic (with common spellings).
// Pure and client-safe, and it works offline: no model is involved. What matches nothing can
// be kept as typed, or, only if the reader asks, sent to /api/conditions (conditionsAi.ts).

import { fold } from "./knowledge";
import { CONDITION_IDS, type ConditionId } from "./profile";

/** every name a condition goes by; written plainly, normalized below */
const NAMES: Record<ConditionId, string[]> = {
  hemophilia: [
    "hemophilia", "haemophilia", "hemophiliac", "hemophilie", "hemophile", "hemofilia", "emofilia", "hamophilie",
    "bleeding disorder", "von willebrand", "willebrand", "clotting disorder", "coagulation disorder",
    "trouble de la coagulation", "maladie de willebrand",
    "هيموفيليا", "الهيموفيليا", "ناعور", "الناعور", "نزف الدم", "سيولة الدم", "فون ويلبراند",
  ],
  diabetes: [
    "diabetes", "diabetic", "diabete", "diabetique", "diabetes mellitus", "diabete sucre", "zuckerkrankheit",
    "سكري", "السكري", "مرض السكر", "مرض السكري", "داء السكري",
  ],
  hypertension: [
    "hypertension", "high blood pressure", "blood pressure", "hypertension arterielle", "hypertendu", "hypertendue",
    "tension arterielle", "tension", "ipertensione", "hipertension", "bluthochdruck",
    "ضغط الدم", "ارتفاع ضغط الدم", "ضغط مرتفع", "الضغط",
  ],
  coeliac: [
    "coeliac", "celiac", "coeliac disease", "celiac disease", "maladie coeliaque", "coeliaque", "celiaque",
    "gluten intolerance", "intolerance au gluten", "celiaquia", "celiachia", "zoliakie",
    "سيلياك", "الداء البطني", "الداء الزلاقي", "حساسية الغلوتين", "حساسية الجلوتين", "حساسية القمح",
  ],
  kidney_disease: [
    "kidney disease", "kidney failure", "kidney", "kidneys", "renal failure", "renal disease", "chronic kidney disease", "ckd",
    "insuffisance renale", "maladie renale", "maladie des reins", "reins", "rein", "dialyse", "dialysis",
    "الكلى", "مرض الكلى", "امراض الكلى", "فشل كلوي", "قصور كلوي", "غسيل الكلى",
  ],
  stomach_ulcer: [
    "stomach ulcer", "peptic ulcer", "gastric ulcer", "ulcer", "ulcere", "ulcere gastrique", "ulcere de l'estomac", "ulcere a l'estomac",
    "قرحة", "قرحة المعدة", "قرحة معدية",
  ],
  asthma: ["asthma", "asthmatic", "asthme", "asthmatique", "asma", "ربو", "الربو", "حساسية الصدر"],
  g6pd_deficiency: [
    "g6pd", "g6pd deficiency", "favism", "favisme", "deficit en g6pd", "glucose-6-phosphate dehydrogenase",
    "انيميا الفول", "فقر دم الفول", "نقص g6pd", "التفول", "فوال",
  ],
  pregnancy: ["pregnant", "pregnancy", "expecting a baby", "enceinte", "grossesse", "embarazo", "embarazada", "gravidanza", "incinta", "schwanger", "حامل", "حمل", "الحمل"],
  liver_disease: [
    "liver disease", "liver", "cirrhosis", "hepatitis", "liver failure", "cirrhose", "hepatite", "foie", "maladie du foie",
    "insuffisance hepatique", "الكبد", "مرض الكبد", "تليف الكبد", "التهاب الكبد", "تشمع الكبد",
  ],
};

/** what names something else while sharing words with a condition: "low blood pressure" is not hypertension */
const NOT: Partial<Record<ConditionId, string[]>> = {
  hypertension: [
    "low blood pressure", "hypotension", "tension headache", "cephalee de tension", "cephalees de tension", "tension basse",
    "ضغط منخفض", "انخفاض ضغط الدم", "هبوط الضغط", "هبوط ضغط الدم",
  ],
  kidney_disease: ["kidney stone", "kidney stones", "calcul renal", "calculs renaux", "colique nephretique", "حصى الكلى", "حصوه الكلى", "حصوات الكلى"],
  stomach_ulcer: ["mouth ulcer", "mouth ulcers", "canker sore", "aphte", "aphtes", "ulcere buccal", "leg ulcer", "ulcere de jambe", "قرحه الفم", "قرحه فمويه"],
  pregnancy: ["not pregnant", "pas enceinte", "non enceinte", "لست حامل", "ليست حامل", "غير حامل"],
  diabetes: ["diabetes insipidus", "diabete insipide", "سكري كاذب", "بوله التفهه"],
};

/** folded, Arabic letter variants merged (أإآ→ا, ى→ي, ة→ه), the article "ال" dropped, punctuation as spaces */
export function searchable(text: string): string {
  return fold(text)
    .replace(/[ً-ْـ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .map((w) => (w.length > 3 && w.startsWith("ال") ? w.slice(2) : w))
    .join(" ")
    .trim();
}

const INDEX = CONDITION_IDS.map((id) => ({ id, names: [...new Set(NAMES[id].map(searchable))], not: (NOT[id] ?? []).map(searchable) }));

/** the known conditions the text names or starts to name, the best matches first */
export function searchConditions(text: string): ConditionId[] {
  const q = searchable(text);
  if ([...q].length < 2) return [];
  const scored: { id: ConditionId; score: number }[] = [];
  for (const { id, names, not } of INDEX) {
    if (not.some((n) => ` ${q} `.includes(` ${n} `))) continue;
    let score = 0;
    for (const name of names) {
      // the whole name is in what was typed ("I have type 2 diabetes")
      if (` ${q} `.includes(` ${name} `)) score = Math.max(score, 2);
      // what was typed starts one of its words ("hémo", "pressure")
      else if (` ${name}`.includes(` ${q}`)) score = Math.max(score, 1);
    }
    if (score > 0) scored.push({ id, score });
  }
  const best = Math.max(0, ...scored.map((s) => s.score));
  // a full name found beats names that only start the same way
  return scored.filter((s) => s.score === best).map((s) => s.id);
}
