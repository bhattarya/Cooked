"use client";

import { useMemo, useRef, useState } from "react";
import { area as d3area, line as d3line, scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys, type TipContent } from "./ChartShell";
import { Legend } from "./Legend";
import { easeInOutCubic, localXY, navIndex, useTween } from "./hooks";
import { int } from "./format";
import { ellipsize, interpAt, trapezoid } from "./geometry";
import { alpha, viz } from "./tokens";
import s from "./viz.module.css";

export interface RocSeries {
  key: string;
  /** Model name. */
  label: string;
  color?: string;
  /** Curve vertices as [false-positive rate, true-positive rate], both 0..1. Sorted by FPR on the way in. */
  points: [number, number][];
  /** Area under the curve. Computed from `points` (trapezoid rule) when omitted. */
  auc?: number;
  /** Evaluation sample size, shown in the tooltip. */
  n?: number;
  /** Glow and area wash for the model the story is about. Default: the first series. */
  emphasis?: boolean;
}

export interface RocCurveProps {
  series: RocSeries[];
  height?: number;
  /** Show the legend under the plot. Default: true for two or more models. */
  legend?: boolean;
  label?: string;
}

type Ser = RocSeries & { color: string; auc: number; pts: [number, number][]; emph: boolean };
const f3 = (v: number) => v.toFixed(3).replace(/^0/, "");

