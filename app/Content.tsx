"use client";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Card, cn, Dot, Pill, Tone, toneClasses } from "./components/ui";
import { LEVEL_THRESHOLDS } from "./lib/analysis/knowledge";
import type {
  Additive,
  AnalyzeMeta,
  Ingredient,
  LabelAnalysis,
  Level,
  NutrientKey,
  Nutrients,
  Presence,
} from "./lib/analysis/types";

type SectionId =
  | "overview"
  | "allergens"
  | "dietary"
  | "nutrition"
  | "ingredients"
  | "additives"
  | "details"
  | "raw";

const presence: Record<Presence, { label: string; tone: Tone }> = {
  contains: { label: "Contains", tone: "red" },
  likely_contains: { label: "Likely contains", tone: "amber" },
  no_indication: { label: "No indication", tone: "green" },
  unclear: { label: "Unclear", tone: "zinc" },
};

const levelUi: Record<Level | "unknown", { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "green" },
  medium: { label: "Medium", tone: "amber" },
  high: { label: "High", tone: "red" },
  unknown: { label: "Unknown", tone: "zinc" },
};

const confidenceWidth = { low: "33%", medium: "66%", high: "100%" };

const tableRows: {
  key: NutrientKey | "energy";
  label: string;
  sub?: boolean;
  unit: string;
}[] = [
  { key: "energy", label: "Energy", unit: "" },
  { key: "fat_g", label: "Fat", unit: "g" },
  { key: "saturated_fat_g", label: "of which saturates", sub: true, unit: "g" },
  { key: "carbohydrates_g", label: "Carbohydrates", unit: "g" },
  { key: "sugars_g", label: "of which sugars", sub: true, unit: "g" },
  { key: "fiber_g", label: "Fibre", unit: "g" },
  { key: "protein_g", label: "Protein", unit: "g" },
  { key: "salt_g", label: "Salt", unit: "g" },
  { key: "sodium_mg", label: "Sodium", unit: "mg" },
];

const meters = [
  { key: "fat", nutrient: "fat_g", label: "Fat" },
  { key: "saturated_fat", nutrient: "saturated_fat_g", label: "Saturates" },
  { key: "sugars", nutrient: "sugars_g", label: "Sugars" },
  { key: "salt", nutrient: "salt_g", label: "Salt" },
] as const;

const fmt = (n: number) =>
  n.toLocaleString("en", { maximumFractionDigits: n < 10 ? 2 : 1 });

function cellValue(
  n: Nutrients | null,
  key: NutrientKey | "energy",
  unit: string,
): string | null {
  if (!n) return null;
  if (key === "energy") {
    const parts = [
      n.energy_kj !== null && `${fmt(n.energy_kj)}\u00a0kJ`,
      n.energy_kcal !== null && `${fmt(n.energy_kcal)}\u00a0kcal`,
    ].filter(Boolean);
    return parts.length ? parts.join(" / ") : null;
  }
  const v = n[key];
  return v === null ? null : `${fmt(v)}\u00a0${unit}`;
}

