"use client";
import { useEffect, useRef } from "react";
import { DIETS, EMPTY_PROFILE, isEmptyProfile, type Profile } from "../lib/analysis/profile";
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
import { format, useI18n } from "../lib/i18n/I18nProvider";
import { CloseIcon, cn, PlusIcon, TrashIcon } from "./ui";

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
      className="animate-fade-up m-auto max-h-[92dvh] w-[min(34rem,calc(100vw-1.5rem))] overflow-y-auto rounded-[28px] bg-sheet p-0 text-ink ring-1 ring-rule backdrop:bg-ink/50"
    >
      <div className="px-5 pt-5 pb-6 sm:px-7">
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 id="profile-title" className="font-display text-2xl font-bold">
              {p.title}
            </h2>
            <p className="mt-1.5 text-sm leading-6 text-ink-soft">{p.lead}</p>
          </div>
          <button
            onClick={() => ref.current?.close()}
            aria-label={p.close}
            className="grid size-10 shrink-0 place-items-center rounded-full bg-mute-soft transition hover:bg-rule"
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
                className="inline-flex min-h-11 items-center gap-1.5 rounded-full px-4 text-sm font-medium text-accent ring-1 ring-rule transition hover:bg-accent-soft active:scale-[0.97]"
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
                className="h-11 min-w-0 flex-1 rounded-full bg-mute-soft px-5 text-base placeholder:text-ink-soft focus-visible:outline-2 focus-visible:outline-accent"
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

        <Group title={p.allergens}>
          {ALLERGEN_IDS.map((id) => (
            <Chip key={id} on={profile.allergens.includes(id)} onClick={() => set({ allergens: toggle(profile.allergens, id) })}>
              {t.results.allergenNames[id]}
            </Chip>
          ))}
        </Group>
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

        <p className="mt-6 text-xs leading-5 text-ink-soft">{p.privacy}</p>
        <div className="mt-5 flex items-center gap-3">
          <button
            onClick={() => ref.current?.close()}
            className="h-12 flex-1 rounded-full bg-accent text-sm font-semibold text-on-accent transition hover:brightness-110 active:scale-[0.99]"
          >
            {p.done}
          </button>
          {!isEmptyProfile(profile) && (
            <button onClick={() => saveProfile(EMPTY_PROFILE)} className="h-12 rounded-full px-4 text-sm font-medium text-ink-soft hover:bg-mute-soft hover:text-ink">
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition active:scale-[0.97]",
        on ? "bg-accent-soft text-on-accent-soft ring-1 ring-accent" : "bg-mute-soft text-ink hover:bg-rule",
      )}
    >
      {on && <span aria-hidden>✓</span>}
      {children}
    </button>
  );
}
