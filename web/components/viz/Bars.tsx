"use client";

import { useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys, type TipContent } from "./ChartShell";
import { XAxis, YAxis } from "./Axes";
import { Legend } from "./Legend";
import { easeOutCubic, localXY, navIndex, useTween } from "./hooks";
import { int, nOf, pct } from "./format";
import { barPath, bandRect, endSide, ellipsize, monoWidth, sansWidth, wrapLabel, type Orientation } from "./geometry";
import { alpha, luminance, viz } from "./tokens";
import s from "./viz.module.css";

/** One bar in a single-series chart. */
export interface BarItem {
  /** Stable id: colour, highlight and reorder animation follow it. Defaults to the label. */
  key?: string;
  label: string;
  value: number;
  /** Uncertainty interval (same units as value), drawn as an error bar. */
  lo?: number;
  hi?: number;
  n?: number;
  color?: string;
}

/** One category in a grouped/stacked chart: one value per series, in `series` order. */
export interface BarGroup {
  key?: string;
  label: string;
  values: number[];
  lo?: number[];
  hi?: number[];
  n?: number;
}

export interface BarSeriesDef {
  key: string;
  label: string;
  color?: string;
}

export interface BarsProps {
  /** Single series: one bar per item. Use this OR `groups` + `series`. */
  data?: BarItem[];
  groups?: BarGroup[];
  series?: BarSeriesDef[];
  mode?: "grouped" | "stacked";
  /** Stacked only: scale every bar to 100% (part-to-whole). */
  normalize?: boolean;
  /** Ranked bars read best horizontal; use vertical for ordered categories (terms, bands). */
  orientation?: "horizontal" | "vertical";
  /** Reorders with a FLIP-style glide when changed. Default "none" keeps input order. */
  sort?: "none" | "desc" | "asc";
  /** Value-axis domain. Default: from zero to a nice maximum (bars always keep a zero baseline). */
  domain?: [number, number];
  format?: (v: number) => string;
  axisFormat?: (v: number) => string;
  /** Noun for the value in tooltips ("cooked rate", "alumni"). */
  unit?: string;
  /** Reference line across the bars (a target, threshold, or overall rate). */
  baseline?: { value: number; label?: string; tone?: "gold" | "risk" | "safe" };
  /** Keys to emphasise (gold + glow); everything else recedes to grey. */
  highlight?: string | string[];
  /** "auto": tip labels for single/stacked charts with up to 12 bars. */
  labels?: "auto" | "all" | "none";
  /** Pixel height. Default fits the rows (horizontal) or 260 (vertical). */
  height?: number;
  axis?: boolean;
  /** Default: shown for two or more series. */
  legend?: boolean;
  /** Tooltip word for lo-hi, e.g. "p25 to p75". Default "range". */
  intervalLabel?: string;
  /** Aria summary override. */
  label?: string;
}

interface Cat {
  key: string;
  label: string;
  n?: number;
  vals: number[];
  lo?: (number | undefined)[];
  hi?: (number | undefined)[];
  color?: string;
}

const TONE = { gold: "var(--gold)", risk: "var(--hot)", safe: "var(--cool)" } as const;
const STAGGER = 48;
const THICK = 24;

