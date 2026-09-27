"use client";

import { useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { XAxis } from "./Axes";
import { Legend } from "./Legend";
import { easeOutCubic, localXY, navIndex, useTween } from "./hooks";
import { int, nOf } from "./format";
import { ellipsize, sansWidth } from "./geometry";
import { alpha } from "./tokens";
import s from "./viz.module.css";

export interface DumbbellItem {
  key?: string;
  label: string;
  before: number;
  after: number;
  n?: number;
}

export interface DumbbellProps {
  data: DumbbellItem[];
  /** Which direction is an improvement. Colours the movement teal (better) or red (worse); omit for neutral gold. */
  betterWhen?: "lower" | "higher";
  beforeLabel?: string;
  afterLabel?: string;
  format?: (v: number) => string;
  /** Formats the change column. Default: signed `format(|change|)`. */
  formatDelta?: (d: number) => string;
  /** "delta" orders rows by size of change (biggest first). */
  sort?: "none" | "delta";
  domain?: [number, number];
  height?: number;
  label?: string;
}

const ROW = 38;
const ROW_C = 60;
const COMPACT_W = 470;
const DELTA_W = 88;
const signed = (d: number, f: (v: number) => string) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${f(Math.abs(d))}`;

export function Dumbbell({ data, betterWhen, beforeLabel = "Before", afterLabel = "After", format = int, formatDelta, sort = "none", domain, height, label }: DumbbellProps) {
  const rows = useMemo(() => {
    const r = data.map((d) => ({ ...d, key: d.key ?? d.label, delta: d.after - d.before }));
    if (sort === "delta") r.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
    return r;
  }, [data, sort]);
  const verdict = (dl: number): "good" | "bad" | "flat" | "plain" => (dl === 0 ? "flat" : !betterWhen ? "plain" : (dl < 0) === (betterWhen === "lower") ? "good" : "bad");
  const fmtD = formatDelta ?? ((d: number) => signed(d, format));
  const improved = rows.filter((r) => verdict(r.delta) === "good").length;
  const summary = label ?? `${beforeLabel} to ${afterLabel} for ${rows.length} items${betterWhen ? `; ${improved} improved, ${rows.filter((r) => verdict(r.delta) === "bad").length} got worse` : ""}.`;
  const kinds = new Set(rows.map((r) => verdict(r.delta)));
  const legendItems = [
    { key: "before", label: beforeLabel, color: "var(--muted)", swatch: "dot" as const },
    ...(kinds.has("good") ? [{ key: "good", label: `${afterLabel} (better)`, color: "var(--cool)", swatch: "dot" as const }] : []),
    ...(kinds.has("bad") ? [{ key: "bad", label: `${afterLabel} (worse)`, color: "var(--hot)", swatch: "dot" as const }] : []),
    ...(kinds.has("plain") || kinds.has("flat") ? [{ key: "plain", label: afterLabel, color: "var(--gold)", swatch: "dot" as const }] : []),
  ];
  return (
    <ChartShell
      empty={rows.length === 0}
      height={height ?? ((w: number) => rows.length * (w < COMPACT_W ? ROW_C : ROW) + 34)}
      label={summary}
      table={{ caption: summary, head: ["Item", beforeLabel, afterLabel, "Change", "n"], rows: rows.map((r) => [r.label, format(r.before), format(r.after), fmtD(r.delta), r.n ?? ""]) }}
      legend={<Legend items={legendItems} />}
      legendPosition="top"
    >
      <DumbbellBody rows={rows} verdict={verdict} beforeLabel={beforeLabel} afterLabel={afterLabel} format={format} fmtD={fmtD} domain={domain} />
    </ChartShell>
  );
}

type Row = DumbbellItem & { key: string; delta: number };

function DumbbellBody({ rows, verdict, beforeLabel, afterLabel, format, fmtD, domain }: { rows: Row[]; verdict: (d: number) => "good" | "bad" | "flat" | "plain"; beforeLabel: string; afterLabel: string; format: (v: number) => string; fmtD: (d: number) => string; domain?: [number, number] }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const N = rows.length;
  const compact = W < COMPACT_W;
  const rowH = compact ? ROW_C : ROW;

  const dom = useMemo<[number, number]>(() => {
    if (domain) return domain;
    // position encoding, so the axis need not start at zero: pad the data range and let the labels breathe
    const vals = rows.flatMap((r) => [r.before, r.after]);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const pad = (hi - lo || Math.abs(hi) || 1) * 0.28;
    return scaleLinear().domain([lo >= 0 && lo - pad < 0 ? 0 : lo - pad, hi + pad]).nice().domain() as [number, number];
  }, [domain, rows]);

  // ranks glide when the order changes; `after` slides out of `before` on entry
  const target = useMemo(() => [...rows.map((_, i) => i), ...rows.map((r) => r.before), ...rows.map((r) => r.after), dom[0], dom[1]], [rows, dom]);
  const d = useTween(target, {
    enabled: inView,
    duration: 950,
    ease: easeOutCubic,
    from: (i, t) => (i >= 2 * N && i < 3 * N ? target[i - N] : t),
    delay: (i) => (i >= 2 * N && i < 3 * N ? (i - 2 * N) * 90 : 0),
  });
  const dr = d.slice(0, N);
  const db = d.slice(N, 2 * N);
  const da = d.slice(2 * N, 3 * N);
  const dd: [number, number] = [d[d.length - 2], d[d.length - 1]];

  const longest = Math.max(1, ...rows.map((r) => sansWidth(r.label, 12)));
  const m = compact ? { l: 34, r: 34, t: 6, b: 26 } : { l: Math.min(W * 0.38, Math.min(210, longest + 18)), r: DELTA_W + 8, t: 6, b: 26 };
  const pw = Math.max(20, W - m.l - m.r);
  const xs = scaleLinear().domain(dd).range([m.l, m.l + pw]);
  const ticks = scaleLinear().domain(dom).ticks(Math.max(2, Math.round(pw / 90)));
  const bestIdx = rows.reduce((b, r, i) => (verdict(r.delta) === "good" && Math.abs(r.delta) > Math.abs(rows[b]?.delta ?? 0) ? i : b), -1);
  const active = hover ?? kbd;
  const tone = (v: ReturnType<typeof verdict>) => (v === "good" ? "var(--cool)" : v === "bad" ? "var(--hot)" : v === "flat" ? "var(--muted)" : "var(--gold)");

  const tipFor = (i: number, ax: number, ay: number, say = false) => {
    const r = rows[i];
    const v = verdict(r.delta);
    show(ax, ay, { title: r.label, rows: [{ label: afterLabel, value: format(r.after), color: tone(v), swatch: "dot", strong: true }, { label: beforeLabel, value: format(r.before), color: "var(--muted)", swatch: "dot" }, { label: "change", value: fmtD(r.delta) }], note: r.n !== undefined ? nOf(r.n) : undefined }, { announce: say });
  };
  const y = (i: number) => m.t + (dr[i] + 0.5) * rowH + (compact ? 9 : 0);
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, N);
      if (nx === null) return false;
      setKbd(nx);
      setHover(null);
      tipFor(nx, xs(Math.max(rows[nx].before, rows[nx].after)), y(nx), true);
      return true;
    },
    onFocus: () => {
      if (!N) return;
      setKbd(0);
      setHover(null);
      tipFor(0, xs(Math.max(rows[0].before, rows[0].after)), y(0), true);
    },
    onBlur: () => setKbd(null),
  });

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHover(null); hide(); }}>
      <XAxis scale={xs} y0={m.t} y1={m.t + N * rowH} ticks={ticks} format={(v) => format(v)} />
      {rows.map((r, i) => {
        const v = verdict(r.delta);
        const col = tone(v);
        const py = y(i);
        const xb = xs(db[i]);
        const xa = xs(da[i]);
        const leftIsBefore = xb <= xa;
        const on = active === i;
        const glow = i === bestIdx;
        return (
          <g key={r.key} className={s.mark} style={{ opacity: active !== null && !on ? 0.5 : 1 }}>
            {on && <rect x={0} y={py - (compact ? 9 : 0) - rowH / 2} width={W} height={rowH} rx={6} fill="var(--line)" pointerEvents="none" />}
            <text className={s.cat} x={compact ? 6 : m.l - 12} y={compact ? py - 21 : py} dy="0.34em" textAnchor={compact ? "start" : "end"} style={{ fill: on ? "var(--text)" : undefined }}>
              {ellipsize(r.label, compact ? W * 0.62 : m.l - 16, 12)}
            </text>
            <line x1={xb} x2={xa} y1={py} y2={py} stroke={col} strokeWidth={3} strokeLinecap="round" opacity={0.55} />
            {Math.abs(xa - xb) > 26 && <path d={`M${(xa + xb) / 2 - Math.sign(xa - xb) * 3.5},${py - 4}l${Math.sign(xa - xb) * 5},4l${-Math.sign(xa - xb) * 5},4`} fill="none" stroke={col} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
            <circle cx={xb} cy={py} r={6} fill="var(--panel)" stroke="var(--muted)" strokeWidth={2} />
            <circle cx={xa} cy={py} r={6.5} fill={col} stroke="var(--panel)" strokeWidth={2} style={{ filter: glow ? `drop-shadow(0 0 8px ${alpha(col, 0.7)})` : undefined }} />
            <text className={s.val} x={Math.min(xb, xa) - 12} y={py} dy="0.34em" textAnchor="end" style={{ fill: leftIsBefore ? "var(--muted)" : "var(--text)" }} pointerEvents="none">
              {format(leftIsBefore ? r.before : r.after)}
            </text>
            <text className={s.val} x={Math.max(xb, xa) + 12} y={py} dy="0.34em" textAnchor="start" style={{ fill: leftIsBefore ? "var(--text)" : "var(--muted)" }} pointerEvents="none">
              {format(leftIsBefore ? r.after : r.before)}
            </text>
            <text className={s.val} x={W - 4} y={compact ? py - 21 : py} dy="0.34em" textAnchor="end" style={{ fill: col }} pointerEvents="none">
              <tspan fontSize={9}>{v === "flat" ? "▬" : r.delta > 0 ? "▲" : "▼"}</tspan> {fmtD(r.delta)}
            </text>
            <rect x={0} y={py - (compact ? 9 : 0) - rowH / 2} width={W} height={rowH} fill="transparent" onPointerEnter={() => setHover(i)} onPointerMove={(e) => { const [x, yy] = localXY(e, svgRef.current); tipFor(i, x, yy); }} />
          </g>
        );
      })}
    </svg>
  );
}
