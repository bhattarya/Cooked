"use client";

import { useMemo, useRef, useState } from "react";
import { ChartShell, useChart, useChartKeys } from "./ChartShell";
import { clamp01, easeInOutCubic, localXY, navIndex, useEntry } from "./hooks";
import { int, nOf, pct } from "./format";
import { ellipsize, sansWidth } from "./geometry";
import { alpha, viz } from "./tokens";
import s from "./viz.module.css";

export interface FlowNode {
  id: string;
  label: string;
  color?: string;
  /** Column index (0 = leftmost). Default: derived from the longest path into the node. */
  column?: number;
}
export interface FlowLink {
  source: string;
  target: string;
  value: number;
  n?: number;
}
export interface FlowProps {
  nodes: FlowNode[];
  links: FlowLink[];
  /** Column headings, left to right ("Major", "Pattern", "Outcome"). */
  columns?: string[];
  format?: (v: number) => string;
  /** Noun for the flowing quantity ("alumni"). */
  unit?: string;
  height?: number;
  /** Node id to keep lit while nothing is hovered. */
  highlight?: string;
  label?: string;
}

interface LNode extends FlowNode {
  col: number;
  value: number;
  inV: number;
  outV: number;
  y: number;
  h: number;
  color: string;
}
interface LLink extends FlowLink {
  s: LNode;
  t: LNode;
  w: number;
  sy: number;
  ty: number;
  color: string;
}

const NODE_W = 11;
const GAP = 12;

// Layered Sankey layout without a dependency: columns from longest path, one shared value-to-pixel
// scale, barycentre sweeps to cut crossings, then a slot on each node for every ribbon.
function layout(nodes: FlowNode[], links: FlowLink[], plotH: number): { ns: LNode[]; ls: LLink[]; ncol: number } {
  const byId = new Map<string, number>();
  nodes.forEach((n, i) => byId.set(n.id, i));
  const valid = links.filter((l) => byId.has(l.source) && byId.has(l.target) && l.value > 0 && l.source !== l.target);
  const depth = nodes.map((n) => n.column ?? 0);
  const fixed = nodes.map((n) => n.column !== undefined);
  for (let it = 0; it < nodes.length; it++)
    for (const l of valid) {
      const a = byId.get(l.source)!;
      const b = byId.get(l.target)!;
      if (!fixed[b] && depth[b] < depth[a] + 1) depth[b] = depth[a] + 1;
    }
  const ncol = Math.max(1, ...depth.map((d) => d + 1));
  const inV = nodes.map(() => 0);
  const outV = nodes.map(() => 0);
  for (const l of valid) {
    outV[byId.get(l.source)!] += l.value;
    inV[byId.get(l.target)!] += l.value;
  }
  const roots = nodes.map((_, i) => i).filter((i) => depth[i] === 0);
  const ns: LNode[] = nodes.map((n, i) => ({ ...n, col: depth[i], value: Math.max(inV[i], outV[i]), inV: inV[i], outV: outV[i], y: 0, h: 0, color: n.color ?? (depth[i] === 0 ? viz(roots.indexOf(i)) : "var(--muted)") }));
  const cols: LNode[][] = Array.from({ length: ncol }, (_, c) => ns.filter((n) => n.col === c));
  const ky = Math.min(...cols.filter((c) => c.length).map((c) => (plotH - GAP * (c.length - 1)) / Math.max(1e-9, c.reduce((a, n) => a + n.value, 0))));
  const stack = (col: LNode[]) => {
    const tot = col.reduce((a, n) => a + n.value * ky, 0) + GAP * Math.max(0, col.length - 1);
    let y = (plotH - tot) / 2;
    for (const n of col) {
      n.y = y;
      n.h = Math.max(2, n.value * ky);
      y += n.h + GAP;
    }
  };
  cols.forEach(stack);
  const ls: LLink[] = valid.map((l) => {
    const s0 = ns[byId.get(l.source)!];
    const t0 = ns[byId.get(l.target)!];
    return { ...l, s: s0, t: t0, w: l.value * ky, sy: 0, ty: 0, color: s0.color };
  });
  const center = (n: LNode) => n.y + n.h / 2;
  for (let pass = 0; pass < 8; pass++) {
    const fwd = pass % 2 === 0;
    const idx = cols.map((_, i) => i);
    const order = fwd ? idx.slice(1) : idx.slice(0, -1).reverse();
    for (const c of order) {
      const key = new Map<LNode, number>();
      for (const n of cols[c]) {
        const rel = ls.filter((l) => (fwd ? l.t === n : l.s === n));
        const wsum = rel.reduce((a, l) => a + l.value, 0);
        key.set(n, wsum ? rel.reduce((a, l) => a + center(fwd ? l.s : l.t) * l.value, 0) / wsum : center(n));
      }
      cols[c].sort((a, b) => key.get(a)! - key.get(b)!);
      stack(cols[c]);
    }
  }
  for (const n of ns) {
    let o = n.y;
    for (const l of ls.filter((x) => x.s === n).sort((a, b) => a.t.y - b.t.y)) {
      l.sy = o;
      o += l.w;
    }
    let i = n.y;
    for (const l of ls.filter((x) => x.t === n).sort((a, b) => a.s.y - b.s.y)) {
      l.ty = i;
      i += l.w;
    }
  }
  return { ns, ls, ncol };
}

