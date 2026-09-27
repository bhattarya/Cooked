"use client";

import { useMemo, useRef, useState } from "react";
import { scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { XAxis, YAxis } from "./Axes";
import { easeOutCubic, localXY, navIndex, useTween } from "./hooks";
import { int, nOf } from "./format";
import { bandRect, barPath, ellipsize, endSide, sansWidth, wrapLabel, type Orientation } from "./geometry";
import { alpha } from "./tokens";
import s from "./viz.module.css";

export interface WaterfallStep {
  key?: string;
  label: string;
  /** Signed change this step adds to the running total. */
  delta: number;
  n?: number;
}

export interface WaterfallProps {
  /** Opening bar from zero (e.g. baseline risk). */
  start?: { label: string; value: number };
  steps: WaterfallStep[];
  /** Closing bar with the final total. `true` labels it "Total". */
  total?: boolean | { label: string };
  /** Reference line the running total is heading for (e.g. the 50% "cooked" line). */
  threshold?: { value: number; label: string };
  format?: (v: number) => string;
  /** Formats a signed step, default `+`/`-` plus `format(|delta|)`. */
  formatDelta?: (d: number) => string;
  /** "auto" switches to horizontal rows below 520px so long labels stay readable. */
  orientation?: "vertical" | "horizontal" | "auto";
  /** True (default): an increase is bad (red), a decrease good (teal). False flips the colours. */
  increaseIsBad?: boolean;
  domain?: [number, number];
  height?: number;
  label?: string;
}

interface Item {
  key: string;
  kind: "start" | "step" | "total";
  label: string;
  from: number;
  to: number;
  delta: number;
  n?: number;
}

const THICK = 34;
const signed = (d: number, f: (v: number) => string) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${f(Math.abs(d))}`;

export function Waterfall({ start, steps, total = true, threshold, format = int, formatDelta, orientation = "auto", increaseIsBad = true, domain, height, label }: WaterfallProps) {
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    let run = 0;
    if (start) {
      out.push({ key: "start", kind: "start", label: start.label, from: 0, to: start.value, delta: start.value });
      run = start.value;
    }
    steps.forEach((st, i) => {
      out.push({ key: st.key ?? `${i}:${st.label}`, kind: "step", label: st.label, from: run, to: run + st.delta, delta: st.delta, n: st.n });
      run += st.delta;
    });
    if (total) out.push({ key: "total", kind: "total", label: typeof total === "object" ? total.label : "Total", from: 0, to: run, delta: run });
    return out;
  }, [start, steps, total]);
  const end = items.length ? items[items.length - 1].to : 0;
  const fmtD = formatDelta ?? ((d: number) => signed(d, format));
  const summary = label ?? (items.length ? `Running total ends at ${format(end)}${threshold ? `, ${end >= threshold.value ? "at or past" : "short of"} ${threshold.label} (${format(threshold.value)})` : ""}, after ${steps.length} ${steps.length === 1 ? "step" : "steps"}.` : "No data.");
  const table = { caption: summary, head: ["Step", "Change", "Running total", "n"], rows: items.map((it) => [it.label, it.kind === "step" ? fmtD(it.delta) : "", format(it.to), it.n ?? ""]) };
  const horizontalH = items.length * 40 + 34;
  const H = height ?? (orientation === "horizontal" ? horizontalH : orientation === "vertical" ? 300 : (w: number) => (w < 520 ? horizontalH : 300));
  return (
    <ChartShell height={H} label={summary} table={table} empty={items.length === 0}>
      <WaterfallBody items={items} threshold={threshold} format={format} fmtD={fmtD} orientation={orientation} increaseIsBad={increaseIsBad} domain={domain} />
    </ChartShell>
  );
}

function WaterfallBody({ items, threshold, format, fmtD, orientation, increaseIsBad, domain }: { items: Item[]; threshold?: { value: number; label: string }; format: (v: number) => string; fmtD: (d: number) => string; orientation: "vertical" | "horizontal" | "auto"; increaseIsBad: boolean; domain?: [number, number] }) {
  const { width: W, height: H, inView, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const N = items.length;
  const o: Orientation = orientation === "auto" ? (W < 520 ? "horizontal" : "vertical") : orientation;
  const horizontal = o === "horizontal";

  const dom = useMemo<[number, number]>(() => {
    if (domain) return domain;
    const vals = items.flatMap((it) => [it.from, it.to]);
    if (threshold) vals.push(threshold.value);
    const sc = scaleLinear().domain([Math.min(0, ...vals), Math.max(...vals, 0.0001)]).nice();
    return sc.domain() as [number, number];
  }, [domain, items, threshold]);

  const target = useMemo(() => [...items.flatMap((it) => [it.from, it.to]), dom[0], dom[1]], [items, dom]);
  const d = useTween(target, {
    enabled: inView,
    duration: 800,
    ease: easeOutCubic,
    from: (i, t) => (i >= target.length - 2 ? t : i % 2 === 0 ? t : target[i - 1]),
    delay: (i) => (i >= target.length - 2 ? 0 : Math.floor(i / 2) * 140),
  });
  const dd: [number, number] = [d[d.length - 2], d[d.length - 1]];

  const longest = Math.max(1, ...items.map((it) => sansWidth(it.label, 12)));
  const m = horizontal ? { l: Math.min(W * 0.36, Math.min(170, longest + 16)), r: 64, t: threshold ? 16 : 6, b: 26 } : { l: 42, r: 10, t: 22, b: 40 };
  const pw = Math.max(20, W - m.l - m.r);
  const ph = Math.max(20, H - m.t - m.b);
  const vs = scaleLinear().domain(dd).range(horizontal ? [m.l, m.l + pw] : [m.t + ph, m.t]);
  const ticks = scaleLinear().domain(dom).ticks(horizontal ? Math.max(2, Math.round(pw / 90)) : 4);
  const band = (horizontal ? ph : pw) / Math.max(1, N);
  const pos = (i: number) => (horizontal ? m.t : m.l) + (i + 0.5) * band;
  const thick = Math.min(THICK, band * 0.6);
  const bad = "var(--hot)";
  const good = "var(--cool)";
  const active = hover ?? kbd;

  const colorOf = (it: Item) => {
    if (it.kind === "start") return "var(--viz-8)";
    if (it.kind === "total") return threshold ? (it.to >= threshold.value ? bad : "var(--gold)") : "var(--gold)";
    return (it.delta > 0) === increaseIsBad ? bad : good;
  };
  const tipFor = (i: number, ax: number, ay: number, say = false) => {
    const it = items[i];
    show(
      ax,
      ay,
      {
        title: it.label,
        rows: it.kind === "step" ? [{ label: "change", value: fmtD(it.delta), color: colorOf(it), swatch: "box", strong: true }, { label: "running total", value: format(it.to) }] : [{ label: it.kind === "start" ? "starting level" : "final total", value: format(it.to), color: colorOf(it), swatch: "box", strong: true }],
        note: it.n !== undefined ? nOf(it.n) : undefined,
      },
      { announce: say },
    );
  };
  const anchor = (i: number): [number, number] => {
    const hi = Math.max(items[i].from, items[i].to);
    return horizontal ? [vs(hi), pos(i)] : [pos(i), vs(hi)];
  };
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, N);
      if (nx === null) return false;
      setKbd(nx);
      setHover(null);
      const [x, y] = anchor(nx);
      tipFor(nx, x, y, true);
      return true;
    },
    onFocus: () => {
      if (!N) return;
      setKbd(0);
      setHover(null);
      const [x, y] = anchor(0);
      tipFor(0, x, y, true);
    },
    onBlur: () => setKbd(null),
  });

  const tpx = threshold ? vs(threshold.value) : 0;
  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHover(null); hide(); }}>
      {horizontal ? <XAxis scale={vs} y0={m.t} y1={m.t + ph} ticks={ticks} format={(v) => format(v)} /> : <YAxis scale={vs} x0={m.l} x1={m.l + pw} ticks={ticks} format={(v) => format(v)} />}

      {items.map((it, i) => {
        const a = d[2 * i];
        const b = d[2 * i + 1];
        const p = pos(i);
        const v0 = vs(a);
        const v1 = vs(b);
        const r = bandRect(o, p, thick, v0, v1);
        const col = colorOf(it);
        const on = active === i;
        const prev = i > 0 ? d[2 * (i - 1) + 1] : null;
        const hitR = horizontal ? { x: 0, y: p - band / 2, width: W, height: band } : { x: p - band / 2, y: 0, width: band, height: H };
        const tipPx = vs(Math.max(a, b));
        const lbl = it.kind === "step" ? fmtD(it.delta) : format(it.to);
        const wrap = wrapLabel(it.label, Math.max(4, Math.floor((band - 4) / 6.4)), 2);
        return (
          <g key={it.key} className={s.mark} style={{ opacity: active !== null && !on ? 0.5 : 1 }}>
            {on && <rect {...hitR} rx={6} fill="var(--line)" pointerEvents="none" />}
            {prev !== null && it.kind === "step" && (
              <line x1={horizontal ? vs(prev) : pos(i - 1) + thick / 2} x2={horizontal ? vs(prev) : p - thick / 2} y1={horizontal ? pos(i - 1) + thick / 2 : vs(prev)} y2={horizontal ? p - thick / 2 : vs(prev)} stroke="var(--line-2)" strokeWidth={1} />
            )}
            <path d={barPath(r.x, r.y, r.w, r.h, 4, it.kind === "step" ? "none" : endSide(o, v0, v1))} fill={col} className={on ? s.lift : undefined} style={{ filter: it.kind === "total" ? `drop-shadow(0 0 9px ${alpha(col, 0.5)})` : undefined }} />
            <text className={s.val} x={horizontal ? tipPx + 8 : p} y={horizontal ? p : tipPx - 8} dy={horizontal ? "0.34em" : 0} textAnchor={horizontal ? "start" : "middle"} pointerEvents="none" style={{ fill: on ? "var(--cream)" : undefined }}>
              {lbl}
            </text>
            {horizontal ? (
              <text className={s.cat} x={m.l - 10} y={p} dy="0.34em" textAnchor="end" style={{ fill: on ? "var(--text)" : undefined }}>
                {ellipsize(it.label, m.l - 14, 12)}
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
            <rect {...hitR} fill="transparent" onPointerEnter={() => setHover(i)} onPointerMove={(e) => { const [x, y] = localXY(e, svgRef.current); tipFor(i, x, y); }} />
          </g>
        );
      })}

      {threshold && (
        <g pointerEvents="none">
          <line x1={horizontal ? tpx : m.l} x2={horizontal ? tpx : m.l + pw} y1={horizontal ? m.t : tpx} y2={horizontal ? m.t + ph : tpx} stroke="var(--hot)" strokeWidth={1.4} strokeDasharray="5 4" />
          <text className={`${s.cap} ${s.halo}`} x={horizontal ? tpx : m.l + 4} y={horizontal ? m.t - 5 : tpx - 6} textAnchor={horizontal ? "middle" : "start"} style={{ fill: "var(--hot)" }}>
            {threshold.label}
          </text>
        </g>
      )}
    </svg>
  );
}
