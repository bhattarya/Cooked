// The words on each scene, written from real values. The scenes render these strings and the voice
// agent is handed the same ones, so what is said always matches what is on screen. No number here
// is typed by hand: each comes from the API, the models or the synthetic dataset.
import type { Answer } from "@/lib/agentApi";
import { money } from "@/components/viz";
import type { CareersState, DeckScene, DrillFull, Journey, RepairFull, TwinFacts } from "./model";
import { pct, verdictOf, yrs } from "./model";

export interface SceneVoice {
  title: string;
  summary: string;
  facts: Record<string, string | number | boolean | null>;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The refusal reason the twin matcher gave, in a sentence. The matcher's own words are used verbatim. */
export const twinsReason = (reason: string | null): string => reason ?? "no set of alumni could be matched to you";

// ---------------------------------------------------------------- risk

export function riskFacts(j: Journey) {
  const { st } = j;
  return { risk: st.risk.value, verdict: verdictOf(st.risk.value), twinShare: st.twin_cooked_share?.value ?? null, years: st.plan?.projected_years.value ?? null };
}

/** The verdict in plain words, placed from tool results the way the server's own narration template places them. */
export function riskTakeaway(j: Journey): string {
  const { st } = j;
  const stage = st.terms_done.value === 0
    ? "The audit has no completed regular terms, so this is a starting-stage score."
    : `The audit shows ${plural(st.terms_done.value, "completed regular term")} averaging ${st.avg_credits.value} attempted credits.`;
  const match = st.twins.refused
    ? "There were too few balanced alumni for a matched outcome comparison."
    : `${st.twins.n} balanced alumni provide a separate comparison on the next screen.`;
  return `${stage} The trained model scores the risk of taking over five years or accumulating withdrawals at ${pct(st.risk.value)}. ${match}`;
}

export function riskVoice(j: Journey): SceneVoice {
  const { st } = j;
  const f = riskFacts(j);
  const twin = st.twins.refused ? `COOKED refuses to compare with alumni: ${twinsReason(st.twins.reason)}.` : `Compared with ${st.twins.n} matched alumni, ${pct(f.twinShare ?? 0)} of them got cooked.`;
  return {
    title: `Verdict: ${f.verdict}`,
    summary: `Model risk is ${pct(f.risk)}, ${f.verdict}${st.pattern ? `, trajectory pattern ${st.pattern}` : ""}. ${twin} ${st.terms_done.value} terms done at ${st.avg_credits.value} credits a term; ${st.credits_earned} of ${st.credits_required} credits earned.`,
    facts: {
      model_risk_percent: Math.round(f.risk * 100),
      verdict: f.verdict,
      pattern: st.pattern,
      matched_alumni: st.twins.refused ? 0 : st.twins.n,
      twins_refused: st.twins.refused,
      twins_cooked_percent: f.twinShare === null ? null : Math.round(f.twinShare * 100),
      terms_done: st.terms_done.value,
      average_credits_per_term: st.avg_credits.value,
      credits_earned: st.credits_earned,
      credits_required: st.credits_required,
      work_hours: st.work_hours,
    },
  };
}

// ---------------------------------------------------------------- timeline

export function timelineTakeaway(j: Journey, tw: TwinFacts | null): string {
  const t = j.st.time_to_degree;
  const model = `The trained model estimates ${yrs(t.mid)} years to degree; its 25th to 75th percentile predictions run from ${yrs(t.low)} to ${yrs(t.high)} years.`;
  if (!tw) return j.st.twins.refused ? `${model} COOKED found no balanced twins to compare with, so it shows no alumni line.` : model;
  const load = tw.loadAfter.onTime;
  return `${model} Your ${tw.n} twins actually took ${yrs(tw.ttd.median)}${load !== null ? `, and those who finished on time carried ${load.toFixed(1)} credits a term from here. You carry ${j.st.avg_credits.value}` : ""}.`;
}

export function timelineVoice(j: Journey, tw: TwinFacts | null): SceneVoice {
  const t = j.st.time_to_degree;
  return {
    title: `Timeline: ${yrs(t.mid)} years`,
    summary: timelineTakeaway(j, tw),
    facts: {
      time_to_degree_median_years: t.mid,
      likely_range_low_years: t.low,
      likely_range_high_years: t.high,
      delay_beyond_four_years: j.st.delay.mid,
      twins_median_years: tw ? Math.round(tw.ttd.median * 10) / 10 : null,
      on_time_twins_credits_per_term_after: tw?.loadAfter.onTime != null ? Math.round(tw.loadAfter.onTime * 10) / 10 : null,
      your_credits_per_term: j.st.avg_credits.value,
      sample_size: t.support,
    },
  };
}

// ---------------------------------------------------------------- twins

export function twinsTakeaway(j: Journey): string {
  const { twins } = j.st;
  if (twins.refused) return `${cap(twinsReason(twins.reason))}. COOKED needs at least 30 balanced twins before it will say anything about outcomes, so it will not guess.`;
  const share = j.st.twin_cooked_share?.value ?? 0;
  const cooked = Math.round(share * twins.n);
  const tail = share >= 0.95 ? "Nearly all of them did." : share <= 0.05 ? "Almost none did." : "Same start, very different endings.";
  return `${cooked} of your ${twins.n} twins got cooked, ${pct(share)}. ${tail}`;
}

export function twinsVoice(j: Journey, tw: TwinFacts | null): SceneVoice {
  const { st } = j;
  const seek = st.still_seeking_risk;
  return {
    title: st.twins.refused ? "Twins: refused" : `Twins: ${st.twins.n} matched alumni`,
    summary: `${twinsTakeaway(j)}${seek ? ` Of twins who reported a first destination, ${pct(seek.mid)} were still seeking at six months (${pct(seek.low)} to ${pct(seek.high)}, n=${seek.support}); No Response is treated as unknown.` : ""}`,
    facts: {
      matched_alumni: st.twins.n,
      twins_refused: st.twins.refused,
      refusal_reason: st.twins.reason,
      twins_cooked_percent: st.twin_cooked_share ? Math.round(st.twin_cooked_share.value * 100) : null,
      still_seeking_percent: seek ? Math.round(seek.mid * 100) : null,
      still_seeking_sample: seek?.support ?? null,
      twins_median_years_to_degree: tw ? Math.round(tw.ttd.median * 10) / 10 : null,
    },
  };
}

// ---------------------------------------------------------------- drill

export interface DrillReading {
  kind: "resilient" | "breaks" | "past";
  shocks: number;
  finalRisk: number | null;
  spof: string | null;
}
export const readDrill = (d: DrillFull): DrillReading => {
  const stc = d.shocks_to_cooked;
  return {
    kind: stc === null ? "resilient" : stc.value === 0 ? "past" : "breaks",
    shocks: stc === null ? d.path.length : stc.value,
    finalRisk: d.path.length ? d.path[d.path.length - 1].risk_after : null,
    spof: d.single_point_of_failure,
  };
};

export function drillTakeaway(d: DrillFull): string {
  const r = readDrill(d);
  const line = pct(d.threshold ?? 0.5);
  if (r.kind === "past") return `At ${d.plan_load} credits a term the plan is already past the ${line} line before any shock. The fix matters more than the drill.`;
  if (r.kind === "breaks") return `At ${d.plan_load} credits a term, ${r.shocks === 1 ? "one shock breaks" : `${r.shocks} shocks break`} the plan.${r.spof ? ` The weakest point: ${r.spof.toLowerCase()}.` : ""}`;
  return `At ${d.plan_load} credits a term the plan absorbed ${plural(r.shocks, "shock")} in a row and ends at ${pct(r.finalRisk ?? d.baseline_risk)} risk, well short of the ${line} line.${r.spof ? ` Weakest point: ${r.spof.toLowerCase()}.` : ""}`;
}

export function drillVoice(j: Journey, d: DrillFull, answer?: Answer): SceneVoice {
  const r = readDrill(d);
  return {
    title: r.kind === "resilient" ? `Fire drill: holds through ${plural(r.shocks, "shock")}` : r.kind === "past" ? "Fire drill: already past the line" : `Fire drill: breaks after ${plural(r.shocks, "shock")}`,
    summary: answer?.text ?? drillTakeaway(d),
    facts: {
      plan_credits_per_term: d.plan_load,
      baseline_risk_percent: Math.round(d.baseline_risk * 100),
      shocks_survived_or_to_break: r.shocks,
      outcome: r.kind,
      weakest_point: r.spof,
      simulated_futures: d.sims,
      trajectories_stored: d.rows_stored,
      student_risk_now_percent: Math.round(d.risk_now * 100),
      work_hours: j.st.work_hours,
    },
  };
}

// ---------------------------------------------------------------- repair

export interface RepairReading {
  kind: "fix" | "nothing" | "none";
  title: string;
  accent: string;
}
export function readRepair(r: RepairFull, risk: number): RepairReading {
  if (r.primary) return { kind: "fix", title: "Save", accent: `${r.primary.diff_years.toFixed(1)} years` };
  return risk < 0.2 ? { kind: "nothing", title: "Nothing", accent: "to fix" } : { kind: "none", title: "No safe", accent: "fix" };
}

export function repairTakeaway(j: Journey, r: RepairFull): string {
  const p = r.primary;
  if (!p) return j.st.risk.value < 0.2 ? `Model risk is ${pct(j.st.risk.value)}, so there is nothing to repair. ${r.refusal ?? ""}`.trim() : `${r.refusal ?? "Nothing has enough evidence behind it."} COOKED won't prescribe a change it can't back with matched students.`;
  const range = p.ci90 ? `90% range ${p.ci90[0].toFixed(1)} to ${p.ci90[1].toFixed(1)}, ` : "";
  return `${cap(p.pool)} who did this, ${p.title.toLowerCase()}, finished a median ${p.diff_years.toFixed(1)} years sooner (${range}n=${p.support}). That is what happened to them, not a promise.`;
}

export function repairVoice(j: Journey, r: RepairFull, answer?: Answer): SceneVoice {
  const p = r.primary;
  const picks = p?.feasibility?.picks ?? [];
  return {
    title: p ? `Repair: ${p.title}` : "Repair: nothing supported",
    summary: answer?.text ?? repairTakeaway(j, r),
    facts: {
      fix: p?.title ?? null,
      years_sooner: p ? Math.round(p.diff_years * 10) / 10 : null,
      supporting_students: p?.support ?? null,
      model_risk_now_percent: p?.model_risk_now_pace != null ? Math.round(p.model_risk_now_pace * 100) : null,
      model_risk_after_percent: p?.model_risk_at_target != null ? Math.round(p.model_risk_at_target * 100) : null,
      courses_open_next_term: picks.length ? picks.map((c) => c.course_id).join(", ") : null,
      refusal: r.refusal,
    },
  };
}

// ---------------------------------------------------------------- careers

export function careersTakeaway(c: CareersState): string {
  if (c.status !== "ready") return c.status === "unavailable" ? c.reason : "Scoring your record against the Model Lab.";
  const { sim } = c.data;
  const top = sim.career[0];
  return `A planning scenario from your record: the odds are ${pct(top.probability)} ${top.label.toLowerCase()}, and a first salary is likely ${money(sim.salary.low)} to ${money(sim.salary.high)} in nominal dollars.`;
}

export function careersVoice(c: CareersState): SceneVoice {
  if (c.status !== "ready") return { title: "Careers", summary: careersTakeaway(c), facts: {} };
  const { sim, trust } = c.data;
  return {
    title: "Careers: exploratory outlook",
    summary: `${careersTakeaway(c)} ${trust.careerFamily === "baseline" ? "The career model is the baseline, so those odds do not move with your record. " : ""}This is exploratory and associational, not a promise.`,
    facts: {
      most_likely_destination: sim.career[0].label,
      most_likely_destination_percent: Math.round(sim.career[0].probability * 100),
      salary_median_nominal_dollars: sim.salary.mid,
      salary_low_nominal_dollars: sim.salary.low,
      salary_high_nominal_dollars: sim.salary.high,
      salary_training_rows: sim.salary.support,
      career_model_is_baseline: trust.careerFamily === "baseline",
    },
  };
}

// ---------------------------------------------------------------- answer

export function answerTitle(a: Answer): { title: string; accent: string; kicker: string } {
  const v = a.visual;
  if (v.type === "whatif") {
    const workChanged = v.after.work !== v.before.work;
    const loadChanged = v.after.load !== v.before.load;
    const accent = workChanged && loadChanged ? `${v.after.work} h · ${v.after.load} cr` : loadChanged ? `${v.after.load} credits` : `${v.after.work} hours`;
    return { kicker: "what if", title: "What if", accent };
  }
  if (v.type === "course") return { kicker: "course check", title: "Course", accent: `${v.courses.map((c) => c.course_id).slice(0, 2).join(" vs ")}?` };
  if (a.tool === "audit_summary") return /fall|schedule|semester/i.test(a.question) ? { kicker: "your audit", title: "Your fall", accent: "schedule" } : { kicker: "your audit", title: "Your degree", accent: "progress" };
  if (v.type === "explain") return { kicker: "why", title: "Why", accent: `${pct(v.state.risk.value)}` };
  if (v.type === "drill") return { kicker: "stress test", title: "Fire", accent: "drill" };
  if (v.type === "cohort") {
    const words = v.title.trim().split(/\s+/);
    const accent = words.length > 1 ? words.slice(-1).join(" ") : v.title;
    const title = words.length > 1 ? words.slice(0, -1).join(" ") : "Cohort";
    return { kicker: "the cohort", title, accent };
  }
  return { kicker: "the fix", title: "The", accent: "fix" };
}

export function answerVoice(a: Answer): SceneVoice {
  const t = answerTitle(a);
  return { title: `Answer: ${t.title} ${t.accent}`, summary: a.text, facts: { question: a.question, tool: a.tool, numbers_traced: a.provenance.tokens } };
}

/** Which bus scene ids the deck scenes correspond to (the answer scene has no equivalent). */
export const BUS_SCENE: Record<DeckScene, "risk" | "timeline" | "twins" | "drill" | "repair" | "careers" | null> = {
  risk: "risk",
  timeline: "timeline",
  twins: "twins",
  drill: "drill",
  repair: "repair",
  careers: "careers",
  answer: null,
};
