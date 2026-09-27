"use client";

import { useMemo, useRef, useState } from "react";
import { area as d3area, bisector, curveLinear, curveMonotoneX, curveStepAfter, line as d3line, scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys, type TipContent } from "./ChartShell";
import { YAxis } from "./Axes";
import { Legend } from "./Legend";
import { easeInOutCubic, localXY, navIndex, useTween } from "./hooks";
import { nOf } from "./format";
import { ellipsize } from "./geometry";
import { alpha, viz } from "./tokens";
import s from "./viz.module.css";

export interface LineSeries {
  key: string;
  label: string;
  color?: string;
  /** One value per x. `null` leaves a gap. */
  y: (number | null)[];
  /** Confidence band (same length as `y`): drawn as a soft ribbon around the line. */
  low?: (number | null)[];
  high?: (number | null)[];
  /** Fill under the line (a ~12% wash that fades to nothing). */
  area?: boolean;
  dashed?: boolean;
  width?: number;
  /** Soft glow on this line only. Default: on for a single-series chart. */
  emphasis?: boolean;
  /** Per-series value formatter (falls back to the chart's `yFormat`). */
  format?: (v: number) => string;
}
export interface LineThreshold {
  value: number;
  label: string;
  tone?: "gold" | "risk" | "safe";
}
export interface LineEvent {
  x: number;
  label: string;
  /** Extra sentence in the tooltip. */
  detail?: string;
  tone?: "gold" | "risk" | "safe";
}

export interface LineChartProps {
  /** Shared x positions (numeric, ascending). */
  x: number[];
  xFormat?: (v: number, i: number) => string;
  /** Which x values get a tick label. Default: all when there are 8 or fewer, else nice ticks. */
  xTicks?: number[];
  series: LineSeries[];
  /** Default: from zero when values are non-negative and spread out, else a nice extent. */
  yDomain?: [number, number];
  yFormat?: (v: number) => string;
  /** Approximate tick count. Default 4. */
  yTicks?: number;
  curve?: "monotone" | "linear" | "step";
  /** Horizontal reference lines (e.g. the 50% "cooked" line). */
  thresholds?: LineThreshold[];
  /** Vertical annotations (e.g. shocks), focusable with tooltips. */
  events?: LineEvent[];
  /** Direct labels at the right edge (dropped automatically if they would collide). */
  endLabels?: boolean;
  /** Default: shown for two or more series. */
  legend?: boolean;
  /** Tooltip word for the band. Default "range". */
  bandLabel?: string;
  xLabel?: string;
  yLabel?: string;
  height?: number;
  /** Sample size for the tooltip footer. */
  n?: number;
  label?: string;
}

const TONE = { gold: "var(--gold)", risk: "var(--hot)", safe: "var(--cool)" } as const;
const CURVES = { monotone: curveMonotoneX, linear: curveLinear, step: curveStepAfter } as const;
const defaultFmt = (v: number) => String(Math.round(v * 100) / 100);
const bis = bisector((d: number) => d).center;

export function LineChart({ x, xFormat = (v) => String(v), xTicks, series: seriesIn, yDomain, yFormat = defaultFmt, yTicks = 4, curve = "monotone", thresholds = [], events = [], endLabels = false, legend, bandLabel = "range", xLabel, yLabel, height = 260, n, label }: LineChartProps) {
  const series = useMemo(() => seriesIn.map((sd, i) => ({ ...sd, color: sd.color ?? viz(i) })), [seriesIn]);
  const first = series[0];
  const summary =
    label ??
    (first && x.length
      ? `${first.label} goes from ${(first.format ?? yFormat)(first.y.find((v) => v !== null) ?? 0)} to ${(first.format ?? yFormat)([...first.y].reverse().find((v) => v !== null) ?? 0)} across ${x.length} points${thresholds[0] ? `, against a ${thresholds[0].label} line at ${yFormat(thresholds[0].value)}` : ""}.`
      : "No data.");
  const cell = (sd: SeriesX, i: number): string => {
    const v = sd.y[i];
    if (v === null || v === undefined) return "";
    const f = sd.format ?? yFormat;
    const lo = sd.low?.[i];
    const hi = sd.high?.[i];
    return lo != null && hi != null ? `${f(v)} (${bandLabel} ${f(lo)} to ${f(hi)})` : f(v);
  };
  const table = {
    caption: summary,
    head: [xLabel ?? "x", ...series.map((sd) => sd.label)],
    rows: x.map((xv, i) => [xFormat(xv, i), ...series.map((sd) => cell(sd, i))]),
  };
  return (
    <ChartShell height={height} label={summary} table={table} empty={!x.length || !series.length} legend={(legend ?? series.length > 1) ? <Legend items={series.map((sd) => ({ key: sd.key, label: sd.label, color: sd.color, swatch: sd.dashed ? ("dash" as const) : ("line" as const) }))} /> : undefined}>
      <LineBody x={x} xFormat={xFormat} xTicks={xTicks} series={series} yDomain={yDomain} yFormat={yFormat} yTicks={yTicks} curve={curve} thresholds={thresholds} events={events} endLabels={endLabels} bandLabel={bandLabel} xLabel={xLabel} yLabel={yLabel} n={n} />
    </ChartShell>
  );
}

