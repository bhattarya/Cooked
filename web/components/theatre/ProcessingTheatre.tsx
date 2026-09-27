"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Step, StepStatus } from "@/components/agent/Pipeline";
import { Backdrop } from "./Backdrop";
import { Bead } from "./Bead";
import { Energy } from "./Energy";
import { Evidence } from "./Evidence";
import { fmtMs, isFinished } from "./format";
import { GoldOrb } from "./GoldOrb";
import { useElapsed, useElementSize } from "./hooks";
import { computeLayout, type OrbitalLayout, type TimelineLayout } from "./layout";
import { NodeBody, RowBody } from "./NodeBody";
import { orbStateFor } from "./orbState";
import styles from "./theatre.module.css";

export interface ProcessingTheatreProps {
  steps: Step[];
  title: string;
  subtitle?: string;
  /** 0..1 loudness of the voice; the orb swells and glows with it. */
  voiceLevel?: number;
  /** Play the exit: the orb swells, the screen washes gold, then black; `onExited` fires at black. */
  exiting?: boolean;
  onExited?: () => void;
  className?: string;
}

const statusMap = (steps: Step[]) => Object.fromEntries(steps.map((s) => [s.key, s.status])) as Record<string, StepStatus>;

function Header({ title, subtitle, compact }: { title: string; subtitle?: string; compact: boolean }) {
  return (
    <div className="min-w-0">
      <div className="label flex items-center gap-2 text-gold/80">
        <span className="h-1.5 w-1.5 rounded-full bg-gold" style={{ boxShadow: "0 0 10px var(--gold)" }} />
        COOKED · agent pipeline
      </div>
      <h2 className="display text-gold-grad mt-2 font-extrabold" style={{ fontSize: compact ? 32 : "clamp(2.4rem, 4.4vw, 4.2rem)", lineHeight: 0.92, textWrap: "balance" }}>
        {title}
      </h2>
      {subtitle && <p className={`mt-2 text-muted ${compact ? "max-w-[34ch] text-[12.5px]" : "max-w-[40ch] text-[13.5px]"}`}>{subtitle}</p>}
    </div>
  );
}

interface Progress {
  steps: Step[];
  lead: Step | undefined;
  leadIndex: number;
  finished: number;
  warns: number;
  errors: number;
  complete: boolean;
}

// What the big orb should be doing: the working step's animation, or a calm breath between steps.
function orbLook(p: Progress) {
  const state = p.lead ? orbStateFor(p.lead) : ("breathing" as const);
  const tone = !p.lead && p.complete ? (p.errors ? ("hot" as const) : p.warns ? ("ember" as const) : ("gold" as const)) : ("gold" as const);
  return { state, tone, label: p.lead ? `${p.lead.agent}: ${p.lead.task}` : "Standing by" };
}

