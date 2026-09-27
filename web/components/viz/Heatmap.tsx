"use client";

import { useMemo, useRef, useState } from "react";
import { interpolateLab, scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys, type TipContent } from "./ChartShell";
import { easeOutCubic, localXY, navIndex, useTween } from "./hooks";
import { int, nOf, pct } from "./format";
import { ellipsize, sansWidth, wrapLabel } from "./geometry";
import { luminance, resolveColor } from "./tokens";
import s from "./viz.module.css";

export interface HeatmapProps {
  rows: string[];
  cols: string[];
  /** values[row][col]; `null` renders an empty cell (no data, never zero). */
  values: (number | null)[][];
  /** Colour domain. Default: the data's min and max. */
  domain?: [number, number];
  /** "sequential" for magnitude (one hue). "diverging" for polarity around `mid`. */
  scale?: "sequential" | "diverging";
  /** Diverging midpoint. Default: the domain's centre. */
  mid?: number;
  /** Diverging: which end is good (teal). Default true: high is good. */
  goodHigh?: boolean;
  format?: (v: number) => string;
  /** Text inside each cell. Default: `format(v)`. Return two strings for a big line and a small line. */
  cellLabel?: (r: number, c: number, v: number) => string | [string, string];
  /** "auto" prints text only when the cell is large enough to hold it. */
  cellText?: "auto" | "never";
  rowTitle?: string;
  colTitle?: string;
  /** Small text at the end of each row (a per-row n). */
  rowNotes?: string[];
  /** Outline the diagonal (for square matrices such as a confusion matrix). */
  emphasizeDiagonal?: boolean;
  /** Custom tooltip. Default lists row, column and value. */
  tooltip?: (r: number, c: number, v: number | null) => TipContent;
  /** Largest cell edge in px. Default 78. */
  maxCell?: number;
  /** Colour-scale key under the grid. Default true. */
  legend?: boolean;
  label?: string;
  /** Text for the scale key's ends, e.g. ["0%", "100%"]. Default: formatted domain. */
  legendEnds?: [string, string];
}

const SEQ_HEX = ["--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"];
const DIV_HEX = ["--div-bad", "--div-mid", "--div-good"];
const MIN_CELL_TEXT = 30;

function layoutFor(w: number, p: { rows: string[]; cols: string[]; colTitle?: string; rowTitle?: string; rowNotes?: string[]; maxCell: number; legend: boolean }) {
  const rowLabelW = Math.min(150, w * 0.32, Math.max(56, ...p.rows.map((r) => sansWidth(r, 12))) + 16) + (p.rowTitle ? 18 : 0);
  const noteW = p.rowNotes && w >= 480 ? 58 : 0;
  const avail = Math.max(60, w - rowLabelW - noteW - 2);
  const cell = Math.max(18, Math.min(p.maxCell, avail / Math.max(1, p.cols.length)));
  const cellH = Math.max(18, Math.min(p.maxCell, cell));
  const top = p.colTitle ? 54 : 40;
  const gridW = cell * p.cols.length;
  return { rowLabelW, noteW, cell, cellH, top, gridW, height: top + cellH * p.rows.length + (p.legend ? 34 : 6) };
}

export function Heatmap(props: HeatmapProps) {
  const { rows, cols, values, format = int, maxCell = 78, legend = true, label, colTitle, rowTitle, rowNotes } = props;
  const flat = values.flat().filter((v): v is number => v !== null);
  const hi = flat.length ? Math.max(...flat) : 0;
  const lo = flat.length ? Math.min(...flat) : 0;
  const summary = label ?? (flat.length ? `Heat map of ${rows.length} rows by ${cols.length} columns, from ${format(lo)} to ${format(hi)}.` : "No data.");
  const table = {
    caption: summary,
    head: [rowTitle ?? "Row", ...cols],
    rows: rows.map((r, i) => [r, ...cols.map((_, j) => (values[i]?.[j] === null || values[i]?.[j] === undefined ? "" : format(values[i][j] as number)))]),
  };
  return (
    <ChartShell height={(w) => (rows.length && cols.length ? layoutFor(w, { rows, cols, colTitle, rowTitle, rowNotes, maxCell, legend }).height : 60)} empty={!rows.length || !cols.length} label={summary} table={table} hint="Arrow keys move between cells.">
      <HeatBody {...props} format={format} maxCell={maxCell} legend={legend} />
    </ChartShell>
  );
}