export function Flow({ nodes, links, columns, format = int, unit, height = 340, highlight, label }: FlowProps) {
  const biggest = links.reduce<FlowLink | undefined>((a, l) => (!a || l.value > a.value ? l : a), undefined);
  const lab = (id: string) => nodes.find((n) => n.id === id)?.label ?? id;
  const summary = label ?? (biggest ? `The largest flow is ${lab(biggest.source)} to ${lab(biggest.target)} at ${format(biggest.value)}${unit ? ` ${unit}` : ""}, among ${links.length} flows.` : "No flows.");
  return (
    <ChartShell height={height} empty={!links.length} label={summary} hint="Arrow keys step through nodes, then flows." table={{ caption: summary, head: ["From", "To", unit ?? "Value", "n"], rows: links.map((l) => [lab(l.source), lab(l.target), format(l.value), l.n ?? ""]) }}>
      <FlowBody nodes={nodes} links={links} columns={columns} format={format} unit={unit} highlight={highlight} />
    </ChartShell>
  );
}

function FlowBody({ nodes, links, columns, format, unit, highlight }: { nodes: FlowNode[]; links: FlowLink[]; columns?: string[]; format: (v: number) => string; unit?: string; highlight?: string }) {
  const { width: W, height: H, inView, uid, show, hide } = useChart();
  const svgRef = useRef<SVGSVGElement>(null);
  const [hl, setHl] = useState<{ kind: "node" | "link"; i: number } | null>(null);
  const [kbd, setKbd] = useState<number | null>(null);
  const p = useEntry(inView, { duration: 1500, ease: easeInOutCubic });

  const narrow = W < 480;
  const m = narrow ? { l: 8, r: 8, t: columns ? 26 : 8, b: 8 } : { l: Math.min(150, W * 0.26), r: Math.min(140, W * 0.26), t: columns ? 26 : 8, b: 8 };
  const pw = Math.max(60, W - m.l - m.r);
  const ph = Math.max(60, H - m.t - m.b);
  const { ns, ls, ncol } = useMemo(() => layout(nodes, links, ph), [nodes, links, ph]);
  const colX = (c: number) => m.l + (ncol > 1 ? (c * (pw - NODE_W)) / (ncol - 1) : 0);
  const colTotals = useMemo(() => Array.from({ length: ncol }, (_, c) => ns.filter((n) => n.col === c).reduce((a, n) => a + n.value, 0)), [ns, ncol]);

  const focusNode = hl?.kind === "node" ? ns[hl.i] : highlight && !hl ? ns.find((n) => n.id === highlight) : undefined;
  const litLink = (l: LLink, i: number) => (hl?.kind === "link" ? hl.i === i : focusNode ? l.s === focusNode || l.t === focusNode : true);
  const litNode = (n: LNode) => {
    if (hl?.kind === "link") return ls[hl.i].s === n || ls[hl.i].t === n;
    if (focusNode) return n === focusNode || ls.some((l) => (l.s === focusNode && l.t === n) || (l.t === focusNode && l.s === n));
    return true;
  };
  const anyFocus = hl !== null || !!focusNode;

  const pathOf = (l: LLink) => {
    const x0 = colX(l.s.col) + NODE_W;
    const x1 = colX(l.t.col);
    const y0 = l.sy + l.w / 2 + m.t;
    const y1 = l.ty + l.w / 2 + m.t;
    const mx = (x0 + x1) / 2;
    return `M${x0},${y0}C${mx},${y0} ${mx},${y1} ${x1},${y1}`;
  };
  const total = Math.max(1, colTotals[0] ?? 1);
  const items = ns.length + ls.length;
  const tipNode = (i: number, ax: number, ay: number, say = false) => {
    const n = ns[i];
    show(ax, ay, { title: n.label, rows: [{ label: unit ?? "total", value: format(n.value), color: n.color, swatch: "box", strong: true }, ...(n.inV ? [{ label: "coming in", value: format(n.inV) }] : []), ...(n.outV ? [{ label: "going out", value: format(n.outV) }] : []), { label: "of column", value: pct(n.value / (colTotals[n.col] || 1), 1) }] }, { announce: say });
  };
  const tipLink = (i: number, ax: number, ay: number, say = false) => {
    const l = ls[i];
    show(ax, ay, { title: `${l.s.label} → ${l.t.label}`, rows: [{ label: unit ?? "flow", value: format(l.value), color: l.color, swatch: "box", strong: true }, { label: `of ${l.s.label}`, value: pct(l.value / (l.s.value || 1), 1) }, { label: `of ${l.t.label}`, value: pct(l.value / (l.t.value || 1), 1) }], note: l.n !== undefined ? nOf(l.n) : undefined }, { announce: say });
  };
  const goto = (k: number, say: boolean) => {
    if (k < ns.length) {
      setHl({ kind: "node", i: k });
      const n = ns[k];
      tipNode(k, colX(n.col) + NODE_W + 6, n.y + m.t + n.h / 2, say);
    } else {
      const i = k - ns.length;
      setHl({ kind: "link", i });
      const l = ls[i];
      tipLink(i, (colX(l.s.col) + colX(l.t.col)) / 2, (l.sy + l.ty) / 2 + l.w / 2 + m.t, say);
    }
  };
  useChartKeys({
    onKey: (e) => {
      const nx = navIndex(e.key, kbd ?? -1, items);
      if (nx === null) return false;
      setKbd(nx);
      goto(nx, true);
      return true;
    },
    onFocus: () => {
      if (!items) return;
      setKbd(0);
      goto(0, true);
    },
    onBlur: () => {
      setKbd(null);
      setHl(null);
    },
  });

  return (
    <svg ref={svgRef} width={W} height={H} aria-hidden="true" onPointerLeave={(e) => { if (e.pointerType === "touch") return; setHl(null); hide(); }}>
      <defs>
        <clipPath id={`${uid}fl`}>
          <rect x={0} y={0} width={W * p} height={H} />
        </clipPath>
      </defs>
      {columns?.map((c, i) => (
        <text key={c} className={s.cap} x={colX(i) + NODE_W / 2} y={10} textAnchor="middle">
          {c}
        </text>
      ))}
      <g clipPath={`url(#${uid}fl)`}>
        {ls.map((l, i) => {
          const on = litLink(l, i);
          const d = pathOf(l);
          return (
            <g key={`${l.source}>${l.target}`}>
              <path d={d} fill="none" stroke={l.color} strokeWidth={Math.max(1.5, l.w)} strokeOpacity={anyFocus ? (on ? 0.6 : 0.07) : 0.3} style={{ transition: "stroke-opacity .2s" }} />
              <path d={d} fill="none" stroke="transparent" strokeWidth={Math.max(14, l.w)} onPointerEnter={() => setHl({ kind: "link", i })} onPointerMove={(e) => { const [x, y] = localXY(e, svgRef.current); tipLink(i, x, y); }} />
            </g>
          );
        })}
      </g>
      {ns.map((n, i) => {
        const x = colX(n.col);
        const on = litNode(n);
        const fade = clamp01(p * 1.5 - (ncol > 1 ? n.col / (ncol - 1) : 0) * 0.9);
        const last = n.col === ncol - 1 && ncol > 1;
        const first = n.col === 0 && ncol > 1;
        // wide: first column's labels sit left of the nodes, last column's right, middle ones on pills over the ribbons.
        // narrow: every label is a pill, and the last column's flip to the node's left so they stay inside the frame.
        const onLeft = narrow ? last : first;
        const pill = narrow || (!first && !last);
        const tx = onLeft ? x - (pill ? 9 : 10) : x + NODE_W + 8;
        const room = narrow ? Math.max(60, (pw - NODE_W) / Math.max(1, ncol - 1) - 24) : first ? m.l - 14 : last ? m.r - 16 : 120;
        const pw2 = Math.min(room, Math.max(sansWidth(n.label, 11.5), 64));
        const cy = n.y + m.t + n.h / 2;
        return (
          <g key={n.id} style={{ opacity: (anyFocus && !on ? 0.3 : 1) * fade, transition: "opacity .2s" }} onPointerEnter={() => setHl({ kind: "node", i })} onPointerMove={(e) => { const [px, py] = localXY(e, svgRef.current); tipNode(i, px, py); }}>
            <rect x={x} y={n.y + m.t} width={NODE_W} height={n.h} rx={3} fill={n.color} style={{ filter: focusNode === n ? `drop-shadow(0 0 8px ${alpha(n.color, 0.7)})` : undefined }} />
            <rect x={x - 6} y={n.y + m.t - 2} width={NODE_W + 12} height={n.h + 4} fill="transparent" />
            {pill && <rect x={onLeft ? tx - pw2 - 5 : tx - 5} y={cy - (n.h > 26 && !narrow ? 17 : 10)} width={pw2 + 10} height={n.h > 26 && !narrow ? 37 : 20} rx={6} fill="rgba(19,16,10,.82)" stroke="var(--line)" />}
            <text className={s.cat} x={tx} y={cy} dy={n.h > 26 && !narrow ? "-0.15em" : "0.34em"} textAnchor={onLeft ? "end" : "start"} fontSize={11.5} style={{ fill: focusNode === n ? "var(--text)" : undefined }}>
              {ellipsize(n.label, room, 11.5)}
            </text>
            {n.h > 26 && !narrow && (
              <text className={s.val} x={tx} y={cy} dy="1.25em" textAnchor={onLeft ? "end" : "start"} fontSize={10} style={{ fill: "var(--dim)" }}>
                {format(n.value)} {"\u00B7"} {pct(n.value / total)}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