export function Bars({ data, groups, series: seriesIn, mode = "grouped", normalize = false, orientation = "horizontal", sort = "none", domain, format = int, axisFormat, unit, baseline, highlight, labels = "auto", height, axis = true, legend, intervalLabel = "range", label }: BarsProps) {
  const { series, cats } = useMemo(() => {
    if (groups && seriesIn) {
      return {
        series: seriesIn.map((sd, i) => ({ ...sd, color: sd.color ?? viz(i) })),
        cats: groups.map<Cat>((g) => ({ key: g.key ?? g.label, label: g.label, n: g.n, vals: g.values, lo: g.lo, hi: g.hi })),
      };
    }
    return {
      series: [{ key: "value", label: unit ?? "value", color: viz(0) }],
      cats: (data ?? []).map<Cat>((d) => ({ key: d.key ?? d.label, label: d.label, n: d.n, vals: [d.value], lo: d.lo === undefined ? undefined : [d.lo], hi: d.hi === undefined ? undefined : [d.hi], color: d.color })),
    };
  }, [data, groups, seriesIn, unit]);

  const N = cats.length;
  const S = series.length;
  const stacked = S > 1 && mode === "stacked";
  const horizontal = orientation === "horizontal";
  const rowH = S > 1 && !stacked ? Math.max(38, S * 17 + 16) : 34;
  const H = height ?? (horizontal ? N * rowH + (axis ? 30 : 10) : 260);

  const totals = cats.map((c) => c.vals.reduce((a, v) => a + v, 0));
  const top = totals.reduce((a, v, i) => (v > totals[a] ? i : a), 0);
  const lead = cats.reduce((a, c, i) => (c.vals[0] > cats[a].vals[0] ? i : a), 0);
  const summary =
    label ??
    (!N
      ? "No data."
      : S === 1
        ? `${cats[top].label} is highest at ${format(cats[top].vals[0])}, out of ${N} ${N === 1 ? "group" : "groups"}.`
        : `${N} groups compared on ${series.map((sd) => sd.label).join(", ")}; the highest ${series[0].label} is ${cats[lead].label} at ${format(cats[lead].vals[0])}.`);
  const table = {
    caption: summary,
    head: ["Group", ...series.map((sd) => sd.label), ...(S === 1 && cats.some((c) => c.lo) ? [intervalLabel] : []), "n"],
    rows: cats.map((c) => [c.label, ...c.vals.map(format), ...(S === 1 && cats.some((x) => x.lo) ? [c.lo?.[0] !== undefined && c.hi?.[0] !== undefined ? `${format(c.lo[0])} to ${format(c.hi[0])}` : ""] : []), c.n ?? ""]),
  };

  return (
    <ChartShell height={H} label={summary} table={table} empty={N === 0} legend={(legend ?? S > 1) ? <Legend items={series.map((sd) => ({ key: sd.key, label: sd.label, color: sd.color!, swatch: "box" as const }))} /> : undefined}>
      <BarsBody cats={cats} series={series} stacked={stacked} normalize={normalize && stacked} horizontal={horizontal} sort={sort} domain={domain} format={format} axisFormat={axisFormat} unit={unit} baseline={baseline} highlight={highlight} labels={labels} axis={axis} intervalLabel={intervalLabel} />
    </ChartShell>
  );
}

type SeriesX = BarSeriesDef & { color: string };