type SeriesX = LineSeries & { color: string };

function LineBody({ x, xFormat, xTicks, series, yDomain, yFormat, yTicks, curve, thresholds, events, endLabels, bandLabel, xLabel, yLabel, n }: { x: number[]; xFormat: (v: number, i: number) => string; xTicks?: number[]; series: SeriesX[]; yDomain?: [number, number]; yFormat: (v: number) => string; yTicks: number; curve: keyof typeof CURVES; thresholds: LineThreshold[]; events: LineEvent[]; endLabels: boolean; bandLabel: string; xLabel?: string; yLabel?: string; n?: number }) {
  const { width: W, height: H, inView, uid, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null);
  const nP = x.length;
  const nS = series.length;

  // y domain (target), tweened so a change in scale glides instead of jumping
  const dom = useMemo<[number, number]>(() => {
    if (yDomain) return yDomain;
    let lo = Infinity;
    let hi = -Infinity;
    for (const sd of series)
      for (const arr of [sd.y, sd.low ?? [], sd.high ?? []])
        for (const v of arr) {
          if (v === null || v === undefined || !Number.isFinite(v)) continue;
          lo = Math.min(lo, v);
          hi = Math.max(hi, v);
        }
    for (const t of thresholds) {
      lo = Math.min(lo, t.value);
      hi = Math.max(hi, t.value);
    }
    if (!Number.isFinite(lo)) return [0, 1];
    if (lo >= 0 && lo < hi * 0.5) lo = 0;
    if (lo === hi) hi = lo + 1;
    const pad = (hi - lo) * 0.06;
    const sc = scaleLinear().domain([lo === 0 ? 0 : lo - pad, hi + pad]).nice();
    return sc.domain() as [number, number];
  }, [yDomain, series, thresholds]);

  const bandIdx = useMemo(() => series.map((sd) => !!(sd.low && sd.high)), [series]);
  const target = useMemo(
    () => [
      ...series.flatMap((sd) => sd.y.map((v) => (v === null || v === undefined ? NaN : v))),
      ...series.flatMap((sd, k) => (bandIdx[k] ? [...sd.low!.map((v) => v ?? NaN), ...sd.high!.map((v) => v ?? NaN)] : [])),
      dom[0],
      dom[1],
    ],
    [series, bandIdx, dom],
  );
  const d = useTween(target, { duration: 700, from: (_, t) => t });
  const yAt = (k: number, i: number) => d[k * nP + i];
  const bandBase = nS * nP;
  const bandOffset = (k: number) => bandBase + bandIdx.slice(0, k).filter(Boolean).length * 2 * nP;
  const dd: [number, number] = [d[d.length - 2], d[d.length - 1]];

  // draw-on: one clip per series, staggered
  const reveal = useTween(series.map(() => 1), { enabled: inView, duration: 1400, ease: easeInOutCubic, from: () => 0, delay: (i) => i * 220 });

  const m = { l: yLabel ? 44 : 40, r: endLabels ? 100 : 14, t: events.length ? 34 : 14, b: 28 };
  const pw = Math.max(20, W - m.l - m.r);
  const ph = Math.max(20, H - m.t - m.b);
  const xs = scaleLinear()
    .domain([x[0] ?? 0, (x[nP - 1] ?? 1) === (x[0] ?? 0) ? (x[0] ?? 0) + 1 : (x[nP - 1] ?? 1)])
    .range([m.l, m.l + pw]);
  const ys = scaleLinear().domain(dd).range([m.t + ph, m.t]);
  const yTickVals = scaleLinear().domain(dom).ticks(yTicks);
  const xPx = x.map((v) => xs(v));
  const gen = CURVES[curve];
  const single = nS === 1;

  const paths = series.map((sd, k) => {
    const pts = x.map((_, i) => ({ px: xPx[i], y: yAt(k, i) }));
    const line = d3line<{ px: number; y: number }>()
      .defined((p) => !Number.isNaN(p.y))
      .x((p) => p.px)
      .y((p) => ys(p.y))
      .curve(gen)(pts);
    const areaPath = sd.area
      ? d3area<{ px: number; y: number }>()
          .defined((p) => !Number.isNaN(p.y))
          .x((p) => p.px)
          .y0(ys(Math.max(dd[0], Math.min(0, dd[1]))))
          .y1((p) => ys(p.y))
          .curve(gen)(pts)
      : null;
    let band: string | null = null;
    if (bandIdx[k]) {
      const o = bandOffset(k);
      const bp = x.map((_, i) => ({ px: xPx[i], lo: d[o + i], hi: d[o + nP + i] }));
      band = d3area<{ px: number; lo: number; hi: number }>()
        .defined((p) => !Number.isNaN(p.lo) && !Number.isNaN(p.hi))
        .x((p) => p.px)
        .y0((p) => ys(p.lo))
        .y1((p) => ys(p.hi))
        .curve(gen)(bp);
    }
    return { line, areaPath, band };
  });

  const tipAt = (i: number, ax: number, ay: number, say = false) => {
    const rows: TipContent["rows"] = series
      .map((sd, k) => {
        const v = yAt(k, i);
        if (Number.isNaN(v)) return null;
        const f = sd.format ?? yFormat;
        const lo = sd.low?.[i];
        const hi = sd.high?.[i];
        return { label: lo != null && hi != null ? `${sd.label} (${bandLabel} ${f(lo)} – ${f(hi)})` : sd.label, value: f(sd.y[i] as number), color: sd.color, swatch: "line" as const, strong: k === 0 };
      })
      .filter((r): r is NonNullable<typeof r> => r !== null);
    show(ax, ay, { title: xFormat(x[i], i), rows, note: n !== undefined ? nOf(n) : undefined }, { announce: say });
  };
  const anchorY = (i: number) => {
    const ks = series.map((_, k) => yAt(k, i)).filter((v) => !Number.isNaN(v));
    return ks.length ? ys(Math.min(...ks)) : m.t + ph / 2;
  };

  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, cursor ?? -1, nP);
      if (nx === null) return false;
      setCursor(nx);
      tipAt(nx, xPx[nx], anchorY(nx), true);
      return true;
    },
    onFocus: () => {
      if (!nP) return;
      setCursor(0);
      tipAt(0, xPx[0], anchorY(0), true);
    },
    onBlur: () => setCursor(null),
  });

  const onMove = (e: React.PointerEvent) => {
    const [px, py] = localXY(e, svgRef.current);
    const i = Math.max(0, Math.min(nP - 1, bis(xPx, px)));
    setCursor(i);
    tipAt(i, xPx[i], Math.min(py, anchorY(i)) );
  };

  // x ticks
  const tickVals = xTicks ?? (nP <= 8 ? x : scaleLinear().domain(xs.domain()).ticks(6));
  // end labels, thinned so they never overprint
  const ends = (() => {
    if (!endLabels) return [];
    const list = series
      .map((sd, k) => {
        let i = nP - 1;
        while (i >= 0 && Number.isNaN(yAt(k, i))) i--;
        return i < 0 ? null : { sd, k, i, y: ys(yAt(k, i)) };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null)
      .sort((a, b) => a.y - b.y);
    const kept: typeof list = [];
    for (const l of list) if (!kept.length || l.y - kept[kept.length - 1].y >= 15) kept.push(l);
    return kept;
  })();

  // event flags alternate between two rows when they are close together
  const evRows = [...events]
    .sort((a, b) => a.x - b.x)
    .reduce<{ ev: LineEvent; px: number; row: number }[]>((acc, ev) => {
      const px = xs(ev.x);
      const prev = acc[acc.length - 1];
      acc.push({ ev, px, row: prev && px - prev.px < 96 ? (prev.row + 1) % 2 : 0 });
      return acc;
    }, []);

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setCursor(null); hide(); }}>
      <defs>
        {series.map((sd, k) => (
          <g key={sd.key}>
            <clipPath id={`${uid}c${k}`}>
              <rect x={m.l - 6} y={0} width={(pw + 12 + m.r) * (reveal[k] ?? 1)} height={H} />
            </clipPath>
            <linearGradient id={`${uid}g${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={sd.color} stopOpacity={0.3} />
              <stop offset="1" stopColor={sd.color} stopOpacity={0} />
            </linearGradient>
          </g>
        ))}
      </defs>
      <YAxis scale={ys} x0={m.l} x1={m.l + pw} ticks={yTickVals} format={yFormat} />
      {yLabel && (
        <text className={s.cap} x={m.l - 8} y={m.t - 14} textAnchor="start">
          {yLabel}
        </text>
      )}
      <g aria-hidden="true">
        {tickVals.map((v) => (
          <text key={v} className={s.tick} x={xs(v)} y={m.t + ph + 18} textAnchor={xs(v) < m.l + 8 ? "start" : xs(v) > m.l + pw - 8 ? "end" : "middle"}>
            {xFormat(v, Math.max(0, bis(x, v)))}
          </text>
        ))}
        {xLabel && (
          <text className={s.cap} x={m.l + pw} y={m.t + ph + 32} textAnchor="end">
            {xLabel}
          </text>
        )}
      </g>

      {thresholds.map((t) => (
        <g key={t.label} pointerEvents="none">
          <line x1={m.l} x2={m.l + pw} y1={ys(t.value)} y2={ys(t.value)} stroke={TONE[t.tone ?? "risk"]} strokeWidth={1.3} strokeDasharray="5 4" opacity={0.9} />
          <text className={`${s.cap} ${s.halo}`} x={m.l + 4} y={ys(t.value) - 6} textAnchor="start" style={{ fill: TONE[t.tone ?? "risk"] }}>
            {t.label}
          </text>
        </g>
      ))}

      {series.map((sd, k) => {
        const p = paths[k];
        const glow = sd.emphasis ?? single;
        return (
          <g key={sd.key} clipPath={`url(#${uid}c${k})`}>
            {p.band && <path d={p.band} fill={sd.color} opacity={0.16} />}
            {p.areaPath && <path d={p.areaPath} fill={`url(#${uid}g${k})`} />}
            <path d={p.line ?? ""} fill="none" stroke={sd.color} strokeWidth={sd.width ?? 2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={sd.dashed ? "6 5" : undefined} style={{ filter: glow ? `drop-shadow(0 0 6px ${alpha(sd.color, 0.55)})` : undefined }} />
          </g>
        );
      })}

      <rect x={m.l} y={m.t} width={pw} height={ph} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />

      {evRows.map(({ ev, px, row }) => {
        const tone = TONE[ev.tone ?? "risk"];
        const flip = px > m.l + pw - 90;
        return (
          <g
            key={`${ev.x}${ev.label}`}
            className={s.fadeIn}
            style={{ ["--d" as string]: "1300ms" }}
            onPointerEnter={(e) => {
              const [lx, ly] = localXY(e, svgRef.current);
              show(lx, ly, { title: ev.label, rows: [{ label: ev.detail ?? "event", value: xFormat(ev.x, Math.max(0, bis(x, ev.x))), color: tone, swatch: "dot" }] });
            }}
          >
            <line x1={px} x2={px} y1={m.t - 6 - row * 12} y2={m.t + ph} stroke={tone} strokeWidth={1} opacity={0.5} />
            <path d={`M${px},${m.t - 12 - row * 12}l4.5,4.5l-4.5,4.5l-4.5,-4.5Z`} fill={tone} />
            <text className={`${s.cap} ${s.halo}`} x={px + (flip ? -8 : 8)} y={m.t - 8 - row * 12} textAnchor={flip ? "end" : "start"} style={{ fill: "var(--muted)" }}>
              {ellipsize(ev.label, 150, 9.5, 0.66)}
            </text>
            <rect x={px - 12} y={m.t - 18 - row * 12} width={24} height={24} fill="transparent" />
          </g>
        );
      })}

      {cursor !== null && (
        <g pointerEvents="none">
          <line x1={xPx[cursor]} x2={xPx[cursor]} y1={m.t} y2={m.t + ph} stroke="var(--text)" strokeWidth={1} opacity={0.28} />
          {series.map((sd, k) => {
            const v = yAt(k, cursor);
            return Number.isNaN(v) ? null : <circle key={sd.key} cx={xPx[cursor]} cy={ys(v)} r={4.5} fill={sd.color} stroke="var(--panel)" strokeWidth={2} />;
          })}
        </g>
      )}

      {ends.map(({ sd, k, i, y }) => (
        <g key={sd.key} className={s.fadeIn} style={{ ["--d" as string]: `${1300 + k * 120}ms` }} pointerEvents="none">
          <circle cx={xPx[i]} cy={y} r={4} fill={sd.color} stroke="var(--panel)" strokeWidth={2} />
          <text className={s.val} x={xPx[i] + 10} y={y} dy="-0.05em" fontSize={11}>
            {(sd.format ?? yFormat)(yAt(k, i))}
          </text>
          <text className={s.cap} x={xPx[i] + 10} y={y + 11}>
            {ellipsize(sd.label, m.r - 14, 9.5, 0.66)}
          </text>
        </g>
      ))}
      {!endLabels &&
        series.map((sd, k) => {
          let i = nP - 1;
          while (i >= 0 && Number.isNaN(yAt(k, i))) i--;
          if (i < 0 || (reveal[k] ?? 1) < 0.98) return null;
          return <circle key={sd.key} cx={xPx[i]} cy={ys(yAt(k, i))} r={4} fill={sd.color} stroke="var(--panel)" strokeWidth={2} className={s.pop} pointerEvents="none" />;
        })}

    </svg>
  );
}
