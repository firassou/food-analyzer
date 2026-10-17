"use client";

import { Children, createContext, isValidElement, useContext } from "react";
import { MotionConfig, motion, type HTMLMotionProps, type Variants } from "framer-motion";
import type { Mode } from "./client/mode";

/*
 * Motion for the whole app, in one place. Food mode is lively (a small rise, a lift on hover);
 * Medicine Mode is restrained (fades only, no lift, no scale) to stay calm and precise.
 * Reduced-motion is honoured by MotionConfig: transforms are dropped, opacity changes stay.
 */

const MotionMode = createContext<Mode>("food");

export const EASE = [0.22, 1, 0.36, 1] as const;

/** wraps the page: reads the user's reduced-motion setting and tells children which mode they are in */
export function MotionRoot({ mode, children }: { mode: Mode; children: React.ReactNode }) {
  return (
    <MotionMode.Provider value={mode}>
      <MotionConfig reducedMotion="user" transition={{ duration: 0.32, ease: EASE }}>
        {children}
      </MotionConfig>
    </MotionMode.Provider>
  );
}

export function useIsMedicine() {
  return useContext(MotionMode) === "medicine";
}

/** how a button answers a pointer: Food scales up a touch on hover and presses in; Medicine only presses */
export function usePress() {
  const medicine = useIsMedicine();
  return medicine ? { whileTap: { scale: 0.99 } } : { whileHover: { scale: 1.03 }, whileTap: { scale: 0.97 } };
}

function useRise() {
  return useIsMedicine() ? 0 : 12;
}

type DivProps = HTMLMotionProps<"div">;

/** fade in with a slight rise, once, when it first comes into view */
export function Reveal({ delay = 0, ...rest }: DivProps & { delay?: number }) {
  const y = useRise();
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "0px 0px -8% 0px" }}
      transition={{ delay }}
      {...rest}
    />
  );
}

/** a screen: fades and rises in on entry, fades out on exit (use inside AnimatePresence) */
export function PageView(props: DivProps) {
  const y = useRise();
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.36, ease: EASE } }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
      {...props}
    />
  );
}

/** children enter one after another; each element child is wrapped in a StaggerItem */
export function Stagger({ step = 0.06, children, ...rest }: DivProps & { step?: number }) {
  const variants: Variants = { hidden: {}, show: { transition: { staggerChildren: step, delayChildren: 0.04 } } };
  return (
    <motion.div variants={variants} initial="hidden" animate="show" {...rest}>
      {Children.map(children as React.ReactNode, (child) => (isValidElement(child) ? <StaggerItem>{child}</StaggerItem> : child))}
    </motion.div>
  );
}

export function StaggerItem(props: DivProps) {
  const y = useRise();
  const variants: Variants = {
    hidden: { opacity: 0, y },
    show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } },
  };
  return <motion.div variants={variants} {...props} />;
}

/** a floating glass panel that slides up on entry (the dock) */
export function Float(props: DivProps) {
  const medicine = useIsMedicine();
  return (
    <motion.div
      initial={{ opacity: 0, y: medicine ? 0 : 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: EASE }}
      {...props}
    />
  );
}

/** a button that answers a pointer (see usePress) */
export function PressButton(props: HTMLMotionProps<"button">) {
  return <motion.button {...usePress()} {...props} />;
}