export function RocCurve({ series: seriesIn, height, legend, label }: RocCurveProps) {
  const series = useMemo<Ser[]>(
    () =>
      seriesIn.map((sd, i) => {
        const pts = [...sd.points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
        return { ...sd, color: sd.color ?? viz(i), pts, auc: sd.auc ?? trapezoid(pts), emph: sd.emphasis ?? i === 0 };
      }),
    [seriesIn],
  );
  const best = series.reduce<Ser | undefined>((a, b) => (!a || b.auc > a.auc ? b : a), undefined);
  const summary = label ?? (best ? `${best.label} separates best with an AUC of ${f3(best.auc)}; a coin flip scores .500.` : "No data.");
  return (
    <ChartShell
      empty={!series.length}
      height={height ?? ((w: number) => Math.round(Math.min(430, Math.max(250, w * 0.82))))}
      label={summary}
      hint="Arrow keys move along the false-positive-rate axis."
      table={{ caption: summary, head: ["Model", "AUC", "TPR at FPR 0.1", "TPR at FPR 0.2", "n"], rows: series.map((sd) => [sd.label, f3(sd.auc), f3(interpAt(sd.pts, 0.1)), f3(interpAt(sd.pts, 0.2)), sd.n ?? ""]) }}
      legend={(legend ?? series.length > 1) ? <Legend items={series.map((sd) => ({ key: sd.key, label: sd.label, color: sd.color, value: `AUC ${f3(sd.auc)}`, swatch: "line" as const }))} /> : undefined}
    >
      <RocBody series={series} />
    </ChartShell>
  );
}

const STOPS = 21;

function RocBody({ series }: { series: Ser[] }) {
  const { width: W, height: H, inView, uid, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursor, setCursor] = useState<number | null>(null); // fpr in 0..1
  const reveal = useTween(series.map(() => 1), { enabled: inView, duration: 1300, ease: easeInOutCubic, from: () => 0, delay: (i) => i * 180 });

  const m = { l: 42, r: 12, t: 12, b: 36 };
  const side = Math.max(120, Math.min(W - m.l - m.r, H - m.t - m.b));
  const ox = m.l + Math.max(0, (W - m.l - m.r - side) / 2);
  const oy = m.t;
  const sx = scaleLinear().domain([0, 1]).range([ox, ox + side]);
  const sy = scaleLinear().domain([0, 1]).range([oy + side, oy]);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const ordered = [...series].sort((a, b) => Number(a.emph) - Number(b.emph));
  const chipsSorted = [...series].sort((a, b) => b.auc - a.auc);

  const tipAt = (fpr: number, ay: number, say = false) => {
    const rows: TipContent["rows"] = series.map((sd, i) => ({ label: `${sd.label} · AUC ${f3(sd.auc)}`, value: f3(interpAt(sd.pts, fpr)), color: sd.color, swatch: "line", strong: i === 0 }));
    const ns = series.map((sd) => sd.n).filter((v): v is number => v !== undefined);
    show(sx(fpr), ay, { title: `FPR ${f3(fpr)} → TPR`, rows, note: ns.length ? `n=${int(Math.max(...ns))}` : undefined }, { announce: say });
  };
  const anchor = (fpr: number) => sy(Math.max(...series.map((sd) => interpAt(sd.pts, fpr))));

  useChartKeys({
    onKey: (e) => {
      const cur = cursor === null ? -1 : Math.round(cursor * (STOPS - 1));
      const nx = navIndex(e.key, cur, STOPS);
      if (nx === null) return false;
      const f = nx / (STOPS - 1);
      setCursor(f);
      tipAt(f, anchor(f), true);
      return true;
    },
    onFocus: () => {
      setCursor(0.1);
      tipAt(0.1, anchor(0.1), true);
    },
    onBlur: () => setCursor(null),
  });

  const chipW = Math.min(190, side * 0.62);
  const chipH = series.length * 19 + 12;
  const showChips = side > 300;

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setCursor(null); hide(); }}>
      <defs>
        {series.map((sd, k) => (
          <g key={sd.key}>
            <clipPath id={`${uid}r${k}`}>
              <rect x={ox - 6} y={0} width={(side + 12) * (reveal[k] ?? 1)} height={H} />
            </clipPath>
            <linearGradient id={`${uid}a${k}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={sd.color} stopOpacity={0.24} />
              <stop offset="1" stopColor={sd.color} stopOpacity={0.02} />
            </linearGradient>
          </g>
        ))}
      </defs>
      <g aria-hidden="true">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={ox} x2={ox + side} y1={sy(t)} y2={sy(t)} stroke="var(--line)" shapeRendering="crispEdges" />
            <line x1={sx(t)} x2={sx(t)} y1={oy} y2={oy + side} stroke="var(--line)" shapeRendering="crispEdges" />
            <text className={s.tick} x={ox - 8} y={sy(t)} dy="0.34em" textAnchor="end">
              {t === 0 ? "0" : t === 1 ? "1" : t.toFixed(2).replace(/^0/, "")}
            </text>
            <text className={s.tick} x={sx(t)} y={oy + side + 16} textAnchor="middle">
              {t === 0 ? "0" : t === 1 ? "1" : t.toFixed(2).replace(/^0/, "")}
            </text>
          </g>
        ))}
        <rect x={ox} y={oy} width={side} height={side} fill="none" stroke="var(--line-2)" />
        <text className={s.cap} x={ox + side} y={oy + side + 31} textAnchor="end">
          false-positive rate {"→"}
        </text>
        <text className={s.cap} x={ox - 34} y={oy - 1} dy="-0.3em">
          {"↑"} true-positive rate
        </text>
      </g>

      <g pointerEvents="none">
        <line x1={sx(0)} y1={sy(0)} x2={sx(1)} y2={sy(1)} stroke="var(--dim)" strokeWidth={1.2} strokeDasharray="5 5" />
        <text className={`${s.cap} ${s.halo}`} transform={`translate(${sx(0.38)} ${sy(0.38)}) rotate(-45)`} dy={14} textAnchor="middle" style={{ fill: "var(--dim)" }}>
          chance
        </text>
      </g>

      {ordered.map((sd) => {
        const k = series.indexOf(sd);
        const gen = d3line<[number, number]>().x((p) => sx(p[0])).y((p) => sy(p[1]));
        const ar = d3area<[number, number]>().x((p) => sx(p[0])).y0(sy(0)).y1((p) => sy(p[1]));
        return (
          <g key={sd.key} clipPath={`url(#${uid}r${k})`}>
            {sd.emph && <path d={ar(sd.pts) ?? ""} fill={`url(#${uid}a${k})`} />}
            <path d={gen(sd.pts) ?? ""} fill="none" stroke={sd.color} strokeWidth={sd.emph ? 2.4 : 1.8} strokeLinejoin="round" strokeLinecap="round" opacity={sd.emph ? 1 : 0.85} style={{ filter: sd.emph ? `drop-shadow(0 0 6px ${alpha(sd.color, 0.5)})` : undefined }} />
          </g>
        );
      })}

      {showChips && (
        <g className={s.fadeIn} style={{ ["--d" as string]: "1300ms" }} transform={`translate(${ox + side - chipW - 10} ${oy + side - chipH - 10})`} pointerEvents="none">
          <rect width={chipW} height={chipH} rx={10} fill="rgba(19,16,10,.82)" stroke="var(--line-2)" />
          {chipsSorted.map((sd, i) => (
            <g key={sd.key} transform={`translate(10 ${16 + i * 19})`}>
              <line x1={0} x2={12} y1={0} y2={0} stroke={sd.color} strokeWidth={2.4} strokeLinecap="round" />
              <text className={s.cat} x={19} y={0} dy="0.34em" fontSize={11}>
                {ellipsize(sd.label, chipW - 92, 11)}
              </text>
              <text className={s.val} x={chipW - 20} y={0} dy="0.34em" textAnchor="end" style={{ fill: "var(--cream)" }}>
                {f3(sd.auc)}
              </text>
            </g>
          ))}
          <text className={s.cap} x={chipW - 20} y={-4} textAnchor="end" style={{ fill: "var(--dim)" }}>
            AUC
          </text>
        </g>
      )}

      {cursor !== null && (
        <g pointerEvents="none">
          <line x1={sx(cursor)} x2={sx(cursor)} y1={oy} y2={oy + side} stroke="var(--text)" opacity={0.28} />
          {series.map((sd) => (
            <circle key={sd.key} cx={sx(cursor)} cy={sy(interpAt(sd.pts, cursor))} r={4.5} fill={sd.color} stroke="var(--panel)" strokeWidth={2} />
          ))}
        </g>
      )}
      <rect
        x={ox}
        y={oy}
        width={side}
        height={side}
        fill="transparent"
        onPointerMove={(e) => {
          const [px] = localXY(e, svgRef.current);
          const f = Math.max(0, Math.min(1, sx.invert(px)));
          setCursor(f);
          tipAt(f, anchor(f));
        }}
      />
    </svg>
  );
}
