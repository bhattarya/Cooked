"use client";

import { motion } from "motion/react";
import type { Answer, CourseStatus, Visual } from "@/lib/agentApi";
import { SurvivalChart } from "../Charts";
import { SponsorChip, type SponsorLive } from "./Sponsors";

const pct = (x: number) => `${Math.round(x * 100)}%`;
const riskCol = (r: number) => (r >= 0.5 ? "#ff2e4d" : r >= 0.2 ? "#ffb020" : "#2dd4bf");

function Bar({ label, value, max, color, fmt, delay = 0 }: { label: string; value: number; max: number; color: string; fmt: string; delay?: number }) {
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className="num text-lg font-semibold" style={{ color }}>
          {fmt}
        </span>
      </div>
      <div className="mt-1.5 h-2 rounded-full bg-white/[0.05]">
        <motion.div className="h-full rounded-full" style={{ background: color, boxShadow: `0 0 12px ${color}88` }} initial={{ width: 0 }} animate={{ width: `${Math.min(100, (value / max) * 100)}%` }} transition={{ duration: 0.9, delay, ease: [0.16, 1, 0.3, 1] }} />
      </div>
    </div>
  );
}

export function WhatIf({ v }: { v: Extract<Visual, { type: "whatif" }> }) {
  const cols = [
    { k: "Your plan now", d: v.before, delay: 0 },
    { k: "What if", d: v.after, delay: 0.25 },
  ];
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {cols.map(({ k, d, delay }) => (
        <div key={k} className="rounded-xl border border-line bg-white/[0.02] p-4">
          <div className="label">{k}</div>
          <div className="num mt-1 text-xs text-muted">
            {d.work} h/week work · {d.load} credits/term
          </div>
          <div className="mt-3 space-y-3">
            <Bar label="model risk" value={d.risk} max={1} color={riskCol(d.risk)} fmt={pct(d.risk)} delay={delay} />
            <Bar label="projected finish" value={d.years} max={8} color={d.years > 5 ? "#ff2e4d" : d.years > 4 ? "#ffb020" : "#2dd4bf"} fmt={`${d.years} yrs`} delay={delay + 0.1} />
          </div>
        </div>
      ))}
    </div>
  );
}

function CourseCard({ c, i }: { c: CourseStatus; i: number }) {
  if (!c.known)
    return <div className="rounded-xl border border-line p-4 text-sm text-muted">{c.course_id}: not in the catalog</div>;
  const state = c.already_have
    ? { t: "Already have it", col: "#2dd4bf" }
    : c.missing_prereqs?.length
      ? { t: `Blocked: needs ${c.missing_prereqs.join(", ")}`, col: "#ff2e4d" }
      : c.offered_next_term
        ? { t: `Open for ${c.term}`, col: "#2dd4bf" }
        : { t: `Not offered ${c.term}`, col: "#ffb020" };
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.12 }} className="rounded-xl border border-line bg-white/[0.02] p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="num text-lg font-semibold">{c.course_id}</div>
          <div className="text-xs text-muted">{c.title} · {c.credits} cr</div>
        </div>
        {c.required_for_major && <span className="rounded-full bg-heat/10 px-2 py-0.5 text-[10px] text-heat">required</span>}
      </div>
      <div className="mt-3 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ color: state.col, background: `${state.col}14` }}>
        <span className="h-1.5 w-1.5 rounded-full" style={{ background: state.col }} />
        {state.t}
      </div>
      <div className="mt-3 flex items-end gap-4">
        <div>
          <div className="num text-2xl font-semibold text-text">{c.gates}</div>
          <div className="text-[11px] text-dim">courses it unlocks</div>
        </div>
        <div>
          <div className="num text-2xl font-semibold text-text">{c.gates_required?.length ?? 0}</div>
          <div className="text-[11px] text-dim">of them required</div>
        </div>
        <div className="ml-auto text-right text-[11px] text-dim">offered {c.offered?.join(" / ")}</div>
      </div>
    </motion.div>
  );
}

function Explain({ v }: { v: Extract<Visual, { type: "explain" }> }) {
  const st = v.state;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="rounded-xl border border-line bg-white/[0.02] p-4">
        <Bar label="model risk" value={st.risk.value} max={1} color={riskCol(st.risk.value)} fmt={pct(st.risk.value)} />
        <div className="num mt-3 text-[11px] text-dim">based on {st.twins.n} matched alumni</div>
      </div>
      <div className="space-y-3 rounded-xl border border-line bg-white/[0.02] p-4">
        <Bar label="your credits / term" value={st.avg_credits.value} max={18} color="#ff5a1f" fmt={String(st.avg_credits.value)} />
        {v.reference_load != null && <Bar label="on-time twins, afterwards" value={v.reference_load} max={18} color="#2dd4bf" fmt={String(v.reference_load)} delay={0.15} />}
      </div>
    </div>
  );
}

