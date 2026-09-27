"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import type { Step } from "@/components/agent/Pipeline";
import { SPONSORS } from "@/components/agent/Sponsors";
import { fmtMs, isFinished, STATUS_COLOR } from "./format";
import { useElapsed } from "./hooks";
import { Typed } from "./NodeBody";
import styles from "./theatre.module.css";

function Running({ step }: { step: Step }) {
  const elapsed = useElapsed(true);
  return (
    <motion.li layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="num text-[11px] leading-relaxed" style={{ color: "var(--gold-hi)" }}>
      <span className="uppercase tracking-[0.12em]">{step.agent}</span>
      <span className="text-muted"> · {step.task}</span>
      <span className={`${styles.caret} ml-1`} aria-hidden />
      <span className="float-right text-muted">{fmtMs(elapsed)}</span>
    </motion.li>
  );
}

// A terminal-style feed: each step's result lands here the moment it arrives, oldest scrolling off the top.
export function Evidence({ steps, reduced, className = "" }: { steps: Step[]; reduced: boolean; className?: string }) {
  // arrival order, not pipeline order: remember the order results were first seen
  const [order, setOrder] = useState<string[]>([]);
  const finished = steps.filter((s) => isFinished(s.status));
  const unseen = finished.filter((s) => !order.includes(s.key)).map((s) => s.key);
  if (unseen.length) setOrder([...order, ...unseen]);

  const byKey = new Map(steps.map((s) => [s.key, s]));
  const feed = order.map((k) => byKey.get(k)).filter((s): s is Step => !!s && isFinished(s.status));
  const running = steps.filter((s) => s.status === "running");
  const live = finished.filter((s) => s.live).length;
  const traced = finished.filter((s) => s.tr).length;

  return (
    <aside aria-label="Evidence stream" className={`flex min-h-0 flex-col ${className}`}>
      <div className="flex items-center justify-between pb-3">
        <span className="label flex items-center gap-2">
          <span className={`h-1.5 w-1.5 rounded-full ${reduced ? "" : styles.beadPulse}`} style={{ background: running.length ? "var(--gold-hi)" : "var(--dim)" }} />
          Evidence stream
        </span>
        <span className="num text-[10.5px] text-dim">
          {finished.length}/{steps.length}
        </span>
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden [mask-image:linear-gradient(to_bottom,transparent,black_18%)]">
        <ul className="absolute inset-x-0 bottom-0 flex flex-col gap-3.5">
          {!feed.length && !running.length && (
            <li className="num text-[11px] text-dim">
              waiting for the first result
              <span className={styles.caret} aria-hidden />
            </li>
          )}
          <AnimatePresence initial={false}>
            {feed.map((s) => (
              <motion.li key={s.key} layout initial={reduced ? false : { opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 260, damping: 26 }} className="num border-l pl-3 text-[11px] leading-[1.5]" style={{ borderColor: STATUS_COLOR[s.status] }}>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="uppercase tracking-[0.12em]" style={{ color: STATUS_COLOR[s.status] }}>
                    {s.agent}
                  </span>
                  <span className="text-dim">{s.ms !== undefined ? fmtMs(s.ms) : ""}</span>
                </div>
                <div className="text-[10px] text-dim">
                  {SPONSORS[s.sponsor].label} · {s.live ? "live" : "cached"}
                </div>
                {(s.result || s.tr) && <Typed text={s.result ?? ""} reduced={reduced} className="mt-1 text-text/85" after={s.tr && <span className="text-[10px]" style={{ color: "rgba(246,180,26,0.72)" }}>↳ {s.tr}</span>} />}
              </motion.li>
            ))}
            {running.map((s) => (
              <Running key={s.key} step={s} />
            ))}
          </AnimatePresence>
        </ul>
      </div>
      <div className="num flex items-center gap-3 pt-3 text-[10px] uppercase tracking-[0.1em] text-dim">
        <span>{live} live</span>
        <span>·</span>
        <span>{finished.length - live} cached</span>
        {traced > 0 && (
          <>
            <span>·</span>
            <span>{traced} traced</span>
          </>
        )}
      </div>
    </aside>
  );
}
