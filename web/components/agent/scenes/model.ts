// Types and pure derivations for the audit journey. Nothing here is fetched or invented: every
// value is read from an API response or from the synthetic dataset the API itself was built on.
import type { Answer, Myths } from "@/lib/agentApi";
import type { SampleKey } from "@/lib/commands";
import type { ServerDrill, ServerRepair, ServerState } from "@/lib/live";
import type { Alum, Dataset, Student } from "@/lib/types";
import type { ModelLabScenario, SimulateResponse } from "@/lib/arena-types";

export type FullState = ServerState & {
  terms: { attempted: number; earned: number; withdrawals: number; failures?: number }[];
  courses_done: string[];
  courses_in_progress: string[];
  major: string;
  track: string;
  entry_type: string;
  residency?: string;
  class_level?: string;
  credits_earned: number;
  credits_required: number;
  work_hours: number;
};

/** The API returns more than `lib/live.ts` types; only what the scenes read is declared here. */
export type DrillFull = ServerDrill & { threshold?: number; probs?: { withdraw: number; lighter: number }; ttd_now_median?: number };
export type RepairLever = NonNullable<ServerRepair["primary"]> & { lever?: string };
export type RepairFull = Omit<ServerRepair, "primary" | "fallback"> & { primary: RepairLever | null; fallback: RepairLever | null; current_load?: number };

export type DeckScene = "risk" | "timeline" | "twins" | "drill" | "repair" | "careers" | "answer";

// Synthetic students from the pinned dataset, checked against the trained model (none refused).
export const SAMPLES: { id: string; key: SampleKey; label: string; hint: string }[] = [
  { id: "CID-510094", key: "working", label: "Working 22 h/week", hint: "the alarm fires early" },
  { id: "CID-137153", key: "cooked", label: "Light load, heavy job", hint: "already cooked" },
  { id: "CID-104853", key: "on_track", label: "Full loads", hint: "on track" },
];

/** Everything the deck shows about the loaded student. */
export interface Journey {
  id: string;
  name: string | null;
  source: "sample" | "gemini" | "claude";
  label: string;
  auditWarnings: string[];
  st: FullState;
  /** Weekly work hours the user gave (an audit cannot say); undefined lets the server use the profile. */
  work: number | undefined;
  /** Credits per term the drill and the pace projection use: the student's own average. */
  load: number;
  drill: DrillFull | null;
  repair: RepairFull | null;
  myths: Myths | null;
  /** The narrator's headline text (numbers placed by the server from tool results). */
  headline: string;
  alarm: { id: number | null; fires: boolean } | null;
  sample: Student | null;
}

export type Verdict = "cooked" | "on watch" | "on track";
export const verdictOf = (risk: number): Verdict => (risk >= 0.5 ? "cooked" : risk >= 0.2 ? "on watch" : "on track");
/** 0.427 -> "43%"; a real but tiny risk reads "<1%", never a misleading "0%". */
export const pct = (x: number) => (x > 0 && x < 0.005 ? "<1%" : `${Math.round(x * 100)}%`);
export const yrs = (x: number) => `${x.toFixed(1)}`;

/** A scene's answer-driven override: the drill and repair scenes borrow the answer's text as their takeaway. */
export interface AnswerOverride {
  scene: "drill" | "repair";
  answer: Answer;
}

export const loadOf = (st: Pick<FullState, "terms">): number => (st.terms.length ? Math.round(st.terms.reduce((a, t) => a + t.attempted, 0) / st.terms.length) : 15);

// ---------------------------------------------------------------- twins, from the dataset

export interface Band {
  x: number[];
  median: (number | null)[];
  low: (number | null)[];
  high: (number | null)[];
  n: number;
}
export interface TwinFacts {
  /** Twins found in the dataset (equals `st.twins.n`). */
  n: number;
  cooked: number;
  onTime: number;
  ttd: { p25: number; median: number; p75: number };
  /** First destinations of the twins who reported one. "No Response" is unknown, never an outcome. */
  destinations: { label: string; count: number }[];
  reported: number;
  noResponse: number;
  /** Credits attempted per term across the twins' own histories, so the student's load can be laid beside it. */
  load: { onTime: Band | null; cooked: Band | null };
  /** What the twins averaged per term after the point the student has reached. */
  loadAfter: { onTime: number | null; cooked: number | null };
}

export function quantile(sorted: number[], p: number): number {
  if (!sorted.length) return NaN;
  const i = (sorted.length - 1) * p;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
}

const byIdCache = new WeakMap<Alum[], Map<string, Alum>>();
export function alumniById(ds: Dataset): Map<string, Alum> {
  let m = byIdCache.get(ds.alumni);
  if (!m) {
    m = new Map(ds.alumni.map((a) => [a.id, a]));
    byIdCache.set(ds.alumni, m);
  }
  return m;
}

const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const MIN_BAND = 5;

function band(twins: Alum[], maxT: number): Band | null {
  if (twins.length < MIN_BAND) return null;
  const x: number[] = [];
  const median: (number | null)[] = [];
  const low: (number | null)[] = [];
  const high: (number | null)[] = [];
  for (let t = 1; t <= maxT; t++) {
    const vals = twins.filter((a) => a.terms.length >= t).map((a) => a.terms[t - 1][0]).sort((a, b) => a - b);
    x.push(t);
    if (vals.length >= MIN_BAND) {
      median.push(quantile(vals, 0.5));
      low.push(quantile(vals, 0.25));
      high.push(quantile(vals, 0.75));
    } else {
      median.push(null);
      low.push(null);
      high.push(null);
    }
  }
  return { x, median, low, high, n: twins.length };
}

