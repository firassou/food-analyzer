"use client";
import { useEffect, useState } from "react";

const EVERY_MS = 2600;

/**
 * A word in a headline that is swapped for the next one every few seconds: the old one
 * slides up and out, the new one rises in. All words share one grid cell, so the line
 * is as wide as the longest and never jumps. Screen readers get the whole list once;
 * it stays still for anyone who asked for less motion, and while the tab is hidden.
 */
export default function RotatingWord({ words, className }: { words: readonly string[]; className?: string }) {
  const [step, setStep] = useState({ index: 0, previous: null as number | null, tick: 0 });

  useEffect(() => {
    if (words.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = setInterval(() => {
      if (document.hidden) return;
      setStep((s) => ({ index: (s.index + 1) % words.length, previous: s.index, tick: s.tick + 1 }));
    }, EVERY_MS);
    return () => clearInterval(timer);
  }, [words.length]);

  return (
    <>
      <span className="sr-only">{words.join(", ")}</span>
      <span aria-hidden className="relative -mb-[0.14em] inline-grid overflow-hidden pb-[0.14em] align-bottom">
        {words.map((w) => (
          <span key={w} className="invisible col-start-1 row-start-1">
            {w}
          </span>
        ))}
        {step.previous !== null && (
          <span key={`out-${step.tick}`} className={`animate-word-out col-start-1 row-start-1 ${className ?? ""}`}>
            {words[step.previous]}
          </span>
        )}
        <span key={`in-${step.tick}`} className={`${step.tick > 0 ? "animate-word-in" : ""} col-start-1 row-start-1 ${className ?? ""}`}>
          {words[step.index]}
        </span>
      </span>
    </>
  );
}
