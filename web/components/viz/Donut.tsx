"use client";

import { useMemo, useRef, useState } from "react";
import { arc as d3arc, pie as d3pie } from "d3";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { Legend } from "./Legend";
import { easeOutBack, easeOutCubic, easeOutExpo, localXY, navIndex, useInView, useTween, useTweenValue } from "./hooks";
import { int, nOf, pct } from "./format";
import { polar, rad, ellipsize, wrapLabel } from "./geometry";
import { FONT_DISPLAY, RISK_THRESHOLDS, riskLevel, riskTone, viz } from "./tokens";
import s from "./viz.module.css";

export interface DonutSlice {
  /** Stable id (colour follows the entity). Defaults to the label. */
  key?: string;
  label: string;
  value: number;
  /** CSS colour or token. Defaults to the fixed categorical order (`--viz-1..8`) by position. */
  color?: string;
  /** Sample size behind this slice, shown in the tooltip. */
  n?: number;
}

export interface DonutProps {
  data: DonutSlice[];
  /** Big number in the hole (Big Shoulders). Numbers count up. Hover swaps in the slice's share. */
  centerValue?: string | number;
  centerFormat?: (v: number) => string;
  /** Caption under the big number. */
  centerLabel?: string;
  height?: number;
  /** Ring thickness as a fraction of the radius (0.1 to 0.7). Default 0.26; ~0.62 reads as a pie. */
  thickness?: number;
  /** Degrees of air between slices. Default 1.8. */
  padAngle?: number;
  /** Where the first slice starts, in degrees clockwise from 12 o'clock. Default 0. */
  startAngle?: number;
  /** Half-gauge mode: a 180 degree arc from 9 to 3 o'clock. */
  half?: boolean;
  /** "leader" draws direct labels with leader lines when there is room. Default "leader". */
  labels?: "leader" | "none";
  /** Formats slice values in tooltips and leader labels. */
  format?: (v: number) => string;
  /** Noun for the value in tooltips ("alumni", "credits"). */
  unit?: string;
  /** Key of a slice to emphasise (gold glow) while nothing is hovered. */
  highlight?: string;
  /** Force the legend on/off. Default: shown only when leader labels are not. */
  legend?: boolean;
  /** Aria summary override. Default names the largest slice. */
  label?: string;
  onSliceHover?: (key: string | null) => void;
}

const LEADER_MIN_WIDTH = 520;

export function Donut({ data, centerValue, centerFormat, centerLabel, height = 260, thickness = 0.26, padAngle = 1.8, startAngle = 0, half = false, labels = "leader", format = int, unit, highlight, legend, label, onSliceHover }: DonutProps) {
  const items = useMemo(() => data.filter((d) => d.value > 0).map((d, i) => ({ ...d, key: d.key ?? d.label, color: d.color ?? viz(i) })), [data]);
  const total = items.reduce((a, d) => a + d.value, 0);
  const top = items.reduce((a, d) => (d.value > (a?.value ?? -1) ? d : a), items[0]);
  const summary = label ?? (top ? `${top.label} is the largest share at ${pct(top.value / total)} of ${format(total)}${unit ? ` ${unit}` : ""}, across ${items.length} groups.` : "No data.");

  return (
    <ChartShell
      height={height}
      empty={items.length === 0}
      label={summary}
      table={{ caption: summary, head: ["Group", unit ?? "Value", "Share"], rows: items.map((d) => [d.label, format(d.value), pct(d.value / total, 1)]) }}
      legend={(w) => (labels === "none" || w < LEADER_MIN_WIDTH ? legend !== false : legend === true) && <Legend items={items.map((d) => ({ key: d.key, label: d.label, color: d.color, value: pct(d.value / total), swatch: "box" as const }))} />}
    >
      <DonutBody items={items} total={total} centerValue={centerValue} centerFormat={centerFormat} centerLabel={centerLabel} thickness={thickness} padAngle={padAngle} startAngle={startAngle} half={half} labels={labels} format={format} unit={unit} highlight={highlight} onSliceHover={onSliceHover} />
    </ChartShell>
  );
}

