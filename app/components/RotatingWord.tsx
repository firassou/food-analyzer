"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { cn } from "./ui";

/** long enough to read the sentence each time, short enough to notice the change */
const INTERVAL_MS = 3200;
const REDUCED = "(prefers-reduced-motion: reduce)";

const subscribeReduced = (onChange: () => void) => {
  const query = window.matchMedia(REDUCED);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
};
const reducedNow = () => window.matchMedia(REDUCED).matches;

/**
 * A sentence whose `{thing}` (a single word: the article stays in the sentence) cycles through
 * `things` in the accent colour, each sliding up out of a clipped slot as the next one rises in.
 * Paused on a hidden tab; under reduced motion, and for screen readers, the plain `text` is shown once.
 */
export function RotatingSentence({ text, template, things, className }: { text: string; template: string; things: string[]; className?: string }) {
  const reduced = useSyncExternalStore(subscribeReduced, reducedNow, () => false);
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (reduced || things.length < 2) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % things.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [reduced, things.length]);

  if (reduced) return <p className={className}>{text}</p>;
  const [before, after = ""] = template.split("{thing}");
  const previous = (index + things.length - 1) % things.length;
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {before}
        {/* the shown word sets the width; the others wait below (or leave above) the clipped slot */}
        <span className="relative inline-block overflow-hidden align-bottom">
          {things.map((thing, i) => (
            <span
              key={thing}
              className={cn(
                "block font-semibold whitespace-nowrap text-accent transition-[translate,opacity] duration-700 ease-(--ease-spring)",
                i === index ? "relative translate-y-0 opacity-100" : "absolute start-0 top-0 opacity-0",
                i !== index && (i === previous ? "-translate-y-full" : "translate-y-full"),
              )}
            >
              {thing}
            </span>
          ))}
        </span>
        {after}
      </span>
    </p>
  );
}
