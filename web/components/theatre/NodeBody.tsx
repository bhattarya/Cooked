"use client";

import type { ReactNode } from "react";
import type { Step } from "@/components/agent/Pipeline";
import { SponsorChip } from "@/components/agent/Sponsors";
import { LiveBadge } from "./Bead";
import { fmtMs, isFinished } from "./format";
import { useElapsed, useTyped } from "./hooks";
import styles from "./theatre.module.css";

// Types `text` out without ever reflowing: the not-yet-typed tail is laid out invisibly.
// `after` (an evidence id, say) fades in on its own line once the text has finished.
export function Typed({ text, reduced, lines, after, className = "" }: { text: string; reduced: boolean; lines?: number; after?: ReactNode; className?: string }) {
  const { shown, rest, done } = useTyped(text, reduced);
  const clamp = lines ? ({ display: "-webkit-box", WebkitLineClamp: lines, WebkitBoxOrient: "vertical", overflow: "hidden" } as const) : undefined;
  return (
    <span className={`block ${className}`}>
      {text && (
        <span className="block" style={clamp}>
          {shown}
          <span className="opacity-0" aria-hidden>
            {rest}
          </span>
        </span>
      )}
      {after && (
        <span className="block" style={{ opacity: done ? 1 : 0, transition: "opacity 0.3s" }}>
          {after}
        </span>
      )}
    </span>
  );
}

const NAME_COLOR = { pending: "var(--muted)", running: "var(--cream)", done: "var(--text)", warn: "var(--ember)", error: "var(--hot)" } as const;

// What a node says about its step. `align="right"` mirrors it for cards on the ring's left side.
export function NodeBody({ step, align, compact, reduced, lines = 2 }: { step: Step; align: "left" | "right"; compact: boolean; reduced: boolean; lines?: number }) {
  const running = step.status === "running";
  const finished = isFinished(step.status);
  const elapsed = useElapsed(running);
  const ms = finished ? (step.ms ?? elapsed) : elapsed;
  const right = align === "right";

  return (
    <div className={`flex min-w-0 flex-col justify-center gap-1 ${right ? "items-end text-right" : "items-start text-left"}`} style={{ opacity: step.status === "pending" ? 0.7 : 1, transition: "opacity 0.5s" }}>
      <div className={`flex w-full items-baseline justify-between gap-2 ${right ? "flex-row-reverse" : ""}`}>
        <span className="truncate text-[13.5px] font-semibold leading-tight tracking-[0.01em]" style={{ color: NAME_COLOR[step.status], transition: "color 0.4s" }}>
          {step.agent}
        </span>
        {step.status !== "pending" && (
          <span className="num shrink-0 text-[11px]" style={{ color: running ? "var(--gold-hi)" : "var(--muted)" }} aria-label={running ? "elapsed" : "latency"}>
            {fmtMs(ms)}
          </span>
        )}
      </div>
      {!finished && (!compact || running) && <div className="max-w-full truncate text-[12px] leading-snug text-muted">{step.task}</div>}
      <div className={`flex items-center gap-1.5 ${right ? "justify-end" : ""}`}>
        <SponsorChip k={step.sponsor} live={step.live} compact />
        {step.status !== "pending" && <LiveBadge step={step} />}
      </div>
      {(step.result || step.tr) && (
        <Typed
          text={step.result ?? ""}
          reduced={reduced}
          lines={lines}
          className={`num min-w-0 max-w-full text-[11px] leading-[1.45] text-text/80 ${right ? "text-right" : ""}`}
          after={step.tr && <span className="text-[10px]" style={{ color: "rgba(246,180,26,0.78)" }}>↳ {step.tr}</span>}
        />
      )}
    </div>
  );
}

// The same information as a timeline row (narrow screens): name and latency, chips and evidence id, then the result.
export function RowBody({ step, reduced, lines }: { step: Step; reduced: boolean; lines: number }) {
  const running = step.status === "running";
  const finished = isFinished(step.status);
  const elapsed = useElapsed(running);
  const ms = finished ? (step.ms ?? elapsed) : elapsed;
  return (
    <div className="flex min-w-0 flex-col justify-center gap-0.5" style={{ opacity: step.status === "pending" ? 0.7 : 1, transition: "opacity 0.5s" }}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[13.5px] font-semibold leading-tight" style={{ color: NAME_COLOR[step.status], transition: "color 0.4s" }}>
          {step.agent}
        </span>
        {step.status !== "pending" && (
          <span className="num shrink-0 text-[11px]" style={{ color: running ? "var(--gold-hi)" : "var(--muted)" }} aria-label={running ? "elapsed" : "latency"}>
            {fmtMs(ms)}
          </span>
        )}
      </div>
      <div className={`${styles.rowChips} flex min-w-0 items-center gap-1.5`}>
        <SponsorChip k={step.sponsor} live={step.live} compact />
        {step.status !== "pending" && <LiveBadge step={step} />}
        {step.tr && (
          <span className="num ml-auto min-w-0 truncate text-[10px]" style={{ color: "rgba(246,180,26,0.78)" }}>
            ↳ {step.tr}
          </span>
        )}
      </div>
      <div className={styles.rowText}>
        {step.result ? <Typed text={step.result} reduced={reduced} lines={lines} className="num text-[11px] leading-[1.4] text-text/80" /> : !finished && <div className="truncate text-[12px] leading-snug text-muted">{step.task}</div>}
      </div>
    </div>
  );
}
