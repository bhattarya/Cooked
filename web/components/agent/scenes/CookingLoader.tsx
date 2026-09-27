"use client";

import { useEffect } from "react";
import type { Step } from "../Pipeline";
import styles from "./cooking.module.css";

/** Original retriever illustration, animated with CSS; progress comes only from completed work. */
export function CookingLoader({ steps, exiting, paused, onExited }: { steps: Step[]; exiting: boolean; paused: boolean; onExited: () => void }) {
  useEffect(() => {
    if (!exiting) return;
    const timer = setTimeout(onExited, 750);
    return () => clearTimeout(timer);
  }, [exiting, onExited]);
  const done = steps.filter((s) => s.status === "done" || s.status === "warn").length;
  const active = steps.find((s) => s.status === "running");
  return <div className={`${styles.stage} ${paused ? styles.paused : ""}`}>
    <p className={styles.eyebrow}>COOKED / THE TEST KITCHEN</p>
    <svg viewBox="0 0 400 330" role="img" aria-label="A playful golden retriever in a skillet on a stove" className={styles.art}>
      <ellipse cx="200" cy="299" rx="132" ry="13" fill="#000" opacity=".25" />
      <g className={styles.steam} fill="none" stroke="#e7d6ab" strokeWidth="3" strokeLinecap="round" opacity=".4"><path d="M145 83q-12-16 0-30t0-26" /><path d="M208 60q-12-16 0-30" /><path d="M261 86q12-16 0-30t0-26" /></g>
      <rect x="101" y="246" width="198" height="45" rx="10" fill="#34312b" stroke="#62563b" />
      <circle cx="131" cy="270" r="7" fill="#eebd57" /><circle cx="266" cy="270" r="7" fill="#181714" />
      <g className={styles.flame} fill="#f3aa36"><path d="M142 248q-19-20 2-33q-1 14 12 17q-2 12-14 16"/><path d="M193 249q-22-20 2-39q-2 14 14 22q-3 12-16 17"/><path d="M246 249q-19-20 2-33q-1 14 12 17q-2 12-14 16"/></g>
      <g className={styles.dog}>
        <path d="M145 194q-14-72 55-74q68 1 56 75" fill="#c18b3d" />
        <path d="M147 119q-34-12-34 28t30 12M252 119q34-12 34 28t-29 12" fill="#a96e2b" />
        <path d="M148 119q8-34 52-33q48 0 53 35v29q-1 47-53 48q-54-3-53-48Z" fill="#e5b767" />
        <path d="M162 152q38-22 76 0v15q-6 25-38 25q-34 0-38-25Z" fill="#f3d99c" />
        <g fill="#26221d"><ellipse cx="173" cy="136" rx="5" ry="7" /><ellipse cx="227" cy="136" rx="5" ry="7" /><path d="M189 154q11-6 22 0q0 12-11 12t-11-12" /></g>
        <path d="M200 165v9m-14 0q14 11 28 0" fill="none" stroke="#443322" strokeWidth="3" strokeLinecap="round" />
        <path d="M203 179q14-6 11 8q-8 12-13 0Z" fill="#da8a79" />
        <path d="M164 187l36 9l36-9l-17 30l-19-12l-18 12Z" fill="#272623" /><path d="M195 196h10v10h-10Z" fill="#edbd55" />
        <ellipse cx="151" cy="211" rx="19" ry="13" fill="#e5b767" /><ellipse cx="249" cy="211" rx="19" ry="13" fill="#e5b767" />
      </g>
      <path d="M107 214h183q-5 31-37 31H144q-30 0-37-31" fill="#49463f" stroke="#777064" strokeWidth="3" />
      <path d="M288 220h59" stroke="#777064" strokeWidth="12" strokeLinecap="round" />
      <path d="M116 219h165" stroke="#b1a58c" strokeWidth="2" strokeLinecap="round" />
      <g className={styles.spark} fill="#eebd57"><path d="M88 143l3 9l9 3l-9 3l-3 9l-3-9l-9-3l9-3Z"/><path d="M310 104l2 7l7 2l-7 2l-2 7l-2-7l-7-2l7-2Z"/></g>
    </svg>
    <div role="status" aria-live="polite" className={styles.status}>
      <h1>{exiting ? "Order up. Your next move is ready." : paused ? "Holding the heat." : "Let’s see what’s cooking."}</h1>
      <p>{exiting ? "Bringing your plan to the table." : paused ? "One quick detail before we continue." : active?.task ?? "Putting the finishing touches on your plan."}</p>
    </div>
    <div className={styles.track} role="progressbar" aria-label="Audit analysis" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={done}><div style={{ width: `${steps.length ? done / steps.length * 100 : 0}%` }} /></div>
    <p className={styles.count}>{done} of {steps.length} steps complete</p>
  </div>;
}
