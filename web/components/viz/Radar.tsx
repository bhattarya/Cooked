"use client";

import { useMemo, useRef, useState } from "react";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { Legend } from "./Legend";
import { easeOutCubic, localXY, navIndex, useTween } from "./hooks";
import { nOf } from "./format";
import { polar, wrapLabel } from "./geometry";
import { alpha, viz } from "./tokens";
import s from "./viz.module.css";

export interface RadarAxis {
  key: string;
  label: string;
}
export interface RadarSeries {
  key: string;
  label: string;
  color?: string;
  /** One value per axis, in `axes` order, inside `domain`. */
  values: number[];
  n?: number;
}
export interface RadarProps {
  axes: RadarAxis[];
  series: RadarSeries[];
  /** Value range mapped from centre to rim. Default [0, 1]. */
  domain?: [number, number];
  /** Concentric guide rings. Default 4. */
  rings?: number;
  format?: (v: number) => string;
  height?: number;
  /** Default: shown for two or more series. */
  legend?: boolean;
  label?: string;
}

const defaultFmt = (v: number) => `${Math.round(v * 100)}%`;

export function Radar({ axes, series: seriesIn, domain = [0, 1], rings = 4, format = defaultFmt, height = 320, legend, label }: RadarProps) {
  const series = useMemo(() => seriesIn.map((sd, i) => ({ ...sd, color: sd.color ?? viz(i) })), [seriesIn]);
  const first = series[0];
  const topAxis = first ? first.values.reduce((a, v, i) => (v > first.values[a] ? i : a), 0) : 0;
  const summary = label ?? (first && axes.length ? `${first.label} is strongest on ${axes[topAxis].label} at ${format(first.values[topAxis])}, across ${axes.length} dimensions.` : "No data.");
  return (
    <ChartShell
      height={height}
      empty={axes.length < 3 || !series.length}
      label={summary}
      hint="Arrow keys step around the axes."
      table={{ caption: summary, head: ["Dimension", ...series.map((sd) => sd.label)], rows: axes.map((a, i) => [a.label, ...series.map((sd) => format(sd.values[i]))]) }}
      legend={(legend ?? series.length > 1) ? <Legend items={series.map((sd) => ({ key: sd.key, label: sd.label, color: sd.color, swatch: "line" as const }))} /> : undefined}
    >
      <RadarBody axes={axes} series={series} domain={domain} rings={rings} format={format} />
    </ChartShell>
  );
}

function RadarBody({ axes, series, domain, rings, format }: { axes: RadarAxis[]; series: (RadarSeries & { color: string })[]; domain: [number, number]; rings: number; format: (v: number) => string }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [axis, setAxis] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const N = axes.length;
  const target = useMemo(() => series.flatMap((sd) => sd.values), [series]);
  const d = useTween(target, { enabled: inView, duration: 1000, ease: easeOutCubic, delay: (i) => Math.floor(i / Math.max(1, N)) * 160 });

  const marginX = Math.min(96, W * 0.2);
  const R = Math.max(50, Math.min(W / 2 - marginX, H / 2 - 32));
  const cx = W / 2;
  const cy = H / 2 + 4;
  const ang = (k: number) => (k * 360) / N;
  const rOf = (v: number) => (R * (v - domain[0])) / (domain[1] - domain[0] || 1);
  const ringVals = Array.from({ length: rings }, (_, i) => domain[0] + ((domain[1] - domain[0]) * (i + 1)) / rings);
  const active = axis ?? kbd;

  const tipFor = (k: number, say = false) => {
    const [x, y] = polar(cx, cy, Math.max(...series.map((sd) => rOf(sd.values[k]))), ang(k));
    const ns = series.map((sd) => sd.n).filter((v): v is number => v !== undefined);
    show(x, y, { title: axes[k].label, rows: series.map((sd, i) => ({ label: sd.label, value: format(sd.values[k]), color: sd.color, swatch: "dot", strong: i === 0 })), note: ns.length ? nOf(Math.max(...ns)) : undefined }, { announce: say });
  };
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, N);
      if (nx === null) return false;
      setKbd(nx);
      setAxis(null);
      tipFor(nx, true);
      return true;
    },
    onFocus: () => {
      setKbd(0);
      setAxis(null);
      tipFor(0, true);
    },
    onBlur: () => setKbd(null),
  });

  const ringPath = (r: number) => axes.map((_, k) => `${k ? "L" : "M"}${polar(cx, cy, r, ang(k)).join(",")}`).join("") + "Z";
  const polyPath = (si: number) => axes.map((_, k) => `${k ? "L" : "M"}${polar(cx, cy, Math.max(0, rOf(d[si * N + k])), ang(k)).join(",")}`).join("") + "Z";

  const onMove = (e: React.PointerEvent) => {
    const [px, py] = localXY(e, svgRef.current);
    const a = ((Math.atan2(px - cx, -(py - cy)) * 180) / Math.PI + 360) % 360;
    const k = Math.round(a / (360 / N)) % N;
    setAxis(k);
    tipFor(k);
  };

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setAxis(null); hide(); }}>
      {ringVals.map((rv, i) => (
        <path key={i} d={ringPath(rOf(rv))} fill="none" stroke={i === rings - 1 ? "var(--line-2)" : "var(--line)"} strokeWidth={1} />
      ))}
      {axes.map((_, k) => {
        const [x, y] = polar(cx, cy, R, ang(k));
        return <line key={k} x1={cx} y1={cy} x2={x} y2={y} stroke={active === k ? "var(--gold)" : "var(--line)"} strokeWidth={active === k ? 1.4 : 1} opacity={active === k ? 0.8 : 1} />;
      })}
      {ringVals.map((rv, i) => (
        <text key={i} className={s.tick} x={cx + 4} y={cy - rOf(rv) + 3} fontSize={9} style={{ opacity: 0.85 }}>
          {format(rv)}
        </text>
      ))}
      {axes.map((a, k) => {
        const [x, y] = polar(cx, cy, R + 14, ang(k));
        const dx = x - cx;
        const anchor = Math.abs(dx) < 6 ? "middle" : dx > 0 ? "start" : "end";
        const lines = wrapLabel(a.label, Math.max(8, Math.floor(marginX / 6.2)), 2);
        return (
          <text key={a.key} className={s.cat} x={x} y={y} textAnchor={anchor} fontSize={11.5} style={{ fill: active === k ? "var(--text)" : undefined }}>
            {lines.map((ln, i) => (
              <tspan key={i} x={x} dy={i === 0 ? (y < cy - R * 0.9 ? "-0.2em" : y > cy + R * 0.9 ? "0.9em" : "0.34em") : "1.15em"}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
      {[...series].reverse().map((sd) => {
        const si = series.indexOf(sd);
        const first = si === 0;
        return (
          <g key={sd.key}>
            <path d={polyPath(si)} fill={sd.color} fillOpacity={first ? 0.16 : 0.1} stroke={sd.color} strokeWidth={2} strokeLinejoin="round" style={{ filter: first ? `drop-shadow(0 0 7px ${alpha(sd.color, 0.5)})` : undefined }} />
            {axes.map((_, k) => {
              const [x, y] = polar(cx, cy, Math.max(0, rOf(d[si * N + k])), ang(k));
              return <circle key={k} cx={x} cy={y} r={active === k ? 5.5 : 4} fill={sd.color} stroke="var(--panel)" strokeWidth={2} style={{ transition: "r .15s" }} />;
            })}
          </g>
        );
      })}
      <circle cx={cx} cy={cy} r={R + 30} fill="transparent" onPointerMove={onMove} onPointerDown={onMove} />
    </svg>
  );
}
