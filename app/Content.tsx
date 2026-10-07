"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import AskAi from "./components/AskAi";
import { AdditiveList, additiveId } from "./components/result/Additives";
import Alternatives from "./components/result/Alternatives";
import { Chip, GeneralChip, InfoList, Legend, StatusTile, SubLabel } from "./components/result/bits";
import DrinkPanel from "./components/result/DrinkPanel";
import { AllergenGroup, EstimatedIngredient, IngredientPill } from "./components/result/Ingredients";
import { DoseMarksPanel, GeneralList } from "./components/result/Marks";
import { GlutenPanel, NutritionPanel } from "./components/result/Nutrition";
import MedicineFoodCheck from "./components/result/MedicineFoodCheck";
import ProfileVerdict, { EveryoneVerdict } from "./components/result/ProfileVerdict";
import ShareButtons from "./components/result/ShareButtons";
import RawText from "./components/result/RawText";
import { capitalize, highlightMark, highlightTone, levelTone, presenceTone } from "./components/result/tones";
import WaterPanel from "./components/result/WaterPanel";
import WhyPanel from "./components/result/WhyPanel";
import {
  AlertIcon,
  BottleIcon,
  CameraIcon,
  ChartIcon,
  ClockIcon,
  cn,
  DropIcon,
  FlameIcon,
  FlaskIcon,
  InfoIcon,
  LabelIcon,
  ListIcon,
  Notice,
  PillIcon,
  PlateIcon,
  Section,
  SparkleIcon,
  Spinner,
  SugarIcon,
  SwapIcon,
  toneClasses,
  WheatIcon,
  type Tone,
} from "./components/ui";
import { useAlternatives } from "./lib/client/alternatives";
import { needsExcipients } from "./lib/analysis/medicine";
import type { HistoryEntry } from "./lib/client/history";
import { format, ltr, rich, useI18n } from "./lib/i18n/I18nProvider";
import type {
  Additive,
  AnalyzeMeta,
  ChatTurn,
  DoseMarks,
  Ingredient,
  SubjectKind,
  LabelAnalysis,
  Water,
  WaterFactId,
} from "./lib/analysis/types";

type SectionId =
  | "overview"
  | "dose"
  | "medicine"
  | "cautions"
  | "water"
  | "drink"
  | "allergens"
  | "dietary"
  | "nutrition"
  | "ingredients"
  | "additives"
  | "alternatives"
  | "details"
  | "raw"
  | "ask";

/** a tile before it is wired up: `target` is the section it jumps to */
interface Tile {
  title: string;
  label: string;
  tone: Tone;
  icon: React.ReactNode;
  hint?: string;
  target?: Exclude<SectionId, "overview">;
  /** nothing was found for it: the tile is left out */
  empty?: boolean;
}

const sectionIcons: Record<SectionId, React.ReactNode> = {
  overview: <InfoIcon />,
  dose: <ClockIcon />,
  medicine: <PillIcon />,
  cautions: <AlertIcon />,
  water: <DropIcon />,
  drink: <BottleIcon />,
  allergens: <AlertIcon />,
  dietary: <WheatIcon />,
  nutrition: <ChartIcon />,
  ingredients: <ListIcon />,
  additives: <FlaskIcon />,
  alternatives: <SwapIcon />,
  details: <InfoIcon />,
  raw: <InfoIcon />,
  ask: <SparkleIcon />,
};

const kindIcons: Record<SubjectKind, React.ReactNode> = {
  label: <LabelIcon />,
  drink: <BottleIcon />,
  water: <DropIcon />,
  dish: <PlateIcon />,
  medicine: <PillIcon />,
  other: <InfoIcon />,
};

export default function Content({
  result,
  meta,
  onTakePhoto,
  onAddExcipients,
  onEditProfile,
  onMarksChange,
  otherMedicines,
  onCheckWith,
  onOpenBarcode,
  adding = null,
  ask,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
  /** opens the camera, for results that ask for another photo */
  onTakePhoto?: () => void;
  /** opens the camera for an optional photo of a medicine's composition, merged into this result */
  onAddExcipients?: () => void;
  /** opens the profile screen */
  onEditProfile?: () => void;
  /** the reader typed their own dose in (or removed it): `null` removes the marks */
  onMarksChange?: (dose: Pick<DoseMarks, "morning" | "midday" | "evening" | "anytime" | "duration" | "note"> | null) => void;
  /** other medicines scanned on this device, and the way to check this one with one of them */
  otherMedicines?: HistoryEntry[];
  onCheckWith?: (other: HistoryEntry) => void;
  /** opens a product by its barcode (the alternatives it lists) */
  onOpenBarcode?: (code: string) => void;
  /** that photo is being read ("working") or showed no excipient list ("none") */
  adding?: "working" | "none" | null;
  /** the saved scan this result belongs to: enables "Ask AI" about it, with its earlier conversation */
  ask?: { scanId: string; chat?: ChatTurn[] };
}) {
  // nothing about a food: neither a label, a product, nor an estimate
  const empty =
    result.kind === "other" || (!result.label_detected && result.ingredients.length === 0 && !result.product.name && !result.medicine);
  if (empty) return <NotALabel result={result} />;
  return (
    <Results
      result={result}
      meta={meta}
      onTakePhoto={onTakePhoto}
      onAddExcipients={onAddExcipients}
      onEditProfile={onEditProfile}
      onMarksChange={onMarksChange}
      otherMedicines={otherMedicines}
      onCheckWith={onCheckWith}
      onOpenBarcode={onOpenBarcode}
      adding={adding}
      ask={ask}
    />
  );
}