function Caption({ p, compact, align = "center" }: { p: Progress; compact: boolean; align?: "center" | "left" }) {
  const n = p.steps.length;
  const next = p.steps.find((s) => s.status === "pending");
  let label: string;
  let name: string;
  let sub: string;
  if (p.lead) {
    label = `Step ${p.leadIndex + 1} / ${n}`;
    name = p.lead.agent;
    sub = p.lead.task;
  } else if (p.complete) {
    label = `${p.finished} / ${n} steps`;
    name = p.errors ? "Finished with a failure" : p.warns ? "Done, with cautions" : "Complete";
    sub = p.errors ? "See the red node for what failed" : p.warns ? "See the amber node for what to check" : "every step reported back";
  } else if (next && p.finished > 0) {
    label = `Next · ${p.finished} / ${n}`;
    name = next.agent;
    sub = next.task;
  } else {
    label = `0 / ${n} steps`;
    name = "Standing by";
    sub = "waiting for the first step";
  }
  return (
    <div className={align === "center" ? "text-center" : "text-left"} aria-hidden>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={`${label}|${name}`} initial={{ opacity: 0, y: 10, filter: "blur(4px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} exit={{ opacity: 0, y: -8, filter: "blur(4px)" }} transition={{ duration: 0.32, ease: "easeOut" }}>
          <div className="num text-[11px] uppercase tracking-[0.2em] text-gold">{label}</div>
          <div className="display mt-1 font-extrabold text-cream" style={{ fontSize: compact ? 26 : "clamp(1.7rem, 2.5vw, 2.4rem)" }}>
            {name}
          </div>
          <div className="serif mt-0.5 text-muted" style={{ fontSize: compact ? 16 : 19 }}>
            {sub}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

// The exit: gold floods out from the orb, then everything goes to black. `onDone` fires at black.
function ExitWash({ cx, cy, w, h, reduced, onDone }: { cx: number; cy: number; w: number; h: number; reduced: boolean; onDone: () => void }) {
  const R = Math.hypot(w, h) * 0.85;
  if (reduced) return <motion.div className="absolute inset-0 z-40 bg-bg" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} onAnimationComplete={onDone} />;
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute z-30 rounded-full"
        style={{ left: cx - R, top: cy - R, width: R * 2, height: R * 2, background: "radial-gradient(closest-side, #ffe9a0 0%, #ffd15c 20%, #f6b41a 44%, #d58f08 70%, rgba(213,143,8,0) 100%)" }}
        initial={{ scale: 0.04, opacity: 0 }}
        animate={{ scale: [0.04, 0.6, 1, 1], opacity: [0, 1, 1, 1] }}
        transition={{ duration: 1.75, times: [0, 0.42, 0.68, 1], ease: "easeIn" }}
      />
      <motion.div className="absolute inset-0 z-40 bg-bg" initial={{ opacity: 0 }} animate={{ opacity: [0, 0, 0, 1] }} transition={{ duration: 1.75, times: [0, 0.52, 0.7, 1], ease: "easeInOut" }} onAnimationComplete={onDone} />
    </>
  );
}

function Orbital({ l, p, reduced, flashes, voiceLevel, exiting, elapsed, title, subtitle }: { l: OrbitalLayout; p: Progress; reduced: boolean; flashes: Record<string, number>; voiceLevel: number; exiting: boolean; elapsed: number; title: string; subtitle?: string }) {
  const n = p.steps.length;
  const arenaW = l.evidence ? l.evidence.x : l.w;
  const gap = 14;
  return (
    <>
      <motion.div className="absolute inset-0" animate={exiting ? { opacity: 0, scale: 0.95 } : { opacity: 1, scale: 1 }} transition={{ duration: 0.5, ease: "easeIn" }}>
        <motion.div className="absolute left-9 top-7" style={{ maxWidth: Math.max(280, arenaW * 0.36) }} initial={reduced ? false : { opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7, ease: "easeOut" }}>
          <Header title={title} subtitle={subtitle} compact={false} />
        </motion.div>
        <div className="num absolute top-8 text-right text-[11px] uppercase tracking-[0.16em] text-dim" style={{ right: l.w - arenaW + 36 }}>
          <div>
            {p.finished}/{n} steps
          </div>
          <div className="mt-0.5 text-[13px] normal-case tracking-normal text-muted">{fmtMs(elapsed)}</div>
        </div>

        {n > 0 && <Energy l={l} steps={p.steps} flashes={flashes} reduced={reduced} />}

        <ol className="absolute inset-0 m-0 list-none p-0">
          {p.steps.map((s, i) => {
            const pos = l.nodes[i];
            const running = s.status === "running";
            return (
              <motion.li
                key={s.key}
                className="absolute"
                style={{ left: pos.x, top: pos.y }}
                initial={reduced ? false : { opacity: 0, x: (l.cx - pos.x) * 0.3, y: (l.orbY - pos.y) * 0.3, scale: 0.6 }}
                animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 140, damping: 18, delay: reduced ? 0 : 0.15 + i * 0.07 }}
              >
                <div className="absolute" style={{ left: -l.bead / 2, top: -l.bead / 2 }}>
                  <Bead step={s} index={i} size={l.bead} flash={flashes[s.key] ?? 0} reduced={reduced} />
                </div>
                <div
                  className="absolute rounded-xl border px-2.5 py-2"
                  style={{
                    top: pos.cardTop - pos.y,
                    width: l.cardW,
                    height: l.cardH,
                    ...(pos.side === "r" ? { left: l.bead / 2 + gap } : { right: l.bead / 2 + gap }),
                    borderColor: running ? "rgba(246,180,26,0.3)" : "transparent",
                    background: running ? `linear-gradient(${pos.side === "r" ? "90deg" : "270deg"}, rgba(246,180,26,0.1), rgba(19,16,10,0.72))` : "transparent",
                    transition: "background 0.5s, border-color 0.5s",
                  }}
                >
                  {/* a soft dark plate keeps the ring's lines from running through the text */}
                  <span aria-hidden className="pointer-events-none absolute -inset-3 -z-10" style={{ background: "radial-gradient(closest-side, rgba(10,8,5,0.82) 55%, rgba(10,8,5,0) 100%)" }} />
                  <div className="h-full overflow-hidden">
                    <NodeBody step={s} align={pos.side === "r" ? "left" : "right"} compact={l.compact} reduced={reduced} lines={l.compact ? 1 : 2} />
                  </div>
                </div>
              </motion.li>
            );
          })}
        </ol>

        <div className="absolute" style={{ left: l.cx - 220, width: 440, top: l.orbY + l.orb / 2 + 36 }}>
          <Caption p={p} compact={false} />
        </div>

        {l.evidence && (
          <motion.div className="absolute bottom-0 top-0 border-l border-line-2 bg-gradient-to-l from-[rgba(19,16,10,0.75)] to-transparent px-6 pb-7 pt-8" style={{ left: l.evidence.x, width: l.evidence.w }} initial={reduced ? false : { opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.3, ease: "easeOut" }}>
            <Evidence steps={p.steps} reduced={reduced} className="h-full" />
          </motion.div>
        )}
      </motion.div>

      <OrbLayer cx={l.cx} cy={l.orbY} size={l.orb} p={p} reduced={reduced} flashes={flashes} voiceLevel={voiceLevel} exiting={exiting} />
    </>
  );
}

