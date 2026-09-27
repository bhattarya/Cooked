// FAKE sample data for the dev gallery only. None of it is real or comes from the dataset; every
// card on the gallery says so. Seeded so the page is identical on the server and the client.

function mulberry32(a: number) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gaussian(rng: () => number) {
  return () => {
    let u = 0;
    let v = 0;
    while (u === 0) u = rng();
    while (v === 0) v = rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
}

export const PATTERNS = ["smooth", "rough patch", "part-time grind", "withdrawal spiral", "stop-out"] as const;
export type Pattern = (typeof PATTERNS)[number];

const CLUSTERS: { key: Pattern; share: number; cx: number; cy: number; sx: number; sy: number }[] = [
  { key: "smooth", share: 0.5, cx: -2.2, cy: 0.6, sx: 1.1, sy: 0.9 },
  { key: "rough patch", share: 0.18, cx: 0.9, cy: -0.4, sx: 0.9, sy: 1.0 },
  { key: "part-time grind", share: 0.13, cx: 2.4, cy: 1.6, sx: 0.8, sy: 0.8 },
  { key: "withdrawal spiral", share: 0.1, cx: 2.8, cy: -2.1, sx: 0.8, sy: 0.9 },
  { key: "stop-out", share: 0.09, cx: -0.5, cy: -2.6, sx: 1.1, sy: 0.7 },
];

export function fakeConstellation(n = 3200) {
  const g = gaussian(mulberry32(2026));
  const pts: { x: number; y: number; group: string; id: string }[] = [];
  for (const c of CLUSTERS) {
    const k = Math.round(n * c.share);
    for (let i = 0; i < k; i++) pts.push({ x: c.cx + g() * c.sx, y: c.cy + g() * c.sy, group: c.key, id: `FAKE-${String(pts.length + 1).padStart(4, "0")}` });
  }
  return pts;
}

/** Points with 4 groups, few enough to render as SVG. */
export const fakeSmallScatter = () => fakeConstellation(320);

export const RISK_X = [0, 1, 2, 3, 4, 5, 6];
export const RISK_MID = [0.12, 0.16, 0.21, 0.29, 0.38, 0.47, 0.55];
export const RISK_LOW = [0.09, 0.11, 0.15, 0.2, 0.27, 0.34, 0.4];
export const RISK_HIGH = [0.15, 0.22, 0.29, 0.4, 0.52, 0.62, 0.71];
export const RISK_REPAIRED = [0.12, 0.14, 0.16, 0.2, 0.24, 0.27, 0.3];

export const SHOCK_STEPS = [
  { label: "Drop 2 courses", delta: 0.11, n: 412 },
  { label: "Work 30 h/week", delta: 0.09, n: 388 },
  { label: "Skip a term", delta: 0.13, n: 271 },
  { label: "Internship ends early", delta: 0.05, n: 143 },
  { label: "Summer bridge course", delta: -0.04, n: 96 },
];

export const CAREER = [
  { label: "Software engineering", value: 34, n: 34 },
  { label: "Data / analytics", value: 21, n: 21 },
  { label: "IT and support", value: 17, n: 17 },
  { label: "Grad school", value: 12, n: 12 },
  { label: "Other field", value: 9, n: 9 },
  { label: "Still seeking", value: 7, n: 7 },
];

export const MAJOR_RATES = [
  { label: "Computer Science", value: 0.31, lo: 0.26, hi: 0.36, n: 1210 },
  { label: "Information Systems", value: 0.42, lo: 0.35, hi: 0.5, n: 640 },
  { label: "Biology", value: 0.24, lo: 0.19, hi: 0.3, n: 880 },
  { label: "Psychology", value: 0.37, lo: 0.3, hi: 0.44, n: 720 },
  { label: "Mechanical Engineering", value: 0.28, lo: 0.22, hi: 0.35, n: 510 },
  { label: "Business", value: 0.19, lo: 0.14, hi: 0.25, n: 930 },
];

export const LOAD_BANDS = ["<9 credits", "9-11", "12-14", "15-17", "18+"];
export const CREDIT_SERIES = [
  { key: "ontime", label: "Graduates on time" },
  { key: "late", label: "Graduates late" },
  { key: "cooked", label: "Not cooked out, still enrolled" },
];
export const CREDIT_GROUPS = [
  { label: "<9 credits", values: [12, 31, 57], n: 210 },
  { label: "9-11", values: [24, 40, 36], n: 388 },
  { label: "12-14", values: [46, 38, 16], n: 1240 },
  { label: "15-17", values: [58, 31, 11], n: 920 },
  { label: "18+", values: [49, 30, 21], n: 142 },
];

export const REPAIR = [
  { label: "Cut work to 15 h/week", before: 0.52, after: 0.34, n: 388 },
  { label: "Take a summer bridge course", before: 0.52, after: 0.44, n: 96 },
  { label: "Retake instead of withdraw", before: 0.52, after: 0.47, n: 205 },
  { label: "Add an internship", before: 0.52, after: 0.4, n: 312 },
  { label: "Drop to 9 credits", before: 0.52, after: 0.55, n: 144 },
  { label: "Use advising office", before: 0.52, after: 0.52, n: 77 },
];

/** ROC curves with a chosen AUC: tpr = fpr^p integrates to 1/(p+1). */
export function fakeRoc(auc: number, jitter = 0): [number, number][] {
  const p = 1 / auc - 1;
  const g = mulberry32(Math.round(auc * 1000));
  const pts: [number, number][] = [];
  for (let i = 0; i <= 40; i++) {
    const f = i / 40;
    const t = Math.min(1, Math.max(f, Math.pow(f, p) + (i > 0 && i < 40 ? (g() - 0.5) * jitter : 0)));
    pts.push([f, t]);
  }
  return pts;
}

export const MODELS = [
  { key: "gb", label: "Gradient boosting", auc: 0.913, n: 3200 },
  { key: "rf", label: "Random forest", auc: 0.894, n: 3200 },
  { key: "lr", label: "Logistic regression", auc: 0.842, n: 3200 },
];

export const CONFUSION_LABELS = ["smooth", "rough patch", "part-time grind", "withdrawal spiral", "stop-out"];
export const CONFUSION_COUNTS = [
  [772, 18, 6, 2, 2],
  [21, 251, 14, 11, 3],
  [9, 17, 168, 4, 10],
  [2, 12, 5, 121, 20],
  [6, 4, 11, 22, 97],
];

export const RADAR_AXES = [
  { key: "acc", label: "Accuracy" },
  { key: "cal", label: "Calibration" },
  { key: "rec", label: "Recall on spirals" },
  { key: "stab", label: "Stability" },
  { key: "cov", label: "Coverage" },
  { key: "spd", label: "Speed" },
];
export const RADAR_SERIES = [
  { key: "gb", label: "Gradient boosting", values: [0.91, 0.84, 0.88, 0.79, 0.93, 0.62], n: 3200 },
  { key: "rf", label: "Random forest", values: [0.87, 0.78, 0.81, 0.9, 0.9, 0.7], n: 3200 },
  { key: "lr", label: "Logistic regression", values: [0.8, 0.9, 0.7, 0.94, 0.86, 0.96], n: 3200 },
];

export const HEAT_ROWS = ["<9 credits", "9-11", "12-14", "15-17", "18+"];
export const HEAT_COLS = ["T1", "T2", "T3", "T4", "T5", "T6", "T7", "T8"];
export const HEAT_VALUES: (number | null)[][] = [
  [0.22, 0.31, 0.4, 0.52, 0.61, 0.7, 0.74, 0.79],
  [0.15, 0.2, 0.27, 0.36, 0.44, 0.52, 0.58, 0.63],
  [0.08, 0.1, 0.14, 0.19, 0.24, 0.29, 0.33, 0.36],
  [0.06, 0.08, 0.11, 0.15, 0.2, 0.26, 0.31, 0.35],
  [0.1, 0.14, 0.2, 0.28, 0.37, null, null, null],
];

export const FEATURES = [
  { label: "Earned / attempted ratio", value: 0.29 },
  { label: "Withdrawals", value: 0.21 },
  { label: "Credits per term", value: 0.14 },
  { label: "Work hours", value: 0.11 },
  { label: "Enrollment gaps", value: 0.09 },
  { label: "Failed courses", value: 0.07 },
  { label: "Internships", value: 0.05 },
  { label: "Engagement events", value: 0.04 },
];

export function fakeSalary() {
  const g = gaussian(mulberry32(77));
  const mk = (mean: number, sd: number, n: number) => Array.from({ length: n }, () => Math.max(38000, Math.round(mean + g() * sd)));
  return [
    { key: "smooth", label: "smooth", values: mk(82000, 15000, 420), color: "var(--viz-2)" },
    { key: "rough", label: "rough patch", values: mk(74000, 14000, 260), color: "var(--viz-1)" },
    { key: "grind", label: "part-time grind", values: mk(69000, 12000, 190), color: "var(--viz-3)" },
    { key: "spiral", label: "withdrawal spiral", values: mk(58000, 12000, 140), color: "var(--hot)" },
  ];
}

export const FLOW_NODES = [
  { id: "cs", label: "Computer Science", color: "var(--viz-8)" },
  { id: "is", label: "Information Systems", color: "var(--viz-5)" },
  { id: "smooth", label: "smooth", color: "var(--viz-2)" },
  { id: "rough", label: "rough patch", color: "var(--viz-1)" },
  { id: "grind", label: "part-time grind", color: "var(--viz-3)" },
  { id: "spiral", label: "withdrawal spiral", color: "var(--hot)" },
  { id: "emp", label: "Employed in field" },
  { id: "grad", label: "Grad school" },
  { id: "seek", label: "Still seeking" },
];
export const FLOW_LINKS = [
  { source: "cs", target: "smooth", value: 780 },
  { source: "cs", target: "rough", value: 290 },
  { source: "cs", target: "grind", value: 190 },
  { source: "cs", target: "spiral", value: 140 },
  { source: "is", target: "smooth", value: 420 },
  { source: "is", target: "rough", value: 180 },
  { source: "is", target: "grind", value: 130 },
  { source: "is", target: "spiral", value: 110 },
  { source: "smooth", target: "emp", value: 850 },
  { source: "smooth", target: "grad", value: 250 },
  { source: "smooth", target: "seek", value: 100 },
  { source: "rough", target: "emp", value: 300 },
  { source: "rough", target: "grad", value: 60 },
  { source: "rough", target: "seek", value: 110 },
  { source: "grind", target: "emp", value: 190 },
  { source: "grind", target: "grad", value: 20 },
  { source: "grind", target: "seek", value: 110 },
  { source: "spiral", target: "emp", value: 100 },
  { source: "spiral", target: "grad", value: 10 },
  { source: "spiral", target: "seek", value: 140 },
];

export const SPARK = [0.31, 0.33, 0.3, 0.36, 0.41, 0.39, 0.44, 0.47, 0.45, 0.52];
