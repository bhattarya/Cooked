"use client";

import { useMemo, useRef, useState } from "react";
import { area as d3area, curveMonotoneX, line as d3line, quantile, scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { XAxis } from "./Axes";
import { easeOutCubic, localXY, navIndex, useTween } from "./hooks";
import { int, nOf } from "./format";
import { ellipsize, sansWidth } from "./geometry";
import { alpha, viz } from "./tokens";
import s from "./viz.module.css";

export interface DistRow {
  key?: string;
  label: string;
  /** Raw samples (a smoothed density or a dot strip is drawn from them). */
  values?: number[];
  /** Pre-binned counts, when raw samples are not available (Ridgeline only). */
  hist?: { x0: number; x1: number; count: number }[];
  /** Quartile markers. Computed from `values` when omitted; required with `hist`. */
  q?: { p25: number; p50: number; p75: number };
  color?: string;
  /** Sample size for the tooltip. Defaults to `values.length` or the histogram total. */
  n?: number;
}

interface Base {
  rows: DistRow[];
  /** x-axis extent. Default: the data range, padded. */
  domain?: [number, number];
  format?: (v: number) => string;
  /** Noun for the quantity ("first salary"). Used in tooltips and the aria label. */
  unit?: string;
  height?: number;
  label?: string;
}

interface Norm extends DistRow {
  key: string;
  color: string;
  q: { p25: number; p50: number; p75: number };
  count: number;
}

function normalise(rows: DistRow[]): Norm[] {
  return rows.map((r, i) => {
    const vals = r.values ? [...r.values].sort((a, b) => a - b) : [];
    const q = r.q ?? (vals.length ? { p25: quantile(vals, 0.25) ?? 0, p50: quantile(vals, 0.5) ?? 0, p75: quantile(vals, 0.75) ?? 0 } : { p25: 0, p50: 0, p75: 0 });
    return { ...r, key: r.key ?? r.label, color: r.color ?? viz(i), q, count: r.n ?? (vals.length || r.hist?.reduce((a, b) => a + b.count, 0) || 0) };
  });
}

function domainOf(rows: DistRow[], given?: [number, number]): [number, number] {
  if (given) return given;
  const vals: number[] = [];
  for (const r of rows) {
    if (r.values) for (const v of r.values) vals.push(v);
    if (r.hist) for (const b of r.hist) vals.push(b.x0, b.x1);
    if (r.q) vals.push(r.q.p25, r.q.p75);
  }
  if (!vals.length) return [0, 1];
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const pad = (hi - lo) * 0.04 || 1;
  return scaleLinear().domain([lo - pad, hi + pad]).nice().domain() as [number, number];
}

const tipRows = (r: Norm, fmt: (v: number) => string, unit?: string) => [
  { label: `median${unit ? ` ${unit}` : ""}`, value: fmt(r.q.p50), color: r.color, swatch: "line" as const, strong: true },
  { label: "middle half (p25 to p75)", value: `${fmt(r.q.p25)} – ${fmt(r.q.p75)}`, color: alpha(r.color, 0.5), swatch: "box" as const },
];

/* -------------------------------- Ridgeline -------------------------------- */

export interface RidgelineProps extends Base {
  /** Gaussian kernel width in data units. Default: 1/40 of the domain (shared by all rows so shapes compare). */
  bandwidth?: number;
  /** How far ridges overlap the row above, 0 to 1. Default 0.55. */
  overlap?: number;
  /** "area": every ridge encloses the same area (honest comparison of shape). "peak": every ridge reaches full height. */
  normalize?: "area" | "peak";
  /** Key of one row to emphasise; the rest recede. */
  highlight?: string;
}

const GRID = 96;
const ROW_H = 58;

export function Ridgeline({ rows, domain, format = int, unit, height, label, bandwidth, overlap = 0.55, normalize = "area", highlight }: RidgelineProps) {
  const norm = useMemo(() => normalise(rows), [rows]);
  const summary = label ?? (norm.length ? `Distribution of ${unit ?? "values"} for ${norm.length} groups; ${norm.reduce((a, b) => (b.q.p50 > a.q.p50 ? b : a)).label} has the highest median at ${format(Math.max(...norm.map((r) => r.q.p50)))}.` : "No data.");
  return (
    <ChartShell
      empty={norm.length === 0}
      height={height ?? norm.length * ROW_H + 52}
      label={summary}
      table={{ caption: summary, head: ["Group", "p25", "Median", "p75", "n"], rows: norm.map((r) => [r.label, format(r.q.p25), format(r.q.p50), format(r.q.p75), r.count]) }}
    >
      <RidgeBody rows={norm} domain={domainOf(rows, domain)} format={format} unit={unit} bandwidth={bandwidth} overlap={overlap} normalize={normalize} highlight={highlight} />
    </ChartShell>
  );
}

function RidgeBody({ rows, domain, format, unit, bandwidth, overlap, normalize, highlight }: { rows: Norm[]; domain: [number, number]; format: (v: number) => string; unit?: string; bandwidth?: number; overlap: number; normalize: "area" | "peak"; highlight?: string }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const N = rows.length;
  const h = bandwidth ?? (domain[1] - domain[0]) / 40;
  const grid = useMemo(() => Array.from({ length: GRID }, (_, i) => domain[0] + ((domain[1] - domain[0]) * i) / (GRID - 1)), [domain]);

  // density per row on a shared grid, scaled so a change in data morphs instead of jumping
  const dens = useMemo(() => {
    const raw = rows.map((r) => {
      if (r.hist?.length) {
        const tot = r.hist.reduce((a, b) => a + b.count, 0) || 1;
        return grid.map((x) => {
          const b = r.hist!.find((bin) => x >= bin.x0 && x < bin.x1);
          return b ? b.count / tot / (b.x1 - b.x0) : 0;
        });
      }
      const v = r.values ?? [];
      const c = 1 / (Math.max(1, v.length) * h * Math.sqrt(2 * Math.PI));
      return grid.map((x) => {
        let a = 0;
        for (let i = 0; i < v.length; i++) {
          const z = (x - v[i]) / h;
          if (z > -4 && z < 4) a += Math.exp(-0.5 * z * z);
        }
        return a * c;
      });
    });
    const gmax = Math.max(1e-12, ...raw.flat());
    return raw.map((row) => {
      const m = normalize === "peak" ? Math.max(1e-12, ...row) : gmax;
      return row.map((v) => v / m);
    });
  }, [rows, grid, h, normalize]);

  const target = useMemo(() => dens.flat(), [dens]);
  const shown = useTween(target, { enabled: inView, duration: 1100, ease: easeOutCubic, from: () => 0, delay: (i) => Math.floor(i / GRID) * 130 });

  const longest = Math.max(1, ...rows.map((r) => sansWidth(r.label, 12)));
  const m = { l: Math.min(W * 0.3, Math.min(170, longest + 16)), r: 10, t: 10, b: 28 };
  const pw = Math.max(20, W - m.l - m.r);
  const rowH = (H - m.t - m.b) / Math.max(1, N + overlap);
  const xs = scaleLinear().domain(domain).range([m.l, m.l + pw]);
  const ticks = xs.ticks(Math.max(2, Math.round(pw / 100)));
  const active = hover ?? kbd;
  const amp = rowH * (1 + overlap);
  const base = (i: number) => m.t + rowH * overlap + (i + 1) * rowH - 4;

  const tipFor = (i: number, ax: number, ay: number, say = false) => {
    const r = rows[i];
    show(ax, ay, { title: r.label, rows: tipRows(r, format, unit), note: nOf(r.count) }, { announce: say });
  };
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, N);
      if (nx === null) return false;
      setKbd(nx);
      setHover(null);
      tipFor(nx, xs(rows[nx].q.p50), base(nx) - amp * 0.4, true);
      return true;
    },
    onFocus: () => {
      if (!N) return;
      setKbd(0);
      setHover(null);
      tipFor(0, xs(rows[0].q.p50), base(0) - amp * 0.4, true);
    },
    onBlur: () => setKbd(null),
  });

  const gen = d3area<number>().x((_, i) => xs(grid[i])).curve(curveMonotoneX);
  const top = d3line<number>().x((_, i) => xs(grid[i])).curve(curveMonotoneX);

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHover(null); hide(); }}>
      <XAxis scale={xs} y0={m.t} y1={H - m.b} ticks={ticks} format={(v) => format(v)} baseline={false} />
      {rows.map((r, i) => {
        const b = base(i);
        const row = shown.slice(i * GRID, (i + 1) * GRID);
        const on = active === i;
        const dim = (highlight && r.key !== highlight) || (active !== null && !on);
        const y1 = (v: number) => b - v * amp;
        const area = gen.y0(b).y1((v) => y1(v))(row) ?? "";
        const line = top.y((v) => y1(v))(row) ?? "";
        const gp = Math.round(((r.q.p50 - domain[0]) / (domain[1] - domain[0])) * (GRID - 1));
        const medTop = y1(row[Math.max(0, Math.min(GRID - 1, gp))] ?? 0);
        return (
          <g key={r.key} className={s.mark} style={{ opacity: dim ? 0.4 : 1 }}>
            <text className={s.cat} x={m.l - 12} y={b} dy="-0.1em" textAnchor="end" style={{ fill: on ? "var(--text)" : undefined }}>
              {ellipsize(r.label, m.l - 16, 12)}
            </text>
            <path d={area} fill="var(--panel)" />
            <path d={area} fill={alpha(r.color, on || highlight === r.key ? 0.4 : 0.26)} />
            <path d={line} fill="none" stroke={r.color} strokeWidth={1.8} strokeLinejoin="round" style={{ filter: on || highlight === r.key ? `drop-shadow(0 0 6px ${alpha(r.color, 0.6)})` : undefined }} />
            {/* middle half on the baseline, median as a tick that rises into the ridge */}
            <line x1={xs(r.q.p25)} x2={xs(r.q.p75)} y1={b + 0.5} y2={b + 0.5} stroke={r.color} strokeWidth={4} strokeLinecap="round" />
            <line x1={xs(r.q.p50)} x2={xs(r.q.p50)} y1={b} y2={Math.min(b - 8, medTop)} stroke="var(--cream)" strokeWidth={1.6} strokeLinecap="round" />
            <circle cx={xs(r.q.p50)} cy={b + 0.5} r={4.2} fill="var(--cream)" stroke="var(--panel)" strokeWidth={1.6} />
            <line x1={m.l} x2={m.l + pw} y1={b + 4} y2={b + 4} stroke="var(--line)" />
            <rect x={0} y={b - rowH} width={W} height={rowH + 6} fill="transparent" onPointerEnter={() => setHover(i)} onPointerMove={(e) => { const [x, y] = localXY(e, svgRef.current); tipFor(i, x, y); }} />
          </g>
        );
      })}
    </svg>
  );
}

