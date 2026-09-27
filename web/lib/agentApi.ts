"use client";

// Typed calls for the voice agent. Every number in these responses carries a tool_result_id.
import type { ArenaReport, ModelLabScenario, SimulateResponse } from "./arena-types";
import { authHeaders } from "./auth";
import { api, type Call, type ServerDrill, type ServerNarration, type ServerRepair, type ServerState } from "./live";

// The browser uses this origin; Next routes to the configured API server.
const API = "/backend";

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
  source: "sample" | "gemini" | "claude" | "unavailable";
  first_name?: string | null;
  needs_work_hours?: boolean;
  warnings?: string[];
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
export interface CohortVisualRow {
  label: string;
  n: number;
  value: number | null;
  unknown?: number;
  tool_result_id: string;
}
export type Visual =
  | { type: "whatif"; before: { work: number; load: number; risk: number; years: number }; after: { work: number; load: number; risk: number; years: number }; tool_result_id: string }
  | { type: "course"; courses: CourseStatus[]; highlight?: string[]; tool_result_id: string }
  | { type: "drill"; drill: ServerDrill }
  | { type: "repair"; repair: ServerRepair }
  | { type: "explain"; state: ServerState; reference_load?: number | null; tool_result_id?: string }
  | {
      type: "cohort";
      question: string;
      topic: "load" | "work" | "internships" | "destinations" | "majors" | "cost";
      router: "gemini" | "local";
      title: string;
      detail: string;
      measure: string;
      dimension: string;
      unit: "years" | "%" | "ratio" | "people";
      rows: CohortVisualRow[];
      source: string;
      tool_result_id: string;
      disclaimer: string;
      narration: { text: string; source?: string; provenance?: { ok?: boolean } };
    };
export interface Answer extends ServerNarration {
  // The backend may also return "cohort_pattern" (a cohort/alumni-pattern question answered inline);
  // kept out of this literal union so TOOL_LABEL's exhaustive Record elsewhere doesn't need a new key,
  // and read as a plain string wherever it's used untyped.
  tool: "audit_summary" | "what_if" | "course_plan" | "stress_test" | "find_fix" | "explain_risk" | (string & {});
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
  if (!file.size) throw new Error("That file is empty. Choose your degree audit again.");
  if (file.size > 8_000_000) throw new Error("Your audit is too large. Choose a PDF or image under 8 MB.");
  const ext = name.toLowerCase();
  const isPdf = ext.endsWith(".pdf") || (file.type ? file.type.includes("pdf") : false);
  const isImg = /\.(png|jpg|jpeg|webp)$/.test(ext) || (file.type ? file.type.includes("image") : false);
  const isTxt = ext.endsWith(".txt") || (file.type ? file.type.includes("text") : false);
  if (!isPdf && !isImg && !isTxt && file.type && !["application/pdf", "image/png", "image/jpeg", "image/webp", "text/plain"].includes(file.type)) {
    throw new Error("Choose a PDF, PNG, JPEG, WebP, or TXT degree audit.");
  }
  const t0 = performance.now();
  const fd = new FormData();
  fd.append("file", file, name);
  let r: Response;
  const headers = await authHeaders();
  try {
    r = await fetch(`${API}/audit/parse`, { method: "POST", body: fd, headers, signal: AbortSignal.timeout(180_000) });
  } catch (error) {
    throw new Error(error instanceof DOMException && error.name === "TimeoutError"
      ? "Reading this audit took too long. Try a smaller or clearer PDF."
      : "Couldn't reach the audit service. Check your connection and try again.");
  }
  const j = await r.json().catch(() => null);
  if (!r.ok) throw new Error(j?.message ?? j?.detail ?? (r.status === 413 ? "Your audit is too large. Choose a file under 8 MB." : "The audit service is unavailable. Please try again."));
  if (!j?.data) throw new Error("The audit service returned an incomplete response. Please try again.");
  return { data: j.data, version: j.model_version, ms: performance.now() - t0 };
}

export const sayLine = (line: "greeting" | "thanks" | "ask_work" | "ready" | "listening", name?: string) =>
  api<ServerNarration>("/say", { line, name });
export const askAgent = (id: string, question: string, work?: number, plan?: number) =>
  api<Answer>(`/students/${id}/ask`, { question, work_hours: work, plan_load: plan });
export const setWorkHours = (id: string, hours: number) => api<{ id: string; work_hours: number }>(`/profiles/${id}/work`, { work_hours: hours });
export const getState = (id: string, work?: number, plan?: number) =>
  api<ServerState & { terms: { attempted: number; earned: number; withdrawals: number; failures?: number }[]; courses_done: string[]; courses_in_progress: string[]; major: string; track: string; credits_earned: number; credits_required: number; work_hours: number }>(
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