type Item = DonutSlice & { key: string; color: string };

function DonutBody({ items, total, centerValue, centerFormat, centerLabel, thickness, padAngle, startAngle, half, labels, format, unit, highlight, onSliceHover }: { items: Item[]; total: number; centerValue?: string | number; centerFormat?: (v: number) => string; centerLabel?: string; thickness: number; padAngle: number; startAngle: number; half: boolean; labels: "leader" | "none"; format: (v: number) => string; unit?: string; highlight?: string; onSliceHover?: (key: string | null) => void }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);

  const leaders = labels === "leader" && W >= LEADER_MIN_WIDTH;
  const mx = leaders ? 100 : 14;
  const my = leaders ? 26 : 10;
  const baseY = half ? 30 : 0;
  const R = Math.max(40, half ? Math.min(W / 2 - mx, H - my - baseY) : Math.min(W / 2 - mx, (H - 2 * my) / 2));
  const cx = W / 2;
  const cy = half ? H - baseY : H / 2;
  const ir = R * (1 - thickness);
  const a0 = half ? -90 : startAngle;
  const a1 = a0 + (half ? 180 : 360);

  const arcs = useMemo(
    () =>
      d3pie<Item>()
        .sort(null)
        .value((d) => d.value)
        .startAngle(rad(a0))
        .endAngle(rad(a1))(items),
    [items, a0, a1],
  );
  const target = useMemo(() => arcs.flatMap((a) => [a.startAngle, a.endAngle]), [arcs]);
  const shown = useTween(target, { enabled: inView, duration: 1100, ease: easeOutExpo, delay: (i) => Math.floor(i / 2) * 110, from: (i, t) => (i % 2 === 0 ? t : target[i - 1]) });

  const hi = highlight ? items.findIndex((d) => d.key === highlight) : -1;
  const active = hover ?? kbd ?? (hi >= 0 ? hi : null);
  const gen = useMemo(() => d3arc<{ startAngle: number; endAngle: number }>().innerRadius(ir).outerRadius(R).cornerRadius(Math.min(4, (R - ir) / 2.4)).padAngle(rad(padAngle)).padRadius(R), [ir, R, padAngle]);

  const numericCenter = typeof centerValue === "number" ? centerValue : 0;
  const centerShown = useTweenValue(numericCenter, { enabled: inView, duration: 1200, ease: easeOutExpo });

  const tipFor = (i: number, x: number, y: number, say = false) => {
    const d = items[i];
    show(x, y, { title: d.label, rows: [{ label: unit ?? "value", value: format(d.value), color: d.color, swatch: "box", strong: true }, { label: "of total", value: pct(d.value / total, 1) }], note: d.n !== undefined ? nOf(d.n) : undefined }, { announce: say });
  };
  const setActive = (i: number | null) => {
    setHover(i);
    onSliceHover?.(i === null ? null : items[i].key);
  };

  useChartKeys({
    onKey: (e) => {
      const n = navIndex(e.key, kbd ?? -1, items.length);
      if (n === null) return false;
      setKbd(n);
      setActive(null);
      const a = arcs[n];
      const [x, y] = polar(cx, cy, R, ((a.startAngle + a.endAngle) / 2) * (180 / Math.PI));
      tipFor(n, x, y, true);
      return true;
    },
    onFocus: () => {
      setKbd(0);
      setActive(null);
      setHover(null);
      const a = arcs[0];
      if (!a) return;
      const [x, y] = polar(cx, cy, R, ((a.startAngle + a.endAngle) / 2) * (180 / Math.PI));
      tipFor(0, x, y, true);
    },
    onBlur: () => setKbd(null),
  });

  // Leader labels, wrapped to the room beside the ring and spread apart per side so neighbours never overprint.
  const room = W / 2 - R - 44;
  const leaderSet = useMemo(() => {
    if (!leaders) return [];
    const L = arcs
      .map((a, i) => {
        const mid = (a.startAngle + a.endAngle) / 2;
        const dx = Math.sin(mid);
        const dy = -Math.cos(mid);
        const lines = wrapLabel(items[i].label, Math.max(6, Math.floor(room / 6.4)), 2);
        return { i, share: items[i].value / total, right: dx >= 0, p0: [cx + dx * (R + 3), cy + dy * (R + 3)] as [number, number], p1: [cx + dx * (R + 15), cy + dy * (R + 15)] as [number, number], y: cy + dy * (R + 15), lines, hgt: lines.length * 13 + 16 };
      })
      .filter((l) => l.share >= 0.035);
    for (const side of [true, false]) {
      const col = L.filter((l) => l.right === side).sort((a, b) => a.y - b.y);
      for (let k = 1; k < col.length; k++) col[k].y = Math.max(col[k].y, col[k - 1].y + (col[k - 1].hgt + col[k].hgt) / 2 + 4);
      const over = col.length ? col[col.length - 1].y + col[col.length - 1].hgt / 2 - (H - 4) : 0;
      if (over > 0) col.forEach((l) => (l.y -= over));
      for (let k = col.length - 2; k >= 0; k--) col[k].y = Math.min(col[k].y, col[k + 1].y - (col[k + 1].hgt + col[k].hgt) / 2 - 4);
    }
    return L;
  }, [leaders, arcs, items, total, cx, cy, R, H, room]);

  const activeItem = active !== null ? items[active] : null;
  const centerText = activeItem ? pct(activeItem.value / total, activeItem.value / total < 0.1 ? 1 : 0) : typeof centerValue === "number" ? (centerFormat ?? int)(centerShown) : (centerValue ?? "");
  const centerCap = activeItem ? activeItem.label : centerLabel;
  const fs = Math.max(20, Math.min(ir * 0.78, (ir * 1.75) / Math.max(2.4, centerText.length * 0.62)));
  const showCenter = centerText !== "" && ir > 34;

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setActive(null); hide(); }}>
      {arcs.map((a, i) => {
        const d = items[i];
        const mid = (a.startAngle + a.endAngle) / 2;
        const on = active === i;
        const off = on ? 7 : 0;
        return (
          <g
            key={d.key}
            className={`${s.mark}${active !== null && !on ? ` ${s.dimmed}` : ""}`}
            style={{ transform: `translate(${Math.sin(mid) * off}px, ${-Math.cos(mid) * off}px)`, transition: "transform .28s cubic-bezier(.16,1,.3,1), opacity .18s", filter: on ? `drop-shadow(0 0 12px color-mix(in srgb, ${d.color} 55%, transparent))` : undefined }}
            onPointerEnter={() => setActive(i)}
            onPointerMove={(e) => {
              const [x, y] = localXY(e, svgRef.current);
              tipFor(i, x, y);
            }}
          >
            <path d={gen({ startAngle: shown[2 * i], endAngle: shown[2 * i + 1] }) ?? ""} transform={`translate(${cx} ${cy})`} fill={d.color} />
          </g>
        );
      })}
      {leaderSet.map((l) => {
        const d = items[l.i];
        const on = active === null || active === l.i;
        const lx = l.right ? cx + R + 34 : cx - R - 34;
        const anchor = l.right ? "start" : "end";
        const top = l.y - l.hgt / 2 + 11;
        return (
          <g key={d.key} className={s.fadeIn} style={{ ["--d" as string]: "700ms", opacity: on ? 1 : 0.3, transition: "opacity .2s" }}>
            <path d={`M${l.p0[0]},${l.p0[1]}L${l.p1[0]},${l.p1[1]}L${lx + (l.right ? -6 : 6)},${l.y}`} fill="none" stroke="var(--line-2)" strokeWidth={1} />
            <text className={s.cat} x={lx} y={top} textAnchor={anchor}>
              {l.lines.map((ln, k) => (
                <tspan key={k} x={lx} y={top + k * 13}>
                  {ln}
                </tspan>
              ))}
            </text>
            <text className={s.val} x={lx} y={top + l.lines.length * 13 + 1} textAnchor={anchor}>
              {format(d.value)}
              <tspan fill="var(--dim)"> · {pct(d.value / total)}</tspan>
            </text>
          </g>
        );
      })}
      {showCenter && (
        <g pointerEvents="none">
          <text className={s.display} x={cx} y={half ? cy - 8 : cy + fs * 0.06} textAnchor="middle" fontSize={fs} style={{ fontFamily: FONT_DISPLAY }}>
            {centerText}
          </text>
          {centerCap && (
            <text className={s.cap} x={cx} y={(half ? cy - 8 : cy + fs * 0.06) + Math.max(14, fs * 0.36)} textAnchor="middle">
              {ellipsize(centerCap, ir * 1.7, 9.5, 0.66)}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

/* --------------------------------- RiskRing --------------------------------- */

export interface RiskRingProps {
  /** Risk 0..1. */
  value: number;
  /** Model uncertainty around the value, drawn as a ghost arc. */
  range?: { low: number; high: number };
  /** Rendered pixel width (the ring scales down to fit its container). Default 260. */
  size?: number;
  /** Caption under the number. Default "risk of getting cooked". */
  label?: string;
  /** Sample size, shown under the caption. */
  n?: number;
  /** Arc length in degrees. Default 270. */
  sweep?: number;
  showNeedle?: boolean;
  className?: string;
}

const VB = 240;
const PAD = 16;
const LEVEL_WORD = { low: "Low risk", elevated: "Elevated", high: "High risk" } as const;

/** Single-value risk gauge: red/gold/teal by threshold, threshold tick marks, glow and a needle that sweeps in. */
export function RiskRing({ value, range, size = 260, label = "risk of getting cooked", n, sweep = 270, showNeedle = true, className }: RiskRingProps) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref);
  const v = Math.max(0, Math.min(1, value));
  const [tv, tlo, thi] = useTween([v, range?.low ?? v, range?.high ?? v], { enabled: inView, duration: 1300, ease: easeOutCubic });
  const needle = useTweenValue(v, { enabled: inView, duration: 1500, ease: easeOutBack });
  const tone = riskTone(v);
  const level = riskLevel(v);
  const c = VB / 2;
  const R = 92;
  const w = 13;
  const A = (t: number) => -sweep / 2 + t * sweep;
  const arcGen = d3arc<{ startAngle: number; endAngle: number }>().innerRadius(R - w / 2).outerRadius(R + w / 2).cornerRadius(w / 2);
  const zone = d3arc<{ startAngle: number; endAngle: number }>().innerRadius(R + 13).outerRadius(R + 16);
  const seg = (a: number, b: number) => ({ startAngle: rad(A(a)), endAngle: rad(A(b)) });
  const ticks = Array.from({ length: 21 }, (_, i) => i / 20);
  const zones: [number, number, string][] = [
    [0, RISK_THRESHOLDS.elevated, "var(--cool)"],
    [RISK_THRESHOLDS.elevated, RISK_THRESHOLDS.high, "var(--gold)"],
    [RISK_THRESHOLDS.high, 1, "var(--hot)"],
  ];
  const pctText = Math.round(tv * 100);
  const say = `${label}: ${Math.round(v * 100)} percent, ${LEVEL_WORD[level].toLowerCase()}${range ? `, model range ${Math.round(range.low * 100)} to ${Math.round(range.high * 100)} percent` : ""}${n ? `, based on ${n.toLocaleString("en-US")} cases` : ""}.`;
  const [nx0, ny0] = polar(c, c, R - 20, A(needle));
  const [nx1, ny1] = polar(c, c, R + 9, A(needle));

  return (
    <div ref={ref} className={`${s.root} ${className ?? ""}`} data-live={inView ? "1" : "0"} style={{ width: size, maxWidth: "100%" }}>
      <svg viewBox={`${-PAD} ${-PAD} ${VB + 2 * PAD} ${VB + 2 * PAD}`} width="100%" role="img" aria-label={say} style={{ display: "block", overflow: "visible" }}>
        {/* zone bands: the thresholds themselves, so colour has a place on the scale */}
        {zones.map(([a, b, col]) => (
          <path key={a} d={zone(seg(a + 0.006, b - 0.006)) ?? ""} transform={`translate(${c} ${c})`} fill={col} opacity={0.5} />
        ))}
        <path d={arcGen(seg(0, 1)) ?? ""} transform={`translate(${c} ${c})`} fill="var(--line-2)" opacity={0.7} />
        {range && tlo < thi && <path d={arcGen(seg(tlo, thi)) ?? ""} transform={`translate(${c} ${c})`} fill={tone} opacity={0.22} />}
        <g className={s.breath}>
          <path d={arcGen(seg(0, Math.max(0.004, tv))) ?? ""} transform={`translate(${c} ${c})`} fill={tone} opacity={0.35} style={{ filter: `blur(9px)` }} />
        </g>
        <path d={arcGen(seg(0, Math.max(0.004, tv))) ?? ""} transform={`translate(${c} ${c})`} style={{ fill: tone, transition: "fill .5s", filter: `drop-shadow(0 0 7px color-mix(in srgb, ${tone} 60%, transparent))` }} />
        {/* tick marks inside the ring; every 10% is longer, thresholds are labelled */}
        {ticks.map((t, i) => {
          const major = i % 2 === 0;
          const [x0, y0] = polar(c, c, R - 17, A(t));
          const [x1, y1] = polar(c, c, R - (major ? 24 : 21), A(t));
          return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="var(--dim)" strokeWidth={major ? 1.2 : 0.8} opacity={0.75} />;
        })}
        {[0, RISK_THRESHOLDS.elevated, RISK_THRESHOLDS.high, 1].map((t) => {
          const [x, y] = polar(c, c, R + 27, A(t));
          return (
            <text key={t} className={s.tick} x={x} y={y} dy="0.34em" textAnchor="middle" fontSize={9}>
              {Math.round(t * 100)}
            </text>
          );
        })}
        {showNeedle && (
          <g style={{ filter: "drop-shadow(0 0 4px rgba(255,248,231,.5))" }}>
            <line x1={nx0} y1={ny0} x2={nx1} y2={ny1} stroke="var(--cream)" strokeWidth={2.4} strokeLinecap="round" />
            <circle cx={nx1} cy={ny1} r={2.6} fill="var(--cream)" />
          </g>
        )}
        <text x={c} y={c + 14} textAnchor="middle" className={s.display} style={{ fontFamily: FONT_DISPLAY, fontSize: 74, fill: "var(--text)" }}>
          {pctText}
          <tspan style={{ fontSize: 30, fill: "var(--muted)" }} dx={2} dy={-24}>
            %
          </tspan>
        </text>
        <text x={c} y={c + 35} textAnchor="middle" className={s.cap} style={{ fill: tone, letterSpacing: "0.18em" }}>
          {LEVEL_WORD[level]}
        </text>
        <text textAnchor="middle" className={s.cap} fontSize={9}>
          {wrapLabel(label, 17, 2).map((ln, i) => (
            <tspan key={i} x={c} y={c + 51 + i * 11}>
              {ln}
            </tspan>
          ))}
        </text>
        {(range || n !== undefined) && (
          <text x={c} y={c + 86} textAnchor="middle" className={s.tick} fontSize={9.5}>
            {[range ? `range ${Math.round(range.low * 100)}\u2013${Math.round(range.high * 100)}%` : "", n !== undefined ? nOf(n) : ""].filter(Boolean).join("  \u00B7  ")}
          </text>
        )}
      </svg>
    </div>
  );
}
