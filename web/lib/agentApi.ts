"use client";

// Typed calls for the voice agent. Every number in these responses carries a tool_result_id.
import type { ArenaReport, ModelLabScenario, SimulateResponse } from "./arena-types";
import { authHeaders } from "./auth";
import { api, type Call, type ServerDrill, type ServerNarration, type ServerRepair, type ServerState } from "./live";

export type { Call };
const API = process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "");

export interface AuditSummary {
  major: string;
  track: string;
  entry_type: string;
  terms: number;
  courses_done: number;
  in_progress: number;
  credits_earned: number;
  credits_required: number;
  tool_result_id: string;
}
export type AuditErrorCode = "unreadable" | "no_courses_found" | "too_large" | "unsupported_type" | "reader_unavailable" | "reader_timeout" | "network" | "server";
export interface Reading {
  method: "text" | "vision" | "sample" | "manual";
  ms?: number;
  pages?: number;
  terms?: number;
  courses?: number;
}
export interface Intake {
  id: string | null;
  source: "sample" | "gemini" | "parser" | "manual" | "unavailable";
  first_name?: string | null;
  needs_work_hours?: boolean;
  summary?: AuditSummary;
  error?: string | null;
  error_code?: AuditErrorCode | null;
  can_retry?: boolean;
  can_enter_manually?: boolean;
  warnings?: string[];
  reading?: Reading | null;
}

/** The body of POST /audit/manual: what a student types when a file can't be read. */
export interface ManualAudit {
  first_name?: string;
  major: string;
  track?: string;
  entry_type: "Transfer" | "First-Time Freshman";
  residency?: "In-State" | "Out-of-State";
  credits_required?: number;
  terms: { label: string; courses?: { id: string; credits: number; grade: string }[]; credits_attempted?: number; credits_earned?: number; withdrawals?: number }[];
  in_progress?: string[];
}

/** What the models read from the audit (GET /profiles/{id}/receipt). */
export interface Receipt {
  terms: { label: string; attempted: number; earned: number; withdrawals: number; failures?: number | null; gpa?: number | null }[];
  totals: { credits_earned: number | null; credits_in_progress: number | null; credits_required: number | null; terms_completed: number | null; withdrawals?: number | null; repeats?: number | null };
  features: { name: string; label: string; value: number | string | null; unit?: string; note?: string }[];
  tool_result_id?: string;
}
export interface CourseStatus {
  course_id: string;
  known: boolean;
  title?: string;
  credits?: number;
  required_for_major?: boolean;
  already_have?: boolean;
  offered_next_term?: boolean;
  offered?: string[];
  missing_prereqs?: string[];
  gates?: number;
  gates_required?: string[];
  term?: string;
}
export type Visual =
  | { type: "whatif"; before: { work: number; load: number; risk: number; years: number }; after: { work: number; load: number; risk: number; years: number }; tool_result_id: string }
  | { type: "course"; courses: CourseStatus[]; highlight?: string[]; tool_result_id: string }
  | { type: "drill"; drill: ServerDrill }
  | { type: "repair"; repair: ServerRepair }
  | { type: "explain"; state: ServerState; reference_load?: number | null; tool_result_id?: string };
export interface Answer extends ServerNarration {
  tool: "what_if" | "course_plan" | "stress_test" | "find_fix" | "explain_risk";
  args: Record<string, unknown>;
  router: "gemini" | "local";
  visual: Visual;
  question: string;
}
export interface Myths {
  items: { title: string; value: string; evidence: string; tool_result_id: string; computed: boolean }[];
  held_up: { title: string; value: string; evidence: string; tool_result_id: string; computed: boolean }[];
}

const failed = (code: AuditErrorCode, error: string, retry: boolean): Intake => ({ id: null, source: "unavailable", error, error_code: code, can_retry: retry, can_enter_manually: true });

