"use client";
import { LEVEL_THRESHOLDS } from "../../lib/analysis/knowledge";
import type { LabelAnalysis } from "../../lib/analysis/types";
import { format, ltr, useI18n } from "../../lib/i18n/I18nProvider";
import { Bar, cn, Dot, Tag } from "../ui";
import { SUGAR_CUBE_G } from "./Nutrition";
import { capitalize, levelTone } from "./tones";

/** sugar per 100 ml and per bottle, colours, sweeteners and caffeine */
export default function DrinkPanel({ result }: { result: LabelAnalysis }) {
  const { t, fmt } = useI18n();
  const r = t.results;
  const { sugar, drink, ingredients } = result;
  return (
    <>
      <div className={cn("flex flex-wrap items-end gap-x-4 gap-y-2", sugar.per_100 === null && "hidden")}>
        <p className="font-display text-6xl leading-none font-bold tabular-nums">{sugar.per_100 !== null && ltr(`${fmt(sugar.per_100)} g`)}</p>
        <div className="pb-1">
          <p className="eyebrow text-ink-soft">
            {r.drink.sugars} · {r.drink.per100}
          </p>
          <Tag tone={levelTone[sugar.level]} className="mt-1.5">
            <Dot tone={levelTone[sugar.level]} />
            {r.level[sugar.level]}
          </Tag>
        </div>
      </div>
      {sugar.per_100 !== null && (
        <div className="mt-4">
          <Bar value={sugar.per_100 / (LEVEL_THRESHOLDS["100ml"].sugars.high * 1.4)} tone={levelTone[sugar.level]} />
        </div>
      )}
      {drink?.sugar_per_container_g != null && drink.volume_ml !== null && (
        <p className="mt-4 text-sm leading-6">
          <span className="font-medium">
            {format(r.drink.perContainer, {
              grams: fmt(drink.sugar_per_container_g),
              volume: ltr(drink.volume_ml >= 1000 ? `${fmt(drink.volume_ml / 1000)} L` : `${fmt(drink.volume_ml)} ml`),
            })}
          </span>
          {drink.sugar_per_container_g >= SUGAR_CUBE_G && (
            <span className="text-ink-soft"> · {format(r.drink.cubes, { count: Math.round(drink.sugar_per_container_g / SUGAR_CUBE_G) })}</span>
          )}
        </p>
      )}
      {sugar.explanation && (
        <p dir="auto" className="mt-2 text-sm leading-6 text-ink-soft">
          {sugar.explanation}
        </p>
      )}
      {/* colours, sweeteners and caffeine are only known from a read ingredient list */}
      <dl className={cn("mt-5 overflow-hidden rounded-2xl bg-mute-soft/60", ingredients.length === 0 && "hidden")}>
        {(
          [
            [r.drink.colours, drink?.colours ?? []],
            [r.drink.sweeteners, drink?.sweeteners ?? []],
          ] as const
        ).map(([label, names]) => (
          <div key={label} className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule/70 px-4 py-3 first:border-t-0">
            <dt className="eyebrow w-28 shrink-0 text-ink-soft">{label}</dt>
            <dd className="flex min-w-0 flex-1 flex-wrap gap-1.5">
              {names.length ?
                names.map((name) => (
                  <Tag key={name} tone="amber" dir="auto">
                    {capitalize(name)}
                  </Tag>
                ))
              : <span className="text-sm text-ink-soft">{r.drink.none}</span>}
            </dd>
          </div>
        ))}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule/70 px-4 py-3">
          <dt className="eyebrow w-28 shrink-0 text-ink-soft">{r.drink.caffeine}</dt>
          <dd className="text-sm">{drink?.caffeine ? <Tag tone="amber">{r.drink.present}</Tag> : <span className="text-ink-soft">{r.drink.none}</span>}</dd>
        </div>
      </dl>
    </>
  );
}
