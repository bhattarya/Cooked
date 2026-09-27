"use client";

import { motion, useReducedMotion } from "motion/react";
import { Bars, CountUp, Donut, LineChart, int, viz, type BarItem, type DonutSlice } from "@/components/viz";
import { MIN_N, fmtN, fmtValue, type CohortAnswer, type Reading } from "./model";

// Bars' vertical plot area starts 42px in and stops 8px short of the right edge; the n strip below lines up with those margins.
const PLOT_L = 42;
const PLOT_R = 8;
const STRIP = 44;
// horizontal bars: plot top/bottom margins (no baseline label, with axis) and the width of the n column
const ROW_TOP = 6;
const ROW_BOTTOM = 24;
const N_COL = 88;

const axisFmt = (unit: CohortAnswer["unit"]) => (v: number) => (unit === "years" ? `${+v.toFixed(1)}y` : unit === "%" ? `${Math.round(v)}%` : unit === "ratio" ? `${+v.toFixed(2)}` : int(v));

/** The hero chart, chosen from the shape of the result (see `read`). Every mark is a value the API returned. */
export function AnswerChart({ a, r, height }: { a: CohortAnswer; r: Reading; height: number }) {
  switch (r.kind) {
    case "bars":
      return r.rows.length === 2 ? <CohortDuel a={a} r={r} /> : <CohortBars a={a} r={r} height={height} />;
    case "line":
      return <CohortLine a={a} r={r} height={height} />;
    case "donut":
      return <CohortDonut r={r} height={height} />;
    default:
      return <Withheld a={a} r={r} />;
  }
}

