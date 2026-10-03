// The sentences normalize.ts writes itself (warnings, evidence, sugar explanation,
// computed highlights), in every interface language. English is the reference:
// its wording is pinned by normalize.test.ts.
// Shared by client and server: keep it free of runtime dependencies.

import type { Locale } from "../i18n/locales";
import type { AllergenId, LevelKey } from "./types";
import { ALLERGEN_NAMES } from "./types";

type Unit = "g" | "ml";
type Threshold = { low: number; high: number };

export interface AnalysisMessages {
  allergenNames: Record<AllergenId, string>;
  warnings: {
    nutritionDropped: string;
    nutritionInconsistent: (issues: string[]) => string;
    reconstructed: string;
    notALabel: string;
    poorQuality: string;
    fairQuality: string;
    noIngredients: string;
    cutShort: string;
    /** the model answered, but never with a structured reading */
    unstructured: string;
  };
  issues: { sugarsOverCarbs: string; saturatesOverFat: string; macrosOver100: string; energyMismatch: string };
  evidence: {
    ingredient: (name: string) => string;
    glutenDeclared: string;
    glutenMayContain: string;
    glutenFree: string;
    milkDeclared: string;
    milkMayContain: string;
    lactoseFree: string;
  };
  sources: { mayContain: string; declared: string; listed: string };
  /** keyed by English class names: those of knowledge.ts `additiveCategory`, plus the ones models write anyway */
  categories: Record<string, string>;
  sugar: {
    high: (value: number, unit: Unit, t: Threshold) => string;
    low: (value: number, unit: Unit, t: Threshold) => string;
    medium: (value: number, unit: Unit, t: Threshold) => string;
    notPrinted: string;
  };
  highlights: {
    high: (nutrient: LevelKey, value: number | null, unit: Unit) => string;
    lowSugars: (value: number | null, unit: Unit) => string;
  };
}

const en: AnalysisMessages = {
  allergenNames: ALLERGEN_NAMES,
  warnings: {
    nutritionDropped: "Some nutrition values were unreadable or impossible and were left out.",
    nutritionInconsistent: (issues) =>
      `Some nutrition values look inconsistent (${issues.join("; ")}). Double-check them on the pack.`,
    reconstructed: "The ingredient list was reconstructed from the label text.",
    notALabel:
      "This photo doesn't look like a food label. For best results, photograph the ingredient list or nutrition table up close.",
    poorQuality:
      "The label was hard to read, so some details may be missing or inaccurate. A sharper, closer photo will help.",
    fairQuality: "Parts of the label were hard to read. Double-check key numbers against the pack.",
    noIngredients: "No ingredient list was readable, so allergen, gluten and additive checks are incomplete.",
    cutShort: "The analysis was cut short; some sections may be incomplete.",
    unstructured:
      "The AI couldn't produce a structured reading of this photo. Try a sharper, well-lit photo of the ingredient list or nutrition table.",
  },
  issues: {
    sugarsOverCarbs: "sugars exceed carbohydrates",
    saturatesOverFat: "saturates exceed total fat",
    macrosOver100: "macronutrients add up to more than 100 g",
    energyMismatch: "energy doesn't match the macronutrients",
  },
  evidence: {
    ingredient: (name) => `Ingredient: ${name}`,
    glutenDeclared: "Gluten declared as an allergen",
    glutenMayContain: "“May contain” gluten statement",
    glutenFree: "Labelled gluten-free",
    milkDeclared: "Milk declared as an allergen",
    milkMayContain: "“May contain” milk statement",
    lactoseFree: "Labelled lactose-free",
  },
  sources: {
    mayContain: "“May contain” statement",
    declared: "Declared on the label",
    listed: "Listed on the label",
  },
  categories: {},
  sugar: {
    high: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, above the ${t.high} g “high” threshold used on UK front-of-pack labels.`,
    low: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, at or below the ${t.low} g “low” threshold used on UK front-of-pack labels.`,
    medium: (v, unit, t) =>
      `${v} g of sugars per 100 ${unit}, between the ${t.low} g “low” and ${t.high} g “high” thresholds used on UK front-of-pack labels.`,
    notPrinted: "No sugar value per 100 g/ml is printed on the visible label.",
  },
  highlights: {
    high: (nutrient, value, unit) =>
      `High in ${{ fat: "fat", saturated_fat: "saturated fat", sugars: "sugars", salt: "salt" }[nutrient]} (${value} g per 100 ${unit})`,
    lowSugars: (value, unit) => `Low in sugars (${value} g per 100 ${unit})`,
  },
};

