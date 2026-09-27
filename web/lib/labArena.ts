// Reads the arena report for the leaderboard: which metric to headline per task, in which direction,
// the four families' values, and the plain-English size of each family's win over the naive baseline.
// Nothing is computed beyond picking, ordering and formatting numbers that arena.json already holds.
import type { ArenaReport, CareerCandidate, Family, FeatureImportance, Gain, QuantileMetrics, RiskCandidate, TaskId } from "./arena-types";
import { FAMILIES, dec3, usd } from "./labModel";

export interface MetricDef {
  id: string;
  label: string;
  /** One sentence a non-statistician can use to read the bars. */
  hint: string;
  better: "higher" | "lower";
  format: (v: number) => string;
  /** Fixed axis, when the metric has natural bounds. */
  domain?: [number, number];
}

const yrs2 = (v: number) => `${v.toFixed(2)} y`;
const usdMae = (v: number) => usd(v);

export const METRICS: Record<TaskId, MetricDef[]> = {
  risk: [
    { id: "auroc", label: "AUROC", hint: "How well it ranks students who got cooked above those who did not. 0.5 is a coin flip, 1.0 is perfect.", better: "higher", format: dec3, domain: [0, 1] },
    { id: "brier", label: "Brier", hint: "Average squared miss of the probability. Lower is better.", better: "lower", format: dec3 },
    { id: "log_loss", label: "Log loss", hint: "Penalises confident wrong answers. Lower is better.", better: "lower", format: dec3 },
  ],
  time_to_degree: [
    { id: "mae", label: "Typical miss", hint: "Average gap between the median estimate and the real years to degree. Lower is better.", better: "lower", format: yrs2 },
    { id: "pinball", label: "Pinball", hint: "Scores all three quantiles at once (p25, p50, p75), in years. Lower is better.", better: "lower", format: dec3 },
    { id: "r2", label: "R²", hint: "Share of the spread in graduation time the median explains. 0 means no better than one average.", better: "higher", format: dec3 },
  ],
  career: [
    { id: "macro_f1", label: "Macro-F1", hint: "Average F1 over the three destinations, so a model that only ever says Employed scores low.", better: "higher", format: dec3, domain: [0, 1] },
    { id: "top2_accuracy", label: "Top-2 hit", hint: "How often the real destination is among its two most likely answers.", better: "higher", format: dec3, domain: [0, 1] },
    { id: "log_loss", label: "Log loss", hint: "Penalises confident wrong probabilities. The pre-registered selection metric. Lower is better.", better: "lower", format: dec3 },
  ],
  salary: [
    { id: "mae", label: "Typical miss", hint: "Average gap between the median estimate and the real first salary, in nominal dollars. Lower is better.", better: "lower", format: usdMae },
    { id: "pinball", label: "Pinball", hint: "Scores all three quantiles at once, in dollars. Lower is better.", better: "lower", format: usdMae },
    { id: "r2", label: "R²", hint: "Below zero means one average salary for everyone would have explained the holdout better.", better: "higher", format: dec3 },
  ],
};

type Cand = ArenaReport["tasks"][TaskId]["candidates"][number];

function valueOf(task: TaskId, c: Cand, metric: string, stage: number): number {
  if (task === "risk") {
    const risk = c as RiskCandidate;
    const per = risk.per_stage.find((s) => s.stage === stage);
    if (per && (metric === "auroc" || metric === "brier" || metric === "log_loss")) return per[metric];
    return risk.metrics[metric as "auroc" | "brier" | "log_loss"];
  }
  if (task === "career") return (c as CareerCandidate).metrics[metric as "macro_f1" | "top2_accuracy" | "log_loss"];
  return (c as { metrics: QuantileMetrics }).metrics[metric as "mae" | "pinball" | "r2"];
}

export interface BoardRow {
  family: Family;
  value: number;
  champion: boolean;
  holdoutBest: boolean;
  beats: boolean;
  gain: Gain | null;
  kind: string;
}

