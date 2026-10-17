"use client";
import { useEffect, useRef, useState } from "react";
import type { OtherCondition } from "../lib/analysis/conditionsAi";
import { searchConditions } from "../lib/analysis/conditionSearch";
import {
  CONDITION_IDS,
  cleanConditionText,
  type ConditionId,
  DIETS,
  EMPTY_PROFILE,
  isEmptyProfile,
  MAX_CONDITION_TEXT,
  MAX_OTHER_CONDITIONS,
  type Profile,
} from "../lib/analysis/profile";
import { ALLERGEN_IDS } from "../lib/analysis/types";
import { MAX_PROFILES, type NamedProfile } from "../lib/analysis/profiles";
import {
  addProfilePerson,
  removeProfilePerson,
  renameProfilePerson,
  saveProfile,
  switchProfilePerson,
  useProfile,
  useProfileBook,
} from "../lib/client/profile";
import { COUNTRIES } from "../lib/analysis/country";
import { understandConditions } from "../lib/client/conditions";
import { saveCountry, useCountryChoice, useDetectedCountry } from "../lib/client/country";
import { format, isolate, useI18n } from "../lib/i18n/I18nProvider";
import { CloseIcon, cn, Notice, PlusIcon, SparkleIcon, Spinner, TrashIcon } from "./ui";

/** what a person is called in the interface: the name typed, else "Me" or "Person 2" */
export function usePersonName() {
  const { t } = useI18n();
  const book = useProfileBook();
  return (p: NamedProfile) => p.name || (p.id === book.profiles[0].id ? t.profile.me : format(t.profile.person, { n: book.profiles.indexOf(p) + 1 }));
}

export function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="12" cy="8.5" r="3.5" />
      <path d="M5 20c.8-3.6 3.5-5.5 7-5.5s6.2 1.9 7 5.5" />
    </svg>
  );
}

/** the header button: a dot shows that a profile is set; with several people it shows who is active */
export function ProfileButton({ onClick }: { onClick: () => void }) {
  const { t } = useI18n();
  const book = useProfileBook();
  const profile = useProfile();
  const nameOf = usePersonName();
  const several = book.profiles.length > 1;
  const active = !isEmptyProfile(profile);
  return (
    <button
      onClick={onClick}
      aria-label={several ? `${t.profile.title}: ${nameOf(profile)}` : t.profile.title}
      title={several ? nameOf(profile) : t.profile.title}
      className="relative grid size-11 place-items-center rounded-full bg-mute-soft transition hover:bg-rule"
    >
      {several ? <span className="font-display text-base font-bold text-accent">{[...nameOf(profile)][0]?.toUpperCase()}</span> : <ProfileIcon className="size-5" />}
      {active && <span aria-hidden className="absolute end-0 top-0 size-3 rounded-full border-2 border-paper bg-accent" />}
    </button>
  );
}

/**
 * What the reader avoids. Entirely optional and saved as it is tapped: there is no
 * account, and nothing leaves the device.
 */
