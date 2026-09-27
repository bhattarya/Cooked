// The Watchtower's view model. Two sources feed it: the live API (the trained model plus the alarm log) and, when the API
// is unreachable, the in-browser engine over matched alumni. Nothing here invents a number; it only groups and ranks
// what those sources returned.
import type { QueueRow } from "@/lib/engine";

export interface PatternStat {
  name: string;
  scored: number;
  /** Students at or above the alarm line. */
  atRisk: number;
  avgRisk: number;
  /** Open alarms in the Watchtower's log for this pattern (live source only). */
  open: number | null;
  openAvgRisk: number | null;
}

export interface Student {
  id: string;
  major: string;
  cls: string;
  pattern: string | null;
  risk: number;
  avgCredits: number;
  work: number;
  lead: number;
}

export interface Snapshot {
  source: "model" | "local";
  version?: string;
  tr?: string;
  scored: number;
  atRisk: number;
  /** The risk at which an alarm opens (model) or a student is flagged (local engine). */
  threshold: number;
  openAlarms: number | null;
  /** Newest day with alarm activity, ISO date. */
  latestAlarmDay: string | null;
  patterns: PatternStat[];
  /** Per-student rows: only present when the viewer is allowed to fetch them. */
  students: Student[] | null;
}

// ---------------------------------------------------------------- API payloads (api/engine.py `queue`, api/routes/product.py `alarms`)

export interface QueuePayload {
  scored: number;
  at_risk: number;
  threshold: number;
  by_pattern: { pattern: string; scored: number; at_risk: number; avg_risk: number }[];
  items: { campus_id: string; major: string; class_level: string; pattern: string | null; risk: number; avg_credits: number; work_hours: number; lead_time_terms: number }[];
  model_version: string;
  tool_result_id: string;
  open_alarms: number | null;
}
export interface AlarmsPayload {
  items: { pattern: string | null; n: number; avg_risk: number }[];
  daily: { day: string; pattern: string | null; n: number; avg_risk: number }[];
}

export const NO_PATTERN = "no pattern";
const label = (p: string | null | undefined) => (!p || p === "none" ? NO_PATTERN : p);

export function fromApi(q: QueuePayload, alarms: AlarmsPayload | null, withRows: boolean): Snapshot {
  const open = new Map((alarms?.items ?? []).map((a) => [label(a.pattern), a]));
  const latest = (alarms?.daily ?? []).map((d) => d.day).sort().at(-1) ?? null;
  return {
    source: "model",
    version: q.model_version,
    tr: q.tool_result_id,
    scored: q.scored,
    atRisk: q.at_risk,
    threshold: q.threshold,
    openAlarms: q.open_alarms,
    latestAlarmDay: latest,
    patterns: q.by_pattern.map((p) => {
      const name = label(p.pattern);
      const a = open.get(name);
      return { name, scored: p.scored, atRisk: p.at_risk, avgRisk: p.avg_risk, open: alarms ? (a?.n ?? 0) : null, openAvgRisk: a?.avg_risk ?? null };
    }),
    students: withRows
      ? q.items.map((i) => ({ id: i.campus_id, major: i.major, cls: i.class_level, pattern: i.pattern ? label(i.pattern) : null, risk: i.risk, avgCredits: i.avg_credits, work: i.work_hours, lead: i.lead_time_terms }))
      : null,
  };
}

const LOCAL_LINE = 0.2; // the engine's "watch" line: statusOf() calls anything below it fine

/** Offline fallback: the browser engine scores every current student against matched alumni. */
export function fromLocal(rows: QueueRow[], withRows: boolean): Snapshot {
  const names = new Set<string>(rows.map((r) => label(r.student.pattern)));
  const patterns: PatternStat[] = [...names].map((name) => {
    const g = rows.filter((r) => label(r.student.pattern) === name);
    return { name, scored: g.length, atRisk: g.filter((r) => r.risk >= LOCAL_LINE).length, avgRisk: g.reduce((s, r) => s + r.risk, 0) / Math.max(1, g.length), open: null, openAvgRisk: null };
  });
  patterns.sort((a, b) => b.atRisk - a.atRisk);
  return {
    source: "local",
    scored: rows.length,
    atRisk: rows.filter((r) => r.risk >= LOCAL_LINE).length,
    threshold: LOCAL_LINE,
    openAlarms: null,
    latestAlarmDay: null,
    patterns,
    students: withRows ? rows.map((r) => ({ id: r.student.id, major: r.student.major, cls: r.student.cls, pattern: r.student.pattern ? label(r.student.pattern) : null, risk: r.risk, avgCredits: r.avgCredits, work: r.student.work, lead: r.lead })) : null,
  };
}

// ---------------------------------------------------------------- derived views

/** Risk bands the distribution chart uses: 5% wide, `x` is the band's lower edge in percent. */
export const BAND = 5;

/** Share of each pattern's students in every risk band, so a 983-student pattern doesn't drown a 69-student one. */
export function bandShares(students: Student[]): { x: number[]; series: { name: string; n: number; y: number[] }[] } {
  const bands = Math.round(100 / BAND);
  const x = Array.from({ length: bands }, (_, i) => i * BAND);
  const byPattern = new Map<string, number[]>();
  for (const s of students) {
    const key = s.pattern ?? NO_PATTERN;
    const counts = byPattern.get(key) ?? new Array<number>(bands).fill(0);
    counts[Math.min(bands - 1, Math.floor((s.risk * 100) / BAND))]++;
    byPattern.set(key, counts);
  }
  const series = [...byPattern.entries()]
    .map(([name, counts]) => {
      const n = counts.reduce((a, b) => a + b, 0);
      return { name, n, y: counts.map((c) => c / n) };
    })
    .sort((a, b) => b.n - a.n);
  return { x, series };
}

export type Level = "cooked" | "watch" | "fine";
/** The same three words the whole product uses for risk: 50%+ cooked, 20-50% watch, below fine. */
export const levelOf = (risk: number): Level => (risk >= 0.5 ? "cooked" : risk >= 0.2 ? "watch" : "fine");

export const CLASSES = ["All", "Freshman", "Sophomore", "Junior", "Senior"] as const;

export function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}