/** French prints decimals with a comma */
const n = (v: number | null) => String(v).replace(".", ",");

const fr: AnalysisMessages = {
  allergenNames: {
    gluten: "Gluten",
    milk: "Lait",
    eggs: "Œufs",
    peanuts: "Arachides",
    tree_nuts: "Fruits à coque",
    soy: "Soja",
    sesame: "Sésame",
    fish: "Poisson",
    crustaceans: "Crustacés",
    molluscs: "Mollusques",
    celery: "Céleri",
    mustard: "Moutarde",
    sulphites: "Sulfites",
    lupin: "Lupin",
  },
  warnings: {
    nutritionDropped: "Certaines valeurs nutritionnelles étaient illisibles ou impossibles et ont été ignorées.",
    nutritionInconsistent: (issues) =>
      `Certaines valeurs nutritionnelles semblent incohérentes (${issues.join(" ; ")}). Vérifiez-les sur l'emballage.`,
    reconstructed: "La liste des ingrédients a été reconstituée à partir du texte de l'étiquette.",
    notALabel:
      "Cette photo ne ressemble pas à une étiquette alimentaire. Pour un meilleur résultat, photographiez de près la liste des ingrédients ou le tableau nutritionnel.",
    poorQuality:
      "L'étiquette était difficile à lire : certains détails peuvent manquer ou être inexacts. Une photo plus nette et plus proche aidera.",
    fairQuality:
      "Certaines parties de l'étiquette étaient difficiles à lire. Vérifiez les chiffres importants sur l'emballage.",
    noIngredients:
      "Aucune liste d'ingrédients n'était lisible : les vérifications des allergènes, du gluten et des additifs sont incomplètes.",
    cutShort: "L'analyse a été interrompue ; certaines sections peuvent être incomplètes.",
    unstructured:
      "L'IA n'a pas pu produire une lecture structurée de cette photo. Essayez une photo plus nette et bien éclairée de la liste des ingrédients ou du tableau nutritionnel.",
  },
  issues: {
    sugarsOverCarbs: "les sucres dépassent les glucides",
    saturatesOverFat: "les acides gras saturés dépassent les matières grasses totales",
    macrosOver100: "les macronutriments totalisent plus de 100 g",
    energyMismatch: "l'énergie ne correspond pas aux macronutriments",
  },
  evidence: {
    ingredient: (name) => `Ingrédient : ${name}`,
    glutenDeclared: "Gluten déclaré comme allergène",
    glutenMayContain: "Mention « peut contenir » du gluten",
    glutenFree: "Étiqueté sans gluten",
    milkDeclared: "Lait déclaré comme allergène",
    milkMayContain: "Mention « peut contenir » du lait",
    lactoseFree: "Étiqueté sans lactose",
  },
  sources: {
    mayContain: "Mention « peut contenir »",
    declared: "Déclaré sur l'étiquette",
    listed: "Indiqué sur l'étiquette",
  },
  categories: {
    Colour: "Colorant",
    Preservative: "Conservateur",
    "Antioxidant / acidity regulator": "Antioxydant / correcteur d'acidité",
    "Thickener, stabiliser or emulsifier": "Épaississant, stabilisant ou émulsifiant",
    "Acidity regulator / anti-caking agent": "Correcteur d'acidité / antiagglomérant",
    "Flavour enhancer": "Exhausteur de goût",
    "Glazing agent, gas or sweetener": "Agent d'enrobage, gaz ou édulcorant",
    "Modified starch": "Amidon modifié",
    "Other additive": "Autre additif",
    Color: "Colorant",
    Emulsifier: "Émulsifiant",
    Stabiliser: "Stabilisant",
    Stabilizer: "Stabilisant",
    Thickener: "Épaississant",
    "Gelling agent": "Gélifiant",
    Sweetener: "Édulcorant",
    Antioxidant: "Antioxydant",
    Acid: "Acidifiant",
    Acidifier: "Acidifiant",
    "Acidity regulator": "Correcteur d'acidité",
    "Raising agent": "Poudre à lever",
    "Anti-caking agent": "Antiagglomérant",
    "Glazing agent": "Agent d'enrobage",
    Humectant: "Humectant",
    Flavouring: "Arôme",
    Flavoring: "Arôme",
  },
  sugar: {
    high: (v, unit, t) =>
      `${n(v)} g de sucres pour 100 ${unit}, au-dessus du seuil « élevé » de ${n(t.high)} g utilisé sur les étiquettes en face avant au Royaume-Uni.`,
    low: (v, unit, t) =>
      `${n(v)} g de sucres pour 100 ${unit}, au niveau ou en dessous du seuil « faible » de ${n(t.low)} g utilisé sur les étiquettes en face avant au Royaume-Uni.`,
    medium: (v, unit, t) =>
      `${n(v)} g de sucres pour 100 ${unit}, entre les seuils « faible » (${n(t.low)} g) et « élevé » (${n(t.high)} g) utilisés sur les étiquettes en face avant au Royaume-Uni.`,
    notPrinted: "Aucune teneur en sucres pour 100 g/ml n'est imprimée sur la partie visible de l'étiquette.",
  },
  highlights: {
    high: (nutrient, value, unit) =>
      `Riche en ${{ fat: "matières grasses", saturated_fat: "acides gras saturés", sugars: "sucres", salt: "sel" }[nutrient]} (${n(value)} g pour 100 ${unit})`,
    lowSugars: (value, unit) => `Pauvre en sucres (${n(value)} g pour 100 ${unit})`,
  },
};

