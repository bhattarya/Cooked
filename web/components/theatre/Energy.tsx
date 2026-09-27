"use client";

import { motion } from "motion/react";
import type { Step } from "@/components/agent/Pipeline";
import { STATUS_COLOR, isFinished } from "./format";
import { angleOf, arcPath, ringPath, type OrbitalLayout } from "./layout";
import styles from "./theatre.module.css";

const SPARK = "var(--gold-hi)";

// Everything drawn as lines behind the node cards: the orbit, the energy that flows from a
// finished step to the next, the spokes to the working step, and the orb's segmented bezel.
export function Energy({ l, steps, flashes, reduced }: { l: OrbitalLayout; steps: Step[]; flashes: Record<string, number>; reduced: boolean }) {
  const n = steps.length;
  const bezelR = l.orb / 2 + 22;
  const half = Math.PI / n;
  const gap = Math.min(0.09, half * 0.35);

  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0" width={l.w} height={l.h} viewBox={`0 0 ${l.w} ${l.h}`}>
      {/* orbit guides */}
      <motion.ellipse cx={l.cx} cy={l.cy} rx={l.rx} ry={l.ry} fill="none" stroke="rgba(255,220,140,0.12)" strokeWidth={1} initial={reduced ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.6, ease: "easeInOut" }} />
      <ellipse cx={l.cx} cy={l.cy} rx={l.rx + 26} ry={l.ry + 26} fill="none" stroke="rgba(255,220,140,0.16)" strokeWidth={1} strokeDasharray="1 9" strokeLinecap="round" className={reduced ? undefined : styles.drift} />

      {/* ring segments: dim until the step before them finishes, then lit, then a spark runs to the next node */}
      {steps.map((s, i) => {
        const a0 = angleOf(i, n);
        const a1 = angleOf(i + 1, n);
        const d = ringPath(l, a0, a1);
        const lit = isFinished(s.status);
        const next = steps[(i + 1) % n];
        const color = STATUS_COLOR[s.status === "pending" || s.status === "running" ? "done" : s.status];
        return (
          <g key={s.key}>
            <motion.path d={d} fill="none" stroke={color} strokeWidth={5} strokeLinecap="round" strokeOpacity={0.14} initial={false} animate={{ pathLength: lit ? 1 : 0 }} transition={{ duration: 0.9, ease: "easeInOut" }} />
            <motion.path d={d} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" initial={false} animate={{ pathLength: lit ? 1 : 0, opacity: lit ? 0.95 : 0 }} transition={{ duration: 0.9, ease: "easeInOut" }} />
            {lit && !reduced && <path d={d} pathLength={1} fill="none" stroke={SPARK} strokeWidth={2.4} strokeLinecap="round" strokeDasharray="0.035 0.965" className={next.status === "running" ? styles.spark : styles.sparkSlow} />}
          </g>
        );
      })}

      {/* spokes from the orb to whatever is working right now */}
      {steps.map((s, i) => {
        if (s.status !== "running") return null;
        const p = l.nodes[i];
        const dx = p.x - l.cx;
        const dy = p.y - l.orbY;
        const len = Math.hypot(dx, dy) || 1;
        const from = bezelR + 14;
        const to = len - l.bead / 2 - 6;
        if (to <= from) return null;
        return <line key={s.key} x1={l.cx + (dx / len) * from} y1={l.orbY + (dy / len) * from} x2={l.cx + (dx / len) * to} y2={l.orbY + (dy / len) * to} stroke={SPARK} strokeOpacity={0.6} strokeWidth={1.4} strokeLinecap="round" strokeDasharray="2 9" className={reduced ? undefined : styles.flow} />;
      })}

      {/* the orb's bezel: one arc per step, aligned with its node */}
      {n === 1 ? (
        <circle cx={l.cx} cy={l.orbY} r={bezelR} fill="none" stroke={STATUS_COLOR[steps[0].status]} strokeWidth={3} strokeOpacity={steps[0].status === "pending" ? 1 : 0.9} />
      ) : (
        steps.map((s, i) => {
          const c = angleOf(i, n);
          const d = arcPath(l.cx, l.orbY, bezelR, c - half + gap, c + half - gap);
          const lit = isFinished(s.status);
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke="rgba(255,220,140,0.16)" strokeWidth={3} strokeLinecap="round" />
              <motion.path d={d} fill="none" stroke={STATUS_COLOR[s.status === "pending" ? "done" : s.status]} strokeWidth={3} strokeLinecap="round" initial={false} animate={{ pathLength: lit || s.status === "running" ? 1 : 0, opacity: lit ? 1 : s.status === "running" ? 0.85 : 0 }} transition={{ duration: 0.8, ease: "easeOut" }} className={s.status === "running" && !reduced ? styles.pulseStroke : undefined} />
            </g>
          );
        })
      )}

      {/* one packet of energy per completion, from the node into the orb */}
      {!reduced &&
        steps.map((s, i) => {
          const f = flashes[s.key] ?? 0;
          if (!f) return null;
          const p = l.nodes[i];
          return (
            <motion.g key={`${s.key}-${f}`} initial={{ x: p.x - l.cx, y: p.y - l.orbY, opacity: 1 }} animate={{ x: 0, y: 0, opacity: [1, 1, 0] }} transition={{ duration: 0.95, ease: [0.5, 0, 0.2, 1], times: [0, 0.8, 1] }}>
              <circle cx={l.cx} cy={l.orbY} r={11} fill={STATUS_COLOR[s.status === "pending" ? "done" : s.status]} fillOpacity={0.22} />
              <circle cx={l.cx} cy={l.orbY} r={4} fill={SPARK} />
            </motion.g>
          );
        })}
    </svg>
  );
}
