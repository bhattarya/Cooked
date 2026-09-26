"use client";

import { AnimatePresence, motion } from "motion/react";
import { SponsorChip, type SponsorKey } from "./Sponsors";

export type StepStatus = "pending" | "running" | "done" | "warn" | "error";
export interface Step {
  key: string;
  agent: string;
  task: string;
  sponsor: SponsorKey;
  live: boolean;
  status: StepStatus;
  result?: string;
  tr?: string;
  ms?: number;
}

function Dot({ status }: { status: StepStatus }) {
  if (status === "running")
    return (
      <span className="relative flex h-5 w-5 items-center justify-center">
        <motion.span className="absolute inset-0 rounded-full border-2 border-violet/30 border-t-violet" animate={{ rotate: 360 }} transition={{ duration: 0.9, repeat: Infinity, ease: "linear" }} />
      </span>
    );
  const map: Record<Exclude<StepStatus, "running">, [string, string]> = {
    pending: ["", "var(--line-2)"],
    done: ["✓", "var(--cool)"],
    warn: ["!", "var(--amber)"],
    error: ["×", "var(--hot)"],
  };
  const [glyph, color] = map[status];
  return (
    <motion.span
      initial={status === "pending" ? false : { scale: 0.4 }}
      animate={{ scale: 1 }}
      className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold text-bg"
      style={{ background: status === "pending" ? "transparent" : color, border: status === "pending" ? `1.5px solid ${color}` : undefined }}
    >
      {glyph}
    </motion.span>
  );
}

// The agents working on an audit, each tagged with the sponsor that powers it.
export function Pipeline({ steps }: { steps: Step[] }) {
  return (
    <ol className="relative space-y-1">
      <span className="absolute bottom-3 left-[9px] top-3 w-px bg-line-2" />
      <AnimatePresence initial={false}>
        {steps.map((s, i) => (
          <motion.li
            key={s.key}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: s.status === "pending" ? 0.45 : 1, x: 0 }}
            transition={{ delay: i * 0.04 }}
            className="relative flex items-start gap-3 rounded-xl px-0 py-2"
          >
            <span className="relative z-10 mt-0.5 bg-bg">
              <Dot status={s.status} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-medium">{s.agent}</span>
                <span className="text-[12px] text-muted">{s.task}</span>
                <SponsorChip k={s.sponsor} live={s.live} compact />
              </div>
              <AnimatePresence>
                {s.result && (
                  <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="num mt-1 text-[11.5px] leading-relaxed text-text/75">
                    {s.result}
                    {s.tr && <span className="ml-2 text-cool/70">{s.tr}</span>}
                    {s.ms !== undefined && <span className="ml-2 text-dim">{s.ms < 1000 ? `${Math.round(s.ms)}ms` : `${(s.ms / 1000).toFixed(1)}s`}</span>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.li>
        ))}
      </AnimatePresence>
    </ol>
  );
}