// The orb itself sits outside the fading content so it can swell while everything else goes dark.
function OrbLayer({ cx, cy, size, p, reduced, flashes, voiceLevel, exiting }: { cx: number; cy: number; size: number; p: Progress; reduced: boolean; flashes: Record<string, number>; voiceLevel: number; exiting: boolean }) {
  const { state, tone, label } = orbLook(p);
  const ripple = Object.values(flashes).reduce((a, b) => a + b, 0);
  return (
    <motion.div className="absolute z-20" style={{ left: cx - size / 2, top: cy - size / 2, width: size, height: size }} initial={reduced ? false : { scale: 0.6, opacity: 0 }} animate={exiting && !reduced ? { scale: [1, 1.3, 2.3], opacity: 1 } : { scale: 1, opacity: 1 }} transition={exiting ? { duration: 1.2, times: [0, 0.35, 1], ease: "easeIn" } : { type: "spring", stiffness: 90, damping: 16 }}>
      <GoldOrb state={state} size={size} tone={tone} speed={p.lead || exiting ? 1 : 0.55} level={exiting ? 1 : voiceLevel} aria-label={label} />
      {ripple > 0 && !reduced && (
        <motion.span key={ripple} aria-hidden className="pointer-events-none absolute rounded-full border" style={{ inset: -22, borderColor: "rgba(255,209,92,0.7)" }} initial={{ scale: 1, opacity: 0.7 }} animate={{ scale: 1.22, opacity: 0 }} transition={{ duration: 0.9, ease: "easeOut" }} />
      )}
    </motion.div>
  );
}

// In the timeline layout the orb is small and sits in the flow, so it doesn't get the swelling layer.
function TimelineOrb({ size, p, voiceLevel, exiting }: { size: number; p: Progress; voiceLevel: number; exiting: boolean }) {
  const { state, tone, label } = orbLook(p);
  return <GoldOrb state={state} size={size} tone={tone} speed={p.lead || exiting ? 1 : 0.55} level={exiting ? 1 : voiceLevel} aria-label={label} />;
}

function Timeline({ l, p, reduced, flashes, voiceLevel, exiting, title, subtitle }: { l: TimelineLayout; p: Progress; reduced: boolean; flashes: Record<string, number>; voiceLevel: number; exiting: boolean; title: string; subtitle?: string }) {
  const bead = l.compact ? 30 : 36;
  return (
    <motion.div className={`absolute inset-0 flex gap-4 px-5 pb-5 pt-5 ${l.split ? "flex-row" : "flex-col"}`} animate={exiting ? { opacity: 0 } : { opacity: 1 }} transition={{ duration: 0.5, ease: "easeIn" }}>
      <div className={`flex shrink-0 flex-col ${l.split ? "w-[40%] justify-between" : ""}`}>
        <Header title={title} subtitle={subtitle} compact />
        <div className={`flex items-center gap-4 ${l.split ? "mt-4 flex-col text-center" : "mt-3"}`}>
          <div className="relative shrink-0" style={{ width: l.orb, height: l.orb }}>
            <TimelineOrb size={l.orb} p={p} voiceLevel={voiceLevel} exiting={exiting} />
          </div>
          <div className="min-w-0 flex-1">
            <Caption p={p} compact align={l.split ? "center" : "left"} />
          </div>
        </div>
      </div>
      <ol className="relative m-0 flex min-h-0 flex-1 list-none flex-col p-0">
        {p.steps.map((s, i) => (
          <motion.li key={s.key} className={`${styles.row} relative flex min-h-0 flex-1 gap-3`} initial={reduced ? false : { opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.1 + i * 0.05, duration: 0.4 }}>
            {i < p.steps.length - 1 && <span aria-hidden className="absolute bottom-0 w-px" style={{ left: bead / 2, top: bead + 4, background: isFinished(s.status) ? "var(--gold)" : "var(--line-2)", transition: "background 0.6s" }} />}
            <div className="shrink-0 pt-1">
              <Bead step={s} index={i} size={bead} flash={flashes[s.key] ?? 0} reduced={reduced} />
            </div>
            <div className="min-h-0 min-w-0 flex-1 overflow-hidden pt-0.5">
              <RowBody step={s} reduced={reduced} lines={l.compact ? 1 : 2} />
            </div>
          </motion.li>
        ))}
      </ol>
    </motion.div>
  );
}

