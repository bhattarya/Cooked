"use client";

import { memo, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { contourDensity, curveCatmullRomClosed, extent, geoPath, line as d3line, polygonCentroid, polygonHull, quadtree, scaleLinear } from "d3";
import { ChartShell, useChart, useChartKeys, type TipContent } from "./ChartShell";
import { XAxis, YAxis } from "./Axes";
import { Legend } from "./Legend";
import { clamp01, easeInOutCubic, easeOutBack, localXY, navIndex, useEntry, useTween } from "./hooks";
import { int, pct } from "./format";
import { monoWidth } from "./geometry";
import { resolveColor, viz } from "./tokens";
import s from "./viz.module.css";

export interface ScatterPoint {
  x: number;
  y: number;
  /** Group key (matches `ScatterGroup.key`). Points without one join the first group. */
  group?: string;
  /** Shown in the tooltip (an alum id, a scenario name). */
  id?: string;
}
export interface ScatterGroup {
  key: string;
  label: string;
  color?: string;
}
export interface ScatterYou {
  x: number;
  y: number;
  /** Chip text. Default "You are here". */
  label?: string;
}

export interface ScatterProps {
  points: ScatterPoint[];
  /** Categories: colours, legend, hulls. Array order is draw order (put rare/important groups last). */
  groups?: ScatterGroup[];
  /** A highlighted point with an expanding ripple and a label chip. */
  you?: ScatterYou;
  /** Per-cluster smoothed outline around each group's core (the middle ~88% of its points). */
  hulls?: boolean;
  /** Density contours: "all" for one set, "groups" for one per group. */
  density?: "none" | "all" | "groups";
  xDomain?: [number, number];
  yDomain?: [number, number];
  xLabel?: string;
  yLabel?: string;
  xFormat?: (v: number) => string;
  yFormat?: (v: number) => string;
  /** Hide tick labels (for projections like PCA where the axes carry no units). Axis captions stay. */
  hideAxes?: boolean;
  /** Drag a rectangle to zoom, double-click or Escape to reset. */
  zoom?: boolean;
  /** Dot radius in px. Default scales down with point count. */
  radius?: number;
  height?: number;
  /** Switch from SVG to canvas above this many points. Default 600. */
  canvasThreshold?: number;
  /** Legend with toggles and count per group. Default true when groups are given. */
  legend?: boolean;
  /** Custom tooltip for a hovered point. */
  tooltip?: (p: ScatterPoint, g: ScatterGroup) => TipContent;
  label?: string;
}

const BASE_ALPHA = 0.7;
const HIT = 22;
const TAU = Math.PI * 2;

type G = ScatterGroup & { color: string };

export function Scatter({ points, groups: groupsIn, you, hulls = false, density = "none", xDomain, yDomain, xLabel, yLabel, xFormat, yFormat, hideAxes = false, zoom = false, radius, height = 360, canvasThreshold = 600, legend, tooltip, label }: ScatterProps) {
  const groups = useMemo<G[]>(() => (groupsIn?.length ? groupsIn : [{ key: "all", label: "Points" }]).map((g, i) => ({ ...g, color: g.color ?? viz(i) })), [groupsIn]);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(() => new Set());
  const [spot, setSpot] = useState<string | null>(null);

  const counts = useMemo(() => {
    const idx = new Map(groups.map((g, i) => [g.key, i]));
    const c = new Array<number>(groups.length).fill(0);
    for (const p of points) c[idx.get(p.group ?? "") ?? 0]++;
    return c;
  }, [points, groups]);
  const total = points.length;
  const biggest = counts.reduce((a, v, i) => (v > counts[a] ? i : a), 0);
  const summary = label ?? `${int(total)} points in ${groups.length} ${groups.length === 1 ? "group" : "groups"}; the largest is ${groups[biggest]?.label ?? "none"} with ${pct(total ? counts[biggest] / total : 0)}.`;

  const toggle = (k: string) =>
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(k)) n.delete(k);
      else if (n.size < groups.length - 1) n.add(k);
      return n;
    });

  return (
    <ChartShell
      height={height}
      empty={total === 0}
      label={summary}
      hint="Arrow keys step through groups. Escape resets zoom."
      table={{ caption: summary, head: ["Group", "Count", "Share"], rows: groups.map((g, i) => [g.label, int(counts[i]), pct(total ? counts[i] / total : 0, 1)]) }}
      legend={(legend ?? !!groupsIn?.length) ? <Legend items={groups.map((g, i) => ({ key: g.key, label: g.label, color: g.color, value: int(counts[i]), hidden: hidden.has(g.key) }))} onToggle={toggle} onHover={setSpot} /> : undefined}
    >
      <ScatterBody points={points} groups={groups} counts={counts} hidden={hidden} spot={spot} onSpot={setSpot} you={you} hulls={hulls} density={density} xDomain={xDomain} yDomain={yDomain} xLabel={xLabel} yLabel={yLabel} xFormat={xFormat} yFormat={yFormat} hideAxes={hideAxes} zoom={zoom} radius={radius} canvasThreshold={canvasThreshold} tooltip={tooltip} />
    </ChartShell>
  );
}

