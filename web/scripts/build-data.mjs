// Builds the static JSON the web app reads in local/demo mode.
// Reads ../data/*.csv (HackUMBC 2026, synthetic), writes public/data/*.json.
// Run: npm run data
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
// CSVs live in data/raw (pinned + hash-checked by scripts/load.py); fall back to data/.
const DATA = [path.resolve(here, "../../data/raw"), path.resolve(here, "../../data")].find((d) => fs.existsSync(path.join(d, "alumni.csv")));
const OUT = path.resolve(here, "../public/data");
fs.mkdirSync(OUT, { recursive: true });

// ---------- CSV ----------
function parseCSV(text) {
  const rows = [];
  let row = [], field = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
      } else field += c;
    } else if (c === '"') q = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n") { row.push(field); rows.push(row); row = []; field = ""; }
    else if (c !== "\r") field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length === head.length).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]])));
}
const load = (f) => parseCSV(fs.readFileSync(path.join(DATA, f), "utf8"));
const NA = (v) => (v === "Not Applicable" || v === "" ? null : v);
const num = (v) => (NA(v) === null ? null : Number(v));

// ---------- seeded RNG ----------
function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

// ---------- terms ----------
// Regular terms only. Spring yyyy -> 2y, Fall yyyy -> 2y+1.
function termIdx(t) {
  const [season, y] = t.split(" ");
  if (season === "Summer") return null;
  return Number(y) * 2 + (season === "Fall" ? 1 : 0);
}
const idxName = (i) => `${i % 2 ? "Fall" : "Spring"} ${Math.floor(i / 2)}`;

console.log("loading CSVs…");
const alumniRaw = load("alumni.csv");
const currentRaw = load("students_current.csv");
const transcripts = load("transcripts.csv");
const experience = load("student_experience.csv");
const catalogRaw = load("course_catalog.csv");

// person -> term -> aggregates
const byPerson = new Map();
const ipCourses = new Map();
const doneCourses = new Map();
for (const r of transcripts) {
  if (r.grade === "IP") {
    if (!ipCourses.has(r.campus_id)) ipCourses.set(r.campus_id, []);
    ipCourses.get(r.campus_id).push(r.course_id);
    continue;
  }
  if (Number(r.credits_earned) > 0) {
    if (!doneCourses.has(r.campus_id)) doneCourses.set(r.campus_id, new Set());
    doneCourses.get(r.campus_id).add(r.course_id);
  }
  const ti = termIdx(r.term);
  if (ti === null) continue;
  if (!byPerson.has(r.campus_id)) byPerson.set(r.campus_id, new Map());
  const m = byPerson.get(r.campus_id);
  if (!m.has(ti)) m.set(ti, { att: 0, earned: 0, w: 0, f: 0, rep: 0 });
  const t = m.get(ti);
  t.att += Number(r.credits_attempted);
  t.earned += Number(r.credits_earned);
  if (r.grade === "W") t.w++;
  if (r.grade === "F") t.f++;
  if (r.is_repeat === "TRUE") t.rep++;
}

function termSeries(id) {
  const m = byPerson.get(id);
  if (!m) return { terms: [], gaps: 0, first: null };
  const idx = [...m.keys()].sort((a, b) => a - b);
  const gaps = idx.length ? idx[idx.length - 1] - idx[0] + 1 - idx.length : 0;
  return {
    terms: idx.map((i) => { const t = m.get(i); return [t.att, t.earned, t.w, t.f, t.rep]; }),
    gaps,
    first: idx.length ? idxName(idx[0]) : null,
  };
}

// Per-term behaviour features (normalised by term count so partial histories are comparable).
function feats(terms, gaps) {
  const n = terms.length || 1;
  const att = terms.reduce((s, t) => s + t[0], 0) / n;
  const low = terms.filter((t) => t[0] < 12).length / n;
  const w = terms.reduce((s, t) => s + t[2], 0) / n;
  const rep = terms.reduce((s, t) => s + t[4], 0) / n;
  return [att, low, w, rep, gaps > 0 ? 1 : 0];
}

