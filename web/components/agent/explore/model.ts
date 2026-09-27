// Shapes and pure helpers for the cohort explorer. Nothing here talks to the network or invents a number:
// every figure on screen is a value the /explore response carried (or a sum/rank of those values).
import { int } from "@/components/viz/format";

export type Topic = "load" | "work" | "internships" | "destinations" | "majors" | "cost";
export type Unit = "years" | "%" | "ratio" | "people";

export interface CohortRow {
  label: string;
  n: number;
  value: number | null;
  /** "No Response" alumni left out of this row's rate: unknown, never an outcome. */
  unknown?: number;
  tool_result_id: string;
}

export interface CohortAnswer {
  question: string;
  topic: Topic;
  router: "gemini" | "local";
  title: string;
  detail: string;
  measure: string;
  dimension: string;
  unit: Unit;
  rows: CohortRow[];
  source: string;
  tool_result_id: string;
  disclaimer: string;
  narration: { text: string; source?: string; provenance?: { ok?: boolean } };
}

export interface Entry {
  id: string;
  answer: CohortAnswer;
}

/** The same floor the twin refusal uses: a group of fewer than 30 people is never read as a pattern. */
export const MIN_N = 30;

/** The six fixed queries in api/explore.py, each phrased so both the AI router and the keyword fallback route it correctly. */
export const SUGGESTIONS: { q: string; kind: "bars" | "shares" | "trend"; topic: Topic }[] = [
  { q: "Does a lighter course load change the timeline?", kind: "bars", topic: "load" },
  { q: "How do work hours relate to time to degree?", kind: "bars", topic: "work" },
  { q: "How do internships relate to first jobs?", kind: "bars", topic: "internships" },
  { q: "Where do graduates end up in their first job?", kind: "shares", topic: "destinations" },
  { q: "Compare Computer Science and Information Systems", kind: "bars", topic: "majors" },
  { q: "What does degree cost look like by year?", kind: "trend", topic: "cost" },
];