function Results({
  result,
  meta,
  onTakePhoto,
  onAddExcipients,
  onEditProfile,
  onMarksChange,
  otherMedicines = [],
  onCheckWith,
  onOpenBarcode,
  adding,
  ask,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
  onTakePhoto?: () => void;
  onAddExcipients?: () => void;
  onEditProfile?: () => void;
  onMarksChange?: React.ComponentProps<typeof Content>["onMarksChange"];
  otherMedicines?: HistoryEntry[];
  onCheckWith?: (other: HistoryEntry) => void;
  onOpenBarcode?: (code: string) => void;
  adding: "working" | "none" | null;
  ask?: { scanId: string; chat?: ChatTurn[] };
}) {
  const { t, fmt, languageName } = useI18n();
  const r = t.results;
  const { kind, product, nutrition, ingredients, allergens, additives, gluten, sugar, water, drink, medicine } = result;
  const med = t.results.medicine;
  // better choices: fetched quietly for a packaged product with a barcode, and only there when something fit is found
  const alternatives = useAlternatives(product.barcode, (kind === "label" || kind === "drink") && !!onOpenBarcode);

  // ---- derived data ----
  const additiveByCode = new Map(additives.filter((a) => a.code).map((a) => [a.code!, a]));
  const contains = allergens.filter((a) => a.presence === "contains");
  const mayContain = allergens.filter((a) => a.presence === "may_contain");
  const tags = [product.category, product.quantity].filter((x): x is string => !!x);
  const isWater = kind === "water";
  const estimated = result.ingredient_source === "estimated";
  const hasNutrition = !!nutrition || (!!sugar.explanation && kind !== "drink");
  const unit = sugar.basis === "100ml" ? "ml" : "g";
  // free text is in the language the photo was analyzed in, which the interface may since have left
  const analysisLocale = meta?.locale ?? "en";
  const labelLanguage = result.language?.slice(0, 2) ?? null;
  const translated = !!labelLanguage && labelLanguage !== analysisLocale;
  const translationOf = (i: Ingredient) =>
    analysisLocale === "en" ? i.name_en
    : translated || estimated ? (i.name_local ?? i.name_en)
    : (i.name_local ?? null);
  // a packaged product whose ingredient list is still missing or only recalled
  const needsProductPhoto = (kind === "label" || kind === "drink") && (ingredients.length === 0 || estimated);
  // a medicine whose excipients weren't read on the photo: a second photo can add them, if the user wants
  const canAddExcipients = needsExcipients(result) && !!onAddExcipients;

  const details = {
    dates: [
      [r.details.bestBefore, result.dates.best_before],
      [r.details.useBy, result.dates.expiration],
      [r.details.produced, result.dates.production],
      [r.details.lot, result.dates.lot],
    ],
    storage: [
      [r.details.temperature, result.storage.temperature],
      [r.details.instructions, result.storage.instructions],
    ],
    manufacturer: [
      [r.details.name, result.manufacturer.name],
      [r.details.address, result.manufacturer.address],
      [r.details.country, result.manufacturer.country],
      [r.details.origin, result.origin],
    ],
  } satisfies Record<string, [string, string | null][]>;
  const marks = [...result.certifications, ...result.claims];
  const hasDetails = marks.length > 0 || Object.values(details).some((rows) => rows.some(([, v]) => v));

  // what the sheet contains depends on what was photographed; the order is the reading order
  const shown: Record<Exclude<SectionId, "overview">, boolean> = {
    // a medicine always has a dose block when the reader can type their own in
    dose: !!medicine && (!!medicine.marks || !!medicine.typical_dose || !!medicine.how_to_take || !!onMarksChange),
    medicine: !!medicine && (medicine.active.length > 0 || medicine.uses.length > 0 || !!medicine.form),
    cautions: !!medicine && (medicine.not_for.length > 0 || medicine.warnings.length > 0 || medicine.side_effects.length > 0),
    water: isWater,
    // Nothing is shown for what couldn't be found: no "unknown" tile, row or section.
    // The warnings at the top say what is missing and how to get it.
    drink: kind === "drink" && (sugar.per_100 !== null || ingredients.length > 0),
    // a medicine's excipients get their own notes; the food-allergen list would only repeat them
    allergens: !isWater && !medicine && (allergens.length > 0 || ingredients.length > 0),
    dietary: !isWater && gluten.status !== "unclear",
    nutrition: hasNutrition,
    ingredients: ingredients.length > 0 || (medicine?.excipients.length ?? 0) > 0,
    additives: additives.length > 0,
    // only when there are suggestions that are sold in the reader's country and fit their profile
    alternatives: alternatives !== null,
    details: hasDetails,
    raw: !!result.raw_text,
    ask: !!ask,
  };
  const order: Exclude<SectionId, "overview">[] =
    kind === "dish" ? ["ingredients", "allergens", "dietary", "nutrition", "additives", "details", "raw", "ask"]
    : kind === "drink" ? ["drink", "nutrition", "additives", "alternatives", "ingredients", "allergens", "dietary", "details", "raw", "ask"]
    : kind === "medicine" ? ["dose", "medicine", "cautions", "ingredients", "dietary", "nutrition", "additives", "details", "raw", "ask"]
    : ["water", "allergens", "dietary", "nutrition", "ingredients", "additives", "alternatives", "details", "raw", "ask"];
  const visible = order.filter((id) => shown[id]);
  const titles: Record<SectionId, string> = {
    overview: r.sections.overview,
    dose: med.dose,
    medicine: med.about,
    cautions: med.cautions,
    water: r.water.title,
    drink: r.drink.title,
    allergens: estimated && kind === "dish" ? r.dish.allergens : r.sections.allergens,
    dietary: r.sections.dietary,
    nutrition: r.sections.nutrition,
    ingredients:
      medicine ? med.excipients
      : estimated ? r.dish.ingredients
      : r.sections.ingredients,
    additives: r.sections.additives,
    alternatives: t.alternatives.title,
    details: r.sections.details,
    raw: r.sections.raw,
    ask: t.ask.title,
  };
  const sections: SectionId[] = ["overview", ...visible];
  const sectionKey = sections.join();

  // ---- navigation / highlight ----
  const [flash, setFlash] = useState<{ id: string; n: number } | null>(null);
  const [active, setActive] = useState<SectionId>("overview");
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const navRef = useRef<HTMLDivElement>(null);

  const goTo = useCallback((id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    setFlash((f) => ({ id, n: (f?.n ?? 0) + 1 }));
    clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(null), 1500);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const flashFor = (id: string) => (flash?.id === id ? flash.n : undefined);

  // a question from elsewhere on the sheet (an additive's "Ask AI"): the Ask section sends it
  const [askRequest, setAskRequest] = useState<{ text: string; n: number } | null>(null);
  const askAbout = (text: string) => {
    setAskRequest((q) => ({ text, n: (q?.n ?? 0) + 1 }));
    goTo("section-ask");
  };
  const askAboutAdditive = (a: Additive) => {
    const name = capitalize(a.name_local ?? a.name);
    askAbout(format(t.ask.aboutAdditive, { name: a.code ? `${name} (${a.code})` : name }));
  };

  // scroll-spy: the active section is the last one whose top has passed under the sticky nav
  useEffect(() => {
    const ids = sectionKey.split(",") as SectionId[];
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`section-${id}`);
        if (el && el.getBoundingClientRect().top <= 150) current = id;
      }
      setActive(atBottom ? ids[ids.length - 1] : current);
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      cancelAnimationFrame(frame);
    };
  }, [sectionKey]);

  // keep the active chip visible in the horizontally scrolling nav
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-id="${active}"]`);
    if (!nav || !chip) return;
    nav.scrollTo({
      left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2,
      behavior: "smooth",
    });
  }, [active]);

  const sid = (id: SectionId) => `section-${id}`;
  /** where a tile leads: the section, when it is on the sheet */
  const jump = (id: Exclude<SectionId, "overview">) => (shown[id] ? id : undefined);
  const head = (id: Exclude<SectionId, "overview">) => ({
    id: sid(id),
    icon: sectionIcons[id],
    title: titles[id],
    flash: flashFor(sid(id)),
  });
  const found = (count: number) => format(r.tiles.found, { count });

  // ---- at a glance: what matters most for this kind of photo ----
  const factOf = (...ids: WaterFactId[]) => water?.facts.find((f) => ids.includes(f.id));
  const waterTile = (title: string, value: string | null, fact: Water["facts"][number] | undefined): Tile => ({
    title,
    label: value ?? r.water.notPrinted,
    empty: value === null,
    tone: fact ? highlightTone[fact.tone] : "zinc",
    icon: <DropIcon />,
    hint: fact ? r.water.short[fact.id as keyof typeof r.water.short] : undefined,
    target: jump("water"),
  });
  const glutenTile: Tile = {
    title: r.tiles.gluten,
    label: r.presence[gluten.status],
    tone: presenceTone[gluten.status],
    icon: <WheatIcon />,
    hint: r.tiles.confidence[gluten.confidence],
    empty: gluten.status === "unclear",
    target: jump("dietary"),
  };
  const kcal = nutrition?.per_serving?.energy_kcal ?? nutrition?.per_100?.energy_kcal ?? null;
  const caloriesTile: Tile = {
    title: r.dish.calories,
    label: kcal !== null ? ltr(`≈ ${fmt(kcal)} kcal`) : r.tiles.unknown,
    empty: kcal === null,
    tone: "zinc",
    icon: <FlameIcon />,
    hint:
      kcal === null ? undefined
      : nutrition?.per_serving?.energy_kcal != null ? r.dish.perPortion
      : r.dish.per100,
    target: jump("nutrition"),
  };
  const sugarTile: Tile = {
    title: r.tiles.sugar,
    label: r.level[sugar.level],
    empty: sugar.level === "unknown",
    tone: levelTone[sugar.level],
    icon: <SugarIcon />,
    hint: sugar.per_100 !== null ? ltr(`${fmt(sugar.per_100)} g / 100 ${unit}`) : undefined,
    target: jump(kind === "drink" ? "drink" : "nutrition"),
  };
  const allergenTile: Tile = {
    title: titles.allergens,
    label:
      contains.length ? found(contains.length)
      : estimated && mayContain.length ? found(mayContain.length)
      : ingredients.length ? r.tiles.noneFound
      : r.tiles.unknown,
    empty: contains.length === 0 && mayContain.length === 0 && ingredients.length === 0,
    tone:
      contains.length ? "red"
      : mayContain.length ? "amber"
      : ingredients.length ? "green"
      : "zinc",
    icon: <AlertIcon />,
    hint:
      contains.length || !estimated ?
        mayContain.length ?
          format(r.tiles.mayContain, { count: mayContain.length })
        : undefined
      : undefined,
    target: jump("allergens"),
  };
  const countTile = (title: string, count: number, target: Exclude<SectionId, "overview">, icon: React.ReactNode): Tile => ({
    title,
    label:
      count ? found(count)
      : ingredients.length ? r.tiles.noneFound
      : r.tiles.unknown,
    empty: count === 0 && ingredients.length === 0,
    tone:
      count ? "amber"
      : ingredients.length ? "green"
      : "zinc",
    icon,
    target: count ? jump(target) : jump("ingredients"),
  });
  const additiveTile = countTile(r.tiles.additives, additives.length, "additives", <FlaskIcon />);

  const allTiles: Tile[] =
    isWater ?
      [
        waterTile(
          r.water.ph,
          water?.ph != null ? ltr(fmt(water.ph)) : null,
          factOf("ph_neutral", "ph_acidic", "ph_alkaline", "ph_sparkling"),
        ),
        waterTile(
          r.water.mineralContent,
          water?.dry_residue_mg_l != null ? ltr(`${fmt(water.dry_residue_mg_l)} mg/L`) : null,
          factOf("mineral_very_low", "mineral_low", "mineral_medium", "mineral_high"),
        ),
        waterTile(
          r.water.hardness,
          water?.hardness_mg_l != null ? ltr(`${fmt(water.hardness_mg_l)} mg/L`) : null,
          factOf("hardness_soft", "hardness_medium", "hardness_hard", "hardness_very_hard"),
        ),
        waterTile(
          r.water.sodium,
          water?.minerals.sodium != null ? ltr(`${fmt(water.minerals.sodium)} mg/L`) : null,
          factOf("low_sodium", "sodium_rich"),
        ),
      ]
    : kind === "drink" ?
      [
        sugarTile,
        countTile(r.drink.colours, drink?.colours.length ?? 0, "drink", <BottleIcon />),
        countTile(r.drink.sweeteners, drink?.sweeteners.length ?? 0, "drink", <SugarIcon />),
        additiveTile,
        allergenTile,
        glutenTile,
      ]
    : kind === "dish" ? [allergenTile, glutenTile, caloriesTile]
    : medicine ?
      [
        {
          title: med.active,
          label: medicine.active.length ? medicine.active.map((a) => capitalize(a.name_local ?? a.name)).join(" + ") : med.notRead,
          empty: medicine.active.length === 0,
          tone: "zinc",
          icon: <PillIcon />,
          hint:
            medicine.active
              .map((a) => a.strength)
              .filter(Boolean)
              .join(" + ") || undefined,
          target: jump("medicine"),
        },
        ...(medicine.marks ?
          [
            {
              title: med.marked,
              // one line across the box: so many a day, no times to list
              ...(medicine.marks.anytime ?
                { label: `${ltr(fmt(medicine.marks.anytime))} ${med.anytime}` }
              : {
                  label: ltr([medicine.marks.morning, medicine.marks.midday, medicine.marks.evening].map(fmt).join(" · ")),
                  hint: `${med.morning} · ${med.midday} · ${med.evening}`,
                }),
              empty: !medicine.marks.anytime && medicine.marks.morning + medicine.marks.midday + medicine.marks.evening === 0,
              tone: "zinc" as const,
              icon: <ClockIcon />,
              target: jump("dose"),
            },
          ]
        : []),
        glutenTile,
        { ...countTile(med.toNote, medicine.excipients.length, "ingredients", <ListIcon />), target: jump("ingredients") },
      ]
    : [glutenTile, sugarTile, allergenTile, additiveTile];
  const tiles = allTiles.filter((tile) => !tile.empty);

  const blocks: Record<Exclude<SectionId, "overview">, React.ReactNode> = {
    dose: medicine && (
      <Section {...head("dose")}>
        <div className="space-y-6">
          <DoseMarksPanel marks={medicine.marks} onChange={onMarksChange} />
          {(medicine.typical_dose || medicine.how_to_take) && (
            <div>
              <div className="mb-2.5 flex flex-wrap items-center gap-2">
                <p className="eyebrow text-ink-soft">{med.typicalDose}</p>
                <GeneralChip>{med.general}</GeneralChip>
              </div>
              {medicine.typical_dose && (
                <p dir="auto" className="text-[15px] leading-7">
                  {medicine.typical_dose}
                </p>
              )}
              {medicine.how_to_take && (
                <p dir="auto" className="mt-2 text-sm leading-6 text-ink-soft">
                  <span className="font-medium text-ink">{med.howToTake}: </span>
                  {medicine.how_to_take}
                </p>
              )}
              <p className="mt-3 text-sm font-medium">{med.yourDose}</p>
            </div>
          )}
        </div>
      </Section>
    ),

    medicine: medicine && (
      <Section {...head("medicine")}>
        <dl className="overflow-hidden rounded-2xl bg-mute-soft/60">
          {medicine.active.map((a) => (
            <div key={a.name} className="flex items-baseline gap-4 border-t border-rule/70 px-4 py-3.5 first:border-t-0">
              <dt className="eyebrow w-28 shrink-0 text-ink-soft">{med.active}</dt>
              <dd className="min-w-0 flex-1">
                <span dir="auto" className="font-display block text-lg leading-tight font-semibold">
                  {capitalize(a.name_local ?? a.name)}
                </span>
                {a.strength && <span className="mt-0.5 block text-sm text-ink-soft tabular-nums">{ltr(a.strength)}</span>}
              </dd>
            </div>
          ))}
          {medicine.form && (
            <div className="flex items-baseline gap-4 border-t border-rule/70 px-4 py-3.5 first:border-t-0">
              <dt className="eyebrow w-28 shrink-0 text-ink-soft">{med.form}</dt>
              <dd dir="auto" className="text-sm">
                {medicine.form}
              </dd>
            </div>
          )}
        </dl>
        {medicine.uses.length > 0 && <GeneralList title={med.uses} items={medicine.uses} className="mt-6" />}
      </Section>
    ),

    cautions: medicine && (
      <Section {...head("cautions")} aside={<GeneralChip>{med.general}</GeneralChip>}>
        <div className="space-y-6">
          <GeneralList title={med.notFor} items={medicine.not_for} mark="!" tone="red" />
          <GeneralList title={med.warnings} items={medicine.warnings} mark="!" tone="amber" />
          <GeneralList title={med.sideEffects} items={medicine.side_effects} />
        </div>
      </Section>
    ),

    water: (
      <Section {...head("water")}>
        {water ?
          <WaterPanel water={water} />
        : <Notice tone="zinc">{r.water.noComposition}</Notice>}
      </Section>
    ),

    drink: (
      <Section {...head("drink")}>
        <DrinkPanel result={result} />
      </Section>
    ),

    allergens: (
      <Section {...head("allergens")}>
        {allergens.length === 0 ?
          <p className="text-sm leading-6 text-ink-soft">{ingredients.length ? r.allergens.none : r.allergens.unreadable}</p>
        : <div className="space-y-6">
            {contains.length > 0 && <AllergenGroup title={r.allergens.contains} tone="red" items={contains} />}
            {mayContain.length > 0 && (
              <AllergenGroup title={estimated ? r.dish.likely : r.allergens.mayContain} tone="amber" items={mayContain} />
            )}
          </div>
        }
      </Section>
    ),

    dietary: (
      <Section {...head("dietary")}>
        <GlutenPanel status={gluten.status} confidence={gluten.confidence} evidence={gluten.evidence} />
        {/* in a medicine, wheat starch means gluten is present but at a very low level: say so next to the verdict */}
        {medicine?.excipients
          .filter((e) => e.id === "wheat_starch" || e.id === "starch_unspecified")
          .map((e) => (
            <Notice key={e.id} tone="amber" className="mt-4">
              <span dir="auto" className="block">
                {e.note}
              </span>
              <span dir="auto" className="mt-1 block text-xs text-ink-soft/80">
                {med.source} {e.source}
              </span>
            </Notice>
          ))}
      </Section>
    ),

    nutrition: (
      <Section
        {...head("nutrition")}
        title={nutrition?.estimated ? r.dish.nutrition : r.nutrition.title}
        aside={
          nutrition?.serving_size && (
            <>
              {r.nutrition.serving} · <span dir="auto">{nutrition.serving_size}</span>
            </>
          )
        }
      >
        <NutritionPanel result={result} />
      </Section>
    ),

    ingredients: (
      <Section {...head("ingredients")} aside={ingredients.length > 0 && format(r.ingredients.count, { count: ingredients.length })}>
        {medicine && medicine.excipients.length > 0 && (
          <div className="mb-6">
            <SubLabel>{med.toKnow}</SubLabel>
            <ul className="space-y-2">
              {medicine.excipients.map((e) => (
                <li key={e.id}>
                  <Notice tone={e.id === "wheat_starch" || e.id === "starch_unspecified" ? "amber" : "zinc"}>
                    <span dir="auto" className="block font-medium">
                      {capitalize(e.matched)}
                    </span>
                    <span dir="auto" className="block text-ink-soft">
                      {e.note}
                    </span>
                    <span dir="auto" className="mt-1 block text-xs text-ink-soft/80">
                      {med.source} {e.source}
                    </span>
                  </Notice>
                </li>
              ))}
            </ul>
          </div>
        )}
        {estimated ?
          <ol>
            {ingredients.map((ing, i) => (
              <EstimatedIngredient key={`${i}-${ing.name}`} ingredient={ing} translation={translationOf(ing)} />
            ))}
          </ol>
        : <ol className="flex flex-wrap gap-2">
            {ingredients.map((ing, i) => (
              <IngredientPill
                key={`${i}-${ing.name}`}
                ingredient={ing}
                translation={translationOf(ing)}
                additive={ing.e_number ? additiveByCode.get(ing.e_number) : undefined}
                onAdditive={(a) => goTo(additiveId(a))}
              />
            ))}
          </ol>
        }
        <div className="mt-5 flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-soft">
          <Legend tone="red">{r.ingredients.legendAllergen}</Legend>
          {!estimated && <Legend tone="amber">{r.ingredients.legendAdditive}</Legend>}
        </div>
      </Section>
    ),

    additives: (
      <Section {...head("additives")} aside={found(additives.length)}>
        <AdditiveList additives={additives} highlighted={flash?.id} onAsk={ask ? askAboutAdditive : undefined} />
      </Section>
    ),

    alternatives:
      alternatives && onOpenBarcode ?
        <Section {...head("alternatives")}>
          <Alternatives data={alternatives} unit={unit} onOpen={onOpenBarcode} />
        </Section>
      : null,

    details: (
      <Section {...head("details")}>
        <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2">
          <InfoList title={r.details.dates} rows={details.dates} />
          <InfoList title={r.details.storage} rows={details.storage} />
          <InfoList title={r.details.manufacturer} rows={details.manufacturer} />
          {marks.length > 0 && (
            <div>
              <SubLabel>{r.details.claims}</SubLabel>
              <div className="flex flex-wrap gap-1.5">
                {result.certifications.map((c) => (
                  <Chip key={`cert-${c}`} tone="green">
                    <span dir="auto">{c}</span>
                  </Chip>
                ))}
                {result.claims.map((c) => (
                  <Chip key={`claim-${c}`} tone="zinc">
                    <span dir="auto">{c}</span>
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </div>
      </Section>
    ),

    raw: result.raw_text ? <RawText id={sid("raw")} title={titles.raw} text={result.raw_text} flash={flashFor(sid("raw"))} /> : null,
    ask: ask && (
      <Section {...head("ask")} className="print:hidden">
        <AskAi key={ask.scanId} scanId={ask.scanId} result={result} initialChat={ask.chat} request={askRequest} />
      </Section>
    ),
  };

  return (
    <div className="flex w-full flex-col gap-3">
      {/* Section nav */}
      <nav
        ref={navRef}
        aria-label={r.nav}
        className="animate-fade-in scrollbar-none sticky top-16 z-20 print:hidden -mx-4 flex gap-2 overflow-x-auto bg-paper/90 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0"
      >
        {sections.map((id) => (
          <button
            key={id}
            data-id={id}
            onClick={() => goTo(sid(id))}
            aria-current={active === id ? "true" : undefined}
            className={cn(
              "inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-medium whitespace-nowrap transition-colors duration-200",
              active === id ? "bg-accent-soft text-on-accent-soft" : "text-ink-soft ring-1 ring-rule hover:bg-mute-soft hover:text-ink",
            )}
          >
            {titles[id]}
          </button>
        ))}
      </nav>

      {/* Overview */}
      <header
        id={sid("overview")}
        className="animate-fade-up scroll-mt-32 rounded-[28px] bg-sheet px-5 pt-6 pb-6 ring-1 ring-rule sm:px-7 sm:pt-7"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          <Chip icon={kindIcons[kind]}>{t.kinds[kind]}</Chip>
          {estimated && <Chip tone="amber">{r.source.estimated}</Chip>}
          {result.database && <Chip tone="zinc">{format(r.source.database, { name: result.database.name })}</Chip>}
          {translated && <Chip tone="zinc">{format(r.labelIn, { language: languageName(labelLanguage) })}</Chip>}
        </div>
        {product.brand && (
          <p dir="auto" className="eyebrow mt-5 text-ink-soft">
            {product.brand}
          </p>
        )}
        <h2
          dir="auto"
          className={cn("font-display text-[1.9rem] leading-[1.1] font-bold text-balance sm:text-4xl", product.brand ? "mt-1" : "mt-5")}
        >
          {product.name ?? product.category ?? r.fallbackName}
        </h2>
        {tags.length > 0 && (
          <p className="mt-2 flex flex-wrap gap-x-2 text-sm text-ink-soft">
            {tags.map((x, i) => (
              <span key={x} dir="auto">
                {i > 0 && <span aria-hidden>· </span>}
                {x}
              </span>
            ))}
          </p>
        )}
        {result.summary && (
          <p dir="auto" className="mt-4 text-[15px] leading-7 text-ink-soft">
            {result.summary}
          </p>
        )}
        {result.highlights.length > 0 && (
          <ul className="mt-4 space-y-2">
            {result.highlights.map((h) => (
              <li key={h.text} className="flex items-start gap-3 text-sm leading-6">
                <span
                  aria-hidden
                  className={cn(
                    "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-xs font-bold",
                    toneClasses[highlightTone[h.tone]],
                  )}
                >
                  {highlightMark[h.tone]}
                </span>
                <span dir="auto">{h.text}</span>
              </li>
            ))}
          </ul>
        )}

        <ProfileVerdict result={result} onEdit={onEditProfile} />
        <EveryoneVerdict result={result} />
        <MedicineFoodCheck result={result} />

        <div className="mt-5 flex flex-wrap gap-2 print:hidden">
          {ask && (
            // the way to put a question about this product, from the top of the sheet
            <button
              onClick={() => goTo(sid("ask"))}
              className="inline-flex min-h-11 items-center gap-2 rounded-full bg-accent-soft px-5 text-sm font-semibold text-on-accent-soft transition hover:brightness-95 active:scale-[0.98]"
            >
              <SparkleIcon className="size-4.5" />
              {medicine ? t.ask.placeholderMedicine : t.ask.placeholder}
            </button>
          )}
          <ShareButtons result={result} name={product.name ?? product.category ?? r.fallbackName} />
        </div>

        {/* nothing the analysis is unsure about is hidden */}
        {(result.warnings.length > 0 || needsProductPhoto || canAddExcipients || result.database) && (
          <div className="mt-5 space-y-2">
            {result.warnings.map((w) => (
              <Notice key={w} tone="amber">
                <span dir="auto">{w}</span>
                {result.database && w.includes(result.database.product) && (
                  <a
                    href={result.database.url}
                    target="_blank"
                    rel="noreferrer"
                    className="ms-1 font-medium text-accent underline underline-offset-2"
                  >
                    {r.source.viewEntry}
                  </a>
                )}
              </Notice>
            ))}
            {needsProductPhoto && onTakePhoto && (
              // the warning above says why; this is the way out
              <button
                onClick={onTakePhoto}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-accent px-5 text-sm font-semibold text-on-accent transition active:scale-[0.98]"
              >
                <CameraIcon className="size-5" />
                {r.retake.button}
              </button>
            )}
            {canAddExcipients && (
              // optional: the result stands without it
              <div className="space-y-2">
                {adding === "none" && (
                  <Notice tone="zinc">
                    <span role="status">{med.addPhotoNone}</span>
                  </Notice>
                )}
                <button
                  onClick={onAddExcipients}
                  disabled={adding === "working"}
                  className="inline-flex min-h-11 items-center gap-2 rounded-full px-5 py-2 text-start text-sm font-semibold text-ink ring-1 ring-rule transition hover:bg-mute-soft active:scale-[0.98] disabled:opacity-70"
                >
                  {adding === "working" ?
                    <Spinner className="text-accent" />
                  : <CameraIcon className="size-5 shrink-0 text-accent" />}
                  <span>
                    {adding === "working" ? med.addPhotoWorking : med.addPhoto}
                    {adding !== "working" && <span className="eyebrow ms-2 text-ink-soft">{med.optional}</span>}
                  </span>
                </button>
              </div>
            )}
          </div>
        )}
      </header>

      {medicine && medicine.active.length > 0 && onCheckWith && (
        // two medicines at once: the same substance twice, or a known interaction
        <div className="rounded-3xl bg-sheet px-5 py-4 ring-1 ring-rule sm:px-7">
          <p className="font-medium">{t.together.checkWith}</p>
          {otherMedicines.length === 0 ?
            <p className="mt-1 text-sm leading-6 text-ink-soft">{t.together.checkWithHint}</p>
          : <div className="mt-2.5 flex flex-wrap gap-2">
              {otherMedicines.map((other) => (
                <button
                  key={other.id}
                  onClick={() => onCheckWith(other)}
                  className="inline-flex min-h-10 max-w-full items-center rounded-full bg-accent-soft px-4 py-1.5 text-start text-sm font-medium text-on-accent-soft transition hover:brightness-95 active:scale-[0.98]"
                >
                  <span dir="auto" className="truncate">
                    {format(t.together.checkButton, { name: other.result.product.name ?? t.results.fallbackName })}
                  </span>
                </button>
              ))}
            </div>
          }
        </div>
      )}

      {/* At a glance */}
      <div className={cn("grid grid-cols-2 gap-3 sm:grid-cols-3", tiles.length === 0 && "hidden")}>
        {tiles.map(({ title, label, tone, icon, hint, target }, i) => (
          <StatusTile
            key={title}
            title={title}
            label={label}
            tone={tone}
            icon={icon}
            hint={hint}
            onClick={target ? () => goTo(sid(target)) : undefined}
            // the last tile fills its row instead of leaving a hole (2 columns, 3 from `sm`)
            className={
              i === tiles.length - 1 ?
                cn(tiles.length % 2 === 1 && "col-span-2", ["sm:col-span-1", "sm:col-span-3", "sm:col-span-2"][tiles.length % 3])
              : undefined
            }
          />
        ))}
      </div>

      <WhyPanel result={result} />

      {visible.map((id) => (
        <React.Fragment key={id}>{blocks[id]}</React.Fragment>
      ))}

      <footer className="px-2 py-4 text-xs leading-5 text-ink-soft">
        {r.disclaimer}
        {meta && (
          <span className="eyebrow mt-2 block tabular-nums">
            {format(r.duration, { seconds: fmt(Math.round(meta.duration_ms / 100) / 10) })}
          </span>
        )}
      </footer>
    </div>
  );
}

function NotALabel({ result }: { result: LabelAnalysis }) {
  const { t } = useI18n();
  const n = t.results.notALabel;
  return (
    <article className="animate-fade-up overflow-hidden rounded-[28px] bg-sheet px-5 pt-6 pb-7 ring-1 ring-rule sm:px-7">
      <span aria-hidden className="grid size-12 place-items-center rounded-2xl bg-warn-soft text-warn">
        <CameraIcon className="size-6" />
      </span>
      <h2 className="font-display mt-4 text-2xl leading-tight font-bold text-balance">{n.title}</h2>
      {result.product.name && (
        <p className="mt-3 text-sm leading-6 text-ink-soft">
          {rich(format(n.looksLike, { name: result.product.name }), (name) => (
            <b dir="auto" className="text-ink">
              {name}
            </b>
          ))}
        </p>
      )}
      {result.summary && (
        <p dir="auto" className="mt-3 text-sm leading-6 text-ink-soft">
          {result.summary}
        </p>
      )}
      {result.warnings.length > 0 && (
        <div className="mt-4 space-y-2">
          {result.warnings.map((w) => (
            <Notice key={w} tone="amber">
              <span dir="auto">{w}</span>
            </Notice>
          ))}
        </div>
      )}
      <ol className="mt-6 space-y-2">
        {n.tips.map((tip) => (
          <li key={tip} className="flex gap-3 rounded-2xl bg-mute-soft/60 px-4 py-3 text-sm leading-6">
            <span aria-hidden className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-accent-soft text-on-accent-soft">
              <svg
                viewBox="0 0 24 24"
                className="size-3"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m5 12.500 4.500 4.500L19 7.500" />
              </svg>
            </span>
            {tip}
          </li>
        ))}
      </ol>
    </article>
  );
}