export function ProcessingTheatre({ steps, title, subtitle, voiceLevel = 0, exiting = false, onExited, className = "" }: ProcessingTheatreProps) {
  const root = useRef<HTMLDivElement>(null);
  const { w, h } = useElementSize(root);
  const reduced = !!useReducedMotion();
  const layout = useMemo(() => (w && h ? computeLayout(w, h, steps.length, { title, subtitle }) : null), [w, h, steps.length, title, subtitle]);

  // one flash per completion: remember what each step looked like last render and compare
  const [seen, setSeen] = useState(() => statusMap(steps));
  const [flashes, setFlashes] = useState<Record<string, number>>({});
  const changed = steps.filter((s) => seen[s.key] !== s.status);
  if (changed.length) {
    setSeen(statusMap(steps));
    const bumped = changed.filter((s) => isFinished(s.status) && seen[s.key] !== undefined && !isFinished(seen[s.key]));
    if (bumped.length) setFlashes((f) => ({ ...f, ...Object.fromEntries(bumped.map((s) => [s.key, (f[s.key] ?? 0) + 1])) }));
  }

  const finished = steps.filter((s) => isFinished(s.status)).length;
  const running = steps.filter((s) => s.status === "running");
  const p: Progress = {
    steps,
    lead: running[0],
    leadIndex: running[0] ? steps.indexOf(running[0]) : -1,
    finished,
    warns: steps.filter((s) => s.status === "warn").length,
    errors: steps.filter((s) => s.status === "error").length,
    complete: steps.length > 0 && finished === steps.length,
  };
  const started = steps.some((s) => s.status !== "pending");
  const elapsed = useElapsed(started && !p.complete);
  const heat = steps.length ? (finished + running.length * 0.5) / steps.length : 0;

  // onExited fires once per exit; re-arm when the caller brings the theatre back
  const exitFired = useRef(false);
  useEffect(() => {
    if (!exiting) exitFired.current = false;
  }, [exiting]);
  const done = () => {
    if (!exiting || exitFired.current) return;
    exitFired.current = true;
    onExited?.();
  };

  const cx = layout?.kind === "orbital" ? layout.cx : w / 2;
  const cy = layout?.kind === "orbital" ? layout.orbY : h / 2;
  const summary = p.lead ? `Step ${p.leadIndex + 1} of ${steps.length}: ${p.lead.agent}, ${p.lead.task}` : p.complete ? `All ${steps.length} steps finished` : "Waiting to start";

  return (
    <div ref={root} className={`relative isolate h-dvh w-full overflow-hidden bg-bg text-text ${className}`}>
      {layout && (
        <>
          <Backdrop w={w} h={h} cx={cx} cy={cy} heat={heat} reduced={reduced} />
          {layout.kind === "orbital" ? (
            <Orbital l={layout} p={p} reduced={reduced} flashes={flashes} voiceLevel={voiceLevel} exiting={exiting} elapsed={elapsed} title={title} subtitle={subtitle} />
          ) : (
            <Timeline l={layout} p={p} reduced={reduced} flashes={flashes} voiceLevel={voiceLevel} exiting={exiting} title={title} subtitle={subtitle} />
          )}
        </>
      )}
      {/* outside the layout guard, so onExited still fires if the stage was never measured */}
      {exiting && <ExitWash cx={cx} cy={cy} w={w} h={h} reduced={reduced} onDone={done} />}
      <p role="status" aria-live="polite" className="sr-only">
        {title}. {summary}
      </p>
    </div>
  );
}