function BarsBody({ cats, series, stacked, normalize, horizontal, sort, domain, format, axisFormat, unit, baseline, highlight, labels, axis, intervalLabel }: { cats: Cat[]; series: SeriesX[]; stacked: boolean; normalize: boolean; horizontal: boolean; sort: "none" | "desc" | "asc"; domain?: [number, number]; format: (v: number) => string; axisFormat?: (v: number) => string; unit?: string; baseline?: BarsProps["baseline"]; highlight?: string | string[]; labels: "auto" | "all" | "none"; axis: boolean; intervalLabel: string }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const N = cats.length;
  const S = series.length;
  const o: Orientation = horizontal ? "horizontal" : "vertical";
  const hasIv = S === 1 && cats.some((c) => c.lo?.[0] !== undefined && c.hi?.[0] !== undefined);
  const hl = useMemo(() => new Set(Array.isArray(highlight) ? highlight : highlight ? [highlight] : []), [highlight]);

  const totals = useMemo(() => cats.map((c) => c.vals.reduce((a, v) => a + v, 0)), [cats]);
  const ranks = useMemo(() => {
    const idx = cats.map((_, i) => i);
    const score = (i: number) => (stacked ? totals[i] : cats[i].vals[0]);
    if (sort === "desc") idx.sort((a, b) => score(b) - score(a));
    else if (sort === "asc") idx.sort((a, b) => score(a) - score(b));
    const r = new Array<number>(N);
    idx.forEach((ci, rk) => (r[ci] = rk));
    return r;
  }, [cats, totals, sort, stacked, N]);
  const order = useMemo(() => {
    const o2 = new Array<number>(N);
    ranks.forEach((rk, ci) => (o2[rk] = ci));
    return o2;
  }, [ranks, N]);

  const dom = useMemo<[number, number]>(() => {
    if (domain) return domain;
    if (normalize) return [0, 1];
    let mx = 0;
    let mn = 0;
    cats.forEach((c, i) => {
      if (stacked) mx = Math.max(mx, totals[i]);
      else
        c.vals.forEach((v, k) => {
          mx = Math.max(mx, v, c.hi?.[k] ?? v);
          mn = Math.min(mn, v, c.lo?.[k] ?? v);
        });
    });
    const sc = scaleLinear().domain([mn, mx || 1]).nice();
    return sc.domain() as [number, number];
  }, [domain, normalize, cats, totals, stacked]);

  const target = useMemo(
    () => [...ranks, ...cats.flatMap((c) => c.vals), ...(hasIv ? cats.map((c) => c.lo?.[0] ?? c.vals[0]) : []), ...(hasIv ? cats.map((c) => c.hi?.[0] ?? c.vals[0]) : []), dom[0], dom[1]],
    [ranks, cats, hasIv, dom],
  );
  const d = useTween(target, {
    enabled: inView,
    duration: 900,
    ease: easeOutCubic,
    from: (i, t) => (i < N || i >= target.length - 2 ? t : 0),
    delay: (i) => {
      if (i < N || i >= target.length - 2) return 0;
      const k = i - N;
      const ci = k < N * S ? Math.floor(k / S) : (k - N * S) % N;
      return ranks[ci] * STAGGER;
    },
  });
  const dr = d.slice(0, N);
  const dv = d.slice(N, N + N * S);
  const dl = hasIv ? d.slice(N + N * S, N + N * S + N) : [];
  const dh = hasIv ? d.slice(N + N * S + N, N + N * S + 2 * N) : [];
  const dd: [number, number] = [d[d.length - 2], d[d.length - 1]];

  // layout
  const showLabels = labels === "all" || (labels === "auto" && S >= 1 && (!(S > 1) || stacked) && N <= (horizontal ? 12 : 9));
  const fmtAxis = axisFormat ?? (normalize ? (v: number) => pct(v) : format);
  const longest = Math.max(1, ...cats.map((c) => sansWidth(c.label, 12)));
  const maxTip = Math.max(...cats.map((c, i) => monoWidth(format(stacked ? totals[i] : Math.max(...c.vals, ...(c.hi?.map((v) => v ?? 0) ?? []))), 11)), 20);
  const m = horizontal
    ? { l: Math.min(W * 0.4, Math.min(190, longest + 16)), r: showLabels ? maxTip + 14 : 10, t: baseline?.label ? 16 : 6, b: axis ? 24 : 4 }
    : { l: axis ? 42 : 8, r: 8, t: showLabels ? 20 : baseline?.label ? 16 : 8, b: 36 };
  const pw = Math.max(20, W - m.l - m.r);
  const ph = Math.max(20, H - m.t - m.b);
  const vScale = scaleLinear().domain(dd).range(horizontal ? [m.l, m.l + pw] : [m.t + ph, m.t]);
  const tickScale = useMemo(() => scaleLinear().domain(dom), [dom]);
  const ticks = tickScale.ticks(Math.max(2, Math.round((horizontal ? pw : ph) / (horizontal ? 90 : 46))));
  const band = (horizontal ? ph : pw) / Math.max(1, N);
  const catStart = horizontal ? m.t : m.l;
  const posOf = (rank: number) => catStart + (rank + 0.5) * band;
  const thick = stacked || S === 1 ? Math.min(THICK, band * 0.62) : Math.min(THICK, (band * 0.74 - 3 * (S - 1)) / S);
  const r4 = Math.min(4, thick / 2);
  const zero = vScale(0);
  const anyHl = hl.size > 0;

  const active = hover ?? kbd;

  const tipFor = (ci: number, x: number, y: number, say = false) => {
    const c = cats[ci];
    const tot = totals[ci];
    const rows: TipContent["rows"] = series.map((sd, k) => ({
      label: normalize && tot ? `${sd.label} (${format(c.vals[k])})` : S === 1 ? (unit ?? "value") : sd.label,
      value: normalize && tot ? pct(c.vals[k] / tot, 1) : format(c.vals[k]),
      color: c.color ?? sd.color,
      swatch: "box",
      strong: S === 1 || k === 0,
    }));
    if (stacked) rows.push({ label: "total", value: format(tot), swatch: "line", color: "var(--muted)" });
    if (hasIv && c.lo?.[0] !== undefined && c.hi?.[0] !== undefined) rows.push({ label: intervalLabel, value: `${format(c.lo[0])} – ${format(c.hi[0])}`, color: "var(--text)", swatch: "line" });
    show(x, y, { title: c.label, rows, note: c.n !== undefined ? nOf(c.n) : undefined }, { announce: say });
  };
  const tipAnchor = (ci: number): [number, number] => {
    const p = posOf(dr[ci]);
    const end = vScale(stacked ? totals[ci] : Math.max(...cats[ci].vals));
    return horizontal ? [end, p] : [p, end];
  };

  useChartKeys({
    onKey: (e) => {
      const at = kbd === null ? -1 : ranks[kbd];
      const n = navIndex(e.key, at, N);
      if (n === null) return false;
      const ci = order[n];
      setKbd(ci);
      setHover(null);
      const [x, y] = tipAnchor(ci);
      tipFor(ci, x, y, true);
      return true;
    },
    onFocus: () => {
      if (!N) return;
      const ci = order[0];
      setKbd(ci);
      setHover(null);
      const [x, y] = tipAnchor(ci);
      tipFor(ci, x, y, true);
    },
    onBlur: () => setKbd(null),
  });

  const colorOf = (c: Cat, k: number): string => {
    const base = c.color ?? series[k].color;
    if (S === 1 && anyHl && !hl.has(c.key)) return alpha("var(--muted)", 0.5);
    return base;
  };
  const baseTone = TONE[baseline?.tone ?? "gold"];
  const bpx = baseline ? vScale(baseline.value) : 0;

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHover(null); hide(); }}>
      {axis && (horizontal ? <XAxis scale={vScale} y0={m.t} y1={m.t + ph} ticks={ticks} format={(v) => fmtAxis(v)} /> : <YAxis scale={vScale} x0={m.l} x1={m.l + pw} ticks={ticks} format={(v) => fmtAxis(v)} />)}
      {!axis && <line x1={horizontal ? zero : m.l} x2={horizontal ? zero : m.l + pw} y1={horizontal ? m.t : zero} y2={horizontal ? m.t + ph : zero} stroke="var(--line-2)" />}

      {cats.map((c, i) => {
        const p = posOf(dr[i]);
        const on = active === i;
        const dim = active !== null && !on;
        const catHl = S > 1 && anyHl && !hl.has(c.key);
        const tot = totals[i];
        const norm = normalize && tot ? tot : 1;
        const glow = S === 1 && anyHl && hl.has(c.key);
        // segments (stacked), or one bar per series (grouped / single)
        let acc = 0;
        const lastNonZero = (() => {
          let idx = -1;
          c.vals.forEach((_, k) => {
            if (dv[i * S + k] > 0) idx = k;
          });
          return idx;
        })();
        const segs = series.map((sd, k) => {
          const v = dv[i * S + k];
          const col = colorOf(c, k);
          if (stacked) {
            const a = acc / norm;
            acc += v;
            const b = acc / norm;
            let v0 = vScale(a);
            let v1 = vScale(b);
            const dir = Math.sign(v1 - v0) || 1;
            if (k > 0 && Math.abs(v1 - v0) > 3) v0 += dir; // 2px surface gap between segments
            if (k < lastNonZero && Math.abs(v1 - v0) > 3) v1 -= dir;
            const r = bandRect(o, p, thick, v0, v1);
            return { k, sd, col, r, side: k === lastNonZero ? endSide(o, v0, v1) : ("none" as const), v, len: Math.abs(v1 - v0) };
          }
          const off = S > 1 ? (k - (S - 1) / 2) * (thick + 3) : 0;
          const r = bandRect(o, p + off, thick, zero, vScale(v));
          return { k, sd, col, r, side: endSide(o, zero, vScale(v)), v, len: Math.abs(vScale(v) - zero) };
        });
        const hitR = horizontal ? { x: 0, y: p - band / 2, w: W, h: band } : { x: p - band / 2, y: 0, w: band, h: H };
        const tipEnd = vScale(stacked ? acc / norm : Math.max(...c.vals.map((_, k) => dv[i * S + k])));
        const hiPx = hasIv ? vScale(dh[i]) : tipEnd;
        const labelEnd = horizontal ? Math.max(tipEnd, hiPx) + 8 : Math.min(tipEnd, hiPx) - 7;
        const wrap = wrapLabel(c.label, Math.max(4, Math.floor((band - 4) / 6.4)), 2);
        return (
          <g key={c.key} className={`${s.mark}${dim || catHl ? ` ${s.dimmed}` : ""}`} style={{ opacity: dim ? 0.5 : catHl ? 0.35 : 1 }}>
            {on && <rect {...hitRectProps(hitR)} fill="var(--line)" rx={6} pointerEvents="none" />}
            {segs.map((g) => (
              <path
                key={g.sd.key}
                d={barPath(g.r.x, g.r.y, g.r.w, g.r.h, r4, g.side)}
                fill={g.col}
                className={on ? s.lift : undefined}
                style={{ filter: glow ? `drop-shadow(0 0 9px ${alpha(g.col, 0.6)})` : undefined, transition: "filter .2s" }}
              />
            ))}
            {stacked &&
              horizontal &&
              segs.map((g) => {
                const txt = normalize && tot ? pct(g.v / tot) : format(g.v);
                if (g.len < monoWidth(txt, 10.5) + 14) return null;
                return (
                  <text key={`t${g.sd.key}`} className={s.val} x={g.r.x + g.r.w / 2} y={p} dy="0.34em" textAnchor="middle" fontSize={10.5} style={{ fill: luminance(g.col) > 0.35 ? "#0a0805" : "var(--text)" }} pointerEvents="none">
                    {txt}
                  </text>
                );
              })}
            {hasIv && <ErrorBar o={o} p={p} a={vScale(dl[i])} b={vScale(dh[i])} />}
            {showLabels && !normalize && (
              <text className={s.val} x={horizontal ? labelEnd : p} y={horizontal ? p : labelEnd} dy={horizontal ? "0.34em" : 0} textAnchor={horizontal ? "start" : "middle"} pointerEvents="none" style={{ fill: on ? "var(--cream)" : undefined }}>
                {format(stacked ? acc : dv[i * S])}
              </text>
            )}
            {horizontal ? (
              <text className={s.cat} x={m.l - 10} y={p} dy="0.34em" textAnchor="end" style={{ fill: on ? "var(--text)" : undefined }}>
                {ellipsize(c.label, m.l - 14, 12)}
              </text>
            ) : (
              <text className={s.cat} textAnchor="middle" fontSize={11} style={{ fill: on ? "var(--text)" : undefined }}>
                {wrap.map((ln, li) => (
                  <tspan key={li} x={p} y={m.t + ph + 16 + li * 13}>
                    {ln}
                  </tspan>
                ))}
              </text>
            )}
            <rect
              {...hitRectProps(hitR)}
              fill="transparent"
              onPointerEnter={() => setHover(i)}
              onPointerMove={(e) => {
                const [x, y] = localXY(e, svgRef.current);
                tipFor(i, x, y);
              }}
              style={{ cursor: "default" }}
            />
          </g>
        );
      })}

      {baseline && (
        <g pointerEvents="none">
          <line x1={horizontal ? bpx : m.l} x2={horizontal ? bpx : m.l + pw} y1={horizontal ? m.t : bpx} y2={horizontal ? m.t + ph : bpx} stroke={baseTone} strokeWidth={1.4} strokeDasharray="5 4" />
          {baseline.label && (
            <text className={`${s.cap} ${s.halo}`} x={horizontal ? bpx : m.l + pw} y={horizontal ? m.t - 5 : bpx - 6} textAnchor={horizontal ? "middle" : "end"} style={{ fill: baseTone }}>
              {baseline.label}
            </text>
          )}
        </g>
      )}
    </svg>
  );
}

const hitRectProps = (r: { x: number; y: number; w: number; h: number }) => ({ x: r.x, y: r.y, width: r.w, height: r.h });

function ErrorBar({ o, p, a, b }: { o: Orientation; p: number; a: number; b: number }) {
  const cap = 4.5;
  const d = o === "horizontal" ? `M${a},${p}H${b}M${a},${p - cap}V${p + cap}M${b},${p - cap}V${p + cap}` : `M${p},${a}V${b}M${p - cap},${a}H${p + cap}M${p - cap},${b}H${p + cap}`;
  return (
    <g pointerEvents="none" fill="none" strokeLinecap="round">
      <path d={d} stroke="var(--bg)" strokeWidth={3.6} opacity={0.75} />
      <path d={d} stroke="var(--cream)" strokeWidth={1.4} />
    </g>
  );
}
