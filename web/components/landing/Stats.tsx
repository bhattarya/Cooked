"use client";

import { animate } from "motion/react";
import { useEffect, useRef } from "react";
import meta from "../../public/data/meta.json";
import styles from "./landing.module.css";

// Every figure here is read straight from public/data/meta.json, which is built from the dataset
// itself (scripts/build-data.mjs). Nothing on the landing is typed in by hand.
const STATS = [
  { value: meta.counts.alumni, label: "alumni outcomes" },
  { value: meta.counts.current, label: "current students" },
  { value: meta.counts.transcripts, label: "transcript rows" },
  { value: meta.baseRate * 100, label: "of alumni cooked", decimals: 1, suffix: "%" },
];

const fmt = (v: number, decimals: number, suffix: string) => v.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + suffix;

// Server HTML carries the final figure; once mounted it counts up to it from zero.
function CountUp({ value, decimals = 0, suffix = "", delay, reduced }: { value: number; decimals?: number; suffix?: string; delay: number; reduced: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = fmt(value, decimals, suffix); // `reduced` flips after hydration; undo a count already begun
      return;
    }
    el.textContent = fmt(0, decimals, suffix);
    const run = animate(0, value, { duration: 1.9, delay, ease: [0.16, 1, 0.3, 1], onUpdate: (v) => (el.textContent = fmt(v, decimals, suffix)) });
    return () => run.stop();
  }, [value, decimals, suffix, delay, reduced]);
  return <span ref={ref}>{fmt(value, decimals, suffix)}</span>;
}

/** Four real numbers from the dataset, with the synthetic-data disclaimer and provenance link. */
export function Stats({ reduced, className = "" }: { reduced: boolean; className?: string }) {
  return (
    <div className={className}>
      <dl className="flex flex-wrap items-end justify-center gap-x-6 gap-y-3 sm:gap-x-8 xl:justify-start">
        {STATS.map((s, i) => (
          <div key={s.label} className="flex flex-col-reverse gap-1">
            <dt className="text-[10.5px] uppercase tracking-[0.14em] text-muted">{s.label}</dt>
            <dd className="num text-[22px] font-medium leading-none text-gold-hi sm:text-[26px]">
              <CountUp value={s.value} decimals={s.decimals} suffix={s.suffix} delay={1.3 + i * 0.12} reduced={reduced} />
            </dd>
          </div>
        ))}
      </dl>
      <p className="mt-3.5 max-w-[46ch] text-[11.5px] leading-relaxed text-muted">
        <span className="inline-block h-1.5 w-1.5 -translate-y-px rounded-full bg-gold align-middle" aria-hidden /> Synthetic data. Every figure comes from the{" "}
        <a href="https://github.com/jasonpaluck/hackumbc-2026" target="_blank" rel="noreferrer" className={`${styles.link} text-muted`}>
          HackUMBC 2026 dataset (UMBC DoIT, CC0)
        </a>
        ; none of it describes real students.
      </p>
    </div>
  );
}