export function DrillView({ v }: { v: Extract<Visual, { type: "drill" }> }) {
  const d = v.drill;
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-2">
        {d.path.length === 0 && <div className="rounded-xl border border-hot/30 bg-hot/[0.06] p-3 text-sm text-hot">Past the line before any shock at this load.</div>}
        {d.path.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.25 }} className={`rounded-xl border p-3 ${s.cooked ? "border-hot/40 bg-hot/[0.06]" : "border-line"}`}>
            <div className="flex justify-between text-sm">
              <span>{s.label}</span>
              <span className="num text-xs text-muted">{s.term}</span>
            </div>
            <div className="num mt-1 text-xs text-muted">
              risk {pct(s.risk_before)} → <span style={{ color: riskCol(s.risk_after) }}>{pct(s.risk_after)}</span> · p={s.prob.toFixed(2)}/term
            </div>
          </motion.div>
        ))}
      </div>
      <SurvivalChart series={[{ key: "p", label: `${d.plan_load} cr`, color: "#ff5a1f", points: d.survival.map((p) => ({ t: p.term_k, label: "", alive: p.survival, graduated: 0 })) }]} height={200} />
    </div>
  );
}

export function RepairView({ v }: { v: Extract<Visual, { type: "repair" }> }) {
  const p = v.repair.primary;
  if (!p) return <div className="rounded-xl border border-line p-4 text-sm text-muted">{v.repair.refusal ?? "Nothing to fix."}</div>;
  return (
    <div className="rounded-xl border border-cool/30 bg-gradient-to-br from-cool/[0.08] to-transparent p-5">
      <div className="label !text-cool">smallest change that worked</div>
      <div className="display mt-1 text-2xl font-semibold">{p.title}</div>
      <div className="mt-3 flex flex-wrap items-end gap-6">
        <div>
          <div className="num text-4xl font-semibold text-cool">{p.diff_years.toFixed(1)}<span className="ml-1 text-base text-cool/70">yrs sooner</span></div>
          <div className="num text-xs text-muted">90% CI {p.ci90?.map((x) => x.toFixed(1)).join("–")} · n={p.support}</div>
        </div>
        {p.model_risk_now_pace !== undefined && p.model_risk_at_target !== undefined && (
          <div className="num text-sm">
            model risk <span style={{ color: riskCol(p.model_risk_now_pace) }}>{pct(p.model_risk_now_pace)}</span> → <span style={{ color: riskCol(p.model_risk_at_target) }}>{pct(p.model_risk_at_target)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

const TOOL_LABEL: Record<Answer["tool"], string> = {
  what_if: "What-if agent",
  course_plan: "Course planner",
  stress_test: "Fire-drill agent",
  find_fix: "Repair agent",
  explain_risk: "Watchtower",
};

export function AnswerCard({ a, live }: { a: Answer; live: SponsorLive }) {
  const v = a.visual;
  return (
    <motion.article layout initial={{ opacity: 0, y: 24, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 260, damping: 28 }} className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <span className="text-sm text-muted">&ldquo;{a.question}&rdquo;</span>
        <span className="ml-auto flex items-center gap-1.5">
          <span className="text-[11px] text-dim">{TOOL_LABEL[a.tool]}</span>
          <SponsorChip k="gemini" live={a.router === "gemini" && live.gemini} compact />
          {(a.tool === "stress_test" || a.tool === "explain_risk") && <SponsorChip k="tiger" live={live.tiger} compact />}
          <SponsorChip k="model" live={live.model} compact />
        </span>
      </div>
      <div className="space-y-4 p-5">
        <p className="text-[17px] leading-relaxed">
          {a.segments.map((s, i) =>
            "text" in s ? (
              <span key={i}>{s.text}</span>
            ) : (
              <span key={i} className="num mx-0.5 rounded-md bg-heat/15 px-1.5 text-heat ring-1 ring-heat/30" title={s.tool_result_id}>
                {s.value}
              </span>
            ),
          )}
        </p>
        {v.type === "whatif" && <WhatIf v={v} />}
        {v.type === "course" && (
          <div className={`grid gap-4 ${v.courses.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {v.courses.map((c, i) => (
              <CourseCard key={c.course_id} c={c} i={i} />
            ))}
          </div>
        )}
        {v.type === "explain" && <Explain v={v} />}
        {v.type === "drill" && <DrillView v={v} />}
        {v.type === "repair" && <RepairView v={v} />}
        <div className="num text-[10.5px] text-dim">{a.provenance.ok ? `✓ ${a.provenance.tokens} numbers traced to tool results` : "blocked: an untraced number"}</div>
      </div>
    </motion.article>
  );
}
