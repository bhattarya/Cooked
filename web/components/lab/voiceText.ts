// What the lab tells the voice agent: sentences and facts assembled from the numbers on screen.
import type { ArenaReport, SimulateResponse, TaskId } from "@/lib/arena-types";
import type { ScreenContext } from "@/lib/commands";
import { board, gainText, protocol } from "@/lib/labArena";
import { FAMILY_FULL, FAMILY_NAME, TASKS, careerP, careerTop, clampNotes, headline, pct0, salaryBias, taskLabel, usd } from "@/lib/labModel";
import { verdictOf } from "./CardsScene";
import { constellationFacts } from "./ConstellationScene";
import type { LabSim } from "./useLabSim";

export type LabScene = "lab" | "constellation" | "arena" | "cards";

export interface LabView {
  sim: LabSim;
  arena: ArenaReport | null;
  task: TaskId;
  metricId: string;
  stage: number;
}

const yr = ([a, b]: [number, number]) => `${a} to ${b}`;

/** The headline numbers of the control room, every one from the last answer of the models. */
function labSentences(r: SimulateResponse, arena: ArenaReport | null): string {
  const t = r.time_to_degree;
  const champ = r.candidates.champions;
  const top = careerTop(r);
  const bias = salaryBias(arena, r);
  const learned = r.candidates.risk.filter((c) => c.family !== "baseline").map((c) => c.risk);
  const s = r.scenario;
  return [
    `Scenario: ${s.major}, ${s.entry_type}, ${s.residency}, ${s.completed_terms} completed terms at ${s.credits_per_term} credits, ${s.work_hours} work hours a week, ${s.withdrawals} withdrawals, ${s.failures} failed courses, ${s.enrollment_gaps} enrollment gaps, ${s.internship_count} internships, ${s.credential_count} credentials, ${s.engagement_count} campus engagement activities.`,
    `Academic risk ${pct0(r.risk)} from the ${FAMILY_FULL[champ.risk].toLowerCase()}; the three learned models range ${pct0(Math.min(...learned))} to ${pct0(Math.max(...learned))}.`,
    r.drivers.length ? `What moves it: ${r.drivers.map((d) => `${d.label.toLowerCase()} ${d.direction} it by ${Math.abs(Math.round(d.delta * 100))} points`).join(", ")}.` : "Nothing stands out against the typical alumnus.",
    `Time to degree median ${t.mid.toFixed(1)} years, likely ${t.low.toFixed(1)} to ${t.high.toFixed(1)} (${FAMILY_FULL[champ.time_to_degree].toLowerCase()}).`,
    champ.career === "baseline"
      ? `Career: base rates, ${pct0(top.probability)} ${top.label}; no model beat them, so they do not move with the inputs.`
      : `Career: ${pct0(top.probability)} ${top.label} (${FAMILY_FULL[champ.career].toLowerCase()}).`,
    `First salary median ${usd(r.salary.mid)}, likely ${usd(r.salary.low)} to ${usd(r.salary.high)} in nominal dollars${bias !== null && bias < 0 ? `; this model ran about ${usd(Math.abs(bias))} low on the holdout` : ""}.`,
    r.pattern === "not enough history" ? "No trajectory pattern yet: no completed terms." : `Trajectory pattern: ${r.pattern}.`,
  ].join(" ");
}

