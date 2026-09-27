"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { GoldOrb } from "./GoldOrb";
import { fmtMs } from "./format";

export interface ModelPulseModel {
  name: string;
  ms?: number;
  done?: boolean;
}

// The Model Lab's heartbeat: up to four tiny orbs. While `busy`, a spotlight fires them in turn;
// each one settles into a slow breath (with its latency) once it reports done.
export function ModelPulse({ busy, models }: { busy: boolean; models: ModelPulseModel[] }) {
  const list = models.slice(0, 4);
  const reduced = !!useReducedMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!busy || reduced) return;
    const id = setInterval(() => setTick((t) => t + 1), 650);
    return () => clearInterval(id);
  }, [busy, reduced]);

  const waiting = list.map((m, i) => (m.done ? -1 : i)).filter((i) => i >= 0);
  const firing = busy && waiting.length ? waiting[tick % waiting.length] : -1;

  return (
    <div role="status" aria-label={busy ? "Models running" : "Models idle"} className="inline-flex items-center rounded-2xl border border-line-2 bg-panel/70 px-3 py-2">
      {list.map((m, i) => {
        const on = i === firing;
        return (
          <div key={m.name} className="flex items-center">
            {i > 0 && <span aria-hidden className="mx-2.5 h-px w-5 transition-colors duration-500" style={{ background: list[i - 1].done ? "var(--gold)" : "var(--line-2)" }} />}
            <div className="flex items-center gap-2" style={{ opacity: m.done || on ? 1 : busy ? 0.5 : 0.65, transition: "opacity 0.4s" }}>
              <span aria-hidden className="flex">
                <GoldOrb state={on ? "working" : "breathing"} size={28} glow={false} paused={!on && !m.done} speed={m.done ? 0.5 : 1} />
              </span>
              <span className="leading-tight">
                <span className="block text-[12px] font-medium" style={{ color: m.done ? "var(--text)" : "var(--muted)" }}>
                  {m.name}
                </span>
                <span className="num block text-[10.5px]" style={{ color: on ? "var(--gold-hi)" : "var(--dim)" }}>
                  {m.ms !== undefined && m.done ? fmtMs(m.ms) : on ? "running" : busy ? "queued" : "idle"}
                </span>
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