function HeatBody({ rows, cols, values, domain, scale = "sequential", mid, goodHigh = true, format = int, cellLabel, cellText = "auto", rowTitle, colTitle, rowNotes, emphasizeDiagonal = false, tooltip, maxCell = 78, legend = true, legendEnds }: HeatmapProps & { format: (v: number) => string; maxCell: number; legend: boolean }) {
  const { width: W, inView, show, hide, uid } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const R = rows.length;
  const C = cols.length;
  const L = layoutFor(W, { rows, cols, colTitle, rowTitle, rowNotes, maxCell, legend });

  const [lo, hi] = useMemo(() => {
    if (domain) return domain;
    const f = values.flat().filter((v): v is number => v !== null);
    return f.length ? ([Math.min(...f), Math.max(...f)] as [number, number]) : ([0, 1] as [number, number]);
  }, [domain, values]);

  const color = useMemo(() => {
    if (scale === "diverging") {
      const m = mid ?? (lo + hi) / 2;
      const cols3 = DIV_HEX.map((v) => resolveColor(`var(${v})`));
      const ordered = goodHigh ? cols3 : [...cols3].reverse();
      return scaleLinear<string>().domain([lo, m, hi]).range(ordered).interpolate(interpolateLab).clamp(true);
    }
    const stops = SEQ_HEX.map((_, i) => lo + ((hi - lo) * i) / (SEQ_HEX.length - 1));
    return scaleLinear<string>().domain(stops).range(SEQ_HEX.map((v) => resolveColor(`var(${v})`))).interpolate(interpolateLab).clamp(true);
  }, [scale, mid, goodHigh, lo, hi]);

  // cells fade up row by row on entry, and re-tween when values change
  const flat = useMemo(() => values.flatMap((r) => Array.from({ length: C }, (_, j) => r[j] ?? NaN)), [values, C]);
  const shown = useTween(flat, { enabled: inView, duration: 700, ease: easeOutCubic, from: (_, t) => (Number.isNaN(t) ? t : lo), delay: (i) => (Math.floor(i / C) + (i % C)) * 38 });

  const tipFor = (r: number, c: number, ax: number, ay: number, say = false) => {
    const v = values[r]?.[c] ?? null;
    const content: TipContent = tooltip ? tooltip(r, c, v) : { title: `${rows[r]} × ${cols[c]}`, rows: [{ label: v === null ? "no data" : "value", value: v === null ? "—" : format(v), color: v === null ? undefined : color(v), swatch: "box", strong: true }] };
    show(ax, ay, content, { announce: say });
  };
  const cellPos = (r: number, c: number): [number, number] => [L.rowLabelW + (c + 0.5) * L.cell, L.top + (r + 0.5) * L.cellH];

  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, R * C, C);
      if (nx === null) return false;
      setKbd(nx);
      setHover(null);
      const [x, y] = cellPos(Math.floor(nx / C), nx % C);
      tipFor(Math.floor(nx / C), nx % C, x, y - L.cellH / 2, true);
      return true;
    },
    onFocus: () => {
      setKbd(0);
      setHover(null);
      const [x, y] = cellPos(0, 0);
      tipFor(0, 0, x, y - L.cellH / 2, true);
    },
    onBlur: () => setKbd(null),
  });

  const active: [number, number] | null = hover ?? (kbd === null ? null : [Math.floor(kbd / C), kbd % C]);
  const gid = `${uid}hm`;
  const gap = 2;
  const legW = Math.min(180, L.gridW);

  return (
    <svg ref={svgRef} width={W} height={L.height} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHover(null); hide(); }}>
      {rowTitle && (
        <text className={s.cap} textAnchor="middle" transform={`translate(8 ${L.top + (R * L.cellH) / 2}) rotate(-90)`}>
          {rowTitle}
        </text>
      )}
      {colTitle && (
        <text className={s.cap} x={L.rowLabelW} y={13}>
          {colTitle} {"→"}
        </text>
      )}
      {cols.map((cl, c) => {
        const lines = wrapLabel(cl, Math.max(4, Math.floor((L.cell - 4) / 6.1)), 2);
        return (
          <text key={cl} className={s.cat} fontSize={11} textAnchor="middle" style={{ fill: active?.[1] === c ? "var(--text)" : undefined }}>
            {lines.map((ln, k) => (
              <tspan key={k} x={L.rowLabelW + (c + 0.5) * L.cell} y={L.top - 8 - (lines.length - 1 - k) * 12}>
                {ln}
              </tspan>
            ))}
          </text>
        );
      })}
      {rows.map((rl, r) => (
        <g key={rl}>
          <text className={s.cat} x={L.rowLabelW - 10} y={L.top + (r + 0.5) * L.cellH} dy="0.34em" textAnchor="end" style={{ fill: active?.[0] === r ? "var(--text)" : undefined }}>
            {ellipsize(rl, L.rowLabelW - 14, 12)}
          </text>
          {rowNotes?.[r] && L.noteW > 0 && (
            <text className={s.tick} x={L.rowLabelW + L.gridW + 10} y={L.top + (r + 0.5) * L.cellH} dy="0.34em">
              {rowNotes[r]}
            </text>
          )}
        </g>
      ))}
      {rows.map((_, r) =>
        cols.map((_, c) => {
          const v = shown[r * C + c];
          const has = !Number.isNaN(v);
          const fill = has ? color(v) : "transparent";
          const diag = emphasizeDiagonal && r === c;
          const on = active?.[0] === r && active?.[1] === c;
          const x = L.rowLabelW + c * L.cell + gap / 2;
          const y = L.top + r * L.cellH + gap / 2;
          const w = L.cell - gap;
          const h = L.cellH - gap;
          const real = values[r]?.[c];
          const txt = real === null || real === undefined || cellText === "never" || w < MIN_CELL_TEXT ? null : cellLabel ? cellLabel(r, c, real) : format(real);
          const all = txt === null ? null : Array.isArray(txt) ? txt : [txt];
          const lines = all && h < 46 ? all.slice(0, 1) : all;
          const light = has && luminance(fill) > 0.32;
          return (
            <g
              key={`${r}-${c}`}
              onPointerEnter={() => setHover([r, c])}
              onPointerMove={(e) => {
                const [ax, ay] = localXY(e, svgRef.current);
                tipFor(r, c, ax, ay);
              }}
            >
              <rect x={x} y={y} width={w} height={h} rx={5} fill={fill} stroke={has ? "none" : "var(--line-2)"} strokeDasharray={has ? undefined : "2 3"} opacity={has ? 1 : 0.7} />
              {(diag || on) && <rect x={x + 0.75} y={y + 0.75} width={w - 1.5} height={h - 1.5} rx={4.5} fill="none" stroke={on ? "var(--cream)" : "var(--gold-hi)"} strokeWidth={on ? 1.8 : 1.4} opacity={on ? 1 : 0.9} style={diag && !on ? { filter: "drop-shadow(0 0 5px rgba(246,180,26,.6))" } : undefined} />}
              {lines && (
                <text x={x + w / 2} y={y + h / 2 + (lines.length > 1 ? -4 : 0)} dy="0.34em" textAnchor="middle" className={s.val} fontSize={Math.min(15, Math.max(10.5, w * 0.2))} style={{ fill: light ? "#0a0805" : "var(--text)", fontWeight: diag ? 700 : 500 }} pointerEvents="none">
                  {lines[0]}
                  {lines[1] && (
                    <tspan x={x + w / 2} dy="1.55em" fontSize={9.5} style={{ fill: light ? "rgba(10,8,5,.7)" : "var(--muted)", fontWeight: 400 }}>
                      {lines[1]}
                    </tspan>
                  )}
                </text>
              )}
            </g>
          );
        }),
      )}
      {legend && (
        <g transform={`translate(${L.rowLabelW} ${L.top + R * L.cellH + 14})`} pointerEvents="none">
          <defs>
            <linearGradient id={gid} x1="0" x2="1">
              {Array.from({ length: 9 }, (_, i) => (
                <stop key={i} offset={i / 8} stopColor={color(lo + ((hi - lo) * i) / 8)} />
              ))}
            </linearGradient>
          </defs>
          <rect width={legW} height={7} rx={3.5} fill={`url(#${gid})`} />
          <text className={s.tick} x={0} y={20}>
            {legendEnds?.[0] ?? format(lo)}
          </text>
          <text className={s.tick} x={legW} y={20} textAnchor="end">
            {legendEnds?.[1] ?? format(hi)}
          </text>
        </g>
      )}
    </svg>
  );
}

