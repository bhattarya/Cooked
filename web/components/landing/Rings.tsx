"use client";

import { motion, useTransform, type MotionValue } from "motion/react";
import styles from "./landing.module.css";

const C = 500;
const circ = (r: number) => 2 * Math.PI * r;

/**
 * Hairline orbits around the emblem, a nod to the trajectory arrows on the skillet. They turn at
 * different speeds and sit a step behind the emblem in the pointer parallax, which is what makes
 * the whole piece read as layered instead of flat.
 */
export function Rings({ sx, sy }: { sx: MotionValue<number>; sy: MotionValue<number> }) {
  const x = useTransform(sx, [-1, 1], [12, -12]);
  const y = useTransform(sy, [-1, 1], [9, -9]);
  return (
    <motion.div
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[152%] -translate-x-1/2 -translate-y-1/2"
      style={{ x, y, maskImage: "radial-gradient(closest-side, transparent 34%, #000 52%, #000 80%, transparent 100%)", WebkitMaskImage: "radial-gradient(closest-side, transparent 34%, #000 52%, #000 80%, transparent 100%)" }}
      initial={{ opacity: 0, scale: 0.78 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 2.4, delay: 0.5, ease: [0.16, 1, 0.3, 1] }}
    >
      <svg viewBox="0 0 1000 1000" className="h-full w-full overflow-visible">
        <defs>
          <linearGradient id="landing-arc" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#ffd15c" stopOpacity="0.95" />
            <stop offset="1" stopColor="#f6b41a" stopOpacity="0.1" />
          </linearGradient>
        </defs>

        <circle cx={C} cy={C} r={350} fill="none" stroke="#f6b41a" strokeOpacity={0.16} strokeWidth={1} />

        <g className={styles.spinCw}>
          <circle cx={C} cy={C} r={392} fill="none" stroke="#ffd15c" strokeOpacity={0.34} strokeWidth={2.2} strokeDasharray="1.4 11" />
        </g>

        <g className={styles.spinCcw}>
          <circle cx={C} cy={C} r={436} fill="none" stroke="url(#landing-arc)" strokeWidth={1.6} strokeLinecap="round" strokeDasharray={`${circ(436) * 0.22} ${circ(436) * 0.28}`} />
          <circle cx={C + 436} cy={C} r={4.5} fill="#ffd15c" />
          <circle cx={C - 436} cy={C} r={3} fill="#f6b41a" opacity={0.7} />
        </g>

        <g className={styles.spinCw} style={{ animationDuration: "400s" }}>
          <circle cx={C} cy={C} r={478} fill="none" stroke="#f6b41a" strokeOpacity={0.24} strokeWidth={9} strokeDasharray={`1.2 ${circ(478) / 180 - 1.2}`} />
        </g>

        <g className={styles.spinFast}>
          <circle cx={C + 458} cy={C} r={11} fill="#f6b41a" opacity={0.18} />
          <circle cx={C + 458} cy={C} r={3.2} fill="#fff1c2" />
        </g>
      </svg>
    </motion.div>
  );
}
