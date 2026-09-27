"use client";

// Typed calls for the voice agent. Every number in these responses carries a tool_result_id.
import { authHeaders } from "./auth";
import { api, type Call, type ServerDrill, type ServerNarration, type ServerRepair, type ServerState } from "./live";

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
export interface Intake {
  id: string | null;
  source: "sample" | "gemini" | "unavailable";
  first_name?: string | null;
  needs_work_hours?: boolean;
  summary?: AuditSummary;
  error?: string;
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

export async function uploadAudit(file: Blob, name = "audit.pdf"): Promise<Call<Intake>> {
  const t0 = performance.now();
  const fd = new FormData();
  fd.append("file", file, name);
  const r = await fetch(`${API}/audit/parse`, { method: "POST", body: fd, headers: await authHeaders() });
  const j = await r.json();
  if (!r.ok) throw new Error(j?.message ?? `HTTP ${r.status}`);
  return { data: j.data, version: j.model_version, ms: performance.now() - t0 };
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
export const narrate = (kind: "alarm" | "drill" | "repair", id: string, work?: number, wait = true) =>
  api<ServerNarration>("/narrate", { kind, campus_id: id, work_hours: work, wait });
export const alarmCheck = (id: string) => api<{ id: number | null; fires: boolean; decision: string; tool_result_id: string }>(`/students/${id}/alarm/check`, {});
export const remember = (id: string, note: string) => api<{ stored: "backboard" | "local" }>(`/students/${id}/memory`, { kind: "decision", note });
export const getMyths = () => api<Myths>("/myths");