export function arenaSentences(arena: ArenaReport, task: TaskId, metricId: string, stage: number): string {
  const b = board(arena, task, metricId, stage);
  const pr = protocol(arena, task, stage);
  const base = b.rows[0];
  const champ = b.rows.find((r) => r.champion);
  const v = verdictOf(arena, task);
  const detail = b.rows.map((r) => `${FAMILY_NAME[r.family]} ${b.metric.format(r.value)}`).join(", ");
  const gain = champ?.gain;
  return [
    `Arena, ${taskLabel(task)}${task === "risk" ? ` after ${stage} completed terms` : ""}: ${v.headline}.`,
    `${b.metric.label} on the ${yr(pr.testYears)} holdout of ${pr.nTest.toLocaleString("en-US")} alumni (${b.metric.better} is better): ${detail}.`,
    b.nobodyBeatsBaseline
      ? `The baseline, ${b.metric.format(base.value)}, is champion because no learned model beat it beyond noise.`
      : `${FAMILY_FULL[b.champion]} is champion${gain ? `: ${gainText(task, gain)}` : ""}.`,
    b.holdoutBest !== b.champion ? `${FAMILY_FULL[b.holdoutBest]} scored best on the holdout, but the champion was fixed earlier on a validation year.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function cardsSentences(arena: ArenaReport): string {
  return `Model cards, from most to least trust: ${TASKS.map((t) => `${t.label}: ${verdictOf(arena, t.id).headline.toLowerCase()}`).join("; ")}. All of it is synthetic data and associational, not causal.`;
}

/** One paragraph for a scene change or a describeScreen question. Falls back gracefully while data loads. */
export function sceneSentence(scene: LabScene, v: LabView): string {
  const r = v.sim.result;
  if (scene === "lab") return r ? `Shape a future. ${headline(r)}` : "Shape a future. The models are still answering.";
  if (scene === "constellation") {
    const f = constellationFacts(v.sim, v.arena);
    if (!f) return "The trajectory sample is still loading.";
    return f.pattern ? `Trajectory: your scenario follows the ${f.pattern} pattern, shared by ${pct0(f.share)} of ${f.n} sampled alumni${f.alumni ? ` out of ${f.alumni.toLocaleString("en-US")}` : ""}.` : "Trajectory: with no completed terms there is no history to classify.";
  }
  if (scene === "arena") return v.arena ? arenaSentences(v.arena, v.task, v.metricId, v.stage) : "The arena report is still loading.";
  return v.arena ? cardsSentences(v.arena) : "The model cards are still loading.";
}

export function screenContext(scene: LabScene, v: LabView): ScreenContext {
  const r = v.sim.result;
  const title = { lab: "Shape a future", constellation: "Trajectory patterns", arena: `The arena: ${taskLabel(v.task)}`, cards: "Model cards" }[scene];
  const base: ScreenContext = {
    scene: "models",
    title,
    summary: `Model Lab, lab scene "${title}". ${scene === "lab" && r ? labSentences(r, v.arena) : sceneSentence(scene, v)} The four lab scenes, reached with next and previous, are: Shape a future, Trajectory patterns, The arena, Model cards. Synthetic data; associations, not promises.`,
    student: false,
    scenes: ["models", "explore"],
  };
  if (!r) return base;
  const s = r.scenario;
  const top = careerTop(r);
  const facts: NonNullable<ScreenContext["facts"]> = {
    lab_scene: scene,
    major: s.major,
    entry_type: s.entry_type,
    residency: s.residency,
    work_hours: s.work_hours,
    completed_terms: s.completed_terms,
    credits_per_term: s.credits_per_term,
    credits_earned_percent: Math.round(s.earned_ratio * 100),
    withdrawals: s.withdrawals,
    failed_courses: s.failures,
    enrollment_gaps: s.enrollment_gaps,
    internships: s.internship_count,
    credentials: s.credential_count,
    campus_engagement: s.engagement_count,
    risk_percent: Math.round(r.risk * 100),
    risk_model: FAMILY_FULL[r.candidates.champions.risk],
    time_to_degree_median_years: r.time_to_degree.mid,
    time_to_degree_range_years: `${r.time_to_degree.low} to ${r.time_to_degree.high}`,
    career_top: top.label,
    career_top_percent: Math.round(careerP(r.career, top.label) * 100),
    career_is_base_rates: r.candidates.champions.career === "baseline",
    first_salary_median_usd: r.salary.mid,
    first_salary_range_usd: `${r.salary.low} to ${r.salary.high}`,
    trajectory_pattern: r.pattern,
    held_at_training_edge: clampNotes(r).map((c) => c.label).join(", ") || "none",
  };
  return { ...base, facts };
}
