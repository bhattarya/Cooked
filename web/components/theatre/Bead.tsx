"use client";

import { motion } from "motion/react";
import type { Step, StepStatus } from "@/components/agent/Pipeline";
import { FALLBACK } from "@/components/agent/Sponsors";
import { GoldOrb } from "./GoldOrb";
import { STATUS_COLOR } from "./format";
import { orbStateFor } from "./orbState";
import styles from "./theatre.module.css";

const DISC: Record<"done" | "warn" | "error", string> = {
  done: "radial-gradient(circle at 34% 28%, #ffe08a 0%, #f6b41a 52%, #b97a06 100%)",
  warn: "radial-gradient(circle at 34% 28%, #ffc38a 0%, #ff7a1a 55%, #a94a05 100%)",
  error: "radial-gradient(circle at 34% 28%, #ff9a90 0%, #ff4a3d 55%, #9a1f16 100%)",
};
const GLOW: Record<"done" | "warn" | "error", string> = {
  done: "0 0 26px rgba(246,180,26,0.5), 0 0 3px rgba(255,224,138,0.9) inset",
  warn: "0 0 24px rgba(255,122,26,0.5)",
  error: "0 0 26px rgba(255,74,61,0.55)",
};

function Glyph({ status, size }: { status: "done" | "warn" | "error"; size: number }) {
  const common = { fill: "none", stroke: "#0a0805", strokeWidth: 2.7, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const draw = { initial: { pathLength: 0 }, animate: { pathLength: 1 }, transition: { duration: 0.4, delay: 0.12, ease: "easeOut" as const } };
  return (
    <svg viewBox="0 0 24 24" width={size * 0.5} height={size * 0.5} aria-hidden>
      {status === "done" && <motion.path d="M5.5 12.8 10 17.2 18.6 7.4" {...common} {...draw} />}
      {status === "warn" && (
        <>
          <motion.path d="M12 6v7.5" {...common} {...draw} />
          <circle cx="12" cy="18" r="1.5" fill="#0a0805" />
        </>
      )}
      {status === "error" && <motion.path d="M7 7l10 10M17 7 7 17" {...common} {...draw} />}
    </svg>
  );
}

// The node's status disc: hollow ring (pending), its own little thinking orb (running),
// then a solid gold check / ember mark / red cross. `flash` bumps once each time it finishes.
export function Bead({ step, index, size, flash, reduced }: { step: Step; index: number; size: number; flash: number; reduced: boolean }) {
  const s: StepStatus = step.status;
  return (
    <span className="relative flex shrink-0 items-center justify-center rounded-full bg-bg" style={{ width: size, height: size }}>
      {s === "pending" && (
        <span className="num flex h-full w-full items-center justify-center rounded-full border text-[11px] text-dim" style={{ borderColor: STATUS_COLOR.pending, background: "rgba(19,16,10,0.7)" }}>
          {String(index + 1).padStart(2, "0")}
        </span>
      )}
      {s === "running" && (
        <>
          <span aria-hidden className={reduced ? "absolute -inset-2 rounded-full" : `${styles.beadPulse} absolute -inset-2 rounded-full`} style={{ background: "radial-gradient(circle, rgba(246,180,26,0.34), transparent 68%)" }} />
          <span aria-hidden className={`absolute inset-0 rounded-full border ${reduced ? "" : styles.spin}`} style={{ borderColor: "rgba(246,180,26,0.25)", borderTopColor: "var(--gold-hi)", borderRightColor: "rgba(246,180,26,0.6)" }} />
          <GoldOrb state={orbStateFor(step)} size={Math.round(size - 10)} glow={false} aria-label={`${step.agent} is working`} />
        </>
      )}
      {(s === "done" || s === "warn" || s === "error") && (
        <motion.span
          initial={reduced ? false : { scale: 0.55, opacity: 0 }}
          animate={s === "error" && !reduced ? { scale: 1, opacity: 1, x: [0, -5, 5, -3, 3, 0] } : { scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 15 }}
          className="flex h-full w-full items-center justify-center rounded-full"
          style={{ background: DISC[s], boxShadow: GLOW[s] }}
          role="img"
          aria-label={s === "done" ? "done" : s === "warn" ? "finished with a warning" : "failed"}
        >
          <Glyph status={s} size={size} />
        </motion.span>
      )}
      {flash > 0 && !reduced && (
        <motion.span
          key={flash}
          aria-hidden
          initial={{ scale: 1, opacity: 0.7 }}
          animate={{ scale: 2.6, opacity: 0 }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="pointer-events-none absolute inset-0 rounded-full border-2"
          style={{ borderColor: STATUS_COLOR[s === "pending" ? "done" : s] }}
        />
      )}
    </span>
  );
}

// LIVE when the sponsor is really answering; CACHED when the honest fallback (cached, local) is doing the work.
export function LiveBadge({ step }: { step: Pick<Step, "live" | "sponsor"> }) {
  return (
    <span
      className="num inline-flex items-center gap-1 rounded-[5px] border px-1.5 py-px text-[9px] font-semibold uppercase tracking-[0.14em]"
      style={step.live ? { color: "var(--gold-hi)", borderColor: "rgba(246,180,26,0.4)", background: "rgba(246,180,26,0.1)" } : { color: "var(--dim)", borderColor: "var(--line-2)", borderStyle: "dashed" }}
      title={step.live ? "Answered live" : `Not live: ${FALLBACK[step.sponsor]}`}
    >
      <span className="h-1 w-1 rounded-full" style={{ background: step.live ? "var(--gold-hi)" : "var(--dim)" }} />
      {step.live ? "live" : "cached"}
    </span>
  );
}
