"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Step } from "@/components/agent/Pipeline";
import { Wordmark } from "@/components/brand";
import { SPONSORS } from "@/components/agent/Sponsors";
import { fmtMs, isFinished } from "./format";
import { useElapsed } from "./hooks";
import styles from "./processing.module.css";

export interface ProcessingTheatreProps {
  steps: Step[];
  title: string;
  subtitle?: string;
  voiceLevel?: number;
  exiting?: boolean;
  onExited?: () => void;
  className?: string;
}

const statusLabel: Record<Step["status"], string> = { pending: "Queued", running: "Working", done: "Complete", warn: "Review", error: "Failed" };

export function ProcessingTheatre({ steps, title, subtitle, exiting = false, onExited, className = "" }: ProcessingTheatreProps) {
  const reduced = !!useReducedMotion();
  const finished = steps.filter((step) => isFinished(step.status));
  const current = steps.find((step) => step.status === "running");
  const active = current ?? steps.find((step) => step.status === "pending");
  const index = active ? steps.indexOf(active) : steps.length - 1;
  const elapsed = useElapsed(steps.some((step) => step.status !== "pending") && finished.length !== steps.length);
  const called = useRef(false);
  useEffect(() => {
    if (!exiting) { called.current = false; return; }
    const timer = window.setTimeout(() => {
      if (!called.current) { called.current = true; onExited?.(); }
    }, reduced ? 250 : 650);
    return () => window.clearTimeout(timer);
  }, [exiting, onExited, reduced]);

  return (
    <div className={`${styles.page} ${className}`}>
      <header className={styles.header}>
        <Wordmark size={16} />
        <span>THE AUDIT / IN PROGRESS</span>
        <span className={styles.elapsed}>{fmtMs(elapsed)}</span>
      </header>
      <div className={styles.body}>
        <main className={styles.stage}>
          <p className={styles.eyebrow}>{title} / {String(Math.max(0, index + 1)).padStart(2,"0")} OF {String(steps.length).padStart(2,"0")}</p>
          <span className={styles.stageNumber} aria-hidden>{String(Math.max(0, index + 1)).padStart(2,"0")}</span>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={active?.key ?? "complete"} initial={reduced ? false : {opacity:0,y:14}} animate={{opacity:1,y:0}} exit={reduced ? undefined : {opacity:0,y:-10}} transition={{duration:.3}}>
              <h1>{current ? current.agent : finished.length === steps.length ? "The picture is clear." : active?.agent ?? "Getting ready."}</h1>
              <p className={styles.task}>{current ? current.task : finished.length === steps.length ? "Your results are coming into view." : active?.task ?? subtitle ?? "Preparing the analysis."}</p>
            </motion.div>
          </AnimatePresence>
          <div className={styles.stageFoot}>
            <div className={styles.progressLabel}><span>{finished.length} steps complete</span><span>{steps.length} total</span></div>
            <div className={styles.progress} role="progressbar" aria-label="Audit progress" aria-valuenow={finished.length} aria-valuemin={0} aria-valuemax={steps.length}><span style={{width:`${steps.length ? finished.length / steps.length * 100 : 0}%`}} /></div>
            <p>{subtitle ?? "Following the evidence behind every finding."}</p>
          </div>
        </main>
        <aside className={styles.evidence} aria-label="Evidence as it arrives">
          <div className={styles.evidenceHead}><span>FIELD NOTES</span><span>{String(finished.length).padStart(2,"0")} / {String(steps.length).padStart(2,"0")}</span></div>
          <div className={styles.notes}>
            {finished.length === 0 && <p className={styles.waiting}>The first result will appear here.</p>}
            {finished.slice(-4).reverse().map((step) => <article key={step.key} className={styles.note}>
              <div><span>{step.agent}</span><span>{statusLabel[step.status]}</span></div>
              <p>{step.result ?? step.task}</p>
              <small>{SPONSORS[step.sponsor].label} / {step.live ? "LIVE" : "CACHED"}{step.ms !== undefined ? ` / ${fmtMs(step.ms)}` : ""}</small>
            </article>)}
          </div>
          <p className={styles.evidenceFoot}>Every finding can be traced to its source in your results.</p>
        </aside>
      </div>
      <nav className={styles.sequence} aria-label="Analysis sequence"><ol>{steps.map((step,i) => <li key={step.key} className={`${styles.step} ${styles[step.status]}`} aria-current={step.status === "running" ? "step" : undefined}><span>{String(i+1).padStart(2,"0")}</span><strong>{step.agent}</strong><small>{statusLabel[step.status]}</small></li>)}</ol></nav>
      <p role="status" aria-live="polite" className={styles.sr}>{current ? `${current.agent}: ${current.task}` : finished.length === steps.length ? "Analysis complete" : "Preparing analysis"}</p>
      {exiting && <motion.div className={styles.exit} initial={{opacity:0}} animate={{opacity:1}} transition={{duration:reduced?.2:.6}} aria-hidden />}
    </div>
  );
}
