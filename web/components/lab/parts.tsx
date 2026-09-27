"use client";

import { AnimatePresence, motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import type { Driver, Family } from "@/lib/arena-types";
import { FAMILIES, FAMILY_COLOR, FAMILY_NAME } from "@/lib/labModel";
import s from "./lab.module.css";

/* -------------------------------------------------------------------- crown */

export function Crown({ size = 14, className }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" aria-hidden="true" className={className} style={{ display: "block", filter: "drop-shadow(0 0 4px rgba(246,180,26,.55))" }}>
      <path d="M1.6 5.4l3.3 3 3.1-5 3.1 5 3.3-3-1.1 7H2.7z" fill="currentColor" />
      <rect x="2.6" y="13.2" width="10.8" height="1.6" rx=".8" fill="currentColor" />
    </svg>
  );
}

/* ------------------------------------------------------------------- panels */

/** Frame of one model panel: an index, a title, what it predicts, the champion badge, and a sweep while the models run. */
export function Panel({ n, title, sub, badge, busy, className = "", children }: { n: number; title: string; sub?: string; badge?: ReactNode; busy?: boolean; className?: string; children: ReactNode }) {
  return (
    <section aria-label={title} className={`panel @container relative flex min-h-0 min-w-0 flex-col overflow-hidden p-3.5 ${className}`}>
      {busy && <span className={s.busyBar} aria-hidden="true" />}
      <header className="mb-2 flex shrink-0 items-center gap-2">
        <span className="num text-[10px] text-gold">0{n}</span>
        <h3 className="label whitespace-nowrap !text-text">{title}</h3>
        {sub && <span className="hidden min-w-0 truncate text-[10.5px] text-dim @lg:block">{sub}</span>}
        <div className="ml-auto shrink-0">{badge}</div>
      </header>
      {children}
    </section>
  );
}