// ---------- alumni ----------
const alumni = alumniRaw.map((a) => {
  const { terms, gaps } = termSeries(a.campus_id);
  const wTot = terms.reduce((s, t) => s + t[2], 0);
  const ttd = Number(a.time_to_degree_years);
  return {
    id: a.campus_id,
    major: a.major,
    track: a.track,
    entry: a.entry_type === "Transfer" ? "T" : "F",
    res: a.residency === "Out-of-State" ? "O" : "I",
    work: Number(a.work_hours_per_week_while_enrolled),
    ttd,
    gy: Number(a.graduation_year),
    dest: a.first_destination,
    sal: num(a.first_job_annual_salary_usd),
    cost: num(a.net_cost_usd),
    intern: Number(a.internship_count),
    gpa: num(a.final_gpa),
    gaps,
    cooked: ttd > 5 || wTot >= 5,
    terms,
  };
});

// ---------- autopsy: k-means on behaviour features ----------
const X = alumni.map((a) => feats(a.terms, a.gaps));
const dims = X[0].length;
const mu = Array.from({ length: dims }, (_, j) => X.reduce((s, x) => s + x[j], 0) / X.length);
const sd = Array.from({ length: dims }, (_, j) => Math.sqrt(X.reduce((s, x) => s + (x[j] - mu[j]) ** 2, 0) / X.length) || 1);
const Z = X.map((x) => x.map((v, j) => (v - mu[j]) / sd[j]));
const d2 = (a, b) => a.reduce((s, v, j) => s + (v - b[j]) ** 2, 0);

function kmeans(data, k, seed) {
  const rand = rng(seed);
  const cents = [data[Math.floor(rand() * data.length)]];
  while (cents.length < k) {
    const ds = data.map((p) => Math.min(...cents.map((c) => d2(p, c))));
    const tot = ds.reduce((s, v) => s + v, 0);
    let r = rand() * tot, i = 0;
    while ((r -= ds[i]) > 0) i++;
    cents.push(data[i]);
  }
  let lab = new Array(data.length).fill(0);
  for (let it = 0; it < 100; it++) {
    lab = data.map((p) => { let b = 0; cents.forEach((c, j) => { if (d2(p, c) < d2(p, cents[b])) b = j; }); return b; });
    const next = cents.map((_, j) => {
      const pts = data.filter((_, i) => lab[i] === j);
      return pts.length ? pts[0].map((_, d) => pts.reduce((s, p) => s + p[d], 0) / pts.length) : cents[j];
    });
    if (next.every((c, j) => d2(c, cents[j]) < 1e-9)) break;
    next.forEach((c, j) => (cents[j] = c));
  }
  const inertia = data.reduce((s, p, i) => s + d2(p, cents[lab[i]]), 0);
  return { cents, lab, inertia };
}
let best = null;
for (let s = 1; s <= 12; s++) {
  const r = kmeans(Z, 5, s * 7919);
  if (!best || r.inertia < best.inertia) best = r;
}
// Name clusters from their centroids (raw units).
const raw = best.cents.map((c) => c.map((v, j) => v * sd[j] + mu[j]));
const order = raw.map((c, j) => ({ j, att: c[0], low: c[1], w: c[2], rep: c[3], gap: c[4] }));
const names = {};
const take = (key, name) => {
  const left = order.filter((o) => !(o.j in names));
  const pick = left.sort((a, b) => b[key] - a[key])[0];
  names[pick.j] = name;
};
take("gap", "stop-out");
take("w", "withdrawal spiral");
take("low", "part-time grind");
take("rep", "rough patch");
order.forEach((o) => { if (!(o.j in names)) names[o.j] = "smooth"; });
alumni.forEach((a, i) => (a.pattern = names[best.lab[i]]));