/* ----------------------------------- Strip ---------------------------------- */

export interface StripProps extends Base {
  /** Cap on dots per row (evenly sampled by rank so the shape survives). Default 260. */
  maxDots?: number;
  dotRadius?: number;
}

const STRIP_ROW = 62;

export function Strip({ rows, domain, format = int, unit, height, label, maxDots = 260, dotRadius = 3 }: StripProps) {
  const norm = useMemo(() => normalise(rows), [rows]);
  const summary = label ?? (norm.length ? `Dot plot of ${unit ?? "values"} for ${norm.length} groups, each dot one case; medians run from ${format(Math.min(...norm.map((r) => r.q.p50)))} to ${format(Math.max(...norm.map((r) => r.q.p50)))}.` : "No data.");
  return (
    <ChartShell
      empty={norm.length === 0}
      height={height ?? norm.length * STRIP_ROW + 34}
      label={summary}
      table={{ caption: summary, head: ["Group", "p25", "Median", "p75", "n"], rows: norm.map((r) => [r.label, format(r.q.p25), format(r.q.p50), format(r.q.p75), r.count]) }}
    >
      <StripBody rows={norm} domain={domainOf(rows, domain)} format={format} unit={unit} maxDots={maxDots} r={dotRadius} />
    </ChartShell>
  );
}