/** The matched twins as they appear in the synthetic dataset. Null while the dataset loads or when COOKED refused to match. */
export function twinFacts(ds: Dataset | null, st: FullState): TwinFacts | null {
  if (!ds || st.twins.refused) return null;
  const byId = alumniById(ds);
  const twins = st.twins.ids.map((id) => byId.get(id)).filter((a): a is Alum => !!a);
  if (!twins.length) return null;
  const k = st.terms.length;
  const ok = twins.filter((a) => !a.cooked);
  const bad = twins.filter((a) => a.cooked);
  const ttd = twins.map((a) => a.ttd).sort((a, b) => a - b);
  const counts = new Map<string, number>();
  for (const a of twins) counts.set(a.dest, (counts.get(a.dest) ?? 0) + 1);
  const noResponse = counts.get("No Response") ?? 0;
  const destinations = [...counts.entries()].filter(([l]) => l !== "No Response").map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
  const after = (group: Alum[]) => {
    const per = group.filter((a) => a.terms.length > k).map((a) => mean(a.terms.slice(k).map((t) => t[0])));
    return per.length ? mean(per) : null;
  };
  const maxT = Math.min(12, Math.max(...twins.map((a) => a.terms.length)));
  return {
    n: twins.length,
    cooked: bad.length,
    onTime: ok.length,
    ttd: { p25: quantile(ttd, 0.25), median: quantile(ttd, 0.5), p75: quantile(ttd, 0.75) },
    destinations,
    reported: twins.length - noResponse,
    noResponse,
    load: { onTime: band(ok, maxT), cooked: band(bad, maxT) },
    loadAfter: { onTime: after(ok), cooked: after(bad) },
  };
}

// ---------------------------------------------------------------- careers scenario

/** The lab's own defaults for what an audit cannot tell us. */
export const ASSUMED = { internship_count: 1, credential_count: 1, engagement_count: 3 } as const;

export interface CareersInput {
  scenario: ModelLabScenario;
  /** Inputs read from the student's real record, in words for the receipt chips. */
  real: string[];
  /** Inputs an audit does not carry, held at the Model Lab defaults. */
  assumed: string[];
  /** Real inputs that had to be held inside the range the models were trained on. */
  clamped: string[];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** Map the student's real state onto a Model Lab scenario. Null when the major or entry type is not one the lab models. */
export function careersInput(st: FullState, sample: Student | null): CareersInput | null {
  const major = st.major === "Computer Science" || st.major === "Information Systems" ? st.major : null;
  const entry = st.entry_type === "Transfer" || st.entry_type === "First-Time Freshman" ? st.entry_type : null;
  if (!major || !entry || !st.terms.length) return null;
  const residency = st.residency === "In-State" || st.residency === "Out-of-State" ? st.residency : null;
  const attempted = st.terms.reduce((a, t) => a + t.attempted, 0);
  const earned = st.terms.reduce((a, t) => a + t.earned, 0);
  const withdrawals = st.terms.reduce((a, t) => a + t.withdrawals, 0);
  const clamped: string[] = [];
  const hold = (label: string, raw: number, lo: number, hi: number) => {
    const v = clamp(raw, lo, hi);
    if (v !== raw) clamped.push(label);
    return v;
  };
  const scenario: ModelLabScenario = {
    major,
    entry_type: entry,
    residency: residency ?? "In-State",
    work_hours: Math.round(hold("work hours", st.work_hours, 0, 50)),
    completed_terms: hold("completed terms", st.terms.length, 0, 6),
    credits_per_term: Math.round(hold("credits per term", attempted / st.terms.length, 3, 18)),
    earned_ratio: Math.round(hold("credits earned", attempted ? earned / attempted : 1, 0.5, 1) * 100) / 100,
    withdrawals: hold("withdrawals", withdrawals, 0, 10),
    failures: hold("failures", st.terms.reduce((sum, t) => sum + (t.failures ?? 0), 0), 0, 10),
    enrollment_gaps: hold("enrollment gaps", st.enrollment_gaps ?? sample?.gaps ?? 0, 0, 4),
    internship_count: sample ? clamp(sample.intern, 0, 4) : ASSUMED.internship_count,
    credential_count: ASSUMED.credential_count,
    engagement_count: ASSUMED.engagement_count,
  };
  const real = [
    major,
    entry === "Transfer" ? "transfer" : "first-time",
    ...(residency ? [residency.toLowerCase()] : []),
    `${scenario.work_hours} h/week`,
    `${scenario.completed_terms} terms done`,
    `${scenario.credits_per_term} credits/term`,
    `${Math.round(scenario.earned_ratio * 100)}% credits earned`,
    `${scenario.withdrawals} withdrawals`,
    ...(sample ? [`${scenario.internship_count} internship${scenario.internship_count === 1 ? "" : "s"}`] : []),
  ];
  const assumed = [
    ...(residency ? [] : ["in-state residency"]),
    ...(sample ? [] : [`${ASSUMED.internship_count} internship`]),
    `${ASSUMED.credential_count} credential`,
    `${ASSUMED.engagement_count} campus engagements`,
  ];
  return { scenario, real, assumed, clamped };
}

export interface CareersData {
  input: CareersInput;
  sim: SimulateResponse;
  /** From the arena report: how much to trust each output. */
  trust: { careerFamily: string | null; careerMacroF1: number | null; salaryBias: number | null; salaryFamily: string | null };
}

export type CareersState = { status: "idle" } | { status: "loading" } | { status: "ready"; data: CareersData } | { status: "unavailable"; reason: string };

export type { SampleKey };