const patterns = Object.values(names).map((name) => {
  const j = Number(Object.keys(names).find((k) => names[k] === name));
  const members = alumni.filter((a) => a.pattern === name);
  const c = raw[j];
  const avg = (f) => members.reduce((s, a) => s + f(a), 0) / members.length;
  const emp = members.filter((a) => a.sal);
  const reported = members.filter((a) => a.dest !== "No Response");
  return {
    name,
    n: members.length,
    share: members.length / alumni.length,
    avgCredits: c[0],
    lowShare: c[1],
    wPerTerm: c[2],
    repPerTerm: c[3],
    ttd: avg((a) => a.ttd),
    work: avg((a) => a.work),
    cookedRate: avg((a) => (a.cooked ? 1 : 0)),
    salary: emp.length ? emp.reduce((s, a) => s + a.sal, 0) / emp.length : null,
    stillSeeking: reported.length ? reported.filter((a) => a.dest === "Still Seeking").length / reported.length : null,
  };
});
console.log("patterns:", patterns.map((p) => `${p.name} ${p.n} ttd=${p.ttd.toFixed(2)} cr=${p.avgCredits.toFixed(1)}`).join(" | "));

// ---------- shock rates (measured per-term, by work-hours band) ----------
const band = (w) => (w === 0 ? 0 : w <= 10 ? 1 : w <= 20 ? 2 : w <= 30 ? 3 : 4);
const BANDS = ["0 h", "1–10 h", "11–20 h", "21–30 h", "31+ h"];
const shock = BANDS.map(() => ({ terms: 0, wTerms: 0, drops: 0, pairs: 0 }));
for (const a of alumni) {
  const s = shock[band(a.work)];
  a.terms.forEach((t, i) => {
    s.terms++;
    if (t[2] > 0) s.wTerms++;
    if (i > 0) { s.pairs++; if (a.terms[i - 1][0] - t[0] >= 3) s.drops++; }
  });
}
const internOutcomes = {};
let internTotal = 0;
for (const e of experience) {
  if (e.experience_type !== "Internship" && e.experience_type !== "Co-op") continue;
  internOutcomes[e.outcome] = (internOutcomes[e.outcome] || 0) + 1;
  internTotal++;
}
const seekingByIntern = [0, 1, 2, 3].map((k) => {
  const g = alumni.filter((a) => a.dest !== "No Response" && (k < 3 ? a.intern === k : a.intern >= 3));
  return { internships: k, n: g.length, rate: g.filter((a) => a.dest === "Still Seeking").length / g.length };
});
const shocks = {
  bands: BANDS,
  withdraw: shock.map((s) => s.wTerms / s.terms),
  lighterLoad: shock.map((s) => s.drops / s.pairs),
  internEndedEarly: (internOutcomes["Ended early"] || 0) / internTotal,
  internOfferDeclined: (internOutcomes["Return offer declined"] || 0) / internTotal,
  seekingByIntern,
};
console.log("shocks:", JSON.stringify(shocks.withdraw.map((v) => v.toFixed(3))), JSON.stringify(shocks.lighterLoad.map((v) => v.toFixed(3))));

// ---------- the load cliff ----------
const bins = [
  { label: "≤7", lo: 0, hi: 7 },
  { label: "7–9", lo: 7, hi: 9 },
  { label: "9–11", lo: 9, hi: 11 },
  { label: "11–13", lo: 11, hi: 13 },
  { label: "13+", lo: 13, hi: 99 },
];
const avgAtt = (a) => (a.terms.length ? a.terms.reduce((s, t) => s + t[0], 0) / a.terms.length : null);
const cliffFor = (filter) =>
  bins.map((b) => {
    const g = alumni.filter((a) => filter(a) && avgAtt(a) !== null && avgAtt(a) > b.lo - (b.lo === 0 ? 1 : 0) && avgAtt(a) <= b.hi);
    return { ...b, n: g.length, cooked: g.length ? g.filter((a) => a.cooked).length / g.length : null };
  });
const cliff = { heavy: cliffFor((a) => a.work >= 20), all: cliffFor(() => true), light: cliffFor((a) => a.work < 20) };
console.log("cliff heavy:", cliff.heavy.map((b) => `${b.label}:${b.cooked === null ? "-" : (b.cooked * 100).toFixed(0)}%(${b.n})`).join(" "));