/** Intake never throws: a network or server failure comes back as an Intake with an error code, like any other failure. */
async function intake(path: string, init: RequestInit): Promise<Call<Intake>> {
  const t0 = performance.now();
  const headers = { ...(await authHeaders()), ...(init.headers as Record<string, string> | undefined) };
  try {
    const r = await fetch(`${API}${path}`, { ...init, headers });
    const j = await r.json().catch(() => null);
    const ms = performance.now() - t0;
    if (r.ok && j?.data) return { data: j.data, version: j.model_version, ms };
    if (r.status === 413) return { data: failed("too_large", "That file is over the size limit.", false), version: "", ms };
    return { data: failed("server", typeof j?.message === "string" ? j.message : `The server answered ${r.status}.`, true), version: "", ms };
  } catch {
    return { data: failed("network", "Couldn't reach the COOKED server.", true), version: "", ms: performance.now() - t0 };
  }
}

export function uploadAudit(file: Blob, name = "audit.pdf"): Promise<Call<Intake>> {
  const fd = new FormData();
  fd.append("file", file, name);
  return intake("/audit/parse", { method: "POST", body: fd });
}

export const manualAudit = (body: ManualAudit): Promise<Call<Intake>> => intake("/audit/manual", { method: "POST", body: JSON.stringify(body), headers: { "Content-Type": "application/json" } });

/** Null while the endpoint isn't there (older API): the receipt scene then derives what it can and marks the rest unavailable. */
export async function getReceipt(id: string): Promise<Receipt | null> {
  try {
    const r = await fetch(`${API}/profiles/${id}/receipt`, { headers: await authHeaders() });
    if (!r.ok) return null;
    const j = await r.json();
    return j?.data?.terms ? (j.data as Receipt) : null;
  } catch {
    return null;
  }
}

export const sayLine = (line: "greeting" | "thanks" | "ask_work" | "ready" | "listening", name?: string) =>
  api<ServerNarration>("/say", { line, name });
export const askAgent = (id: string, question: string, work?: number, plan?: number) =>
  api<Answer>(`/students/${id}/ask`, { question, work_hours: work, plan_load: plan });
export const setWorkHours = (id: string, hours: number) => api<{ id: string; work_hours: number }>(`/profiles/${id}/work`, { work_hours: hours });
export const getState = (id: string, work?: number, plan?: number) =>
  api<ServerState & { terms: { attempted: number; earned: number; withdrawals: number }[]; courses_done: string[]; courses_in_progress: string[]; major: string; track: string; credits_earned: number; credits_required: number; work_hours: number }>(
    `/students/${id}/state?${new URLSearchParams({ ...(work !== undefined ? { work_hours: String(work) } : {}), ...(plan !== undefined ? { plan_load: String(plan) } : {}) })}`,
  );
export const runDrill = (id: string, load?: number, work?: number) => api<ServerDrill>("/drill", { campus_id: id, plan_load: load, work_hours: work });
export const findRepair = (id: string, work?: number) => api<ServerRepair>("/repair", { campus_id: id, work_hours: work });
export const narrate = (kind: "alarm" | "drill" | "repair", id: string, work?: number, wait = true, plan?: number) =>
  api<ServerNarration>("/narrate", { kind, campus_id: id, work_hours: work, plan_load: plan, wait });
export const alarmCheck = (id: string) => api<{ id: number | null; fires: boolean; decision: string; tool_result_id: string }>(`/students/${id}/alarm/check`, {});
export const remember = (id: string, note: string) => api<{ stored: "backboard" | "local" }>(`/students/${id}/memory`, { kind: "decision", note });
export const getMyths = () => api<Myths>("/myths");
// The careers scene scores the student's own record as a Model Lab scenario and reads how far to trust each model.
export const simulateScenario = (scenario: ModelLabScenario) => api<SimulateResponse>("/model-lab/simulate", scenario);
export const getArena = () => api<ArenaReport>("/model-lab/arena");