/* -------------------------------- ConfusionMatrix ------------------------------- */

export interface ConfusionMatrixProps {
  labels: string[];
  /** counts[actual][predicted]. */
  counts: number[][];
  actualTitle?: string;
  predictedTitle?: string;
  /** Show the raw count under each percentage. Default true. */
  showCounts?: boolean;
  maxCell?: number;
  label?: string;
}

/** Row-normalised confusion matrix: each row sums to 100%, the diagonal is outlined, counts appear on hover. */
export function ConfusionMatrix({ labels, counts, actualTitle = "Actual", predictedTitle = "Predicted", showCounts = true, maxCell = 84, label }: ConfusionMatrixProps) {
  const sums = counts.map((r) => r.reduce((a, v) => a + v, 0));
  const total = sums.reduce((a, v) => a + v, 0);
  const correct = counts.reduce((a, r, i) => a + (r[i] ?? 0), 0);
  const norm = counts.map((r, i) => r.map((v) => (sums[i] ? v / sums[i] : null)));
  const summary = label ?? `Confusion matrix over ${int(total)} cases: ${pct(total ? correct / total : 0)} land on the diagonal (correctly classified).`;
  return (
    <Heatmap
        rows={labels}
        cols={labels}
        values={norm}
        domain={[0, 1]}
        format={(v) => pct(v)}
        cellLabel={(r, c, v) => (showCounts ? [pct(v), int(counts[r][c])] : pct(v))}
        rowTitle={actualTitle}
        colTitle={predictedTitle}
        rowNotes={sums.map(nOf)}
        emphasizeDiagonal
        maxCell={maxCell}
        legendEnds={["0% of row", "100%"]}
        label={summary}
        tooltip={(r, c, v) => ({
          title: r === c ? "Correct" : "Confused",
          rows: [
            { label: `of ${labels[r]} rows`, value: v === null ? "—" : pct(v, 1), color: r === c ? "var(--gold)" : "var(--muted)", swatch: "box", strong: true },
            { label: "predicted as", value: labels[c] },
            { label: "cases", value: `${int(counts[r][c])} of ${int(sums[r])}` },
          ],
          note: `overall accuracy ${pct(total ? correct / total : 0, 1)} · ${nOf(total)}`,
        })}
    />
  );
}
