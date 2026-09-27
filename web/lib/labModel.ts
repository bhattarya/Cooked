// Model Lab plumbing shared by the /app/lab scenes: request/response helpers (with real
// cancellation), the scenario definition, family and class identities, and the sentences the
// voice handlers and the narrator say. Every sentence is assembled from a response, never invented.
import { authHeaders } from "./auth";
import type { ArenaReport, CareerClass, Envelope, Family, ModelLabScenario, SimulateResponse, TaskId } from "./arena-types";
import { fieldSpec, type ScenarioField } from "./commands";

// The browser uses this origin; Next routes to the configured API server.
const API = "/backend";

export type LabField = keyof ModelLabScenario;
export type NumericField = Exclude<LabField, "major" | "entry_type" | "residency">;

export const DEFAULT_SCENARIO: ModelLabScenario = {
  major: "Computer Science",
  entry_type: "First-Time Freshman",
  residency: "In-State",
  work_hours: 15,
  completed_terms: 3,
  credits_per_term: 12,
  earned_ratio: 0.9,
  withdrawals: 1,
  failures: 0,
  enrollment_gaps: 0,
  internship_count: 1,
  credential_count: 1,
  engagement_count: 3,
};

const KEYS = Object.keys(DEFAULT_SCENARIO) as LabField[];
export const scenarioKey = (s: ModelLabScenario): string => JSON.stringify(KEYS.map((k) => s[k]));

/** Applies one field, rounding numbers the way the API accepts them (ints, or hundredths for the ratio). */
export function withField(s: ModelLabScenario, field: LabField, value: number | string): ModelLabScenario {
  return { ...s, [field]: typeof value === "number" && field === "earned_ratio" ? Math.round(value * 100) / 100 : value };
}

