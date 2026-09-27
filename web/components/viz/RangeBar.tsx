"use client";

import { useState, type ReactNode } from "react";
import { scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { CountUp } from "./Spark";
import { easeOutCubic, navIndex, useTween } from "./hooks";
import { int, nOf } from "./format";
import { FONT_DISPLAY, alpha } from "./tokens";
import s from "./viz.module.css";

export interface RangeMark {
  value: number;
  label: string;
  tone?: "gold" | "risk" | "safe";
}

export interface RangeBarProps {
  /** What is being estimated ("Time to degree"). */
  label: string;
  /** The middle estimate (median). Shown as the big number. */
  value: number;
  /** Lower and upper ends of the likely range (e.g. p25 and p75). */
  low: number;
  high: number;
  /** Extent of the scale the range sits on. */
  min: number;
  max: number;
  format?: (v: number) => string;
  /** Small word after the big number ("years"). */
  unit?: string;
  size?: "md" | "lg" | "hero";
  tone?: "gold" | "safe" | "risk";
  /** Reference points on the scale (a 4-year on-time line, a salary floor). */
  marks?: RangeMark[];
  /** Tick values under the track. Default: nice ticks. */
  ticks?: number[];
  /** Sample size behind the estimate. */
  n?: number;
  lowLabel?: string;
  highLabel?: string;
  midLabel?: string;
  /** Sentence under the bar, e.g. what the range means. */
  caption?: ReactNode;
}

const TONE = { gold: "var(--gold)", safe: "var(--cool)", risk: "var(--hot)" } as const;
const SIZE = {
  md: { num: 44, band: 10, val: 20, h: 108 },
  lg: { num: 68, band: 14, val: 26, h: 128 },
  hero: { num: 108, band: 18, val: 32, h: 148 },
} as const;

/** A value with an honest uncertainty range on a scale. Large by design: this is the hero element for salary and time-to-degree. */
export function RangeBar({ label, value, low, high, min, max, format = int, unit, size = "hero", tone = "gold", marks = [], ticks, n, lowLabel = "p25", highLabel = "p75", midLabel = "median", caption }: RangeBarProps) {
  const z = SIZE[size];
  const summary = `${label}: median ${format(value)}${unit ? ` ${unit}` : ""}, likely range ${format(low)} to ${format(high)}${n !== undefined ? `, from ${int(n)} similar cases` : ""}.`;
  const extra = marks.length ? 22 : 0;
  return (
    <div className={s.hero}>
      <div className={s.heroTop}>
        <div>
          <div className={s.statLabel}>{label}</div>
          <div className={s.statValue} style={{ fontSize: `clamp(${Math.round(z.num * 0.62)}px, 12vw, ${z.num}px)`, marginTop: 6 }}>
            <CountUp value={value} format={format} duration={1300} />
            {unit && <span className={s.statUnit}>{unit}</span>}
          </div>
        </div>
        <div className={s.heroRange}>
          <div className={s.statLabel}>likely range</div>
          <div className="num" style={{ fontSize: size === "md" ? 15 : 19, color: "var(--text)", marginTop: 4, fontFamily: "var(--f-mono), monospace" }}>
            {format(low)} <span style={{ color: "var(--dim)" }}>{"–"}</span> {format(high)}
            {unit && <span style={{ color: "var(--muted)", fontSize: "0.7em", marginLeft: 6 }}>{unit}</span>}
          </div>
          {n !== undefined && <div style={{ fontFamily: "var(--f-mono), monospace", fontSize: 10.5, color: "var(--faint)", marginTop: 4 }}>{nOf(n)}</div>}
        </div>
      </div>
      <div style={{ marginTop: 10 }}>
        <ChartShell
          height={z.h + extra}
          label={summary}
          hint="Arrow keys step between the low end, the median and the high end."
          table={{ caption: summary, head: ["Measure", "Value"], rows: [[lowLabel, format(low)], [midLabel, format(value)], [highLabel, format(high)], ...(n !== undefined ? [["n", int(n)]] : [])] }}
        >
          <RangeBody value={value} low={low} high={high} min={min} max={max} format={format} unit={unit} label={label} size={size} tone={tone} marks={marks} ticks={ticks} n={n} lowLabel={lowLabel} highLabel={highLabel} midLabel={midLabel} />
        </ChartShell>
      </div>
      {caption && <div style={{ marginTop: 10, fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>{caption}</div>}
    </div>
  );
}

function RangeBody({ value, low, high, min, max, format, unit, label, size, tone, marks, ticks, n, lowLabel, highLabel, midLabel }: Required<Pick<RangeBarProps, "value" | "low" | "high" | "min" | "max" | "format" | "size" | "tone" | "marks" | "lowLabel" | "highLabel" | "midLabel" | "label">> & Pick<RangeBarProps, "unit" | "ticks" | "n">) {
  const { width: W, inView, uid, show } = useChart();
  const [stop, setStop] = useState<number | null>(null);
  const z = SIZE[size];
  const col = TONE[tone];
  // the band opens outward from the median on entry
  const d = useTween([low, value, high], { enabled: inView, duration: 1300, ease: easeOutCubic, from: () => value });
  const padX = 8;
  const xs = scaleLinear().domain([min, max]).range([padX, Math.max(padX + 10, W - padX)]);
  const cy = z.val + 34 + z.band / 2;
  const [xl, xm, xh] = [xs(d[0]), xs(d[1]), xs(d[2])];
  const tickVals = ticks ?? scaleLinear().domain([min, max]).ticks(Math.max(2, Math.round(W / 130)));
  const mid = (value - low) / (high - low || 1);
  const half = z.band / 2;

  const stopsVals = [low, value, high];
  const stopNames = [lowLabel, midLabel, highLabel];
  const tipStop = (i: number) => {
    const v = stopsVals[i];
    show(xs(v), cy - half - 8, { title: label, rows: [{ label: stopNames[i], value: `${format(v)}${unit ? ` ${unit}` : ""}`, color: col, swatch: "box", strong: true }, { label: "likely range", value: `${format(low)} – ${format(high)}` }], note: n !== undefined ? nOf(n) : undefined }, { announce: true });
  };
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, stop ?? -1, 3);
      if (nx === null) return false;
      setStop(nx);
      tipStop(nx);
      return true;
    },
    onFocus: () => {
      setStop(1);
      tipStop(1);
    },
    onBlur: () => setStop(null),
  });

  const labelLow = xl - 12 < 40;
  const labelHigh = xh + 12 > W - 40;
  const gradId = `${uid}rb`;

  return (
    <svg width={W} height={z.h + (marks.length ? 22 : 0)} aria-hidden="true">
      <defs>
        <linearGradient id={gradId} x1="0" x2="1">
          <stop offset="0" stopColor={col} stopOpacity={0.3} />
          <stop offset={Math.max(0.05, Math.min(0.95, mid))} stopColor={col} stopOpacity={1} />
          <stop offset="1" stopColor={col} stopOpacity={0.3} />
        </linearGradient>
      </defs>
      {/* the scale */}
      <line x1={xs(min)} x2={xs(max)} y1={cy} y2={cy} stroke="var(--line-2)" strokeWidth={2} strokeLinecap="round" />
      {tickVals.map((t) => (
        <g key={t}>
          <line x1={xs(t)} x2={xs(t)} y1={cy + half + 8} y2={cy + half + 13} stroke="var(--dim)" />
          <text className={s.tick} x={xs(t)} y={cy + half + 26} textAnchor={xs(t) < 14 ? "start" : xs(t) > W - 14 ? "end" : "middle"}>
            {format(t)}
          </text>
        </g>
      ))}
      {/* reference marks */}
      {marks.map((mk) => (
        <g key={mk.label} pointerEvents="none">
          <line x1={xs(mk.value)} x2={xs(mk.value)} y1={cy - half - 10} y2={cy + half + 9} stroke={TONE[mk.tone ?? "risk"]} strokeWidth={1.3} strokeDasharray="4 3" opacity={0.85} />
          <text className={`${s.cap} ${s.halo}`} x={xs(mk.value)} y={cy + half + 46} textAnchor={xs(mk.value) > W - 70 ? "end" : xs(mk.value) < 70 ? "start" : "middle"} style={{ fill: TONE[mk.tone ?? "risk"] }}>
            {mk.label}
          </text>
        </g>
      ))}
      {/* the range: soft at the ends, solid at the median, glowing */}
      <rect x={xl} y={cy - half} width={Math.max(2, xh - xl)} height={z.band} rx={half} fill={`url(#${gradId})`} style={{ filter: `drop-shadow(0 0 12px ${alpha(col, 0.5)})` }} />
      {[xl, xh].map((x, i) => (
        <line key={i} x1={x} x2={x} y1={cy - half - 6} y2={cy + half + 6} stroke={col} strokeWidth={2} strokeLinecap="round" opacity={0.9} />
      ))}
      {/* end values */}
      {[
        { x: xl, v: d[0], anchor: labelLow ? "start" : "end", dx: labelLow ? -2 : -10, cap: lowLabel },
        { x: xh, v: d[2], anchor: labelHigh ? "end" : "start", dx: labelHigh ? 2 : 10, cap: highLabel },
      ].map((e) => (
        <g key={e.cap} pointerEvents="none">
          <text className={s.cap} x={e.x + e.dx} y={12} textAnchor={e.anchor as "start" | "end"}>
            {e.cap}
          </text>
          <text x={e.x + e.dx} y={12 + z.val} textAnchor={e.anchor as "start" | "end"} style={{ fontFamily: FONT_DISPLAY, fontWeight: 800, fontSize: z.val, fill: "var(--text)" }}>
            {format(e.v)}
          </text>
        </g>
      ))}
      {/* the median */}
      <g pointerEvents="none" style={{ filter: "drop-shadow(0 0 6px rgba(255,248,231,.55))" }}>
        <line x1={xm} x2={xm} y1={cy - half - 12} y2={cy + half + 12} stroke="var(--cream)" strokeWidth={3} strokeLinecap="round" />
        <path d={`M${xm - 5},${cy - half - 20}l5,7l5,-7Z`} fill="var(--cream)" />
      </g>
      {xh - xl > 76 && (
        <text className={s.cap} x={xm} y={cy - half - 26} textAnchor="middle" style={{ fill: "var(--muted)" }} pointerEvents="none">
          {midLabel}
        </text>
      )}
      {/* generous hit area over the whole scale */}
      <rect
        x={0}
        y={0}
        width={W}
        height={z.h}
        fill="transparent"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = e.clientX - r.left;
          const v = xs.invert(px);
          const nearest = [low, value, high].reduce((a, b, i, arr) => (Math.abs(b - v) < Math.abs(arr[a] - v) ? i : a), 0);
          tipStop(nearest);
        }}
      />
    </svg>
  );
}