function CohortBars({ a, r, height }: { a: CohortAnswer; r: Reading; height: number }) {
  const vertical = r.rows.length <= 8 && r.rows.every((x) => x.label.length <= 9);
  const fmt = (v: number) => fmtValue(v, a.unit);
  const hasUnknown = r.rows.some((x) => x.unknown);
  const items: BarItem[] = r.rows.map((x) => ({
    key: x.label,
    label: x.label,
    value: x.value ?? 0,
    n: x.n,
    color: x.n < MIN_N ? "var(--dim)" : undefined,
  }));
  const strip = vertical ? STRIP + (hasUnknown ? 16 : 0) : 0;
  const barsH = Math.max(160, height - strip);
  const label = `${a.title}. ${r.rows.map((x) => `${x.label} ${fmt(x.value ?? 0)}, ${fmtN(x.n)}`).join("; ")}.`;
  if (!vertical) {
    // horizontal bars: sample sizes sit in their own column, lined up with the rows (Bars' plot spans TOP..height-BOTTOM)
    const band = (barsH - ROW_TOP - ROW_BOTTOM) / items.length;
    return (
      <div className="relative min-h-0" style={{ paddingRight: N_COL }}>
        <Bars data={items} orientation="horizontal" format={fmt} axisFormat={axisFmt(a.unit)} unit={a.measure.toLowerCase()} labels="all" height={barsH} label={label} />
        <div className="num pointer-events-none absolute right-0 top-0 text-right text-[11px]" style={{ width: N_COL - 8 }} aria-hidden>
          {r.rows.map((x, i) => (
            <div key={x.label} className={`absolute right-0 -translate-y-1/2 leading-tight ${x.n < MIN_N ? "text-ember" : "text-muted"}`} style={{ top: ROW_TOP + (i + 0.5) * band }}>
              {fmtN(x.n)}
              {x.n < MIN_N && <div className="text-[9px] uppercase tracking-wider">too few</div>}
              {x.unknown ? <div className="text-dim">+{x.unknown.toLocaleString("en-US")} unknown</div> : null}
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col">
      <Bars data={items} orientation="vertical" format={fmt} axisFormat={axisFmt(a.unit)} unit={a.measure.toLowerCase()} labels="all" height={barsH} label={label} />
      <div className="num grid shrink-0 text-center text-[11px]" style={{ gridTemplateColumns: `repeat(${r.rows.length}, minmax(0, 1fr))`, paddingLeft: PLOT_L, paddingRight: PLOT_R }} aria-hidden>
        {r.rows.map((x) => (
          <div key={x.label} className={x.n < MIN_N ? "text-dim" : "text-muted"}>
            <div>{fmtN(x.n)}</div>
            {hasUnknown && <div className="text-dim">{x.unknown ? `+${x.unknown.toLocaleString("en-US")} unknown` : " "}</div>}
            {x.n < MIN_N && <div className="text-[10px] uppercase tracking-wider text-ember">too few</div>}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Exactly two groups: two big numbers on zero-based bars, so the size of the gap reads honestly. */
function CohortDuel({ a, r }: { a: CohortAnswer; r: Reading }) {
  const reduced = !!useReducedMotion();
  const max = Math.max(...r.rows.map((x) => x.value ?? 0)) || 1;
  const fmt = (v: number) => fmtValue(v, a.unit);
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-8 sm:gap-10">
      {r.rows.map((x, i) => (
        <div key={x.label}>
          <div className="flex items-end justify-between gap-4">
            <div className="min-w-0">
              <div className="truncate text-[15px] text-cream sm:text-lg">{x.label}</div>
              <div className="num text-[11.5px] text-muted">{fmtN(x.n)}</div>
            </div>
            <CountUp value={x.value ?? 0} format={fmt} className="display shrink-0 text-6xl font-black leading-[0.85] text-cream sm:text-7xl xl:text-8xl" />
          </div>
          <div className="mt-3 h-4 overflow-hidden rounded-full bg-white/[0.05] sm:h-5" role="img" aria-label={`${x.label}: ${fmt(x.value ?? 0)}, ${fmtN(x.n)}`}>
            <motion.div className="h-full rounded-full bg-gradient-to-r from-gold-lo to-gold" style={{ boxShadow: "0 0 24px rgba(246,180,26,0.35)" }} initial={reduced ? false : { width: 0 }} animate={{ width: `${((x.value ?? 0) / max) * 100}%` }} transition={{ duration: 1, delay: 0.15 + i * 0.12, ease: [0.16, 1, 0.3, 1] }} />
          </div>
        </div>
      ))}
      <p className="num text-[10.5px] uppercase tracking-[0.12em] text-dim">bars start at zero</p>
    </div>
  );
}

function CohortLine({ a, r, height }: { a: CohortAnswer; r: Reading; height: number }) {
  const fmt = (v: number) => fmtValue(v, a.unit);
  const ns = r.rows.map((x) => x.n);
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <LineChart
        x={r.rows.map((x) => Number(x.label))}
        xFormat={(v) => String(v)}
        series={[{ key: "v", label: a.measure, y: r.rows.map((x) => (x.n < MIN_N ? null : x.value)), format: fmt }]}
        yFormat={fmt}
        curve="monotone"
        n={r.total}
        height={Math.max(180, height - 26)}
        label={`${a.title}. ${r.rows.map((x) => `${x.label}: ${fmt(x.value ?? 0)}`).join(", ")}.`}
      />
      <div className="num text-center text-[11px] text-dim">
        {Math.min(...ns).toLocaleString("en-US")} to {Math.max(...ns).toLocaleString("en-US")} alumni in each year
      </div>
    </div>
  );
}

function CohortDonut({ r, height }: { r: Reading; height: number }) {
  let seen = 0;
  const data: DonutSlice[] = r.rows.map((x) => {
    const unknown = /^no response$/i.test(x.label);
    return { key: x.label, label: unknown ? "No Response (unknown)" : x.label, value: x.value ?? 0, n: x.n, color: unknown ? "var(--dim)" : viz(seen++) };
  });
  const top = r.rows.filter((x) => !/^no response$/i.test(x.label)).sort((p, q) => (q.value ?? 0) - (p.value ?? 0))[0];
  return <Donut data={data} height={height} thickness={0.3} centerValue={r.total} centerFormat={(v) => int(Math.round(v))} centerLabel="alumni" unit="alumni" format={int} highlight={top?.label} />;
}

/** No chart: the groups were too small (or absent), so COOKED shows sizes only and says why. */
function Withheld({ a, r }: { a: CohortAnswer; r: Reading }) {
  return (
    <div className="flex h-full min-h-[240px] flex-col justify-center rounded-2xl border border-dashed border-ember/40 bg-ember/[0.04] p-6 sm:p-8" role="status">
      <div className="label !text-ember">COOKED refuses to chart this</div>
      <p className="display mt-3 text-4xl font-extrabold leading-[0.95] text-cream sm:text-5xl">{r.kind === "empty" ? "Nothing came back" : "Too few alumni to read"}</p>
      <p className="mt-3 max-w-md text-[13.5px] leading-relaxed text-muted">
        {r.kind === "empty" ? `${r.reason} There is nothing to chart.` : `${r.reason} Groups under ${MIN_N} alumni are never drawn as a pattern, the same floor the twin match uses. Values are withheld; sizes are shown.`}
      </p>
      {r.rows.length > 0 && (
        <ul className="num mt-4 grid max-w-md grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-[12px] text-muted">
          {a.rows.map((x) => (
            <li key={x.label} className="contents">
              <span>{x.label}</span>
              <span className="text-right text-dim">{fmtN(x.n)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