export class LabApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
export const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === "AbortError";

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; signal?: AbortSignal }): Promise<{ data: T; ms: number }> {
  if (!API) throw new LabApiError("The API address is not configured (NEXT_PUBLIC_API_URL).", 0);
  const t0 = performance.now();
  const r = await fetch(`${API}${path}`, {
    method: init.method,
    headers: { ...(await authHeaders()), ...(init.body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
    cache: "no-store",
    signal: init.signal,
  });
  const j = (await r.json().catch(() => null)) as (Envelope<T> & { message?: string }) | null;
  if (!r.ok || !j) throw new LabApiError(j?.message ?? `The models answered HTTP ${r.status}.`, r.status);
  return { data: j.data, ms: performance.now() - t0 };
}

export const simulate = (scenario: ModelLabScenario, signal?: AbortSignal) => call<SimulateResponse>("/model-lab/simulate", { method: "POST", body: scenario, signal });
export const fetchArena = (signal?: AbortSignal) => call<ArenaReport>("/model-lab/arena", { method: "GET", signal });

// ---------------------------------------------------------------------------- identities

export const FAMILIES: Family[] = ["baseline", "linear", "forest", "boosting"];
export const FAMILY_NAME: Record<Family, string> = { baseline: "Baseline", linear: "Linear", forest: "Forest", boosting: "Boosting" };
export const FAMILY_FULL: Record<Family, string> = { baseline: "Naive baseline", linear: "Linear model", forest: "Random forest", boosting: "Gradient boosting" };
/** One hue per family everywhere. Gold is kept for the champion's crown and ring. */
export const FAMILY_COLOR: Record<Family, string> = { baseline: "var(--muted)", linear: "var(--viz-4)", forest: "var(--viz-7)", boosting: "var(--viz-5)" };
export const FAMILY_BLURB: Record<Family, string> = {
  baseline: "What you would say with no model: the training-set average.",
  linear: "One weighted sum of the inputs. Simple, steady, easy to audit.",
  forest: "Hundreds of decision trees voting.",
  boosting: "Trees that each fix the last one's mistakes.",
};

export const CAREER_CLASSES: CareerClass[] = ["Employed", "Continuing education", "Still seeking"];
export const CAREER_COLOR: Record<CareerClass, string> = { Employed: "var(--viz-1)", "Continuing education": "var(--viz-3)", "Still seeking": "var(--viz-8)" };

export const TASKS: { id: TaskId; label: string; short: string; noun: string }[] = [
  { id: "risk", label: "Academic risk", short: "Risk", noun: "risk of getting cooked" },
  { id: "time_to_degree", label: "Time to degree", short: "Timeline", noun: "years to degree" },
  { id: "career", label: "Career destination", short: "Career", noun: "first destination" },
  { id: "salary", label: "First salary", short: "Salary", noun: "first-job salary" },
];
export const taskLabel = (t: TaskId): string => TASKS.find((x) => x.id === t)?.label ?? t;

// ---------------------------------------------------------------------------- formatting

export const pct0 = (v: number): string => `${Math.round(v * 100)}%`;
export const yrs = (v: number): string => `${v.toFixed(1)} years`;
export const usd = (v: number): string => `$${Math.round(v).toLocaleString("en-US")}`;
export const usdK = (v: number): string => `$${Math.round(v / 1000)}k`;
export const dec3 = (v: number): string => v.toFixed(3);
export const pts = (v: number): string => `${v >= 0 ? "+" : "−"}${Math.abs(v * 100).toFixed(0)} pts`;

export const careerTop = (r: SimulateResponse): { label: CareerClass; probability: number } => r.career.reduce((a, b) => (b.probability > a.probability ? b : a), r.career[0]);
export const careerP = (list: { label: CareerClass; probability: number }[], label: CareerClass): number => list.find((c) => c.label === label)?.probability ?? 0;

/** Spread between the highest and lowest family answer, for the agreement dots. */
export const spread = (values: number[]): number => (values.length ? Math.max(...values) - Math.min(...values) : 0);

/** Holdout bias of the shipped salary model, dollars (negative = under-predicts), from the arena report. */
export function salaryBias(arena: ArenaReport | null, result: SimulateResponse | null): number | null {
  if (!arena || !result) return null;
  const fam = result.candidates.champions.salary;
  return arena.tasks.salary.candidates.find((c) => c.family === fam)?.metrics.bias ?? null;
}

// ---------------------------------------------------------------------------- sentences

const FIELD_NOUN: Partial<Record<LabField, string>> = {
  enrollment_gaps: "Enrollment gaps only move the trajectory pattern, not the four model outputs.",
  internship_count: "Internships feed the career and salary models only.",
  credential_count: "Credentials feed the career and salary models only.",
  engagement_count: "Campus engagement feeds the career and salary models only.",
};
export const fieldNote = (f: LabField): string | undefined => FIELD_NOUN[f];

const HISTORY: LabField[] = ["withdrawals", "failures", "earned_ratio"];
export const isHistoryField = (f: LabField): boolean => HISTORY.includes(f);

/** "Risk 48%, median 5.1 years (4.5 to 5.4), first salary median $73k ($66k to $84k)." */
export function headline(r: SimulateResponse): string {
  const t = r.time_to_degree;
  return `Risk ${pct0(r.risk)}, median ${t.mid.toFixed(1)} years to degree (${t.low.toFixed(1)} to ${t.high.toFixed(1)}), first salary median ${usdK(r.salary.mid)} (${usdK(r.salary.low)} to ${usdK(r.salary.high)}).`;
}

/** Inputs the API held at the training edge, each with the value the models actually saw. */
export function clampNotes(r: SimulateResponse): { field: LabField; label: string; requested: number; saw: number | null }[] {
  const asked = r.scenario;
  return r.out_of_range.map((f) => {
    const saw = f === "work_hours" ? r.effective.work_hours : f === "credential_count" ? r.effective.credential_count : f === "engagement_count" ? r.effective.engagement_count : null;
    return { field: f, label: fieldSpec(f as ScenarioField)?.label ?? f, requested: asked[f], saw };
  });
}

/** The full sentence a voice `setScenario` returns: what changed, what the models now say, and what to distrust. */
export function appliedMessage(field: LabField, value: number | string, r: SimulateResponse): string {
  const spec = fieldSpec(field as ScenarioField);
  const label = spec?.label ?? field;
  const shown = field === "earned_ratio" && typeof value === "number" ? `${Math.round(value * 100)} percent` : String(value);
  const parts = [`${label} set to ${shown}.`, `${headline(r)}`];
  const note = fieldNote(field);
  if (note) parts.push(note);
  if (isHistoryField(field) && r.scenario.completed_terms === 0) parts.push("History inputs do nothing until at least one term is completed.");
  const held = clampNotes(r).filter((c) => c.saw !== null);
  if (held.length) parts.push(`Held at the training edge: ${held.map((c) => `${c.label.toLowerCase()} used as ${c.saw}`).join(", ")}.`);
  return parts.join(" ");
}

/** The narrator's script. Only returned numbers; career is described as base rates because that is what it is. */
export function narration(r: SimulateResponse, arena: ArenaReport | null): string {
  const t = r.time_to_degree;
  const top = careerTop(r);
  const champ = r.candidates.champions;
  const bias = salaryBias(arena, r);
  const career =
    champ.career === "baseline"
      ? `For careers no model beat the base rates, so the odds do not move with these inputs: ${pct0(top.probability)} ${top.label.toLowerCase()}.`
      : `The career model puts ${pct0(top.probability)} on ${top.label.toLowerCase()}.`;
  return [
    r.pattern === "not enough history" ? "There is no term history yet, so no trajectory pattern." : `Your scenario follows the ${r.pattern} pattern.`,
    `Academic risk is ${Math.round(r.risk * 100)} percent.`,
    `The timeline model's middle estimate is ${t.mid.toFixed(1)} years, likely ${t.low.toFixed(1)} to ${t.high.toFixed(1)}.`,
    career,
    `The first salary median is about ${Math.round(r.salary.mid / 1000)} thousand dollars, likely ${Math.round(r.salary.low / 1000)} to ${Math.round(r.salary.high / 1000)} thousand, in nominal dollars.${bias !== null && bias < 0 ? ` On the recent holdout this model ran about ${Math.round(Math.abs(bias) / 1000)} thousand low.` : ""}`,
    "This is synthetic data and describes associations, not promises.",
  ].join(" ");
}