/** Arabic prose reads better with Arabic unit names than with Latin ones mid-sentence */
const arUnit = (unit: Unit) => (unit === "ml" ? "مل" : "غ");

const ar: AnalysisMessages = {
  allergenNames: {
    gluten: "الغلوتين",
    milk: "الحليب",
    eggs: "البيض",
    peanuts: "الفول السوداني",
    tree_nuts: "المكسّرات",
    soy: "الصويا",
    sesame: "السمسم",
    fish: "السمك",
    crustaceans: "القشريات",
    molluscs: "الرخويات",
    celery: "الكرفس",
    mustard: "الخردل",
    sulphites: "الكبريتيت",
    lupin: "الترمس",
  },
  warnings: {
    nutritionDropped: "بعض القيم الغذائية كانت غير مقروءة أو غير ممكنة فتم استبعادها.",
    nutritionInconsistent: (issues) =>
      `بعض القيم الغذائية تبدو غير متسقة (${issues.join("؛ ")}). تحقق منها على العبوة.`,
    reconstructed: "أُعيد تكوين قائمة المكوّنات من نص الملصق.",
    notALabel:
      "هذه الصورة لا تبدو ملصقًا غذائيًّا. للحصول على أفضل نتيجة، صوّر قائمة المكوّنات أو جدول القيم الغذائية عن قرب.",
    poorQuality: "كانت قراءة الملصق صعبة، لذا قد تكون بعض التفاصيل ناقصة أو غير دقيقة. صورة أوضح وأقرب ستساعد.",
    fairQuality: "بعض أجزاء الملصق كانت صعبة القراءة. تحقق من الأرقام المهمة على العبوة.",
    noIngredients:
      "لم تكن قائمة المكوّنات مقروءة، لذا فإن فحوص مسببات الحساسية والغلوتين والمضافات غير مكتملة.",
    cutShort: "انقطع التحليل قبل اكتماله؛ قد تكون بعض الأقسام ناقصة.",
    unstructured:
      "لم يتمكن الذكاء الاصطناعي من قراءة هذه الصورة قراءة منظَّمة. جرّب صورة أوضح وجيدة الإضاءة لقائمة المكوّنات أو جدول القيم الغذائية.",
  },
  issues: {
    sugarsOverCarbs: "السكريات تتجاوز الكربوهيدرات",
    saturatesOverFat: "الدهون المشبعة تتجاوز إجمالي الدهون",
    macrosOver100: "مجموع المغذيات الكبرى يتجاوز 100 غ",
    energyMismatch: "الطاقة لا تتوافق مع المغذيات الكبرى",
  },
  evidence: {
    ingredient: (name) => `مكوّن: ${name}`,
    glutenDeclared: "الغلوتين مصرَّح به كمسبب للحساسية",
    glutenMayContain: "عبارة «قد يحتوي على» الغلوتين",
    glutenFree: "مكتوب عليه خالٍ من الغلوتين",
    milkDeclared: "الحليب مصرَّح به كمسبب للحساسية",
    milkMayContain: "عبارة «قد يحتوي على» الحليب",
    lactoseFree: "مكتوب عليه خالٍ من اللاكتوز",
  },
  sources: {
    mayContain: "عبارة «قد يحتوي على»",
    declared: "مصرَّح به على الملصق",
    listed: "مذكور على الملصق",
  },
  categories: {
    Colour: "ملوّن",
    Preservative: "مادة حافظة",
    "Antioxidant / acidity regulator": "مضاد أكسدة / منظّم حموضة",
    "Thickener, stabiliser or emulsifier": "مثخّن أو مثبّت أو مستحلب",
    "Acidity regulator / anti-caking agent": "منظّم حموضة / مانع تكتّل",
    "Flavour enhancer": "معزّز نكهة",
    "Glazing agent, gas or sweetener": "مادة ملمّعة أو غاز أو مُحلٍّ",
    "Modified starch": "نشا معدَّل",
    "Other additive": "مادة مضافة أخرى",
    Color: "ملوّن",
    Emulsifier: "مستحلب",
    Stabiliser: "مثبّت",
    Stabilizer: "مثبّت",
    Thickener: "مثخّن",
    "Gelling agent": "مادة مهلِّمة",
    Sweetener: "مُحلٍّ",
    Antioxidant: "مضاد أكسدة",
    Acid: "محمِّض",
    Acidifier: "محمِّض",
    "Acidity regulator": "منظّم حموضة",
    "Raising agent": "مادة رافعة",
    "Anti-caking agent": "مانع تكتّل",
    "Glazing agent": "مادة ملمّعة",
    Humectant: "مرطّب",
    Flavouring: "منكّه",
    Flavoring: "منكّه",
  },
  sugar: {
    high: (v, unit, t) =>
      `${v} غ من السكريات لكل 100 ${arUnit(unit)}، أي أعلى من عتبة «مرتفع» البالغة ${t.high} غ المعتمدة في الملصقات الأمامية البريطانية.`,
    low: (v, unit, t) =>
      `${v} غ من السكريات لكل 100 ${arUnit(unit)}، أي عند عتبة «منخفض» البالغة ${t.low} غ المعتمدة في الملصقات الأمامية البريطانية أو دونها.`,
    medium: (v, unit, t) =>
      `${v} غ من السكريات لكل 100 ${arUnit(unit)}، أي بين عتبتي «منخفض» (${t.low} غ) و«مرتفع» (${t.high} غ) المعتمدتين في الملصقات الأمامية البريطانية.`,
    notPrinted: "لا توجد قيمة للسكريات لكل 100 غ/مل مطبوعة على الجزء الظاهر من الملصق.",
  },
  highlights: {
    high: (nutrient, value, unit) =>
      `نسبة مرتفعة من ${{ fat: "الدهون", saturated_fat: "الدهون المشبعة", sugars: "السكريات", salt: "الملح" }[nutrient]} (${value} غ لكل 100 ${arUnit(unit)})`,
    lowSugars: (value, unit) => `نسبة منخفضة من السكريات (${value} غ لكل 100 ${arUnit(unit)})`,
  },
};

const MESSAGES: Record<Locale, AnalysisMessages> = { en, fr, ar };

/** an additive class in the reader's language; models often answer with the English class even when asked not to */
export function localCategory(m: AnalysisMessages, category: string | null): string | null {
  if (!category) return category;
  const wanted = category.trim().toLowerCase();
  const key = Object.keys(m.categories).find((k) => k.toLowerCase() === wanted);
  return key ? m.categories[key] : category;
}

/** unknown or missing locales fall back to English */
export function analysisMessages(locale: unknown): AnalysisMessages {
  return typeof locale === "string" && Object.hasOwn(MESSAGES, locale) ? MESSAGES[locale as Locale] : en;
}