/* ---------------------------------- canvas ---------------------------------- */

interface CanvasProps {
  px: Float32Array;
  py: Float32Array;
  members: Int32Array[];
  colors: string[];
  alpha: number[];
  delays: Float32Array;
  r: number;
  w: number;
  h: number;
  plot: { l: number; t: number; w: number; h: number };
}

// Dense marks live on a canvas: one path per group, one fill per group. It owns the entry animation so
// the rest of the chart does not re-render each frame.
const PointsCanvas = memo(function PointsCanvas({ px, py, members, colors, alpha, delays, r, w, h, plot }: CanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { inView } = useChart();
  const p = useEntry(inView, { duration: 1500 });
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    if (cv.width !== Math.round(w * dpr) || cv.height !== Math.round(h * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.beginPath();
    ctx.rect(plot.l - 3, plot.t - 3, plot.w + 6, plot.h + 6);
    ctx.clip();
    for (let g = 0; g < members.length; g++) {
      if (alpha[g] < 0.01) continue;
      ctx.globalAlpha = alpha[g];
      ctx.fillStyle = resolveColor(colors[g]);
      ctx.beginPath();
      const m = members[g];
      for (let k = 0; k < m.length; k++) {
        const i = m[k];
        const local = easeOutBack(clamp01((p - delays[i] * 0.62) / 0.38));
        const rr = r * local;
        if (rr < 0.1) continue;
        ctx.moveTo(px[i] + rr, py[i]);
        ctx.arc(px[i], py[i], rr, 0, TAU);
      }
      ctx.fill();
    }
    ctx.restore();
  }, [px, py, members, colors, alpha, delays, r, w, h, plot, p]);
  return <canvas ref={ref} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: w, height: h, pointerEvents: "none" }} />;
});

/* ----------------------------------- body ----------------------------------- */

type Brush = { x0: number; y0: number; x1: number; y1: number };