export default function ProfileSheet({ onClose }: { onClose: () => void }) {
  const { t } = useI18n();
  const p = t.profile;
  const profile = useProfile();
  const book = useProfileBook();
  const nameOf = usePersonName();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const set = (patch: Partial<Profile>) => saveProfile({ ...profile, ...patch });
  const coeliacGluten = !!profile.conditions?.includes("coeliac") && !profile.allergens.includes("gluten");
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => {
        // a tap on the backdrop
        if (e.target === ref.current) ref.current?.close();
      }}
      aria-labelledby="profile-title"
      className="animate-sheet-up mx-auto mt-auto mb-0 max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-card bg-sheet p-0 text-ink shadow-raised ring-1 ring-rule backdrop:animate-fade-in backdrop:bg-ink/35 backdrop:backdrop-blur-md sm:m-auto sm:w-[min(34rem,calc(100vw-1.5rem))] sm:rounded-card"
    >
      <div className="px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-7 sm:pb-6">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="profile-title" className="font-display text-2xl font-semibold">
              {p.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">{p.lead}</p>
            <p className="mt-2 rounded-xl bg-accent-soft/60 px-3.5 py-2.5 text-sm leading-6 text-ink">{p.effect}</p>
          </div>
          <button
            onClick={() => ref.current?.close()}
            aria-label={p.close}
            className="grid size-11 shrink-0 place-items-center rounded-full bg-mute-soft transition hover:bg-rule"
          >
            <CloseIcon className="size-4" />
          </button>
        </div>

        <fieldset className="mt-5">
          <legend className="eyebrow text-ink-soft">{p.people}</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {book.profiles.map((person) => (
              <Chip key={person.id} on={person.id === book.active} onClick={() => switchProfilePerson(person.id)}>
                {nameOf(person)}
              </Chip>
            ))}
            {book.profiles.length < MAX_PROFILES && (
              <button
                type="button"
                onClick={addProfilePerson.bind(null, "")}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium text-accent ring-1 ring-rule transition hover:bg-accent-soft active:scale-[0.97]"
              >
                <PlusIcon className="size-4" />
                {p.addPerson}
              </button>
            )}
          </div>
          {book.profiles.length > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <input
                key={profile.id}
                defaultValue={profile.name}
                onChange={(e) => renameProfilePerson(profile.id, e.target.value)}
                maxLength={24}
                dir="auto"
                autoComplete="off"
                placeholder={p.name}
                aria-label={p.name}
                className="h-11 min-w-0 flex-1 rounded-control bg-mute-soft px-5 text-base placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
              />
              <button
                type="button"
                onClick={() => removeProfilePerson(profile.id)}
                aria-label={p.removePerson}
                title={p.removePerson}
                className="grid size-11 shrink-0 place-items-center rounded-full text-bad transition hover:bg-bad-soft"
              >
                <TrashIcon className="size-5" />
              </button>
            </div>
          )}
        </fieldset>

        <HealthConditions key={profile.id} profile={profile} onChange={set} />

        <Group title={p.allergens}>
          {ALLERGEN_IDS.map((id) =>
            // coeliac disease is checked as gluten: the chip shows it, and only the condition can lift it
            id === "gluten" && coeliacGluten ?
              <Chip key={id} on locked describedBy="coeliac-gluten" onClick={() => {}}>
                {t.results.allergenNames[id]}
              </Chip>
            : <Chip key={id} on={profile.allergens.includes(id)} onClick={() => set({ allergens: toggle(profile.allergens, id) })}>
                {t.results.allergenNames[id]}
              </Chip>,
          )}
        </Group>
        {coeliacGluten && (
          <p id="coeliac-gluten" className="mt-2 text-xs leading-5 text-ink-soft">
            {p.conditions.coeliacGluten}
          </p>
        )}
        <Group title={p.watch}>
          <Chip on={profile.lactose} onClick={() => set({ lactose: !profile.lactose })}>
            {p.lactose}
          </Chip>
          <Chip on={profile.sugar} onClick={() => set({ sugar: !profile.sugar })}>
            {p.sugar}
          </Chip>
        </Group>
        <Group title={p.diet}>
          {DIETS.map((diet) => (
            <Chip key={diet} on={profile.diets.includes(diet)} onClick={() => set({ diets: toggle(profile.diets, diet) })}>
              {p.diets[diet]}
            </Chip>
          ))}
        </Group>

        <CountryPicker />

        <p className="mt-6 text-xs leading-5 text-ink-soft">{p.privacy}</p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => ref.current?.close()}
            className="h-12 flex-1 rounded-control bg-brand text-sm font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.99]"
          >
            {p.done}
          </button>
          {!isEmptyProfile(profile) && (
            <button onClick={() => saveProfile(EMPTY_PROFILE)} className="h-12 rounded-control px-4 text-sm font-medium text-ink-soft hover:bg-mute-soft hover:text-ink">
              {p.clear}
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="mt-6">
      <legend className="eyebrow text-ink-soft">{title}</legend>
      <div className="mt-2.5 flex flex-wrap gap-2">{children}</div>
    </fieldset>
  );
}

function Chip({
  on,
  onClick,
  locked,
  describedBy,
  children,
}: {
  on: boolean;
  onClick: () => void;
  /** shown on but not changeable here; stays focusable so its explanation is announced */
  locked?: boolean;
  describedBy?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      aria-disabled={locked || undefined}
      aria-describedby={describedBy}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-control px-4 text-sm font-medium transition active:scale-[0.97] aria-disabled:opacity-70 aria-disabled:active:scale-100",
        on ? "bg-accent-soft text-on-accent-soft ring-1 ring-accent" : "bg-mute-soft text-ink hover:bg-rule",
      )}
    >
      {on && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}

