"use client";

import { motion } from "motion/react";
import type { SurvivalPoint } from "@/lib/engine";
import type { CliffBin } from "@/lib/types";

// Share of simulated futures still not cooked after each term.
export function SurvivalChart({
  series,
  height = 220,
  width = 520,
}: {
  series: { key: string; label: string; color: string; points: SurvivalPoint[]; dashed?: boolean }[];
  height?: number;
  width?: number;
}) {
  const pad = { l: 40, r: 70, t: 14, b: 28 };
  const T = Math.max(...series.map((s) => s.points.length)) - 1;
  const X = (t: number) => pad.l + (t / T) * (width - pad.l - pad.r);
  const Y = (v: number) => pad.t + (1 - v) * (height - pad.t - pad.b);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
      <g className="num" fontSize={10} fill="var(--dim)">
        {[0, 0.25, 0.5, 0.75, 1].map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={width - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
            <text x={pad.l - 8} y={Y(v) + 3} textAnchor="end">
              {v * 100}%
            </text>
          </g>
        ))}
        {series[0]?.points.map((p) =>
          p.t % 2 === 0 ? (
            <text key={p.t} x={X(p.t)} y={height - 8} textAnchor="middle">
              {p.t === 0 ? "now" : `+${p.t}`}
            </text>
          ) : null,
        )}
      </g>
      {series.map((s, si) => {
        const d = s.points.map((p, i) => `${i ? `L${X(p.t)},${Y(s.points[i - 1].alive)} ` : "M"}${X(p.t)},${Y(p.alive)}`).join(" ");
        const last = s.points[s.points.length - 1];
        return (
          <g key={s.key}>
            <motion.path
              d={d}
              fill="none"
              stroke={s.color}
              strokeWidth={s.dashed ? 1.5 : 2.5}
              strokeDasharray={s.dashed ? "4 4" : undefined}
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ duration: 1.4, delay: si * 0.25, ease: "easeInOut" }}
              style={{ filter: s.dashed ? undefined : `drop-shadow(0 0 5px ${s.color}90)` }}
            />
            <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.2 + si * 0.25 }}>
              <circle cx={X(last.t)} cy={Y(last.alive)} r={3.5} fill={s.color} />
              <text x={X(last.t) + 8} y={Y(last.alive) + 4} fontSize={11} fill={s.color} className="num">
                {Math.round(last.alive * 100)}%
              </text>
              <text x={X(last.t) + 8} y={Y(last.alive) + 16} fontSize={9} fill="var(--dim)">
                {s.label}
              </text>
            </motion.g>
          </g>
        );
      })}
    </svg>
  );
}

// The load cliff: cooked rate by average credits per term, with the student's pace marked.
export function CliffChart({ bins, current, plan, height = 230 }: { bins: CliffBin[]; current: number; plan: number; height?: number }) {
  const width = 520;
  const pad = { l: 36, r: 12, t: 24, b: 44 };
  const bw = (width - pad.l - pad.r) / bins.length;
  const Y = (v: number) => pad.t + (1 - v) * (height - pad.t - pad.b);
  const binOf = (x: number) => bins.findIndex((b) => x > (b.lo === 0 ? -1 : b.lo) && x <= b.hi);
  const ci = binOf(current);
  const pi = binOf(plan);
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full overflow-visible">
      {[0, 0.5, 1].map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={width - pad.r} y1={Y(v)} y2={Y(v)} stroke="var(--line)" />
          <text x={pad.l - 6} y={Y(v) + 3} textAnchor="end" fontSize={10} fill="var(--dim)" className="num">
            {v * 100}%
          </text>
        </g>
      ))}
      {bins.map((b, i) => {
        const v = b.cooked ?? 0;
        const x = pad.l + i * bw + 8;
        const hot = v >= 0.5;
        const isC = i === ci;
        const isP = i === pi && pi !== ci;
        return (
          <g key={b.label}>
            <motion.rect
              x={x}
              width={bw - 16}
              rx={6}
              initial={{ y: Y(0), height: 0 }}
              animate={{ y: Y(v), height: Y(0) - Y(v) }}
              transition={{ duration: 0.9, delay: i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              fill={hot ? "#ff2e4d" : v >= 0.2 ? "#ffb020" : "#2dd4bf"}
              fillOpacity={isC || isP ? 0.95 : 0.35}
              stroke={isC ? "#fff" : isP ? "#2dd4bf" : "none"}
              strokeWidth={1.5}
            />
            <text x={x + (bw - 16) / 2} y={Y(v) - 7} textAnchor="middle" fontSize={12} fill="var(--text)" className="num">
              {b.cooked === null ? "–" : `${Math.round(v * 100)}%`}
            </text>
            <text x={x + (bw - 16) / 2} y={height - 26} textAnchor="middle" fontSize={11} fill="var(--muted)" className="num">
              {b.label}
            </text>
            <text x={x + (bw - 16) / 2} y={height - 12} textAnchor="middle" fontSize={9} fill="var(--dim)" className="num">
              n={b.n}
            </text>
            {isC && (
              <text x={x + (bw - 16) / 2} y={pad.t - 10} textAnchor="middle" fontSize={10} fill="#fff">
                you now
              </text>
            )}
            {isP && (
              <text x={x + (bw - 16) / 2} y={pad.t - 10} textAnchor="middle" fontSize={10} fill="#2dd4bf">
                your plan
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