function ScatterBody({ points, groups, counts, hidden, spot, onSpot, you, hulls, density, xDomain, yDomain, xLabel, yLabel, xFormat, yFormat, hideAxes, zoom, radius, canvasThreshold, tooltip }: { points: ScatterPoint[]; groups: G[]; counts: number[]; hidden: ReadonlySet<string>; spot: string | null; onSpot: (k: string | null) => void; you?: ScatterYou; hulls: boolean; density: "none" | "all" | "groups"; xDomain?: [number, number]; yDomain?: [number, number]; xLabel?: string; yLabel?: string; xFormat?: (v: number) => string; yFormat?: (v: number) => string; hideAxes: boolean; zoom: boolean; radius?: number; canvasThreshold: number; tooltip?: (p: ScatterPoint, g: ScatterGroup) => TipContent }) {
  const { width: W, height: H, show, hide, reduced, uid } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const [brush, setBrush] = useState<Brush | null>(null);
  const [zoomed, setZoomed] = useState<[number, number, number, number] | null>(null);
  const n = points.length;
  const useCanvas = n > canvasThreshold;
  const showAxisLabels = !hideAxes;
  const m = { l: showAxisLabels ? 44 : 10, r: 12, t: 12, b: showAxisLabels ? 34 : 26 };
  const pw = Math.max(20, W - m.l - m.r);
  const ph = Math.max(20, H - m.t - m.b);
  const plot = useMemo(() => ({ l: m.l, t: m.t, w: pw, h: ph }), [m.l, m.t, pw, ph]);

  // typed arrays for the hot paths
  const { xs, ys, gi, members, delays } = useMemo(() => {
    const idx = new Map(groups.map((g, i) => [g.key, i]));
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    const gi = new Uint8Array(n);
    const delays = new Float32Array(n);
    const lists: number[][] = groups.map(() => []);
    for (let i = 0; i < n; i++) {
      const p = points[i];
      xs[i] = p.x;
      ys[i] = p.y;
      const g = idx.get(p.group ?? "") ?? 0;
      gi[i] = g;
      lists[g].push(i);
      delays[i] = (i * 0.6180339887) % 1;
    }
    return { xs, ys, gi, members: lists.map((l) => Int32Array.from(l)), delays };
  }, [points, groups, n]);

  const dom = useMemo(() => {
    const ex = extent(xs as unknown as number[]) as [number, number];
    const ey = extent(ys as unknown as number[]) as [number, number];
    const padX = ((ex[1] ?? 1) - (ex[0] ?? 0)) * 0.04 || 1;
    const padY = ((ey[1] ?? 1) - (ey[0] ?? 0)) * 0.05 || 1;
    let x0 = xDomain?.[0] ?? (ex[0] ?? 0) - padX;
    let x1 = xDomain?.[1] ?? (ex[1] ?? 1) + padX;
    let y0 = yDomain?.[0] ?? (ey[0] ?? 0) - padY;
    let y1 = yDomain?.[1] ?? (ey[1] ?? 1) + padY;
    if (you) {
      if (!xDomain) [x0, x1] = [Math.min(x0, you.x - padX), Math.max(x1, you.x + padX)];
      if (!yDomain) [y0, y1] = [Math.min(y0, you.y - padY), Math.max(y1, you.y + padY)];
    }
    return [x0, x1, y0, y1] as [number, number, number, number];
  }, [xs, ys, xDomain, yDomain, you]);

  const view = useTween(zoomed ?? dom, { duration: 650, ease: easeInOutCubic, from: (_, t) => t });
  const sx = scaleLinear().domain([view[0], view[1]]).range([m.l, m.l + pw]);
  const sy = scaleLinear().domain([view[2], view[3]]).range([m.t + ph, m.t]);

  // group visibility and spotlight, tweened
  const alphaTarget = groups.map((g) => (hidden.has(g.key) ? 0 : spot !== null ? (spot === g.key ? 0.92 : 0.1) : BASE_ALPHA));
  const alpha = useTween(alphaTarget, { duration: 260, from: (_, t) => t });
  const visible = useMemo(() => groups.map((g) => !hidden.has(g.key)), [groups, hidden]);

  const px = useMemo(() => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = sx(xs[i]);
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, n, view[0], view[1], m.l, pw]);
  const py = useMemo(() => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = sy(ys[i]);
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ys, n, view[2], view[3], m.t, ph]);

  const tree = useMemo(() => {
    const t = quadtree<number>().x((i) => px[i]).y((i) => py[i]);
    for (let i = 0; i < n; i++) {
      if (!visible[gi[i]]) continue;
      if (px[i] < m.l - 2 || px[i] > m.l + pw + 2 || py[i] < m.t - 2 || py[i] > m.t + ph + 2) continue;
      t.add(i);
    }
    return t;
  }, [px, py, n, visible, gi, m.l, m.t, pw, ph]);

  const r = radius ?? Math.max(1.7, Math.min(4.2, 4.9 - Math.log10(Math.max(10, n)) * 0.72));
  const colors = useMemo(() => groups.map((g) => g.color), [groups]);

  // Outlines and density are computed once in the unzoomed frame (so zooming never re-fits them to a thinner
  // sample) and drawn under a matrix transform; deferred so they never block hover or the zoom tween.
  const bx = scaleLinear().domain([dom[0], dom[1]]).range([m.l, m.l + pw]);
  const by = scaleLinear().domain([dom[2], dom[3]]).range([m.t + ph, m.t]);
  const bpx = useMemo(() => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = bx(xs[i]);
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xs, n, dom, m.l, pw]);
  const bpy = useMemo(() => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = by(ys[i]);
    return a;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ys, n, dom, m.t, ph]);
  const dpx = useDeferredValue(bpx);
  const dpy = useDeferredValue(bpy);
  const geo = useMemo(() => {
    const none = { hulls: [] as { key: string; d: string; c: [number, number]; label: string; color: string }[], contours: [] as { d: string; o: number; color: string }[] };
    if (!hulls && density === "none") return none;
    const hs = none.hulls;
    if (hulls) {
      const smooth = d3line().curve(curveCatmullRomClosed.alpha(0.6));
      groups.forEach((g, k) => {
        if (!visible[k]) return;
        const pts: [number, number][] = [];
        for (const i of members[k]) pts.push([dpx[i], dpy[i]]);
        if (pts.length < 8) return;
        const mx = pts.reduce((a, p) => a + p[0], 0) / pts.length;
        const my = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const dist = pts.map((p) => Math.hypot(p[0] - mx, p[1] - my)).sort((a, b) => a - b);
        const cut = dist[Math.floor(dist.length * 0.88)];
        const core = pts.filter((p) => Math.hypot(p[0] - mx, p[1] - my) <= cut);
        const hull = polygonHull(core);
        if (!hull || hull.length < 3) return;
        hs.push({ key: g.key, d: smooth(hull) ?? "", c: polygonCentroid(hull), label: g.label, color: g.color });
      });
    }
    const cs = none.contours;
    if (density !== "none") {
      const path = geoPath();
      const make = (idx: number[], thresholds: number, color: string) => {
        if (idx.length < 12) return;
        const c = contourDensity<number>().x((i) => dpx[i]).y((i) => dpy[i]).size([W, H]).bandwidth(13).cellSize(4).thresholds(thresholds)(idx);
        c.forEach((ct, li) => cs.push({ d: path(ct) ?? "", o: 0.22 + (li / Math.max(1, c.length - 1)) * 0.5, color }));
      };
      if (density === "all") {
        const idx: number[] = [];
        for (let i = 0; i < n; i++) if (visible[gi[i]]) idx.push(i);
        make(idx, 7, "var(--gold)");
      } else {
        groups.forEach((g, k) => {
          if (visible[k]) make(Array.from(members[k]), 4, g.color);
        });
      }
    }
    return { hulls: hs, contours: cs };
  }, [hulls, density, dpx, dpy, groups, visible, members, gi, n, W, H]);
  // base frame -> current (zoomed) frame
  const zx = (sx(dom[1]) - sx(dom[0])) / (bx(dom[1]) - bx(dom[0]) || 1);
  const zy = (sy(dom[3]) - sy(dom[2])) / (by(dom[3]) - by(dom[2]) || 1);
  const zoomM = `matrix(${zx} 0 0 ${zy} ${sx(dom[0]) - zx * bx(dom[0])} ${sy(dom[2]) - zy * by(dom[2])})`;

  // hover
  const idxOfHit = (mx: number, my: number): number | null => {
    const f = tree.find(mx, my, HIT);
    return f === undefined ? null : f;
  };
  const tipForPoint = (i: number, ax: number, ay: number, say = false) => {
    const p = points[i];
    const g = groups[gi[i]];
    const content: TipContent = tooltip
      ? tooltip(p, g)
      : { title: g.label, rows: [{ label: xLabel ?? "x", value: (xFormat ?? fmtNum)(p.x), color: g.color, swatch: "dot", strong: true }, { label: yLabel ?? "y", value: (yFormat ?? fmtNum)(p.y) }, ...(p.id ? [{ label: "id", value: p.id }] : [])] };
    show(ax, ay, content, { announce: say });
  };

  // keyboard stops: you first, then each visible group
  const stops = useMemo(() => {
    const list: { kind: "you" | "group"; k: number }[] = [];
    if (you) list.push({ kind: "you", k: -1 });
    groups.forEach((_, k) => visible[k] && list.push({ kind: "group", k }));
    return list;
  }, [you, groups, visible]);
  const stopTip = (si: number) => {
    const st = stops[si];
    if (!st) return;
    if (st.kind === "you" && you) {
      show(sx(you.x), sy(you.y), { title: you.label ?? "You are here", rows: [{ label: xLabel ?? "x", value: (xFormat ?? fmtNum)(you.x), color: "var(--cream)", swatch: "dot", strong: true }, { label: yLabel ?? "y", value: (yFormat ?? fmtNum)(you.y) }] }, { announce: true });
      onSpot(null);
      return;
    }
    const g = groups[st.k];
    let cx = 0;
    let cy = 0;
    for (const i of members[st.k]) {
      cx += px[i];
      cy += py[i];
    }
    const c = members[st.k].length || 1;
    show(cx / c, cy / c, { title: g.label, rows: [{ label: "points", value: int(counts[st.k]), color: g.color, swatch: "dot", strong: true }, { label: "of all", value: pct(n ? counts[st.k] / n : 0, 1) }] }, { announce: true });
    onSpot(g.key);
  };
  useChartKeys({
    onKey: (e) => {
      if (e.key === "Escape") {
        setZoomed(null);
        setKbd(null);
        onSpot(null);
        return false;
      }
      const nx = navIndex(e.key, kbd ?? -1, stops.length);
      if (nx === null) return false;
      setKbd(nx);
      setHoverIdx(null);
      stopTip(nx);
      return true;
    },
    onFocus: () => {
      if (!stops.length) return;
      setKbd(0);
      stopTip(0);
    },
    onBlur: () => {
      setKbd(null);
      onSpot(null);
    },
  });

  // brush zoom
  const dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    if (!zoom || e.button !== 0 || e.pointerType === "touch") return;
    const [x, y] = localXY(e, svgRef.current);
    dragging.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
    setBrush({ x0: x, y0: y, x1: x, y1: y });
    hide();
  };
  const onMove = (e: React.PointerEvent) => {
    const [x, y] = localXY(e, svgRef.current);
    if (dragging.current) {
      setBrush((b) => (b ? { ...b, x1: x, y1: y } : b));
      return;
    }
    const i = idxOfHit(x, y);
    setHoverIdx((prev) => (prev === i ? prev : i));
    if (i === null) hide();
    else tipForPoint(i, px[i], py[i]);
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragging.current = false;
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (brush && Math.abs(brush.x1 - brush.x0) > 12 && Math.abs(brush.y1 - brush.y0) > 12) {
      const [xa, xb] = [sx.invert(Math.min(brush.x0, brush.x1)), sx.invert(Math.max(brush.x0, brush.x1))];
      const [ya, yb] = [sy.invert(Math.max(brush.y0, brush.y1)), sy.invert(Math.min(brush.y0, brush.y1))];
      setZoomed([xa, xb, ya, yb]);
      setHoverIdx(null);
    }
    setBrush(null);
  };

  const yp = you ? { x: sx(you.x), y: sy(you.y) } : null;
  const youIn = yp && yp.x >= m.l - 4 && yp.x <= m.l + pw + 4 && yp.y >= m.t - 4 && yp.y <= m.t + ph + 4;
  const chipText = (you?.label ?? "You are here").toUpperCase();
  const chipW = monoWidth(chipText, 9.5) + chipText.length * 1.1 + 20;
  const chipRight = yp ? yp.x + 18 + chipW < W - 4 : true;
  const chipBelow = yp ? yp.y - 34 < m.t : false;

  return (
    <>
      {useCanvas && <PointsCanvas px={px} py={py} members={members} colors={colors} alpha={alpha} delays={delays} r={r} w={W} h={H} plot={plot} />}
      <svg ref={svgRef} width={W} height={H} aria-hidden="true" style={{ position: "relative" }} onPointerLeave={(e) => { if (e.pointerType === "touch") return; if (!dragging.current) { setHoverIdx(null); hide(); } }}>
        <defs>
          <clipPath id={`${uid}sc`}>
            <rect x={m.l - 3} y={m.t - 3} width={pw + 6} height={ph + 6} />
          </clipPath>
        </defs>
        {!hideAxes && (
          <>
            <XAxis scale={sx} y0={m.t} y1={m.t + ph} ticks={sx.ticks(Math.max(3, Math.round(pw / 90)))} format={(v) => (xFormat ?? fmtNum)(v)} baseline={false} />
            <YAxis scale={sy} x0={m.l} x1={m.l + pw} ticks={sy.ticks(Math.max(3, Math.round(ph / 60)))} format={(v) => (yFormat ?? fmtNum)(v)} baseline={false} />
          </>
        )}
        {hideAxes && <rect x={m.l} y={m.t} width={pw} height={ph} fill="none" stroke="var(--line)" rx={4} />}
        {xLabel && (
          <text className={s.cap} x={m.l + pw} y={H - 4} textAnchor="end">
            {xLabel} {"→"}
          </text>
        )}
        {yLabel && (
          <text className={s.cap} x={m.l - (hideAxes ? 0 : 36)} y={m.t - 1} dy="-0.3em" textAnchor="start">
            {"↑"} {yLabel}
          </text>
        )}

        <g pointerEvents="none" clipPath={`url(#${uid}sc)`}>
          <g transform={zoomM}>
            {geo.contours.map((c, i) => (
              <path key={i} d={c.d} fill="none" stroke={c.color} strokeWidth={1} opacity={c.o} vectorEffect="non-scaling-stroke" />
            ))}
            {geo.hulls.map((h) => (
              <path key={h.key} d={h.d} fill={h.color} fillOpacity={0.06} stroke={h.color} strokeOpacity={0.5} strokeWidth={1.2} vectorEffect="non-scaling-stroke" className={s.fadeIn} style={{ ["--d" as string]: "900ms" }} />
            ))}
          </g>
        </g>
        <g pointerEvents="none">
          {geo.hulls.map((h) => {
            const lx = zx * h.c[0] + (sx(dom[0]) - zx * bx(dom[0]));
            const ly = zy * h.c[1] + (sy(dom[2]) - zy * by(dom[2]));
            if (lx < m.l || lx > m.l + pw || ly < m.t || ly > m.t + ph) return null;
            return (
              <text key={h.key} className={`${s.cap} ${s.halo} ${s.fadeIn}`} x={lx} y={ly} textAnchor="middle" dy="0.34em" style={{ fill: "var(--text)", ["--d" as string]: "900ms" }}>
                {h.label}
              </text>
            );
          })}
        </g>

        {!useCanvas && (
          <g clipPath={`url(#${uid}sc)`}>
            {Array.from({ length: n }, (_, i) => {
              const g = gi[i];
              if (alpha[g] < 0.01) return null;
              return <circle key={i} cx={px[i]} cy={py[i]} r={r} fill={colors[g]} opacity={alpha[g]} className={s.pop} style={{ ["--d" as string]: `${Math.round(delays[i] * 700)}ms`, transition: "opacity .25s" }} />;
            })}
          </g>
        )}

        {hoverIdx !== null && px[hoverIdx] !== undefined && px[hoverIdx] >= m.l && px[hoverIdx] <= m.l + pw && py[hoverIdx] >= m.t && py[hoverIdx] <= m.t + ph && (
          <g pointerEvents="none">
            <circle cx={px[hoverIdx]} cy={py[hoverIdx]} r={r + 5} fill="none" stroke="var(--cream)" strokeWidth={1.4} />
            <circle cx={px[hoverIdx]} cy={py[hoverIdx]} r={r + 1.2} fill={colors[gi[hoverIdx]]} stroke="var(--panel)" strokeWidth={1.5} />
          </g>
        )}

        {youIn && yp && (
          <g transform={`translate(${yp.x} ${yp.y})`} pointerEvents="none">
            <g className={s.pop} style={{ ["--d" as string]: reduced ? "0ms" : "1100ms" }}>
              {[0, 1, 2].map((k) => (
                <circle key={k} r={9} fill="none" stroke="var(--gold-hi)" strokeWidth={1.6} className={s.ripple} style={{ ["--d" as string]: `${k * 0.85}s` }} />
              ))}
              <circle r={13} fill="var(--gold)" opacity={0.2} />
              <circle r={6.5} fill="var(--cream)" stroke="var(--gold)" strokeWidth={2.6} style={{ filter: "drop-shadow(0 0 8px rgba(246,180,26,.85))" }} />
            </g>
            <g className={s.fadeIn} style={{ ["--d" as string]: "1500ms" }}>
              <line x1={0} y1={0} x2={chipRight ? 14 : -14} y2={chipBelow ? 18 : -16} stroke="var(--gold)" strokeWidth={1} opacity={0.8} />
              <g transform={`translate(${chipRight ? 14 : -14 - chipW} ${chipBelow ? 18 : -34})`}>
                <rect width={chipW} height={18} rx={9} fill="var(--gold)" />
                <text x={chipW / 2} y={9} dy="0.34em" textAnchor="middle" className={s.cap} style={{ fill: "#0a0805", fontWeight: 600 }}>
                  {chipText}
                </text>
              </g>
            </g>
          </g>
        )}

        {brush && <rect x={Math.min(brush.x0, brush.x1)} y={Math.min(brush.y0, brush.y1)} width={Math.abs(brush.x1 - brush.x0)} height={Math.abs(brush.y1 - brush.y0)} fill="var(--gold)" fillOpacity={0.08} stroke="var(--gold)" strokeOpacity={0.7} rx={3} pointerEvents="none" />}
        <rect x={m.l} y={m.t} width={pw} height={ph} fill="transparent" onPointerMove={onMove} onPointerDown={onDown} onPointerUp={onUp} onDoubleClick={() => setZoomed(null)} style={{ cursor: zoom ? "crosshair" : "default", touchAction: "pan-y" }} />
      </svg>
      {zoomed && (
        <div className={s.plotOverlay}>
          <button type="button" className={s.btnGhost} onClick={() => setZoomed(null)}>
            Reset zoom
          </button>
        </div>
      )}
    </>
  );
}

const fmtNum = (v: number) => String(Math.round(v * 100) / 100);