export interface Board {
  task: TaskId;
  metric: MetricDef;
  rows: BoardRow[];
  baseline: number;
  domain: [number, number];
  champion: Family;
  holdoutBest: Family;
  nTest: number;
  /** True when every learned family is inside noise of the baseline: the honest career headline. */
  nobodyBeatsBaseline: boolean;
}

export function board(arena: ArenaReport, task: TaskId, metricId: string, stage = 0): Board {
  const t = arena.tasks[task];
  const metric = METRICS[task].find((m) => m.id === metricId) ?? METRICS[task][0];
  const by = new Map((t.candidates as Cand[]).map((c) => [c.family, c]));
  const rows = FAMILIES.map<BoardRow>((f) => {
    const c = by.get(f) as Cand;
    return { family: f, value: valueOf(task, c, metric.id, stage), champion: t.champion.family === f, holdoutBest: t.champion.holdout_best_family === f, beats: c.beats_baseline, gain: c.vs_baseline, kind: c.kind };
  });
  const vals = rows.map((r) => r.value);
  const lo = Math.min(0, ...vals);
  const hi = Math.max(...vals);
  const domain = metric.domain ?? ([lo < 0 ? lo * 1.15 : 0, hi * 1.08] as [number, number]);
  const nTest = (t.candidates[0].metrics as { n_test: number }).n_test;
  return {
    task,
    metric,
    rows,
    baseline: rows[0].value,
    domain,
    champion: t.champion.family,
    holdoutBest: t.champion.holdout_best_family,
    nTest,
    nobodyBeatsBaseline: rows.filter((r) => r.family !== "baseline").every((r) => !r.beats),
  };
}

/** What "beating the baseline" means in each task's own units, with the 95% interval. */
export function gainText(task: TaskId, g: Gain): string {
  const sg = (v: number, f: (n: number) => string) => `${v < 0 ? "−" : "+"}${f(Math.abs(v))}`;
  const f = task === "salary" ? (n: number) => usd(n) : (n: number) => n.toFixed(3);
  const what = task === "risk" ? "AUROC gained" : task === "career" ? "log loss saved" : task === "salary" ? "pinball loss saved" : "pinball loss saved (years)";
  return `${sg(g.delta, f)} ${what} · 95% CI ${sg(g.ci95[0], f)} to ${sg(g.ci95[1], f)}`;
}

/** Fixed test-slice facts for the protocol line: rows fitted, rows tested, and the holdout years. */
export function protocol(arena: ArenaReport, task: TaskId, stage = 0) {
  const t = arena.tasks[task];
  const sp = t.split;
  const perStage = "per_stage" in sp ? sp.per_stage.find((s) => s.stage === (task === "time_to_degree" ? 1 : stage)) : undefined;
  const nTrain = perStage ? perStage.n_train : "n_train" in sp ? sp.n_train : 0;
  const nTest = perStage ? perStage.n_test : "n_test" in sp ? sp.n_test : 0;
  return { nTrain, nTest, testYears: sp.test_years, trainYears: sp.train_years, validationYears: sp.validation_years };
}

const SHORT: Record<string, string> = {
  entry_transfer: "Transfer entry",
  out_of_state: "Out of state",
  work_hours: "Work hours",
  major_cs: "CS major",
  k: "Terms done",
  att_mean: "Avg credits tried",
  earned_mean: "Avg credits earned",
  att_min: "Lightest term",
  att_last: "Latest load",
  low_share: "Light-term share",
  w_sum: "Withdrawals",
  f_sum: "Failed courses",
  rep_sum: "Repeats",
  earned_ratio: "Earned share",
  internship_count: "Internships",
  credential_count: "Credentials",
  engagement_count: "Engagement",
};
export const featureName = (f: FeatureImportance): string => SHORT[f.feature] ?? f.label;

export function importanceRows(arena: ArenaReport, task: TaskId, stage: number): FeatureImportance[] {
  const imp = arena.tasks[task].importance;
  const list = "by_stage" in imp ? (imp.by_stage[String(task === "time_to_degree" ? 1 : stage)] ?? []) : imp.features;
  return list.slice(0, 8);
}