export const norm = (q: string) => q.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Filmstrip label: the question, trimmed to something a rail or a pill can hold. */
export function shortQuestion(q: string, max = 26): string {
  const t = q.replace(/[?.!\s]+$/g, "").replace(/\s+/g, " ").trim();
  return t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`;
}

// ---------------------------------------------------------------- formatting

export const fmtValue = (v: number | null, unit: Unit): string => {
  if (v === null) return "—";
  if (unit === "%") return `${v.toFixed(1)}%`;
  if (unit === "years") return `${v.toFixed(2)}y`;
  if (unit === "ratio") return v.toFixed(2);
  return int(v);
};

const nice = (n: number) => n.toLocaleString("en-US");
export const fmtN = (n: number) => `n=${nice(n)}`;

// ---------------------------------------------------------------- chart choice

export type ChartKind = "bars" | "line" | "donut" | "refusal" | "empty";

const isYear = (l: string) => /^(19|20)\d{2}$/.test(l.trim());

export interface Reading {
  kind: ChartKind;
  /** Rows with a value. */
  rows: CohortRow[];
  /** Rows too small to read as a pattern (n below MIN_N). Counts of people (donut) are exempt: they are counted, not estimated. */
  small: CohortRow[];
  /** Sum of n across shown rows. */
  total: number;
  /** Why there is no chart, when kind is refusal or empty. */
  reason?: string;
}

/** Pick the hero chart from the SHAPE of the result, and refuse honestly when the groups are too small to read. */
export function read(a: CohortAnswer): Reading {
  const rows = a.rows.filter((r) => r.value !== null);
  const total = rows.reduce((s, r) => s + r.n, 0);
  if (!rows.length) return { kind: "empty", rows, small: [], total, reason: "The query returned no groups." };
  if (a.unit === "people") {
    return total < MIN_N ? { kind: "refusal", rows, small: [], total, reason: `Only ${total} people in total.` } : { kind: "donut", rows, small: [], total };
  }
  const small = rows.filter((r) => r.n < MIN_N);
  const solid = rows.length - small.length;
  const series = rows.length >= 3 && rows.every((r) => isYear(r.label));
  if (series ? solid < 3 : solid < 2) {
    return { kind: "refusal", rows, small, total, reason: solid === 0 ? `No group has ${MIN_N}+ alumni, so there is no pattern to read.` : `Only ${solid} ${solid === 1 ? "group has" : "groups have"} ${MIN_N}+ alumni, so there is no pattern to read.` };
  }
  return { kind: series ? "line" : "bars", rows, small, total };
}

export const KIND_LABEL: Record<ChartKind, string> = { bars: "bars", line: "line", donut: "donut", refusal: "no chart (too few alumni)", empty: "no chart" };

// ---------------------------------------------------------------- copy

const FUNCTION_WORDS = new Set(["a", "an", "and", "at", "by", "for", "in", "of", "on", "the", "through", "to", "with"]);

/** Split the API title into a top line and a gold accent line at the most balanced word break, never stranding a connector like "by" at the end of the top line. */
export function splitTitle(title: string): { top: string; accent?: string } {
  const words = title.trim().split(/\s+/);
  if (words.length < 2) return { top: title };
  let best = 1;
  let gap = Infinity;
  for (let i = 1; i < words.length; i++) {
    const g = Math.abs(words.slice(0, i).join(" ").length - words.slice(i).join(" ").length * 1.15);
    if (g < gap) {
      gap = g;
      best = i;
    }
  }
  while (best > 1 && words.length - best >= 2 && FUNCTION_WORDS.has(words[best - 1].toLowerCase())) best--;
  return { top: words.slice(0, best).join(" "), accent: words.slice(best).join(" ") };
}

/** The narration is provenance-checked server-side; its first sentence carries the numbers, the rest is caveat. */
export function sentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((s) => s.trim()).filter(Boolean);
}

/** The one line under the headline. Falls back to the query's own description if the narration failed its check. */
export function takeaway(a: CohortAnswer): string {
  if (a.narration.provenance?.ok === false) return a.detail;
  return sentences(a.narration.text)[0] ?? a.detail;
}

/** Caveat chips that belong to this result, drawn only from what the API said about it. */
export function caveats(a: CohortAnswer): string[] {
  const out: string[] = [];
  if (a.topic === "internships" || a.topic === "destinations") out.push("No Response = unknown");
  if (a.topic === "cost") out.push("nominal dollars");
  if (a.unit !== "people") out.push("association, not cause");
  return out;
}

/** Plain-language group list, with sizes: what the agent may quote and what describeScreen reads back. */
export function groupsText(a: CohortAnswer): string {
  return a.rows.map((r) => `${r.label}: ${fmtValue(r.value, a.unit)}${a.unit === "people" ? " alumni" : ""} (${fmtN(r.n)})`).join("; ");
}

/** Names the groups under the 30-alumni floor. `how` says what the screen did with them; spoken answers leave it out. */
export function smallNote(a: CohortAnswer, how?: string): string | null {
  if (a.unit === "people") return null;
  const small = a.rows.filter((r) => r.value !== null && r.n < MIN_N);
  if (!small.length) return null;
  const many = small.length > 1;
  return `${small.map((r) => `${r.label} (${fmtN(r.n)})`).join(", ")} ${many ? "have" : "has"} fewer than ${MIN_N} alumni, so ${many ? "they" : "it"} should not be read as a pattern${how ? ` and ${many ? "are" : "is"} ${how}` : ""}.`;
}

/** What a voice command returns: the API's own sentences plus the honest small-sample warning, with real numbers only. */
export function spokenAnswer(a: CohortAnswer): { message: string; data: Record<string, unknown> } {
  const warn = smallNote(a);
  const message = [a.narration.provenance?.ok === false ? a.detail : a.narration.text, warn].filter(Boolean).join(" ");
  return {
    message,
    data: {
      question: a.question,
      title: a.title,
      query: a.topic,
      routed_by: a.router === "gemini" ? "AI router" : "keyword router",
      measure: a.measure,
      dimension: a.dimension,
      unit: a.unit,
      groups: a.rows.map((r) => ({ group: r.label, value: r.value, sample_size: r.n, ...(r.unknown ? { no_response_excluded: r.unknown } : {}) })),
      evidence_id: a.tool_result_id,
      caution: a.disclaimer,
    },
  };
}
