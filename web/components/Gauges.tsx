"use client";

import { motion } from "motion/react";
import { Counter, Evidence, riskColor } from "./ui";

// Half-ring risk gauge that sweeps and recolours as risk changes.
export function HeatGauge({ risk, n, tr, label = "risk of getting cooked" }: { risk: number; n: number; tr: string; label?: string }) {
  const R = 78;
  const C = Math.PI * R;
  const c = riskColor(risk);
  const angle = -90 + risk * 180;
  return (
    <div className="relative flex flex-col items-center">
      <svg width={200} height={112} viewBox="0 0 200 112" className="overflow-visible">
        <defs>
          <linearGradient id="gauge" x1="0" x2="1">
            <stop offset="0" stopColor="#2dd4bf" />
            <stop offset="0.35" stopColor="#ffb020" />
            <stop offset="0.7" stopColor="#ff5a1f" />
            <stop offset="1" stopColor="#ff2e4d" />
          </linearGradient>
        </defs>
        <path d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`} fill="none" stroke="var(--line-2)" strokeWidth={10} strokeLinecap="round" />
        <motion.path
          d={`M ${100 - R} 100 A ${R} ${R} 0 0 1 ${100 + R} 100`}
          fill="none"
          stroke="url(#gauge)"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={C}
          initial={{ strokeDashoffset: C }}
          animate={{ strokeDashoffset: C * (1 - Math.max(0.005, risk)) }}
          transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${c}88)` }}
        />
        {[0.2, 0.5].map((t) => {
          const a = Math.PI * (1 - t);
          return <line key={t} x1={100 + Math.cos(a) * (R - 9)} y1={100 - Math.sin(a) * (R - 9)} x2={100 + Math.cos(a) * (R + 9)} y2={100 - Math.sin(a) * (R + 9)} stroke="var(--bg)" strokeWidth={2} />;
        })}
        <motion.line
          x1={100}
          y1={100}
          initial={{ x2: 36, y2: 100 }}
          animate={{ x2: 100 + Math.sin((angle * Math.PI) / 180) * 64, y2: 100 - Math.cos((angle * Math.PI) / 180) * 64 }}
          transition={{ type: "spring", stiffness: 60, damping: 12 }}
          stroke={c}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
        <circle cx={100} cy={100} r={6} fill="var(--bg)" stroke={c} strokeWidth={2.5} />
      </svg>
      <div className="-mt-1 flex items-baseline gap-1">
        <Counter value={risk * 100} className="text-4xl font-semibold" />
        <span className="num text-lg text-muted">%</span>
      </div>
      <div className="mt-0.5 text-xs text-muted">{label}</div>
      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-dim">
        <span className="num">n={n}</span>
        <Evidence id={tr} />
      </div>
    </div>
  );
}

// Range tile: shows p25–p75 as a band on a scale with the median marked. Never a point.
export function RangeTile({
  label,
  lo,
  mid,
  hi,
  max,
  fmt,
  hint,
  tr,
  n,
  color = "var(--heat)",
}: {
  label: string;
  lo: number;
  mid: number;
  hi: number;
  max: number;
  fmt: (x: number) => string;
  hint: string;
  tr: string;
  n: number;
  color?: string;
}) {
  const p = (x: number) => `${Math.max(0, Math.min(100, (x / max) * 100))}%`;
  return (
    <div className="panel relative overflow-hidden p-4">
      <div className="label">{label}</div>
      <div className="num mt-2 flex items-baseline gap-1.5 text-2xl font-semibold">
        <motion.span key={`lo:${fmt(lo)}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {fmt(lo)}
        </motion.span>
        <span className="text-base text-dim">–</span>
        <motion.span key={`hi:${fmt(hi)}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}>
          {fmt(hi)}
        </motion.span>
      </div>
      <div className="relative mt-3 h-1.5 rounded-full bg-white/[0.06]">
        <motion.div
          className="absolute h-full rounded-full"
          style={{ background: color, boxShadow: `0 0 12px ${color}` }}
          animate={{ left: p(lo), width: `calc(${p(hi)} - ${p(lo)})` }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        />
        <motion.div className="absolute -top-1 h-3.5 w-0.5 rounded bg-text" animate={{ left: p(mid) }} transition={{ type: "spring", stiffness: 120, damping: 20 }} />
      </div>
      <div className="mt-3 flex items-center justify-between text-[11px] text-dim">
        <span>{hint}</span>
        <span className="flex items-center gap-1.5">
          <span className="num">n={n}</span>
          <Evidence id={tr} />
        </span>
      </div>
    </div>
  );
}