/** Who answered: the champion's name, crowned, with the honest verdict against the naive baseline. */
export function Champ({ family, beats, onClick }: { family: Family; beats: boolean | undefined; onClick?: () => void }) {
  const isBase = family === "baseline";
  const tone = isBase ? "border-gold/40 text-gold" : beats ? "border-cool/35 text-cool" : "border-line-2 text-muted";
  const text = isBase ? "Base rates" : FAMILY_NAME[family];
  const glyph = isBase ? "\u25CB" : beats ? "\u2713" : "\u00B1";
  const verdict = isBase ? "no model beat them" : beats ? "beats baseline" : "not beyond noise";
  const body = (
    <>
      {!isBase && <Crown size={11} className="text-gold" />}
      <span>{text}</span>
      <span className="hidden items-center gap-1 @md:inline-flex">
        <span className="text-dim">{"\u00B7"}</span>
        <span>{verdict}</span>
      </span>
      <span aria-hidden="true" className="@md:hidden">{glyph}</span>
    </>
  );
  const cls = `num inline-flex items-center gap-1 rounded-full border px-2 py-[3px] text-[10px] leading-none ${tone}`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${cls} transition hover:bg-gold/10 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold`} title={`${text}: ${verdict}. Open the evidence in the arena.`}>
      {body}
      <span aria-hidden="true">{"→"}</span>
    </button>
  ) : (
    <span className={cls} title={`${text}: ${verdict}`}>{body}</span>
  );
}

/* -------------------------------------------------------------- family dots */

export interface DotEntry {
  family: Family;
  value: number;
  champion: boolean;
}

/**
 * Every family's answer to the same scenario on one track. Where the dots huddle the models agree; where
 * they scatter, they do not. CSS transitions move the dots, so a slider drag glides instead of jittering.
 */
export function FamilyDots({ label, entries, min, max, format, spot, className = "" }: { label: string; entries: DotEntry[]; min: number; max: number; format: (v: number) => string; spot?: Family | null; className?: string }) {
  const span = max - min || 1;
  const pos = (v: number) => `${Math.max(0, Math.min(1, (v - min) / span)) * 100}%`;
  const learned = entries.filter((e) => e.family !== "baseline");
  const vals = learned.map((e) => e.value);
  const lo = vals.length ? Math.min(...vals) : min;
  const hi = vals.length ? Math.max(...vals) : min;
  const aria = entries.map((e) => `${FAMILY_NAME[e.family]} ${format(e.value)}${e.champion ? " (champion)" : ""}`).join(", ");
  return (
    <div className={className}>
      <div className="flex items-baseline justify-between gap-2 text-[9.5px] leading-none">
        <span className="label !text-[9.5px] !tracking-[0.1em]">{label}</span>
        <span className="num text-dim" title="Range of the three learned models">
          {format(lo)} <span aria-hidden="true">{"–"}</span> {format(hi)}
        </span>
      </div>
      <div role="img" aria-label={`${label}: ${aria}`} className="relative mt-1.5 h-[26px]">
        <div className="absolute inset-x-1 top-1/2 h-px bg-line-2" />
        <div className="absolute top-1/2 h-[7px] -translate-y-1/2 rounded-full bg-gold/15 ring-1 ring-gold/25 transition-[left,width] duration-500 ease-[cubic-bezier(.16,1,.3,1)]" style={{ left: pos(lo), width: `calc(${pos(hi)} - ${pos(lo)})` } as CSSProperties} />
        {entries.map((e, i) => {
          const dim = spot && spot !== e.family;
          return (
            <span
              key={e.family}
              title={`${FAMILY_NAME[e.family]}: ${format(e.value)}${e.champion ? " (champion)" : ""}`}
              className="absolute top-1/2 rounded-full transition-[left,opacity,transform] duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
              style={{
                left: pos(e.value),
                width: e.champion ? 13 : 9,
                height: e.champion ? 13 : 9,
                marginLeft: e.champion ? -6.5 : -4.5,
                marginTop: (e.champion ? -6.5 : -4.5) + (i % 2 ? 4 : -4),
                opacity: dim ? 0.25 : 1,
                background: e.family === "baseline" ? "transparent" : FAMILY_COLOR[e.family],
                border: e.family === "baseline" ? `1.5px dashed ${FAMILY_COLOR.baseline}` : e.champion ? "2px solid var(--gold-hi)" : "1.5px solid var(--panel)",
                boxShadow: e.champion ? "0 0 10px rgba(246,180,26,.6)" : undefined,
                zIndex: e.champion ? 2 : 1,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/** The four family colours as a legend that spotlights one family across every dot track. */
export function FamilyLegend({ spot, onSpot, champions }: { spot: Family | null; onSpot: (f: Family | null) => void; champions?: Family[] }) {
  return (
    <ul className="flex items-center gap-3" aria-label="Model families">
      {FAMILIES.map((f) => (
        <li key={f}>
          <button
            type="button"
            className="flex items-center gap-1.5 rounded-full py-1 text-[10.5px] text-muted transition hover:text-text focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold"
            style={{ opacity: spot && spot !== f ? 0.4 : 1 }}
            onPointerEnter={() => onSpot(f)}
            onPointerLeave={() => onSpot(null)}
            onFocus={() => onSpot(f)}
            onBlur={() => onSpot(null)}
            aria-label={`${FAMILY_NAME[f]}${champions?.includes(f) ? ", champion of at least one task" : ""}`}
          >
            <span className="inline-block size-2 rounded-full" style={{ background: f === "baseline" ? "transparent" : FAMILY_COLOR[f], border: f === "baseline" ? `1.5px dashed ${FAMILY_COLOR.baseline}` : undefined }} />
            {FAMILY_NAME[f]}
          </button>
        </li>
      ))}
    </ul>
  );
}

/* --------------------------------------------------------------- range strip */

/**
 * A median with its likely range on a scale (the compact cousin of the hero RangeBar), with each family's own
 * median as a dot on a lane beneath it, so the champion's range and the models' disagreement read together.
 * Positions are CSS transitions: the band slides and stretches as the sliders move, with no per-frame work.
 */
export function RangeStrip({ low, mid, high, min, max, format, marks = [], dots = [], spot, lowLabel = "p25", highLabel = "p75", tone = "var(--gold)" }: { low: number; mid: number; high: number; min: number; max: number; format: (v: number) => string; marks?: { value: number; label: string }[]; dots?: DotEntry[]; spot?: Family | null; lowLabel?: string; highLabel?: string; tone?: string }) {
  const span = max - min || 1;
  const p = (v: number) => Math.max(0, Math.min(1, (v - min) / span)) * 100;
  const ease = "transition-[left,right,width] duration-500 ease-[cubic-bezier(.16,1,.3,1)]";
  const aria = `Likely range ${format(low)} to ${format(high)}, median ${format(mid)}.${dots.length ? ` By model: ${dots.map((d) => `${FAMILY_NAME[d.family]} ${format(d.value)}`).join(", ")}.` : ""}`;
  return (
    <div role="img" aria-label={aria} className="relative h-[78px] w-full shrink-0 select-none">
      <span className={`num absolute top-0 whitespace-nowrap text-[11px] text-text ${ease}`} style={{ right: `min(${100 - p(low)}%, calc(100% - 38px))`, textAlign: "right" }}>
        <span className="mr-1 text-[9px] uppercase tracking-wider text-dim">{lowLabel}</span>
        {format(low)}
      </span>
      <span className={`num absolute top-0 whitespace-nowrap text-[11px] text-text ${ease}`} style={{ left: `min(${p(high)}%, calc(100% - 38px))` }}>
        {format(high)}
        <span className="ml-1 text-[9px] uppercase tracking-wider text-dim">{highLabel}</span>
      </span>
      <div className="absolute inset-x-0 top-[31px] h-[2px] rounded-full bg-line-2" />
      {marks.map((m) => (
        <div key={m.label} className="absolute top-[19px] h-[26px]" style={{ left: `${p(m.value)}%` }}>
          <span className="absolute inset-y-0 w-px border-l border-dashed border-hot/80" />
          <span className="num absolute left-1 top-[48px] whitespace-nowrap text-[8.5px] uppercase tracking-wider text-hot/90">{m.label}</span>
        </div>
      ))}
      <div className={`absolute top-[25px] h-[12px] rounded-full ${ease}`} style={{ left: `${p(low)}%`, width: `${Math.max(0.8, p(high) - p(low))}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${tone} 35%, transparent), ${tone} ${((mid - low) / (high - low || 1)) * 100}%, color-mix(in srgb, ${tone} 35%, transparent))`, boxShadow: `0 0 16px color-mix(in srgb, ${tone} 45%, transparent)` }} />
      <div className={`absolute top-[18px] h-[26px] w-[3px] -translate-x-1/2 rounded-full bg-cream shadow-[0_0_8px_rgba(255,248,231,.6)] ${ease}`} style={{ left: `${p(mid)}%` }} />
      {dots.length > 0 && (
        <div className="absolute inset-x-0 top-[50px] h-[12px]">
          <div className="absolute inset-x-1 top-1/2 h-px bg-line" />
          {dots.map((d) => {
            const size = d.champion ? 12 : 9;
            return (
              <span
                key={d.family}
                title={`${FAMILY_NAME[d.family]} median: ${format(d.value)}${d.champion ? " (champion)" : ""}`}
                className="absolute top-1/2 rounded-full transition-[left,opacity] duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                style={{
                  left: `${p(d.value)}%`,
                  width: size,
                  height: size,
                  margin: `${-size / 2}px 0 0 ${-size / 2}px`,
                  opacity: spot && spot !== d.family ? 0.25 : 1,
                  background: d.family === "baseline" ? "transparent" : FAMILY_COLOR[d.family],
                  border: d.family === "baseline" ? `1.5px dashed ${FAMILY_COLOR.baseline}` : d.champion ? "2px solid var(--gold-hi)" : "1.5px solid var(--panel)",
                  boxShadow: d.champion ? "0 0 10px rgba(246,180,26,.6)" : undefined,
                  zIndex: d.champion ? 2 : 1,
                }}
              />
            );
          })}
        </div>
      )}
      <span className="num absolute bottom-0 left-0 text-[8.5px] text-dim">{format(min)}</span>
      <span className="num absolute bottom-0 right-0 text-[8.5px] text-dim">{format(max)}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ drivers */

const DRIVER_SHORT: Record<Driver["feature"], string> = {
  work_hours: "Work hours",
  credits_per_term: "Credit load",
  withdrawals: "Withdrawals",
  failures: "Failed courses",
  earned_ratio: "Credits earned",
  entry_type: "Entry type",
  residency: "Residency",
  major: "Major",
};
const ROW = 33;
const SLOTS = 4;

const show = (f: Driver["feature"], v: number | string): string => (f === "earned_ratio" && typeof v === "number" ? `${Math.round(v * 100)}%` : String(v));

/** What moves this scenario's risk: signed bars from the typical alumnus, red raises, teal lowers. */
export function Drivers({ drivers, basis }: { drivers: Driver[]; basis: string }) {
  const top = drivers.slice(0, SLOTS);
  const maxAbs = Math.max(0.08, ...top.map((d) => Math.abs(d.delta)));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 leading-none">
        <span className="label !text-[9.5px] !tracking-[0.1em]">What moves it</span>
        <span className="cursor-help text-[9.5px] text-dim" title={basis}>
          vs typical alumnus
        </span>
      </div>
      <div className="relative mt-2" style={{ height: SLOTS * ROW }}>
        <ul aria-label="Drivers of this scenario's risk">
          <AnimatePresence initial={false}>
            {top.map((d, i) => {
              const w = (Math.abs(d.delta) / maxAbs) * 50;
              const raises = d.direction === "raises";
              const col = raises ? "var(--hot)" : "var(--cool)";
              return (
                <motion.li
                  key={d.feature}
                  className="absolute inset-x-0 top-0 grid grid-cols-[86px_1fr_44px] items-center gap-x-1.5"
                  style={{ height: ROW - 4 }}
                  initial={{ opacity: 0, y: i * ROW + 6 }}
                  animate={{ opacity: 1, y: i * ROW }}
                  exit={{ opacity: 0 }}
                  transition={{ type: "spring", stiffness: 380, damping: 34 }}
                >
                  <span className="min-w-0 leading-tight">
                    <span className="block truncate text-[11.5px] text-text">{DRIVER_SHORT[d.feature]}</span>
                    <span className="num block truncate text-[9px] text-dim">
                      {show(d.feature, d.value)} vs {show(d.feature, d.reference)}
                    </span>
                  </span>
                  <span className="relative h-[8px]">
                    <span className="absolute -inset-y-2 left-1/2 w-px bg-line-2" aria-hidden="true" />
                    <span
                      className="absolute top-0 h-full rounded-full transition-[width,background-color] duration-500 ease-[cubic-bezier(.16,1,.3,1)]"
                      style={{ background: col, boxShadow: `0 0 10px color-mix(in srgb, ${col} 55%, transparent)`, width: `${w}%`, left: raises ? "50%" : undefined, right: raises ? undefined : "50%" }}
                    />
                  </span>
                  <span className="num text-right text-[11.5px]" style={{ color: col }}>
                    {`${d.delta >= 0 ? "+" : "−"}${Math.abs(d.delta * 100).toFixed(0)}`}
                    <span className="text-[9px] text-dim"> pts</span>
                  </span>
                </motion.li>
              );
            })}
          </AnimatePresence>
        </ul>
        {top.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center px-2 text-center text-[11.5px] leading-snug text-muted">Nothing stands out: this scenario matches the typical alumnus on every driver.</p>
        ) : (
          top.length < SLOTS && <p className="absolute inset-x-0 bottom-0 text-[9.5px] leading-snug text-dim">Every other input sits at the typical alumnus value or moves the risk by under a twentieth of a point.</p>
        )}
      </div>
    </div>
  );
}
