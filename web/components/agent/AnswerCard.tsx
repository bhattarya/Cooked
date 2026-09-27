"use client";

import { motion } from "motion/react";
import { Bars, Dumbbell, RiskRing } from "@/components/viz";
import type { Answer, CourseStatus, Visual } from "@/lib/agentApi";
import type { Dataset } from "@/lib/types";
import { PrereqMap } from "../PrereqMap";
import { Stage } from "./scenes/kit";
import { pct, type Journey } from "./scenes/model";

// The visuals an answer can carry, drawn with the viz library. Drill and repair answers are not
// drawn here: they move the deck to the Fire drill and Repair scenes instead.

function Change({ label, unit, before, after, delay }: { label: string; unit: string; before: number; after: number; delay: number }) {
  const same = before === after;
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: 0.6 }} className="rounded-2xl border border-line bg-panel/60 p-4">
      <div className="label">{label}</div>
      <div className="display mt-1 flex items-baseline gap-2.5 text-[2.6rem] font-black leading-none">
        {same ? (
          <span className="text-muted">{after}</span>
        ) : (
          <>
            <span className="text-dim line-through decoration-1">{before}</span>
            <span aria-hidden className="text-gold">→</span>
            <span className="text-gold-grad">{after}</span>
          </>
        )}
      </div>
      <div className="num mt-1 text-[11px] text-dim">{same ? `${unit} · unchanged` : unit}</div>
    </motion.div>
  );
}

function WhatIfView({ v }: { v: Extract<Visual, { type: "whatif" }> }) {
  const { before: b, after: a } = v;
  const ceil = Math.max(6, Math.ceil(Math.max(b.years, a.years) + 1));
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-5">
      <div className="grid grid-cols-2 gap-3">
        <Change label="work hours" unit="h / week" before={b.work} after={a.work} delay={0.05} />
        <Change label="course load" unit="credits / term" before={b.load} after={a.load} delay={0.15} />
      </div>
      <div>
        <div className="label mb-1">model risk of getting cooked</div>
        <Dumbbell data={[{ label: "Model risk", before: b.risk, after: a.risk }]} betterWhen="lower" beforeLabel="Your plan now" afterLabel="What if" format={pct} domain={[0, 1]} formatDelta={(d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.round(Math.abs(d) * 100)} pts`} />
      </div>
      <div>
        <div className="label mb-1">finish at that pace, in years</div>
        <Dumbbell data={[{ label: "Years to finish", before: b.years, after: a.years }]} betterWhen="lower" beforeLabel="Your plan now" afterLabel="What if" format={(x) => x.toFixed(1)} domain={[0, ceil]} formatDelta={(d) => `${d > 0 ? "+" : d < 0 ? "−" : ""}${Math.abs(d).toFixed(1)} yrs`} />
      </div>
    </div>
  );
}

function CourseCard({ c, i }: { c: CourseStatus; i: number }) {
  if (!c.known) return <div className="rounded-2xl border border-line p-4 text-sm text-muted">{c.course_id}: not in the catalogue</div>;
  const state = c.already_have
    ? { t: "Already have it", col: "var(--cool)" }
    : c.missing_prereqs?.length
      ? { t: `Blocked: needs ${c.missing_prereqs.join(", ")}`, col: "var(--hot)" }
      : c.offered_next_term
        ? { t: `Open for ${c.term}`, col: "var(--cool)" }
        : { t: `Not offered ${c.term}`, col: "var(--gold)" };
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 + i * 0.12 }} className="rounded-2xl border border-line bg-panel/60 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="display text-[2rem] font-black leading-none text-cream">{c.course_id}</div>
          <div className="mt-1 truncate text-xs text-muted">
            {c.title} · {c.credits} cr
          </div>
        </div>
        {c.required_for_major && <span className="shrink-0 rounded-full bg-gold/10 px-2 py-0.5 text-[10px] text-gold">required</span>}
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ color: state.col, background: `color-mix(in srgb, ${state.col} 12%, transparent)` }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: state.col }} />
        {state.t}
      </div>
      <div className="mt-3 flex items-end gap-5">
        <div>
          <div className="num text-2xl font-semibold">{c.gates}</div>
          <div className="text-[11px] text-dim">courses it unlocks</div>
        </div>
        <div>
          <div className="num text-2xl font-semibold">{c.gates_required?.length ?? 0}</div>
          <div className="text-[11px] text-dim">of them required</div>
        </div>
        <div className="ml-auto text-right text-[11px] text-dim">offered {c.offered?.join(" / ")}</div>
      </div>
    </motion.div>
  );
}

function CourseView({ v, j, ds }: { v: Extract<Visual, { type: "course" }>; j: Journey; ds: Dataset | null }) {
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-4">
      <div className={`grid gap-3 ${v.courses.length > 1 ? "sm:grid-cols-2" : ""}`}>
        {v.courses.map((c, i) => (
          <CourseCard key={c.course_id} c={c} i={i} />
        ))}
      </div>
      {ds && (
        <div className="min-h-0">
          <div className="label mb-1.5">your {j.st.major} prerequisite map · the question is highlighted</div>
          <PrereqMap catalog={ds.catalog} major={j.st.major} done={j.st.courses_done} ip={j.st.courses_in_progress} picks={v.highlight ?? []} maxHeight={220} />
        </div>
      )}
    </div>
  );
}

function ExplainView({ v, j }: { v: Extract<Visual, { type: "explain" }>; j: Journey }) {
  const st = v.state;
  const bars = [{ key: "you", label: "You, credits a term", value: st.avg_credits.value }, ...(v.reference_load != null ? [{ key: "twins", label: "On-time twins, afterwards", value: v.reference_load, color: "var(--cool)" }] : [])];
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-4">
      <Stage className="!h-auto items-center">{(box) => <RiskRing value={st.risk.value} size={Math.min(box.w, 250)} n={st.twins.refused ? undefined : st.twins.n} label="model risk of getting cooked" />}</Stage>
      <div className="w-full">
        <div className="label mb-1">what separates you from twins who finished on time</div>
        <Bars data={bars} orientation="horizontal" format={(x) => x.toFixed(1)} domain={[0, Math.max(12, Math.ceil(Math.max(...bars.map((b) => b.value)) / 3) * 3)]} unit="credits a term" highlight="you" height={bars.length * 46 + 10} />
        {v.reference_load == null && <p className="mt-1 text-[12px] text-dim">{st.twins.refused ? "Too few matched alumni for a comparison: COOKED refuses to guess." : "No on-time twin has a history that long to compare with."}</p>}
        <p className="mt-1 text-[11px] text-dim">
          {j.st.terms_done.value} terms done · averaging {st.avg_credits.value} credits
        </p>
      </div>
    </div>
  );
}

/** The chart for an answer, sized by the stage it is placed in. */
export function AnswerVisual({ a, j, ds }: { a: Answer; j: Journey; ds: Dataset | null }) {
  const v = a.visual;
  if (v.type === "whatif") return <WhatIfView v={v} />;
  if (v.type === "course") return <CourseView v={v} j={j} ds={ds} />;
  if (v.type === "explain") return <ExplainView v={v} j={j} />;
  return null;
}

export const TOOL_LABEL: Record<Answer["tool"], string> = {
  what_if: "What-if agent",
  course_plan: "Course planner",
  stress_test: "Fire-drill agent",
  find_fix: "Repair agent",
  explain_risk: "Watchtower",
};
