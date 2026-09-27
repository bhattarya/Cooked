"use client";

// Live mode: the FastAPI backend with the trained, checksummed models. Adapters map server
// responses onto the local engine's shapes so every component renders either source; the
// local engine stays as the offline fallback.
import { useEffect, useState } from "react";
import { project, type Drill, type Feasibility, type Lever, type Outcomes, type Repair, type Seg, type ShockStep, type State, type SurvivalPoint, type ToolResult } from "./engine";
import type { Course } from "./types";
import { authHeaders } from "./auth";

// The browser uses this origin; Next routes to the configured API server.
const API = "/backend";

export interface Health {
  live: boolean;
  version?: string;
  demo?: boolean;
  providers?: Record<string, boolean>;
  database_kind?: string;
}

let healthPromise: Promise<Health> | null = null;

export function apiHealth(): Promise<Health> {
  if (!healthPromise) {
    healthPromise = !API
      ? Promise.resolve({ live: false })
      : fetch(`${API}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(6000) })
          .then((r) => r.json())
          .then((h) => ({ live: h.mode === "models" && h.status === "ok", version: h.model_version, demo: h.demo_mode, providers: h.providers, database_kind: h.database_kind }))
          .catch(() => ({ live: false }));
  }
  return healthPromise;
}

export function useApiHealth(): Health | null {
  const [h, setH] = useState<Health | null>(null);
  useEffect(() => {
    let on = true;
    apiHealth().then((x) => on && setH(x));
    return () => {
      on = false;
    };
  }, []);
  return h;
}

export interface Call<T> {
  data: T;
  version: string;
  ms: number;
}

export async function api<T>(path: string, body?: unknown): Promise<Call<T>> {
  const t0 = performance.now();
  const r = await fetch(`${API}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { ...(await authHeaders()), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
  });
  const j = await r.json();
  if (!r.ok) throw new ApiError(r.status, j?.message ?? `HTTP ${r.status}`);
  return { data: j.data as T, version: j.model_version, ms: performance.now() - t0 };
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

// ---------- server shapes ----------
type Ev = { value: number; tool_result_id: string };
type Range = { low: number; mid: number; high: number; support: number; tool_result_id: string };
export interface ServerState {
  enrollment_gaps?: number;
  campus_id: string;
  pattern: string | null;
  risk: Ev;
  risk_is_probability: boolean;
  terms_done: Ev;
  avg_credits: Ev;
  w_total: Ev;
  delay: Range;
  time_to_degree: Range;
  still_seeking_risk: Range | null;
  degree_burden: Range | null;
  twin_cooked_share: Ev | null;
  twins: { n: number; k: number; refused: boolean; reason: string | null; smd: Record<string, number>; ids: string[]; tool_result_id: string };
  plan: null | { load: number; risk: Ev; time_to_degree_mid: Ev; projected_years: Ev };
  model_version: string;
}
export interface ServerShock {
  term: string;
  shock: "withdraw" | "lighter";
  label: string;
  detail: string;
  prob: number;
  risk_before: number;
  risk_after: number;
  cooked: boolean;
}
export interface ServerDrill {
  drill_id: string;
  plan_load: number;
  risk_now: number;
  baseline_risk: number;
  path: ServerShock[];
  shocks_to_cooked: Ev | null;
  single_point_of_failure: string | null;
  survival: { term_k: number; survival: number; tool_result_id: string }[];
  rows_stored: number;
  sims: number;
  tool_result_id: string;
  stage_limited: boolean;
}
interface ServerLever {
  title: string;
  target: number;
  diff_years: number;
  ci90?: [number, number];
  support: number;
  cooked_rate_at_target: number;
  pool: string;
  reaches_five_years?: boolean;
  model_risk_now_pace?: number;
  model_risk_at_target?: number;
  feasibility?: { feasible: boolean; target: number; picks: { course_id: string }[]; blocked: string[]; reasons: string[]; tool_result_id: string };
  tool_result_id: string;
}
export interface ServerRepair {
  primary: ServerLever | null;
  fallback: ServerLever | null;
  refusal: string | null;
  tool_result_id: string | null;
  twins?: number;
}
export interface ServerNarration {
  segments: ({ text: string } | { value: string; tool_result_id: string })[];
  source: "gemini" | "cache" | "template";
  provenance: { tokens: number; ok: boolean };
  text: string;
}

// ---------- adapters ----------
const tr = <T,>(id: string, tool: string, data: T, ms = 0): ToolResult<T> => ({ id, tool, args: "api", ms, data });

export function toOutcomes(s: ServerState): Outcomes {
  const risk = s.plan ? s.plan.risk.value : s.risk.value;
  const seek = s.still_seeking_risk;
  return {
    n: s.twins.n,
    risk,
    cookedN: 0,
    delay: [s.delay.low, s.delay.mid, s.delay.high],
    ttd: [s.time_to_degree.low, s.time_to_degree.mid, s.time_to_degree.high],
    seeking: seek ? { rate: seek.mid, n: seek.support, ci95: [seek.low, seek.high] } : { rate: 0, n: 0, ci95: [0, 0] },
    burden: s.degree_burden ? [s.degree_burden.low, s.degree_burden.mid, s.degree_burden.high] : null,
    burdenN: s.degree_burden?.support ?? 0,
  };
}

export function toDrill(d: ServerDrill, st: State): ToolResult<Drill> {
  const path: ShockStep[] = d.path.map((p, i) => ({
    term: i,
    termLabel: p.term,
    key: p.shock,
    label: p.label,
    detail: p.detail,
    prob: p.prob,
    yearsBefore: p.risk_before,
    yearsAfter: p.risk_after,
    cooked: p.cooked,
    tr: d.tool_result_id,
  }));
  const stc = d.shocks_to_cooked?.value ?? null;
  return tr(d.tool_result_id, "fire_drill", {
    unit: "risk",
    baselineRisk: d.baseline_risk,
    baseline: project({ ...st, planLoad: d.plan_load }, [], d.plan_load),
    path,
    shocksToCooked: stc,
    alreadyCooked: stc === 0,
    spof: path.find((p) => p.label === d.single_point_of_failure) ?? null,
    joint: path.reduce((a, p) => a * p.prob, 1),
    outcomeShocks: [],
  });
}

export function toSurvival(d: ServerDrill): ToolResult<SurvivalPoint[]> {
  return tr(
    d.survival[0]?.tool_result_id ?? d.tool_result_id,
    "survival",
    d.survival.map((p) => ({ t: p.term_k, label: p.term_k === 0 ? "now" : `+${p.term_k}`, alive: p.survival, graduated: 0 })),
  );
}

function toLever(l: ServerLever | null, key: "load" | "work"): Lever | null {
  if (!l) return null;
  return {
    key,
    title: l.title,
    target: l.target,
    unit: key === "load" ? "credits/term" : "h/week",
    diffYears: l.diff_years,
    ci: l.ci90 ?? [l.diff_years, l.diff_years],
    n: l.support,
    riskAt: l.cooked_rate_at_target,
    supported: true,
    pool: l.pool,
    reachesGoal: l.reaches_five_years,
  };
}

export function toRepair(r: ServerRepair, catalog: Course[]): ToolResult<Repair> {
  const f = r.primary?.feasibility;
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const feas: ToolResult<Feasibility> | null = f
    ? tr(f.tool_result_id, "catalog_feasibility", {
        feasible: f.feasible,
        target: f.target,
        available: 0,
        picks: f.picks.map((p) => byId.get(p.course_id)).filter((c): c is Course => !!c),
        blocked: f.blocked.map((id) => ({ course: byId.get(id)!, missing: [] })).filter((b) => b.course),
        reasons: f.reasons,
      })
    : null;
  return tr(r.tool_result_id ?? "tr_none", "escapee_stats", {
    primary: toLever(r.primary, "load"),
    fallback: toLever(r.fallback, "work"),
    escapeeLoad: 0,
    cookedLoad: 0,
    escapees: 0,
    cookedTwins: 0,
    feasibility: feas,
    refusal: r.refusal,
  });
}

export const toSegs = (n: ServerNarration): Seg[] => n.segments.map((s) => ("text" in s ? s.text : { v: s.value, tr: s.tool_result_id }));