// Deterministic beeswarm: each dot takes the closest free vertical offset to the row's centre line.
function swarm(xsPx: number[], r: number, limit: number): number[] {
  const placed: { x: number; y: number }[] = [];
  const out: number[] = [];
  const d2 = (2 * r + 0.8) ** 2;
  for (const x of xsPx) {
    let y = 0;
    for (let k = 0; k < 400; k++) {
      const off = Math.ceil(k / 2) * (r + 0.6) * (k % 2 ? 1 : -1);
      const cand = k === 0 ? 0 : off;
      if (Math.abs(cand) > limit) {
        y = Math.max(-limit, Math.min(limit, cand));
        break;
      }
      if (!placed.some((p) => Math.abs(p.x - x) < 2 * r + 1 && (p.x - x) ** 2 + (p.y - cand) ** 2 < d2)) {
        y = cand;
        break;
      }
    }
    placed.push({ x, y });
    out.push(y);
  }
  return out;
}

function StripBody({ rows, domain, format, unit, maxDots, r }: { rows: Norm[]; domain: [number, number]; format: (v: number) => string; unit?: string; maxDots: number; r: number }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const N = rows.length;
  const longest = Math.max(1, ...rows.map((rw) => sansWidth(rw.label, 12)));
  const m = { l: Math.min(W * 0.3, Math.min(170, longest + 16)), r: 10, t: 6, b: 28 };
  const pw = Math.max(20, W - m.l - m.r);
  const xs = scaleLinear().domain(domain).range([m.l, m.l + pw]);
  const ticks = xs.ticks(Math.max(2, Math.round(pw / 100)));
  const active = hover ?? kbd;

  const dots = useMemo(
    () =>
      rows.map((rw) => {
        const v = [...(rw.values ?? [])].sort((a, b) => a - b);
        const pick = v.length > maxDots ? Array.from({ length: maxDots }, (_, i) => v[Math.round((i * (v.length - 1)) / (maxDots - 1))]) : v;
        const px = pick.map((x) => m.l + ((x - domain[0]) / (domain[1] - domain[0])) * pw);
        return { px, dy: swarm(px, r, STRIP_ROW / 2 - r - 4), sampled: v.length > maxDots };
      }),
    [rows, maxDots, domain, m.l, pw, r],
  );

  const tipFor = (i: number, ax: number, ay: number, say = false) => {
    const rw = rows[i];
    show(ax, ay, { title: rw.label, rows: tipRows(rw, format, unit), note: `${nOf(rw.count)}${dots[i]?.sampled ? ` · ${int(dots[i].px.length)} dots shown` : ""}` }, { announce: say });
  };
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, N);
      if (nx === null) return false;
      setKbd(nx);
      setHover(null);
      tipFor(nx, xs(rows[nx].q.p50), m.t + (nx + 0.5) * STRIP_ROW - 20, true);
      return true;
    },
    onFocus: () => {
      if (!N) return;
      setKbd(0);
      setHover(null);
      tipFor(0, xs(rows[0].q.p50), m.t + 0.5 * STRIP_ROW - 20, true);
    },
    onBlur: () => setKbd(null),
  });

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHover(null); hide(); }}>
      <XAxis scale={xs} y0={m.t} y1={H - m.b} ticks={ticks} format={(v) => format(v)} baseline={false} />
      {rows.map((rw, i) => {
        const cy = m.t + (i + 0.5) * STRIP_ROW;
        const on = active === i;
        const dim = active !== null && !on;
        return (
          <g key={rw.key} className={s.mark} style={{ opacity: dim ? 0.4 : 1 }}>
            <text className={s.cat} x={m.l - 12} y={cy} dy="0.34em" textAnchor="end" style={{ fill: on ? "var(--text)" : undefined }}>
              {ellipsize(rw.label, m.l - 16, 12)}
            </text>
            <line x1={m.l} x2={m.l + pw} y1={cy} y2={cy} stroke="var(--line)" />
            <rect x={xs(rw.q.p25)} y={cy - STRIP_ROW / 2 + 4} width={Math.max(2, xs(rw.q.p75) - xs(rw.q.p25))} height={STRIP_ROW - 8} rx={6} fill={rw.color} opacity={0.1} />
            {dots[i].px.map((x, k) => (
              <circle key={k} cx={x} cy={cy + dots[i].dy[k]} r={r} fill={rw.color} opacity={0.72} className={s.pop} style={{ ["--d" as string]: inView ? `${Math.round(((x - m.l) / pw) * 500 + i * 90)}ms` : "0ms" }} />
            ))}
            <line x1={xs(rw.q.p50)} x2={xs(rw.q.p50)} y1={cy - STRIP_ROW / 2 + 5} y2={cy + STRIP_ROW / 2 - 5} stroke="var(--cream)" strokeWidth={2} strokeLinecap="round" style={{ filter: "drop-shadow(0 0 4px rgba(255,248,231,.5))" }} />
            <rect x={0} y={cy - STRIP_ROW / 2} width={W} height={STRIP_ROW} fill="transparent" onPointerEnter={() => setHover(i)} onPointerMove={(e) => { const [x, y] = localXY(e, svgRef.current); tipFor(i, x, y); }} />
          </g>
        );
      })}
    </svg>
  );
}