/** where the reader is, so that suggested products are ones sold there; "automatic" follows the device */
function CountryPicker() {
  const { t, locale } = useI18n();
  const choice = useCountryChoice();
  const detected = useDetectedCountry();
  const names = new Intl.DisplayNames(locale, { type: "region" });
  const nameOf = (code: string) => names.of(code) ?? code;
  const options = [...COUNTRIES].sort((a, b) => nameOf(a).localeCompare(nameOf(b), locale));
  return (
    <fieldset className="mt-6">
      <legend className="eyebrow text-ink-soft">{t.profile.country}</legend>
      <select
        value={choice ?? ""}
        onChange={(e) => saveCountry(e.target.value || null)}
        aria-label={t.profile.country}
        className="mt-2.5 h-12 w-full rounded-control bg-mute-soft px-5 text-base focus-visible:outline-2 focus-visible:outline-accent"
      >
        <option value="">{`${t.profile.countryAuto}${detected ? ` (${nameOf(detected)})` : ""}`}</option>
        {options.map((code) => (
          <option key={code} value={code}>
            {nameOf(code)}
          </option>
        ))}
      </select>
    </fieldset>
  );
}

type AiState = { state: "idle" } | { state: "working" } | { state: "done"; ids: ConditionId[]; others: OtherCondition[] } | { state: "error" };

/**
 * Health conditions: the known ones as chips, filtered by a search box that matches names in
 * every language (no model). What matches nothing is, only when the reader taps for it, sent
 * alone to the AI, which maps it onto the known list or names another real condition (checked by
 * no rule); the reader confirms its answer before anything is saved. No health condition found:
 * nothing is saved, so a typo never becomes a condition.
 */
