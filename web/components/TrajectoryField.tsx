"use client";

import { motion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Alum, PatternName, Term } from "@/lib/types";
import { PATTERN_COLOR } from "./ui";

const MAX_T = 16;
const MAX_C = 150;
const PATTERNS: PatternName[] = ["smooth", "rough patch", "part-time grind", "withdrawal spiral", "stop-out"];

const cumulative = (terms: Term[]) => {
  const pts = [0];
  terms.forEach((t, i) => pts.push(pts[i] + t[1]));
  return pts;
};

interface Props {
  alumni: Alum[];
  height?: number;
  highlight?: Set<string>;
  focus?: { terms: Term[]; planLoad: number; color?: string } | null;
  interactive?: boolean;
  showAxes?: boolean;
  intro?: boolean;
  isolate?: PatternName | null;
  onIsolate?: (p: PatternName | null) => void;
}

// Every alum as a line: cumulative credits earned (y) after each regular term (x).
export function TrajectoryField({ alumni, height = 360, highlight, focus, interactive = true, showAxes = true, intro = true, isolate: isoProp, onIsolate }: Props) {
  const wrap = useRef<HTMLDivElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [w, setW] = useState(800);
  const [isoLocal, setIsoLocal] = useState<PatternName | null>(null);
  const isolate = isoProp !== undefined ? isoProp : isoLocal;
  const setIsolate = onIsolate ?? setIsoLocal;
  const [hover, setHover] = useState<{ x: number; y: number; a: Alum } | null>(null);

  const pad = showAxes ? { l: 44, r: 16, t: 16, b: 30 } : { l: 0, r: 0, t: 0, b: 0 };
  const X = (t: number) => pad.l + (t / MAX_T) * (w - pad.l - pad.r);
  const Y = (c: number) => height - pad.b - (Math.min(c, MAX_C) / MAX_C) * (height - pad.t - pad.b);

  const lines = useMemo(() => alumni.map((a) => ({ a, pts: cumulative(a.terms) })), [alumni]);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    cv.width = w * dpr;
    cv.height = height * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    const start = performance.now();
    const dur = intro ? 1800 : 0;

    const draw = (now: number) => {
      const p = dur ? Math.min(1, (now - start) / dur) : 1;
      const ease = 1 - Math.pow(1 - p, 3);
      const tMax = ease * MAX_T;
      ctx.clearRect(0, 0, w, height);
      if (showAxes) {
        // cooked zone: past 10 regular terms
        ctx.fillStyle = "rgba(255,46,77,0.045)";
        ctx.fillRect(X(10), pad.t, X(MAX_T) - X(10), height - pad.t - pad.b);
      }
      const pass = (hl: boolean) => {
        for (const { a, pts } of lines) {
          const isHl = !!highlight?.has(a.id);
          if (hl !== isHl) continue;
          const dim = (isolate && a.pattern !== isolate) || (highlight && highlight.size && !isHl);
          ctx.strokeStyle = PATTERN_COLOR[a.pattern];
          ctx.globalAlpha = isHl ? 0.55 : dim ? 0.025 : a.pattern === "smooth" ? 0.07 : 0.16;
          ctx.lineWidth = isHl ? 1.2 : 1;
          ctx.beginPath();
          for (let i = 0; i < pts.length; i++) {
            if (i > tMax) break;
            const jitter = ((a.id.charCodeAt(5) + a.id.charCodeAt(8)) % 7) * 0.35;
            const x = X(i) + jitter * 0.3;
            const y = Y(pts[i]) + jitter - 1;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
          }
          ctx.stroke();
        }
      };
      pass(false);
      pass(true);
      ctx.globalAlpha = 1;
      if (p < 1) raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, w, height, highlight, isolate, intro]);

  const focusPts = focus ? cumulative(focus.terms) : null;
  const focusPath = focusPts ? focusPts.map((c, i) => `${i ? "L" : "M"}${X(i)},${Y(c)}`).join(" ") : "";
  const projPath = (() => {
    if (!focusPts) return "";
    const k = focusPts.length - 1;
    let c = focusPts[k];
    const out = [`M${X(k)},${Y(c)}`];
    for (let t = k + 1; t <= MAX_T && c < 125; t++) {
      c += focus!.planLoad;
      out.push(`L${X(t)},${Y(c)}`);
    }
    return out.join(" ");
  })();
  const fc = "#ffffff";
  const pc = focus?.color ?? "#ffffff";

  const onMove = (e: React.MouseEvent) => {
    if (!interactive) return;
    const r = wrap.current!.getBoundingClientRect();
    const mx = e.clientX - r.left;
    const my = e.clientY - r.top;
    let best: { d: number; a: Alum } | null = null;
    const pool = highlight?.size ? lines.filter((l) => highlight.has(l.a.id)) : lines;
    for (const { a, pts } of pool) {
      if (isolate && a.pattern !== isolate) continue;
      const i = Math.round(((mx - pad.l) / (w - pad.l - pad.r)) * MAX_T);
      if (i < 0 || i >= pts.length) continue;
      const d = Math.abs(Y(pts[i]) - my);
      if (!best || d < best.d) best = { d, a };
    }
    setHover(best && best.d < 8 ? { x: mx, y: my, a: best.a } : null);
  };

  return (
    <div className="relative select-none">
      <div ref={wrap} className="relative" style={{ height }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
        <canvas ref={canvas} style={{ width: w, height }} className="absolute inset-0" />
        <svg width={w} height={height} className="absolute inset-0 overflow-visible">
          {showAxes && (
            <g className="num" fontSize={10} fill="var(--dim)">
              {[0, 30, 60, 90, 120, 150].map((c) => (
                <g key={c}>
                  <line x1={pad.l} x2={w - pad.r} y1={Y(c)} y2={Y(c)} stroke={c === 120 ? "rgba(45,212,191,0.35)" : "var(--line)"} strokeDasharray={c === 120 ? "4 4" : undefined} />
                  <text x={pad.l - 8} y={Y(c) + 3} textAnchor="end">
                    {c}
                  </text>
                </g>
              ))}
              {[0, 2, 4, 6, 8, 10, 12, 14, 16].map((t) => (
                <text key={t} x={X(t)} y={height - 10} textAnchor="middle">
                  {t / 2}y
                </text>
              ))}
              <line x1={X(8)} x2={X(8)} y1={pad.t} y2={height - pad.b} stroke="rgba(255,255,255,0.12)" strokeDasharray="2 4" />
              <line x1={X(10)} x2={X(10)} y1={pad.t} y2={height - pad.b} stroke="rgba(255,46,77,0.5)" strokeDasharray="2 4" />
              <text x={X(10) + 6} y={pad.t + 12} fill="#ff2e4d" fontSize={10}>
                cooked zone · past 5 years
              </text>
              <text x={w - pad.r} y={Y(120) - 6} textAnchor="end" fill="rgba(45,212,191,0.7)">
                120 credits · degree
              </text>
            </g>
          )}
          {focusPts && (
            <g>
              <motion.path
                d={projPath}
                fill="none"
                stroke={pc}
                strokeWidth={2}
                strokeDasharray="5 5"
                strokeOpacity={0.85}
              />
              <motion.path
                d={focusPath}
                fill="none"
                stroke={fc}
                strokeWidth={3}
                strokeLinecap="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.4, ease: "easeInOut" }}
                style={{ filter: `drop-shadow(0 0 6px ${fc})` }}
              />
              <circle cx={X(focusPts.length - 1)} cy={Y(focusPts[focusPts.length - 1])} r={5} fill={fc} />
              <g transform={`translate(${X(focusPts.length - 1) + 10},${Y(focusPts[focusPts.length - 1]) - 14})`}>
                <rect x={0} y={-11} width={34} height={17} rx={8.5} fill="#fff" />
                <text x={17} y={1.5} textAnchor="middle" fontSize={10} fontWeight={600} fill="#07080b">
                  you
                </text>
              </g>
              <circle cx={X(focusPts.length - 1)} cy={Y(focusPts[focusPts.length - 1])} r={10} fill="none" stroke={fc} strokeOpacity={0.4}>
                <animate attributeName="r" values="6;16" dur="1.6s" repeatCount="indefinite" />
                <animate attributeName="stroke-opacity" values="0.6;0" dur="1.6s" repeatCount="indefinite" />
              </circle>
            </g>
          )}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute z-10 min-w-44 rounded-lg border border-line-2 bg-panel-2/95 px-3 py-2 text-xs shadow-2xl backdrop-blur"
            style={{ left: Math.min(hover.x + 14, w - 190), top: Math.max(hover.y - 70, 0) }}
          >
            <div className="num text-muted">{hover.a.id}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PATTERN_COLOR[hover.a.pattern] }} />
              {hover.a.pattern}
            </div>
            <div className="num mt-1 text-muted">
              {hover.a.ttd}y · {hover.a.work} h/wk · {hover.a.cooked ? <span className="text-hot">cooked</span> : "on time"}
            </div>
          </div>
        )}
      </div>
      {interactive && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {PATTERNS.map((p) => {
            const n = alumni.filter((a) => a.pattern === p).length;
            const on = isolate === p;
            return (
              <button
                key={p}
                onMouseEnter={() => setIsolate(p)}
                onMouseLeave={() => setIsolate(null)}
                onClick={() => setIsolate(on ? null : p)}
                className="flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition"
                style={{ borderColor: on ? PATTERN_COLOR[p] : "var(--line)", color: on ? "var(--text)" : "var(--muted)" }}
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: PATTERN_COLOR[p] }} />
                {p}
                <span className="num text-dim">{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