// ---------- catalog + prerequisite graph ----------
const catalog = catalogRaw.map((c) => {
  const pre = NA(c.prerequisite_ids);
  // "A|B" = all of; "A or B" inside a group = any of.
  const groups = pre ? pre.split("|").map((g) => g.split(" or ").map((s) => s.trim())) : [];
  return {
    id: c.course_id,
    subject: c.subject,
    title: c.course_title,
    credits: Number(c.credits),
    level: c.course_level,
    type: c.course_type,
    majors: (NA(c.required_for_majors) || "").split("|").filter(Boolean),
    pre: groups,
    offered: c.typical_terms_offered.split("|"),
    difficulty: Number(c.difficulty_index),
  };
});
const children = new Map(catalog.map((c) => [c.id, []]));
catalog.forEach((c) => c.pre.flat().forEach((p) => children.get(p)?.push(c.id)));
const downstream = (id, seen = new Set()) => {
  for (const ch of children.get(id) || []) if (!seen.has(ch)) { seen.add(ch); downstream(ch, seen); }
  return seen;
};
catalog.forEach((c) => (c.gates = downstream(c.id).size));

// ---------- current students ----------
const centsRaw = raw;
const assignPattern = (f) => {
  const z = f.map((v, j) => (v - mu[j]) / sd[j]);
  let b = 0;
  best.cents.forEach((c, j) => { if (d2(z, c) < d2(z, best.cents[b])) b = j; });
  return names[b];
};
void centsRaw;
const current = currentRaw.map((s) => {
  const { terms, gaps, first } = termSeries(s.campus_id);
  return {
    id: s.campus_id,
    major: s.major,
    track: s.track,
    entry: s.entry_type === "Transfer" ? "T" : "F",
    res: s.residency === "Out-of-State" ? "O" : "I",
    work: Number(s.work_hours_per_week),
    cls: s.class_level,
    intensity: s.enrollment_intensity,
    firstGen: s.is_first_generation === "TRUE",
    gpa: num(s.cumulative_gpa),
    credEarned: Number(s.credits_earned),
    credReq: Number(s.credits_required),
    intern: Number(s.internship_count),
    entryTerm: s.entry_term,
    firstTerm: first,
    expGrad: s.expected_graduation_term,
    gaps,
    terms,
    ip: ipCourses.get(s.campus_id) || [],
    done: [...(doneCourses.get(s.campus_id) || [])],
    pattern: terms.length ? assignPattern(feats(terms, gaps)) : null,
  };
});

// Demo candidates: deterministic picks, the app keeps the first with enough twins.
const avgC = (s) => s.terms.reduce((a, t) => a + t[0], 0) / s.terms.length;
const wSum = (s) => s.terms.reduce((a, t) => a + t[2], 0);
// Early-stage students (2-3 completed terms) so the alarm has lead time.
const pool = current.filter((s) => s.terms.length >= 2 && s.terms.length <= 3 && s.gaps === 0);
const byId = (a, b) => a.id.localeCompare(b.id);
const demo = {
  grind: pool.filter((s) => s.work >= 20 && avgC(s) < 9 && wSum(s) === 0).sort(byId).slice(0, 15).map((s) => s.id),
  spiral: pool.filter((s) => wSum(s) >= 2).sort((a, b) => wSum(b) - wSum(a) || byId(a, b)).slice(0, 15).map((s) => s.id),
  smooth: pool.filter((s) => s.work <= 12 && avgC(s) >= 14 && wSum(s) === 0).sort(byId).slice(0, 15).map((s) => s.id),
};
console.log("demo candidates:", JSON.stringify(demo));

// ---------- write ----------
const write = (name, obj) => {
  const p = path.join(OUT, name);
  fs.writeFileSync(p, JSON.stringify(obj));
  console.log(`wrote ${name} ${(fs.statSync(p).size / 1024).toFixed(0)} KB`);
};
write("alumni.json", alumni);
write("current.json", current);
write("catalog.json", catalog);
write("meta.json", {
  generatedAt: new Date().toISOString(),
  counts: { alumni: alumni.length, current: current.length, transcripts: transcripts.length, catalog: catalog.length },
  baseRate: alumni.filter((a) => a.cooked).length / alumni.length,
  patterns,
  shocks,
  cliff,
  demo,
});
