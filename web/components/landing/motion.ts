import type { Variants } from "motion/react";

/** Expo-out: fast start, long soft landing. Used for every reveal on the landing. */
export const EXPO: [number, number, number, number] = [0.16, 1, 0.3, 1];

/** Parent that staggers its children in once the emblem has started to materialise. */
export const stagger = (delay = 0, gap = 0.09): Variants => ({
  hidden: {},
  show: { transition: { delayChildren: delay, staggerChildren: gap } },
  leave: {},
});

/** A block lifting into place. No `filter` here: it would become the backdrop root and kill the glass card's blur. */
export const rise: Variants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.95, ease: EXPO } },
  leave: { opacity: 0, transition: { duration: 0.28 } },
};

/** Headline lines slide up from behind a mask. */
export const line: Variants = {
  hidden: { y: "108%" },
  show: { y: "0%", opacity: 1, transition: { duration: 1.05, ease: EXPO } },
  leave: { opacity: 0, transition: { duration: 0.25 } },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.8 } },
  leave: { opacity: 0, transition: { duration: 0.25 } },
};