const additiveId = (a: Pick<Additive, "code" | "name">) =>
  `additive-${(a.code ?? a.name).toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const LANGUAGES: Record<string, string> = {
  ar: "Arabic",
  de: "German",
  es: "Spanish",
  fr: "French",
  it: "Italian",
  nl: "Dutch",
  pt: "Portuguese",
  tr: "Turkish",
  pl: "Polish",
  ru: "Russian",
  zh: "Chinese",
  ja: "Japanese",
};

export default function Content({
  result,
  meta,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
}) {
  if (!result.label_detected) return <NotALabel result={result} />;
  return <Results result={result} meta={meta} />;
}

function Results({
  result,
  meta,
}: {
  result: LabelAnalysis;
  meta?: AnalyzeMeta;
}) {
  const {
    product,
    nutrition,
    ingredients,
    allergens,
    additives,
    gluten,
    lactose,
    sugar,
  } = result;

  // ---- derived data ----
  const additiveByCode = new Map(
    additives.filter((a) => a.code).map((a) => [a.code!, a]),
  );
  const contains = allergens.filter((a) => a.presence === "contains");
  const mayContain = allergens.filter((a) => a.presence === "may_contain");
  const tags = [product.category, product.quantity].filter(
    (t): t is string => !!t,
  );
  const hasNutrition = !!nutrition || !!sugar.explanation;
  const unit = sugar.basis === "100ml" ? "ml" : "g";

  const details = {
    dates: [
      ["Best before", result.dates.best_before],
      ["Use by", result.dates.expiration],
      ["Produced", result.dates.production],
      ["Lot", result.dates.lot],
    ],
    storage: [
      ["Temperature", result.storage.temperature],
      ["Instructions", result.storage.instructions],
    ],
    manufacturer: [
      ["Name", result.manufacturer.name],
      ["Address", result.manufacturer.address],
      ["Country", result.manufacturer.country],
      ["Origin", result.origin],
    ],
  } satisfies Record<string, [string, string | null][]>;
  const hasDetails =
    result.certifications.length > 0 ||
    result.claims.length > 0 ||
    Object.values(details).some((rows) => rows.some(([, v]) => v));

  const sections: { id: SectionId; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "allergens", label: "Allergens" },
    { id: "dietary", label: "Gluten & lactose" },
    ...(hasNutrition ? [{ id: "nutrition" as const, label: "Nutrition" }] : []),
    ...(ingredients.length ?
      [{ id: "ingredients" as const, label: "Ingredients" }]
    : []),
    ...(additives.length ?
      [{ id: "additives" as const, label: "Additives" }]
    : []),
    ...(hasDetails ? [{ id: "details" as const, label: "Details" }] : []),
    ...(result.raw_text ? [{ id: "raw" as const, label: "Label text" }] : []),
  ];
  const sectionKey = sections.map((s) => s.id).join();

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
    flashTimer.current = setTimeout(() => setFlash(null), 1800);
  }, []);
  useEffect(() => () => clearTimeout(flashTimer.current), []);
  const flashFor = (id: string) => (flash?.id === id ? flash.n : undefined);

  // scroll-spy: the active section is the last one whose top has passed under the sticky nav
  useEffect(() => {
    const ids = sectionKey.split(",") as SectionId[];
    let frame = 0;
    const update = () => {
      frame = 0;
      const atBottom =
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4;
      let current = ids[0];
      for (const id of ids) {
        const el = document.getElementById(`section-${id}`);
        if (el && el.getBoundingClientRect().top <= 160) current = id;
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

  return (
    <div className="flex w-full flex-col gap-5">
      {/* Section nav */}
      <nav
        ref={navRef}
        aria-label="Result sections"
        className="animate-fade-in sticky top-14 z-20 -mx-4 flex gap-1.5 overflow-x-auto border-b border-zinc-200/70 bg-zinc-50/90 px-4 py-2.5 backdrop-blur-lg scrollbar-none sm:mx-0 sm:rounded-2xl sm:border sm:px-2 dark:border-zinc-800/70 dark:bg-black/85"
      >
        {sections.map((s) => (
          <button
            key={s.id}
            data-id={s.id}
            onClick={() => goTo(sid(s.id))}
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-300",
              active === s.id ?
                "bg-zinc-900 text-white shadow-sm dark:bg-white dark:text-zinc-900"
              : "text-zinc-600 hover:bg-zinc-200/70 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100",
            )}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* Overview */}
      <header
        id={sid("overview")}
        className="animate-fade-up relative scroll-mt-32 overflow-hidden rounded-3xl bg-linear-to-br from-emerald-500 via-emerald-600 to-teal-700 p-6 text-white shadow-xl shadow-emerald-600/20 sm:p-8"
      >
        <div
          aria-hidden
          className="animate-float absolute -top-16 -right-10 size-56 rounded-full bg-white/10 blur-2xl"
        />
        <div
          aria-hidden
          className="absolute -bottom-20 -left-10 size-48 rounded-full bg-teal-300/20 blur-2xl"
        />
        <div className="relative">
          {product.brand && (
            <p className="text-xs font-semibold tracking-[0.2em] text-emerald-100 uppercase">
              {product.brand}
            </p>
          )}
          <h2
            dir="auto"
            className="mt-1.5 text-2xl leading-tight font-semibold text-balance sm:text-3xl"
          >
            {product.name ?? product.category ?? "Food product"}
          </h2>
          {(tags.length > 0 ||
            (result.language && result.language !== "en")) && (
            <div className="mt-4 flex flex-wrap gap-2">
              {tags.map((t) => (
                <span
                  key={t}
                  dir="auto"
                  className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium ring-1 ring-white/20 backdrop-blur"
                >
                  {t}
                </span>
              ))}
              {result.language && result.language !== "en" && (
                <span className="rounded-full bg-black/10 px-3 py-1 text-xs font-medium ring-1 ring-white/20">
                  🌐 Label in{" "}
                  {LANGUAGES[result.language.slice(0, 2)] ??
                    result.language.toUpperCase()}
                  , translated
                </span>
              )}
            </div>
          )}
          {result.summary && (
            <p className="mt-5 border-t border-white/20 pt-4 text-sm leading-6 text-emerald-50 sm:text-[15px] sm:leading-7">
              {result.summary}
            </p>
          )}
          {result.highlights.length > 0 && (
            <ul className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              {result.highlights.map((h) => (
                <li
                  key={h.text}
                  className="flex items-start gap-2 rounded-xl bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/15"
                >
                  <span aria-hidden className="shrink-0">
                    {h.tone === "caution" ?
                      "⚠"
                    : h.tone === "positive" ?
                      "✓"
                    : "•"}
                  </span>
                  {h.text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </header>

      {result.warnings.length > 0 && (
        <div
          role="note"
          className="animate-fade-up flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
        >
          <span aria-hidden>ⓘ</span>
          <ul className="space-y-1">
            {result.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Key indicators */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <StatusTile
          delay={1}
          title="Gluten"
          {...presence[gluten.status]}
          hint={
            gluten.status === "unclear" ?
              "Not enough info"
            : `${capitalize(gluten.confidence)} confidence`
          }
          onClick={() => goTo(sid("dietary"))}
        />
        <StatusTile
          delay={2}
          title="Lactose"
          {...presence[lactose.status]}
          onClick={() => goTo(sid("dietary"))}
        />
        <StatusTile
          delay={3}
          title="Sugar"
          {...levelUi[sugar.level]}
          hint={
            sugar.per_100 !== null ?
              `${fmt(sugar.per_100)} g / 100 ${unit}`
            : undefined
          }
          onClick={hasNutrition ? () => goTo(sid("nutrition")) : undefined}
        />
        <StatusTile
          delay={4}
          title="Allergens"
          label={
            contains.length ? `${contains.length} found`
            : ingredients.length ?
              "None found"
            : "Unknown"
          }
          tone={
            contains.length ? "red"
            : mayContain.length ?
              "amber"
            : ingredients.length ?
              "green"
            : "zinc"
          }
          hint={
            mayContain.length ? `+${mayContain.length} may contain` : undefined
          }
          onClick={() => goTo(sid("allergens"))}
        />
        <StatusTile
          delay={5}
          className="col-span-2 sm:col-span-1"
          title="Additives"
          label={
            additives.length ? `${additives.length} found`
            : ingredients.length ?
              "None found"
            : "Unknown"
          }
          tone={
            additives.length ? "amber"
            : ingredients.length ?
              "green"
            : "zinc"
          }
          onClick={
            additives.length ? () => goTo(sid("additives"))
            : ingredients.length ?
              () => goTo(sid("ingredients"))
            : undefined
          }
        />
      </div>

      {/* Allergens */}
      <Card
        id={sid("allergens")}
        flash={flashFor(sid("allergens"))}
        title="Allergens"
        icon="⚠️"
        delay={2}
      >
        {allergens.length === 0 ?
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {ingredients.length ?
              "No allergens were declared or found in the ingredients."
            : "No allergen information was readable on this photo."}
          </p>
        : <div className="space-y-5">
            {contains.length > 0 && (
              <AllergenGroup title="Contains" tone="red" items={contains} />
            )}
            {mayContain.length > 0 && (
              <AllergenGroup
                title="May contain (traces)"
                tone="amber"
                items={mayContain}
              />
            )}
          </div>
        }
      </Card>

      {/* Gluten & lactose */}
      <Card
        id={sid("dietary")}
        flash={flashFor(sid("dietary"))}
        title="Gluten & lactose"
        icon="🌾"
        delay={3}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <DietaryPanel
            title="Gluten"
            status={gluten.status}
            evidence={gluten.evidence}
          >
            <div className="mt-3">
              <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400">
                <span>Confidence</span>
                <span>{capitalize(gluten.confidence)}</span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
                <div
                  className="animate-grow h-full origin-left rounded-full bg-emerald-500"
                  style={{ width: confidenceWidth[gluten.confidence] }}
                />
              </div>
            </div>
          </DietaryPanel>
          <DietaryPanel
            title="Lactose"
            status={lactose.status}
            evidence={lactose.evidence}
          />
        </div>
      </Card>

      {/* Nutrition */}
      {hasNutrition && (
        <Card
          id={sid("nutrition")}
          flash={flashFor(sid("nutrition"))}
          title="Nutrition facts"
          icon="📊"
          delay={4}
          aside={
            nutrition?.serving_size && (
              <>
                Serving
                <br />
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {nutrition.serving_size}
                </span>
              </>
            )
          }
        >
          {nutrition?.per_100 && (
            <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {meters.map((m, i) => (
                <LevelMeter
                  key={m.key}
                  label={m.label}
                  value={nutrition.per_100![m.nutrient]}
                  level={nutrition.levels[m.key]}
                  threshold={LEVEL_THRESHOLDS[nutrition.basis][m.key]}
                  delay={i}
                />
              ))}
            </div>
          )}

          {nutrition && (
            <div className="-mx-1 overflow-x-auto px-1">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                    <th className="pb-2 font-medium">Nutrient</th>
                    {nutrition.per_100 && (
                      <th className="pb-2 text-right font-medium">
                        Per 100 {unit}
                        {nutrition.per_100_calculated && (
                          <span
                            className="block text-[10px] font-normal normal-case"
                            title="Calculated from the per-serving values; the label doesn't print this column."
                          >
                            calculated
                          </span>
                        )}
                      </th>
                    )}
                    {nutrition.per_serving && (
                      <th className="pb-2 pl-4 text-right font-medium">
                        Per serving
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                  {tableRows.map((row) => {
                    const a = cellValue(nutrition.per_100, row.key, row.unit);
                    const b = cellValue(
                      nutrition.per_serving,
                      row.key,
                      row.unit,
                    );
                    if (!a && !b) return null;
                    return (
                      <tr
                        key={row.key}
                        className="transition-colors hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
                      >
                        <td
                          className={cn(
                            "py-2.5",
                            row.sub ?
                              "pl-4 text-zinc-500 dark:text-zinc-400"
                            : "font-medium text-zinc-900 dark:text-zinc-100",
                          )}
                        >
                          {row.label}
                        </td>
                        {nutrition.per_100 && (
                          <td className="py-2.5 text-right tabular-nums">
                            {a ?? "—"}
                          </td>
                        )}
                        {nutrition.per_serving && (
                          <td className="py-2.5 pl-4 text-right tabular-nums">
                            {b ?? "—"}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {sugar.explanation && (
            <div
              className={cn(
                "mt-5 flex gap-3 rounded-2xl p-4 text-sm ring-1 ring-inset",
                toneClasses[levelUi[sugar.level].tone],
              )}
            >
              <span aria-hidden>🍬</span>
              <p>
                {sugar.level !== "unknown" && (
                  <span className="font-semibold">
                    {levelUi[sugar.level].label} sugar.{" "}
                  </span>
                )}
                {sugar.explanation}
              </p>
            </div>
          )}
        </Card>
      )}

      {/* Ingredients */}
      {ingredients.length > 0 && (
        <Card
          id={sid("ingredients")}
          flash={flashFor(sid("ingredients"))}
          title="Ingredients"
          icon="🥣"
          delay={5}
          aside={`${ingredients.length} items`}
        >
          <ol className="flex flex-wrap gap-2">
            {ingredients.map((ing, i) => (
              <IngredientPill
                key={`${i}-${ing.name}`}
                ingredient={ing}
                index={i}
                additive={
                  ing.e_number ? additiveByCode.get(ing.e_number) : undefined
                }
                onAdditive={(a) => goTo(additiveId(a))}
              />
            ))}
          </ol>
          <div className="mt-5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-zinc-500 dark:text-zinc-400">
            <Legend tone="red">Allergen / gluten source</Legend>
            <Legend tone="amber">Additive (tap for details)</Legend>
          </div>
        </Card>
      )}

      {/* Additives */}
      {additives.length > 0 && (
        <Card
          id={sid("additives")}
          flash={flashFor(sid("additives"))}
          title="Additives"
          icon="🧪"
          delay={6}
          aside={`${additives.length} found`}
        >
          <ul className="grid gap-3 md:grid-cols-2">
            {additives.map((a) => {
              const id = additiveId(a);
              return (
                <li
                  key={id}
                  id={id}
                  className={cn(
                    "scroll-mt-32 rounded-2xl border p-4 transition-all duration-500",
                    flash?.id === id ?
                      "border-amber-400 bg-amber-50/60 shadow-lg shadow-amber-500/10 dark:border-amber-600 dark:bg-amber-950/30"
                    : "border-zinc-200 hover:border-zinc-300 dark:border-zinc-800 dark:hover:border-zinc-700",
                  )}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    {a.code && (
                      <span className="rounded-lg bg-amber-100 px-2 py-0.5 font-mono text-xs font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
                        {a.code}
                      </span>
                    )}
                    <span className="font-medium text-zinc-900 dark:text-zinc-100">
                      {capitalize(a.name)}
                    </span>
                  </div>
                  {a.category && (
                    <p className="mt-2 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400">
                      {a.category}
                    </p>
                  )}
                  {a.purpose && (
                    <p className="mt-2 text-sm text-zinc-700 dark:text-zinc-300">
                      <span className="font-medium">Purpose:</span> {a.purpose}
                    </p>
                  )}
                  {a.explanation && (
                    <p className="mt-1 text-sm leading-6 text-zinc-500 dark:text-zinc-400">
                      {a.explanation}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {/* Details */}
      {hasDetails && (
        <div
          id={sid("details")}
          className="grid scroll-mt-32 gap-5 sm:grid-cols-2"
        >
          <InfoCard title="Dates" icon="📅" rows={details.dates} delay={7} flash={flashFor(sid("details"))} />
          <InfoCard
            title="Storage"
            icon="❄️"
            rows={details.storage}
            delay={7}
            flash={flashFor(sid("details"))}
          />
          <InfoCard
            title="Manufacturer"
            icon="🏭"
            rows={details.manufacturer}
            delay={8}
            flash={flashFor(sid("details"))}
          />
          {(result.certifications.length > 0 || result.claims.length > 0) && (
            <Card title="Claims & certifications" icon="🏅" delay={8} flash={flashFor(sid("details"))}>
              <div className="flex flex-wrap gap-2">
                {result.certifications.map((c) => (
                  <Pill key={`cert-${c}`} tone="green">
                    {c}
                  </Pill>
                ))}
                {result.claims.map((c) => (
                  <Pill key={`claim-${c}`} tone="zinc">
                    {c}
                  </Pill>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Raw text */}
      {result.raw_text && <RawText id={sid("raw")} text={result.raw_text} flash={flashFor(sid("raw"))} />}

      <p className="px-4 pt-2 text-center text-xs leading-5 text-zinc-400 dark:text-zinc-600">
        AI-extracted from the label image and may contain mistakes. Always check
        the packaging if you have allergies or dietary restrictions.
        {meta && (
          <span className="mt-1 block">
            Analyzed in {(meta.duration_ms / 1000).toFixed(1)} s
          </span>
        )}
      </p>
    </div>
  );
}

function NotALabel({ result }: { result: LabelAnalysis }) {
  return (
    <div className="animate-fade-up flex flex-col items-center rounded-3xl border border-zinc-200 bg-white p-8 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <span className="animate-float text-5xl" aria-hidden>
        🔎
      </span>
      <h2 className="mt-4 text-xl font-semibold text-zinc-900 dark:text-zinc-100">
        We couldn&apos;t find a food label
      </h2>
      {result.product.name && (
        <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
          It looks like <b>{result.product.name}</b>, but no ingredients or
          nutrition table are visible.
        </p>
      )}
      {result.summary && (
        <p className="mt-2 max-w-md text-sm text-zinc-500 dark:text-zinc-400">
          {result.summary}
        </p>
      )}
      <ul className="mt-6 grid w-full max-w-md gap-2 text-left text-sm text-zinc-600 dark:text-zinc-400">
        {[
          ["📦", "Photograph the back of the pack, where the ingredients are."],
          ["💡", "Use good light and avoid glare on shiny packaging."],
          ["🔍", "Get close enough that the small print is sharp."],
        ].map(([icon, tip]) => (
          <li
            key={tip}
            className="flex gap-3 rounded-xl bg-zinc-50 px-4 py-2.5 dark:bg-zinc-900"
          >
            <span aria-hidden>{icon}</span>
            {tip}
          </li>
        ))}
      </ul>
    </div>
  );
}

function AllergenGroup({
  title,
  tone,
  items,
}: {
  title: string;
  tone: Tone;
  items: LabelAnalysis["allergens"];
}) {
  return (
    <div>
      <SubLabel>{title}</SubLabel>
      <ul className="divide-y divide-zinc-100 dark:divide-zinc-900">
        {items.map((a) => (
          <li
            key={a.id}
            className="flex flex-col gap-1.5 py-2.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="flex shrink-0 items-center gap-2 sm:w-40">
              <Pill tone={tone} className="font-medium">
                {a.name}
              </Pill>
              {a.declared && (
                <span className="text-[11px] font-medium text-zinc-400 uppercase">
                  declared
                </span>
              )}
            </span>
            <span
              dir="auto"
              className="text-sm text-zinc-500 dark:text-zinc-400"
            >
              {a.sources.join(" · ")}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function IngredientPill({
  ingredient: ing,
  index,
  additive,
  onAdditive,
}: {
  ingredient: Ingredient;
  index: number;
  additive?: Additive;
  onAdditive: (a: Additive) => void;
}) {
  const flagged = ing.allergens.length > 0 || ing.gluten;
  const tone: Tone =
    flagged ? "red"
    : additive ? "amber"
    : "zinc";
  const title = [
    ing.allergens.length ?
      `Allergens: ${ing.allergens.join(", ").replace(/_/g, " ")}`
    : null,
    additive ? `${additive.code} · ${additive.name}` : null,
  ]
    .filter(Boolean)
    .join("\n");
  const content = (
    <>
      <span className="mr-1.5 text-xs tabular-nums opacity-50">
        {index + 1}
      </span>
      <span className="flex flex-col text-left leading-tight">
        <span dir="auto">{ing.name}</span>
        {ing.name_en && (
          <span className="text-xs opacity-60">{ing.name_en}</span>
        )}
      </span>
    </>
  );
  return (
    <li
      className="animate-fade-up"
      style={{ animationDelay: `${Math.min(index, 20) * 25}ms` }}
    >
      {additive ?
        <button
          onClick={() => onAdditive(additive)}
          title={title || undefined}
          className={cn(
            "inline-flex items-center rounded-2xl px-3 py-1.5 text-sm ring-1 ring-inset transition hover:-translate-y-0.5 hover:shadow-md active:translate-y-0",
            toneClasses[tone],
          )}
        >
          {content}
          <span aria-hidden className="ml-1.5 opacity-60">
            ↗
          </span>
        </button>
      : <span
          title={title || undefined}
          className={cn(
            "inline-flex items-center rounded-2xl px-3 py-1.5 text-sm ring-1 ring-inset",
            toneClasses[tone],
          )}
        >
          {content}
        </span>
      }
    </li>
  );
}

function StatusTile({
  title,
  label,
  tone,
  hint,
  onClick,
  delay = 0,
  className,
}: {
  title: string;
  label: string;
  tone: Tone;
  hint?: string;
  onClick?: () => void;
  delay?: number;
  className?: string;
}) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      onClick={onClick}
      style={{ animationDelay: `${delay * 60}ms` }}
      className={cn(
        "group animate-fade-up relative flex flex-col items-start justify-start rounded-2xl p-4 text-left ring-1 ring-inset transition-all duration-300",
        toneClasses[tone],
        onClick &&
          "cursor-pointer hover:-translate-y-1 hover:shadow-lg focus-visible:ring-2 focus-visible:outline-none active:translate-y-0 active:scale-[0.98]",
        className,
      )}
    >
      <p className="text-xs font-medium tracking-wide uppercase opacity-70">
        {title}
      </p>
      <p className="mt-1 flex items-center gap-2 font-semibold">
        <Dot tone={tone} />
        {label}
      </p>
      {hint && <p className="mt-1 text-xs opacity-70">{hint}</p>}
      {onClick && (
        <span
          aria-hidden
          className="absolute top-3.5 right-3.5 text-sm opacity-0 transition-all duration-300 group-hover:translate-y-0.5 group-hover:opacity-60"
        >
          ↓
        </span>
      )}
    </Tag>
  );
}

function DietaryPanel({
  title,
  status,
  evidence,
  children,
}: {
  title: string;
  status: Presence;
  evidence: string[];
  children?: React.ReactNode;
}) {
  const p = presence[status];
  return (
    <div className="rounded-2xl border border-zinc-200 p-4 dark:border-zinc-800">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-zinc-900 dark:text-zinc-100">
          {title}
        </span>
        <Pill tone={p.tone} className="text-xs font-medium">
          <Dot tone={p.tone} />
          <span className="ml-1.5">{p.label}</span>
        </Pill>
      </div>
      {children}
      {evidence.length > 0 ?
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm text-zinc-600 dark:text-zinc-400">
          {evidence.map((e, i) => (
            <li key={i} dir="auto">
              {e}
            </li>
          ))}
        </ul>
      : <p className="mt-3 text-sm text-zinc-500 dark:text-zinc-500">
          {status === "unclear" ?
            "The ingredient list wasn't readable, so this can't be determined."
          : "No specific evidence noted."}
        </p>
      }
    </div>
  );
}

function LevelMeter({
  label,
  value,
  level,
  threshold,
  delay,
}: {
  label: string;
  value: number | null;
  level: Level | null;
  threshold: { low: number; high: number };
  delay: number;
}) {
  const tone: Tone =
    level === "high" ? "red"
    : level === "medium" ? "amber"
    : level === "low" ? "green"
    : "zinc";
  const pct =
    value == null ? 0 : Math.min(100, (value / (threshold.high * 1.4)) * 100);
  const bar = {
    red: "bg-red-500",
    amber: "bg-amber-500",
    green: "bg-emerald-500",
    zinc: "bg-zinc-400",
  }[tone];

  return (
    <div
      className="animate-fade-up rounded-2xl bg-zinc-50 p-3.5 dark:bg-zinc-900/60"
      style={{ animationDelay: `${delay * 80}ms` }}
      title={`Low ≤ ${threshold.low} g · High > ${threshold.high} g (UK front-of-pack guidance)`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-zinc-500 dark:text-zinc-400">
          {label}
        </span>
        <span
          className={cn(
            "text-[11px] font-semibold uppercase",
            {
              red: "text-red-600 dark:text-red-400",
              amber: "text-amber-600 dark:text-amber-400",
              green: "text-emerald-600 dark:text-emerald-400",
              zinc: "text-zinc-400",
            }[tone],
          )}
        >
          {level ?? "n/a"}
        </span>
      </div>
      <p className="mt-1 text-lg font-semibold text-zinc-900 tabular-nums dark:text-zinc-100">
        {value !== null ? `${fmt(value)} g` : "—"}
      </p>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
        <div
          className={cn("animate-grow h-full origin-left rounded-full", bar)}
          style={{ width: `${pct}%`, animationDelay: `${200 + delay * 80}ms` }}
        />
      </div>
    </div>
  );
}

function InfoCard({
  title,
  icon,
  rows,
  delay,
  flash,
}: {
  title: string;
  icon: string;
  rows: [string, string | null][];
  delay: number;
  flash?: number;
}) {
  const filled = rows.filter((r): r is [string, string] => !!r[1]);
  if (filled.length === 0) return null;
  return (
    <Card title={title} icon={icon} delay={delay} flash={flash}>
      <dl className="space-y-2.5 text-sm">
        {filled.map(([label, value]) => (
          <div key={label} className="flex gap-3">
            <dt className="w-24 shrink-0 text-zinc-500 dark:text-zinc-400">
              {label}
            </dt>
            <dd
              dir="auto"
              className="min-w-0 wrap-break-word text-zinc-900 dark:text-zinc-100"
            >
              {value}
            </dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function RawText({ id, text, flash }: { id: string; text: string; flash?: number }) {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const long = text.length > 280 || text.split("\n").length > 4;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard can be unavailable (insecure context); nothing to do
    }
  };

  return (
    <Card
      id={id}
      flash={flash}
      title="Raw label text"
      icon="📝"
      delay={9}
      aside={
        <button
          onClick={copy}
          className="rounded-lg px-2.5 py-1 font-medium text-zinc-600 transition hover:bg-zinc-100 active:scale-95 dark:text-zinc-400 dark:hover:bg-zinc-900"
        >
          {copied ? "✓ Copied" : "Copy"}
        </button>
      }
    >
      <div className="relative">
        <pre
          dir="auto"
          className={cn(
            "overflow-hidden font-mono text-xs leading-5 whitespace-pre-wrap text-zinc-600 transition-[max-height] duration-500 dark:text-zinc-400",
            open || !long ? "max-h-[2000px]" : "max-h-24",
          )}
        >
          {text}
        </pre>
        {!open && long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-white dark:from-zinc-950" />
        )}
      </div>
      {long && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-3 text-sm font-medium text-emerald-600 hover:text-emerald-700 dark:text-emerald-400 dark:hover:text-emerald-300"
        >
          {open ? "Show less" : "Show full text"}
        </button>
      )}
    </Card>
  );
}

function SubLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <p
      className={cn(
        "mb-2.5 text-xs font-medium tracking-wide text-zinc-500 uppercase dark:text-zinc-400",
        className,
      )}
    >
      {children}
    </p>
  );
}

function Legend({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <Dot tone={tone} />
      {children}
    </span>
  );
}
