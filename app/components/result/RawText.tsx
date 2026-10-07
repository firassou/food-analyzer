"use client";
import { useState } from "react";
import { useI18n } from "../../lib/i18n/I18nProvider";
import { cn, Section, TextIcon } from "../ui";

/** the text read off the photo, collapsed when long, with a copy button */
export default function RawText({ id, title, text, flash }: { id: string; title: string; text: string; flash?: number }) {
  const { t } = useI18n();
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
    <Section
      id={id}
      icon={<TextIcon />}
      title={title}
      flash={flash}
      aside={
        <button
          onClick={copy}
          className="rounded-full bg-mute-soft px-3 py-1.5 text-xs font-medium text-accent transition hover:bg-rule active:scale-95"
        >
          {copied ? t.results.raw.copied : t.results.raw.copy}
        </button>
      }
    >
      <div className="relative rounded-2xl bg-mute-soft/60 p-4">
        <pre
          dir="auto"
          className={cn(
            "overflow-hidden font-mono text-xs leading-5 whitespace-pre-wrap text-ink-soft transition-[max-height] duration-500",
            open || !long ? "max-h-[2000px]" : "max-h-24",
          )}
        >
          {text}
        </pre>
        {!open && long && (
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-2xl bg-linear-to-t from-mute-soft/90" />
        )}
      </div>
      {long && (
        <button onClick={() => setOpen((o) => !o)} className="mt-3 min-h-10 text-sm font-medium text-accent underline underline-offset-4">
          {open ? t.results.raw.showLess : t.results.raw.showAll}
        </button>
      )}
    </Section>
  );
}