function HealthConditions({ profile, onChange }: { profile: Profile; onChange: (patch: Partial<Profile>) => void }) {
  const { t, locale } = useI18n();
  const c = t.profile.conditions;
  const [query, setQuery] = useState("");
  const [ai, setAi] = useState<AiState>({ state: "idle" });
  const pending = useRef<AbortController | null>(null);
  const chosen = profile.conditions ?? [];
  const others = profile.otherConditions ?? [];
  const typed = cleanConditionText(query);
  const searching = [...typed].length >= 2;
  const matches = searching ? searchConditions(typed) : [...CONDITION_IDS];
  const offered = matches.filter((id) => !chosen.includes(id));
  const unknown = searching && matches.length === 0;

  const reset = (text = "") => {
    pending.current?.abort();
    pending.current = null;
    setQuery(text);
    setAi({ state: "idle" });
  };
  const add = (ids: ConditionId[], named: OtherCondition[] = []) => {
    const fresh = named.filter((n) => !others.some((o) => o.toLowerCase() === n.name.toLowerCase()));
    const terms = Object.fromEntries(fresh.flatMap((n) => (n.fr ? [[n.name, n.fr]] : [])));
    onChange({
      conditions: [...chosen, ...ids.filter((id) => !chosen.includes(id))],
      ...(fresh.length > 0 && {
        otherConditions: [...others, ...fresh.map((n) => n.name)].slice(0, MAX_OTHER_CONDITIONS),
        otherTerms: { ...profile.otherTerms, ...terms },
      }),
    });
    reset();
  };
  const askAi = async () => {
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setAi({ state: "working" });
    try {
      const { ids, others: named } = await understandConditions(typed, locale, controller.signal);
      if (!controller.signal.aborted)
        setAi({ state: "done", ids: ids.filter((id) => !chosen.includes(id)), others: named.filter((n) => !others.some((o) => o.toLowerCase() === n.name.toLowerCase())) });
    } catch {
      if (!controller.signal.aborted) setAi({ state: "error" });
    }
  };

  return (
    <fieldset className="mt-6">
      <legend className="eyebrow text-ink-soft">{c.title}</legend>
      <p className="mt-1.5 text-sm leading-6 text-ink-soft">{c.lead}</p>

      {chosen.length + others.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {chosen.map((id) => (
            <li key={id}>
              <Removable label={format(c.remove, { name: c.names[id] })} onRemove={() => onChange({ conditions: chosen.filter((x) => x !== id) })} on>
                {c.names[id]}
              </Removable>
            </li>
          ))}
          {others.map((text) => (
            <li key={text}>
              <Removable label={format(c.remove, { name: text })} onRemove={() => onChange({ otherConditions: others.filter((x) => x !== text) })}>
                <span className="min-w-0 wrap-break-word">
                  <bdi>{text}</bdi> · {c.notChecked}
                </span>
              </Removable>
            </li>
          ))}
        </ul>
      )}

      <form
        className="mt-3"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          if (searching && offered.length > 0) add([offered[0]]);
        }}
      >
        <input
          type="search"
          value={query}
          onChange={(e) => reset(e.target.value)}
          maxLength={MAX_CONDITION_TEXT}
          dir="auto"
          autoComplete="off"
          enterKeyHint="done"
          placeholder={c.search}
          aria-label={c.searchLabel}
          className="h-11 w-full rounded-control bg-mute-soft px-5 text-base placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
        />
      </form>

      {offered.length > 0 && (
        <div className="mt-2.5 flex flex-wrap gap-2">
          {offered.map((id) => (
            <button
              key={id}
              type="button"
              onClick={() => add([id])}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-control bg-mute-soft px-4 text-sm font-medium text-ink transition hover:bg-rule active:scale-[0.97]"
            >
              <PlusIcon className="size-4 shrink-0" />
              {c.names[id]}
            </button>
          ))}
        </div>
      )}

      {unknown && (
        <div className="mt-3 rounded-2xl bg-mute-soft/60 p-4" aria-live="polite">
          {ai.state === "done" && ai.ids.length + ai.others.length > 0 ?
            <>
              <p className="text-sm font-medium">{c.aiFound}</p>
              <ul className="mt-2 flex flex-wrap gap-2">
                {ai.ids.map((id) => (
                  <li key={id} className="inline-flex min-h-9 items-center rounded-md bg-accent-soft px-3 text-sm font-medium text-on-accent-soft">
                    {c.names[id]}
                  </li>
                ))}
                {ai.others.map(({ name }) => (
                  <li key={name} className="inline-flex min-h-9 items-center rounded-md bg-mute-soft px-3 text-sm font-medium text-ink">
                    <bdi>{name}</bdi>&nbsp;· {c.notChecked}
                  </li>
                ))}
              </ul>
              {ai.others.length > 0 && (
                <p className="mt-2 text-xs leading-6 text-ink-soft">{format(c.otherNote, { names: new Intl.ListFormat(locale, { type: "unit" }).format(ai.others.map((o) => isolate(o.name))) })}</p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => add(ai.ids, ai.others)}
                  className="inline-flex min-h-11 items-center rounded-control bg-brand px-5 text-sm font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.98]"
                >
                  {c.aiConfirm}
                </button>
                <button type="button" onClick={() => reset(query)} className="inline-flex min-h-11 items-center rounded-control px-4 text-sm font-medium text-ink-soft hover:bg-mute-soft hover:text-ink">
                  {c.cancel}
                </button>
              </div>
            </>
          : <>
              <p className="text-sm">{c.noMatch}</p>
              {ai.state === "done" && <p className="mt-2 text-sm leading-6 text-ink-soft">{c.aiNone}</p>}
              {ai.state === "error" && (
                <Notice tone="amber" className="mt-2">
                  {c.aiError}
                </Notice>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                {ai.state !== "done" && (
                  <button
                    type="button"
                    onClick={() => void askAi()}
                    disabled={ai.state === "working"}
                    className="inline-flex min-h-11 items-center gap-2 rounded-control bg-accent-soft px-4 text-sm font-semibold text-on-accent-soft transition hover:brightness-95 active:scale-[0.98] disabled:opacity-70"
                  >
                    {ai.state === "working" ? <Spinner className="size-4" /> : <SparkleIcon className="size-4" />}
                    {ai.state === "working" ? c.aiWorking : c.ai}
                  </button>
                )}
              </div>
              {ai.state !== "done" && <p className="mt-2 text-xs leading-6 text-ink-soft">{c.aiNote}</p>}
            </>
          }
        </div>
      )}

      <p className="mt-3 text-xs leading-5 text-ink-soft">{c.note}</p>
    </fieldset>
  );
}

/** a chosen condition, with its own remove button */
function Removable({ on, label, onRemove, children }: { on?: boolean; label: string; onRemove: () => void; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex min-h-11 items-center gap-1 rounded-control ps-4 text-sm font-medium",
        on ? "bg-accent-soft text-on-accent-soft ring-1 ring-accent" : "bg-mute-soft text-ink",
      )}
    >
      {children}
      <button type="button" onClick={onRemove} aria-label={label} title={label} className="grid size-11 shrink-0 place-items-center rounded-control transition hover:bg-rule/60">
        <CloseIcon className="size-3.5" />
      </button>
    </span>
  );
}
