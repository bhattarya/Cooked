"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { Step } from "@/components/agent/Pipeline";
import { Mark, Wordmark } from "@/components/brand";
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

const label: Record<Step["status"], string> = { pending: "Queued", running: "In progress", done: "Complete", warn: "Check", error: "Failed" };

export function ProcessingTheatre({ steps, title, subtitle, exiting = false, onExited, className = "" }: ProcessingTheatreProps) {
  const reduced = !!useReducedMotion();
  const finished = steps.filter((step) => isFinished(step.status)).length;
  const current = steps.find((step) => step.status === "running");
  const elapsed = useElapsed(steps.some((step) => step.status !== "pending") && finished !== steps.length);
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
      <header className={styles.top}><Wordmark size={16} /><span>DEGREE AUDIT / ANALYSIS IN PROGRESS</span><span className={styles.clock}>{fmtMs(elapsed)}</span></header>
      <main className={styles.main}>
        <section className={styles.intro}>
          <div className={styles.kicker}>AUDIT / {String(finished).padStart(2,"0")} OF {String(steps.length).padStart(2,"0")}</div>
          <h1>{title}</h1>
          <p>{subtitle ?? "Following each step from source to result."}</p>
          <div className={styles.progress} role="progressbar" aria-valuenow={finished} aria-valuemin={0} aria-valuemax={steps.length} aria-label="Audit progress"><span style={{ width: `${steps.length ? finished / steps.length * 100 : 0}%` }} /></div>
          <div className={styles.now}><span className={styles.nowLabel}>CURRENT STEP</span><strong>{current ? current.agent : finished === steps.length ? "Analysis complete" : "Getting ready"}</strong><p>{current ? current.task : finished === steps.length ? "Your results are ready." : "The first agent will start shortly."}</p></div>
          <div className={styles.brandArt} aria-hidden><Mark width={430} /></div>
        </section>
        <section className={styles.list} aria-label="Analysis steps">
          <div className={styles.listHead}><span>THE PROCESS</span><span>{finished} / {steps.length} COMPLETE</span></div>
          <ol>
            {steps.map((step, i) => (
              <li key={step.key} className={`${styles.step} ${styles[step.status]}`}>
                <div className={styles.number}>{String(i + 1).padStart(2, "0")}</div>
                <div className={styles.stepText}><div className={styles.stepTop}><h2>{step.agent}</h2><span>{label[step.status]}</span></div><p>{step.task}</p>{step.result && <div className={styles.result}>{step.result}{step.tr && <small>↳ {step.tr}</small>}</div>}</div>
                <div className={styles.source}><span>{SPONSORS[step.sponsor].label}</span><small>{step.live ? "LIVE" : "CACHED"}</small>{step.ms !== undefined && <small>{fmtMs(step.ms)}</small>}</div>
              </li>
            ))}
          </ol>
          <p className={styles.note}>Each result is tied to the service and data that produced it. You can inspect the findings after the analysis finishes.</p>
        </section>
      </main>
      <div className={styles.sr} role="status" aria-live="polite">{current ? `${current.agent}: ${current.task}` : finished === steps.length ? "Analysis complete" : "Preparing analysis"}</div>
      {exiting && <motion.div className={styles.exit} initial={{opacity:0}} animate={{opacity:1}} transition={{duration: reduced ? .2 : .6}} aria-hidden />}
    </div>
  );
}
