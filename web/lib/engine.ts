// Local engine: runs the COOKED tools in the browser on the synthetic dataset.
// Mirrors the tool contracts in the build plan (§8.2) so the FastAPI backend can
// replace it one function at a time. Every numeric result carries a tool_result id.
import type { Alum, Course, Dataset, Meta, PatternName, Student, Term } from "./types";

export const MIN_SUPPORT = 30;
export const COOKED_YEARS = 5;
export const FOUR_YEAR_TERMS = 8;
export const NEXT_TERM = { label: "Spring 2027", season: "Spring" };

// ---------- provenance ----------
export interface ToolResult<T> {
  id: string;
  tool: string;
  args: string;
  ms: number;
  data: T;
}

function hash(s: string): string {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36).slice(0, 5);
}

function run<T>(tool: string, args: Record<string, unknown>, fn: () => T): ToolResult<T> {
  const a = Object.entries(args)
    .map(([k, v]) => `${k}=${typeof v === "number" ? +v.toFixed(2) : v}`)
    .join(", ");
  const t0 = performance.now();
  const data = fn();
  return { id: `tr_${hash(tool + a)}`, tool, args: a, ms: performance.now() - t0, data };
}

// ---------- helpers ----------
export const quantile = (xs: number[], q: number) => {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const p = (s.length - 1) * q;
  const lo = Math.floor(p);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (p - lo);
};
export const median = (xs: number[]) => quantile(xs, 0.5);

function seeded(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const workBand = (w: number) => (w === 0 ? 0 : w <= 10 ? 1 : w <= 20 ? 2 : w <= 30 ? 3 : 4);

// prefix sums per alum so stage-aligned matching is O(1) per candidate
const prefix = new WeakMap<Alum, { att: number[]; w: number[] }>();
function pre(a: Alum) {
  let p = prefix.get(a);
  if (!p) {
    const att = [0];
    const w = [0];
    a.terms.forEach((t, i) => {
      att.push(att[i] + t[0]);
      w.push(w[i] + t[2]);
    });
    p = { att, w };
    prefix.set(a, p);
  }
  return p;
}

// ---------- state ----------
export interface State {
  id: string;
  major: string;
  track: string;
  entry: "F" | "T";
  res: "I" | "O";
  work: number;
  terms: Term[];
  credEarned: number;
  credReq: number;
  intern: number;
  done: string[];
  ip: string[];
  pattern: PatternName | null;
  planLoad: number;
}

export function avgLoad(terms: Term[], k = terms.length) {
  const n = Math.min(k, terms.length);
  return n ? terms.slice(0, n).reduce((s, t) => s + t[0], 0) / n : 0;
}
export const wTotal = (terms: Term[]) => terms.reduce((s, t) => s + t[2], 0);

export function stateFrom(s: Student, over: { work?: number; planLoad?: number } = {}): State {
  const base = s.terms.length ? Math.round(avgLoad(s.terms)) : 15;
  return {
    id: s.id,
    major: s.major,
    track: s.track,
    entry: s.entry,
    res: s.res,
    work: over.work ?? s.work,
    terms: s.terms,
    credEarned: s.credEarned,
    credReq: s.credReq,
    intern: s.intern,
    done: s.done,
    ip: s.ip,
    pattern: s.pattern,
    planLoad: over.planLoad ?? base,
  };
}

// ---------- get_state ----------
export function getState(st: State) {
  return run("get_state", { campus_id: st.id }, () => ({
    termsDone: st.terms.length,
    avgCredits: avgLoad(st.terms),
    wTotal: wTotal(st.terms),
    work: st.work,
    entry: st.entry === "T" ? "Transfer" : "First-time freshman",
    credEarned: st.credEarned,
    credReq: st.credReq,
  }));
}

// ---------- find_twins ----------
const TIERS = [
  { w: 3, c: 1, wd: 0 },
  { w: 5, c: 1.5, wd: 1 },
  { w: 8, c: 2, wd: 1 },
  { w: 10, c: 2.5, wd: 2 },
];

export interface Twins {
  k: number;
  twins: Alum[];
  n: number;
  tier: number;
  tol: { work: number; credits: number; withdrawals: number };
  refused: boolean;
}

export function findTwins(ds: Dataset, st: State): ToolResult<Twins> {
  const k = Math.min(st.terms.length, FOUR_YEAR_TERMS);
  const sAvg = avgLoad(st.terms, k);
  const sW = wTotal(st.terms.slice(0, k));
  return run("find_twins", { k, work: st.work, entry: st.entry, avg_credits: sAvg, min_support: MIN_SUPPORT }, () => {
    let twins: Alum[] = [];
    let tier = 0;
    for (; tier < TIERS.length; tier++) {
      const T = TIERS[tier];
      twins = ds.alumni.filter((a) => {
        if (a.entry !== st.entry || Math.abs(a.work - st.work) > T.w) return false;
        if (k === 0) return true;
        if (a.terms.length < k) return false;
        const p = pre(a);
        return Math.abs(p.att[k] / k - sAvg) <= T.c && Math.abs(p.w[k] - sW) <= T.wd;
      });
      if (twins.length >= MIN_SUPPORT) break;
    }
    tier = Math.min(tier, TIERS.length - 1);
    const T = TIERS[tier];
    return {
      k,
      twins,
      n: twins.length,
      tier,
      tol: { work: T.w, credits: T.c, withdrawals: T.wd },
      refused: twins.length < MIN_SUPPORT,
    };
  });
}

// ---------- outcomes (the three tiles) ----------
export interface Outcomes {
  n: number;
  risk: number;
  cookedN: number;
  delay: [number, number, number];
  ttd: [number, number, number];
  seeking: { rate: number; n: number; ci95: [number, number] };
  burden: [number, number, number] | null;
  burdenN: number;
}

export function outcomesOf(twins: Alum[]): Outcomes {
  const cooked = twins.filter((a) => a.cooked).length;
  const ttd = twins.map((a) => a.ttd);
  const delay = ttd.map((y) => Math.max(0, y - 4));
  const reported = twins.filter((a) => a.dest !== "No Response");
  const seekingN = reported.filter((a) => a.dest === "Still Seeking").length;
  const seekingRate = reported.length ? seekingN / reported.length : 0;
  // Wilson interval for a binomial proportion; avoids an invented fixed-width band.
  const z = 1.96;
  const nReported = reported.length;
  const den = 1 + z * z / Math.max(nReported, 1);
  const center = (seekingRate + z * z / (2 * Math.max(nReported, 1))) / den;
  const half = z * Math.sqrt(seekingRate * (1 - seekingRate) / Math.max(nReported, 1) + z * z / (4 * Math.max(nReported, 1) ** 2)) / den;
  const burdens = twins.filter((a) => a.sal && a.cost).map((a) => (a.cost as number) / (a.sal as number));
  return {
    n: twins.length,
    risk: twins.length ? cooked / twins.length : 0,
    cookedN: cooked,
    delay: [quantile(delay, 0.25), median(delay), quantile(delay, 0.75)],
    ttd: [quantile(ttd, 0.25), median(ttd), quantile(ttd, 0.75)],
    seeking: {
      rate: seekingRate,
      n: nReported,
      ci95: nReported ? [Math.max(0, center - half), Math.min(1, center + half)] : [NaN, NaN],
    },
    burden: burdens.length >= 10 ? [quantile(burdens, 0.25), median(burdens), quantile(burdens, 0.75)] : null,
    burdenN: burdens.length,
  };
}

export type Status = "fine" | "watch" | "cooked" | "unknown";
export const statusOf = (risk: number, refused = false): Status =>
  refused ? "unknown" : risk >= 0.5 ? "cooked" : risk >= 0.2 ? "watch" : "fine";

// Twins who then carried roughly `load` credits per term after stage k.
export function twinsOnPlan(tw: Twins, load: number, tol = 1.5): Alum[] {
  return tw.twins.filter((a) => {
    const rest = a.terms.slice(tw.k);
    if (!rest.length) return false;
    return Math.abs(avgLoad(rest) - load) <= tol;
  });
}

// Outcomes for the student's plan: matched students who then carried about `planLoad` credits.
// Falls back to everyone at the same entry type and work hours when too few twins did.
export interface PlanOutcome {
  outcomes: Outcomes;
  pool: "twins" | "work-matched" | "twins (any load)";
  people: Alum[];
}
export function planOutcome(ds: Dataset, st: State, tw: Twins): ToolResult<PlanOutcome> {
  return run("plan_outcome", { campus_id: st.id, plan_load: st.planLoad, work: st.work, k: tw.k }, () => {
    const onPlan = twinsOnPlan(tw, st.planLoad);
    if (onPlan.length >= MIN_SUPPORT) return { outcomes: outcomesOf(onPlan), pool: "twins" as const, people: onPlan };
    const wp = ds.alumni.filter(
      (a) => a.entry === st.entry && Math.abs(a.work - st.work) <= 5 && a.terms.length > tw.k && Math.abs(avgLoad(a.terms.slice(tw.k)) - st.planLoad) <= 1.5,
    );
    if (wp.length >= MIN_SUPPORT) return { outcomes: outcomesOf(wp), pool: "work-matched" as const, people: wp };
    return { outcomes: outcomesOf(tw.twins), pool: "twins (any load)" as const, people: tw.twins };
  });
}

// ---------- projection (transparent arithmetic used by the drill) ----------
export function project(st: State, future: Term[], load = st.planLoad) {
  const earned = st.credEarned + future.reduce((s, t) => s + t[1], 0);
  const remaining = Math.max(0, st.credReq - earned);
  const termsNeeded = remaining > 0 ? Math.ceil(remaining / Math.max(load, 1)) : 0;
  const totalTerms = st.terms.length + future.length + termsNeeded;
  const w = wTotal(st.terms) + wTotal(future);
  const years = totalTerms / 2;
  return { years, remaining, termsNeeded, totalTerms, w, cooked: years > COOKED_YEARS || w >= 5 };
}

// ---------- run_shock / fire drill ----------
export type ShockKey = "withdraw" | "lighter";
export interface ShockStep {
  term: number;
  termLabel: string;
  key: ShockKey;
  label: string;
  detail: string;
  prob: number;
  yearsBefore: number;
  yearsAfter: number;
  cooked: boolean;
  tr: string;
}
export interface Drill {
  /** "years" = local arithmetic projection; "risk" = trained model probability (API) */
  unit?: "years" | "risk";
  baselineRisk?: number;
  baseline: ReturnType<typeof project>;
  path: ShockStep[];
  shocksToCooked: number | null;
  alreadyCooked: boolean;
  spof: ShockStep | null;
  joint: number;
  outcomeShocks: { key: string; label: string; detail: string; prob: number }[];
}

const termLabel = (i: number) => {
  // i = 0 is Fall 2026 (in progress), then alternate.
  const idx = 2026 * 2 + 1 + i;
  return `${idx % 2 ? "Fall" : "Spring"} ${Math.floor(idx / 2)}`;
};

export function fireDrill(meta: Meta, st: State, maxShocks = 4, pMin = 0.05): ToolResult<Drill> {
  return run("fire_drill", { campus_id: st.id, plan_load: st.planLoad, work: st.work, max_shocks: maxShocks }, () => {
    const b = workBand(st.work);
    const L = st.planLoad;
    const shocks = [
      {
        key: "withdraw" as const,
        label: "Withdraw and repeat",
        detail: "+1 W, −3 credits earned",
        prob: meta.shocks.withdraw[b],
        term: (): Term => [L, L - 3, 1, 0, 0],
      },
      {
        key: "lighter" as const,
        label: "Forced lighter load",
        detail: "−3 credits attempted",
        prob: meta.shocks.lighterLoad[b],
        term: (): Term => [L - 3, L - 3, 0, 0, 0],
      },
    ];
    const baseline = project(st, []);
    const future: Term[] = [];
    const path: ShockStep[] = [];
    let cur = baseline;
    if (!baseline.cooked) {
      for (let step = 0; step < maxShocks; step++) {
        // Largest projected delay wins; hitting the withdrawal limit counts as a break; ties go to the likelier shock.
        const score = (p: ReturnType<typeof project>) => p.years - cur.years + (p.w >= 5 ? 100 : 0);
        let best: { s: (typeof shocks)[number]; p: ReturnType<typeof project>; t: Term } | null = null;
        for (const s of shocks) {
          if (s.prob < pMin) continue;
          const t = s.term();
          const p = project(st, [...future, t]);
          if (!best || score(p) > score(best.p) || (score(p) === score(best.p) && s.prob > best.s.prob)) best = { s, p, t };
        }
        if (!best) break;
        future.push(best.t);
        path.push({
          term: future.length - 1,
          termLabel: termLabel(future.length - 1),
          key: best.s.key,
          label: best.s.label,
          detail: best.s.detail,
          prob: best.s.prob,
          yearsBefore: cur.years,
          yearsAfter: best.p.years,
          cooked: best.p.cooked,
          tr: `tr_${hash(st.id + best.s.key + step + L)}`,
        });
        cur = best.p;
        if (cur.cooked) break;
      }
    }
    const seek = meta.shocks.seekingByIntern[Math.min(st.intern, 3)];
    return {
      baseline,
      path,
      alreadyCooked: baseline.cooked,
      shocksToCooked: baseline.cooked ? 0 : cur.cooked ? path.length : null,
      spof: path.find((p) => p.yearsAfter > p.yearsBefore) ?? path[0] ?? null,
      joint: path.reduce((s, p) => s * p.prob, 1),
      outcomeShocks: [
        {
          key: "intern",
          label: "Internship ends early",
          detail: "Loses internship insurance",
          prob: meta.shocks.internEndedEarly,
        },
        {
          key: "market",
          label: "Job market miss",
          detail: `Still seeking at graduation (${seek.internships}${seek.internships === 3 ? "+" : ""} internships)`,
          prob: seek.rate,
        },
      ],
    };
  });
}

// ---------- Monte Carlo survival ----------
export interface SurvivalPoint {
  t: number;
  label: string;
  alive: number;
  graduated: number;
}

export function survival(meta: Meta, st: State, load = st.planLoad, horizon = 10, N = 500, seed = 7): ToolResult<SurvivalPoint[]> {
  return run("survival", { campus_id: st.id, plan_load: load, sims: N }, () => {
    const b = workBand(st.work);
    const pw = meta.shocks.withdraw[b];
    const pl = meta.shocks.lighterLoad[b];
    const rand = seeded(seed + load * 31 + st.work);
    const aliveAt = new Array(horizon + 1).fill(0);
    const gradAt = new Array(horizon + 1).fill(0);
    for (let s = 0; s < N; s++) {
      const future: Term[] = [];
      let dead = project(st, future, load).cooked;
      let grad = false;
      for (let t = 0; t <= horizon; t++) {
        if (t > 0 && !dead && !grad) {
          const w = rand() < pw ? 1 : 0;
          const drop = rand() < pl ? 3 : 0;
          const att = load - drop;
          future.push([att, Math.max(0, att - 3 * w), w, 0, 0]);
          const p = project(st, future, load);
          if (p.cooked) dead = true;
          else if (p.remaining <= 0) grad = true;
        }
        if (!dead) aliveAt[t]++;
        if (grad) gradAt[t]++;
      }
    }
    return aliveAt.map((a, t) => ({ t, label: t === 0 ? "now" : termLabel(t - 1), alive: a / N, graduated: gradAt[t] / N }));
  });
}

// ---------- catalog_feasibility ----------
export const majorSubject = (major: string) => (major === "Computer Science" ? "CMSC" : "IS");

export interface Feasibility {
  feasible: boolean;
  target: number;
  available: number;
  picks: Course[];
  blocked: { course: Course; missing: string[] }[];
  reasons: string[];
}

export function catalogFeasibility(ds: Dataset, st: State, target: number): ToolResult<Feasibility> {
  return run("catalog_feasibility", { campus_id: st.id, target_load: target, term: NEXT_TERM.label }, () => {
    const have = new Set([...st.done, ...st.ip]);
    const forMajor = (c: Course) => c.majors.includes(st.major);
    const prereqOk = (c: Course) => c.pre.every((g) => g.some((p) => have.has(p)));
    const offered = (c: Course) => c.offered.includes(NEXT_TERM.season);
    const open = ds.catalog.filter((c) => !have.has(c.id) && prereqOk(c) && offered(c));
    const subj = majorSubject(st.major);
    const rank = (c: Course) => (forMajor(c) ? 0 : c.type === "Elective" && c.subject === subj ? 1 : c.type === "General Education" ? 2 : 3);
    const sorted = [...open].sort((a, b) => rank(a) - rank(b) || b.gates - a.gates);
    const picks: Course[] = [];
    let credits = 0;
    for (const c of sorted) {
      if (credits >= target) break;
      if (rank(c) === 3) continue;
      picks.push(c);
      credits += c.credits;
    }
    const blocked = ds.catalog
      .filter((c) => forMajor(c) && !have.has(c.id) && !prereqOk(c))
      .map((c) => ({ course: c, missing: c.pre.filter((g) => !g.some((p) => have.has(p))).map((g) => g.join(" or ")) }))
      .sort((a, b) => b.course.gates - a.course.gates);
    const available = open.reduce((s, c) => s + c.credits, 0);
    const req = open.filter((c) => rank(c) === 0);
    return {
      feasible: credits >= target,
      target,
      available,
      picks,
      blocked,
      reasons: [
        `${req.length} required courses open in ${NEXT_TERM.label} (${req.reduce((s, c) => s + c.credits, 0)} cr)`,
        `${open.length} courses total with prerequisites met and offered (${available} cr)`,
        `${blocked.length} major courses still blocked by prerequisites`,
      ],
    };
  });
}

// ---------- escapee_stats / repair ----------
export interface Lever {
  key: "load" | "work";
  title: string;
  target: number;
  unit: string;
  diffYears: number;
  ci: [number, number];
  n: number;
  riskAt: number;
  supported: boolean;
  pool: string;
  reachesGoal?: boolean;
}
export interface Repair {
  primary: Lever | null;
  fallback: Lever | null;
  escapeeLoad: number;
  cookedLoad: number;
  escapees: number;
  cookedTwins: number;
  feasibility: ToolResult<Feasibility> | null;
  refusal: string | null;
}

function bootDiff(a: number[], b: number[], seed = 11, R = 300): [number, number] {
  const rand = seeded(seed);
  const pick = (xs: number[]) => xs.map(() => xs[Math.floor(rand() * xs.length)]);
  const ds: number[] = [];
  for (let r = 0; r < R; r++) ds.push(median(pick(a)) - median(pick(b)));
  return [quantile(ds, 0.05), quantile(ds, 0.95)];
}

export function repair(ds: Dataset, st: State, tw: Twins): ToolResult<Repair> {
  return run("escapee_stats", { campus_id: st.id, twins: tw.n, lever: "load,work" }, () => {
    const withFuture = tw.twins.filter((a) => a.terms.length > tw.k);
    const fut = (a: Alum) => avgLoad(a.terms.slice(tw.k));
    const esc = withFuture.filter((a) => !a.cooked);
    const ck = withFuture.filter((a) => a.cooked);
    const escapeeLoad = median(esc.map(fut));
    const cookedLoad = median(ck.map(fut));
    const current = Math.round(avgLoad(st.terms) || st.planLoad);
    const out: Repair = {
      primary: null,
      fallback: null,
      escapeeLoad,
      cookedLoad,
      escapees: esc.length,
      cookedTwins: ck.length,
      feasibility: null,
      refusal: null,
    };
    if (tw.refused) {
      out.refusal = `Only ${tw.n} matched students — not enough evidence (need ${MIN_SUPPORT}).`;
      return out;
    }
    // Primary lever: credit load after this point. Try the stage-matched twins first; if too few
    // of them ever raised their load, fall back to everyone at the same entry type and work hours.
    const workPool = ds.alumni.filter((a) => a.entry === st.entry && Math.abs(a.work - st.work) <= 5 && a.terms.length > tw.k);
    const pools: { label: string; people: Alum[] }[] = [
      { label: "matched students", people: withFuture },
      { label: "students at your work hours", people: workPool },
    ];
    // Smallest load that brings the projection under 5 years; if none can, the biggest supported gain.
    const termsLeft = Math.max(1, 2 * COOKED_YEARS - st.terms.length);
    const need = Math.ceil(Math.max(0, st.credReq - st.credEarned) / termsLeft);
    const start = Math.max(current + 1, Math.min(need, 17));
    const lever = (people: Alum[], target: number, label: string): Lever | null => {
      const hi = people.filter((a) => fut(a) >= target - 0.5);
      const lo = people.filter((a) => fut(a) < target - 0.5);
      if (hi.length < MIN_SUPPORT || lo.length < 10) return null;
      const diff = median(lo.map((a) => a.ttd)) - median(hi.map((a) => a.ttd));
      if (diff <= 0) return null;
      return {
        key: "load",
        title: `Hold ${target}+ credits a term`,
        target,
        unit: "credits/term",
        diffYears: diff,
        ci: bootDiff(lo.map((a) => a.ttd), hi.map((a) => a.ttd), target),
        n: hi.length,
        riskAt: hi.filter((a) => a.cooked).length / hi.length,
        supported: true,
        pool: label,
        reachesGoal: project({ ...st, planLoad: target }, [], target).years <= COOKED_YEARS,
      };
    };
    search: for (const pool of pools) {
      for (let target = start; target <= 17; target++) {
        const l = lever(pool.people, target, pool.label);
        if (l) {
          out.primary = l;
          break search;
        }
      }
    }
    if (!out.primary) {
      for (const pool of pools) {
        let best: Lever | null = null;
        for (let target = current + 1; target <= 16; target++) {
          const l = lever(pool.people, target, pool.label);
          if (l && (!best || l.diffYears > best.diffYears)) best = l;
        }
        if (best) {
          out.primary = best;
          break;
        }
      }
    }
    // Fallback lever: fewer work hours (re-match at lower hours).
    if (st.work >= 10) {
      const lower = Math.max(0, st.work - 10);
      const alt = findTwins(ds, { ...st, work: lower }).data;
      const oAlt = outcomesOf(alt.twins);
      const oNow = outcomesOf(tw.twins);
      // only offer it if it clearly helps
      if (!alt.refused && oAlt.risk <= oNow.risk - 0.1 && oNow.ttd[1] - oAlt.ttd[1] > 0.2) {
        out.fallback = {
          key: "work",
          title: `Cut work to ~${lower} h/week`,
          target: lower,
          unit: "h/week",
          diffYears: oNow.ttd[1] - oAlt.ttd[1],
          ci: bootDiff(tw.twins.map((a) => a.ttd), alt.twins.map((a) => a.ttd), lower),
          n: alt.n,
          riskAt: oAlt.risk,
          supported: true,
          pool: "matched students at fewer hours",
        };
      }
    }
    if (out.primary) out.feasibility = catalogFeasibility(ds, st, out.primary.target);
    if (!out.primary && !out.fallback) out.refusal = "No lever has enough matched students behind it.";
    return out;
  });
}

// ---------- alarm ----------
export interface Alarm {
  fires: boolean;
  status: Status;
  risk: number;
  pattern: PatternName | null;
  leadTimeTerms: number;
  lever: string;
}

export function alarmCheck(st: State, o: Outcomes, tw: Twins): ToolResult<Alarm> {
  return run("alarm_check", { campus_id: st.id, risk: o.risk, k: tw.k }, () => ({
    fires: !tw.refused && o.risk >= 0.2,
    status: statusOf(o.risk, tw.refused),
    risk: o.risk,
    pattern: st.pattern,
    leadTimeTerms: Math.max(0, FOUR_YEAR_TERMS - st.terms.length),
    lever: "average credits per term",
  }));
}

// ---------- institution queue ----------
export interface QueueRow {
  student: Student;
  risk: number;
  n: number;
  status: Status;
  avgCredits: number;
  lead: number;
}

export function institutionQueue(ds: Dataset): QueueRow[] {
  const rows: QueueRow[] = [];
  for (const s of ds.current) {
    if (s.terms.length < 2) continue;
    const st = stateFrom(s);
    const tw = findTwins(ds, st).data;
    if (tw.refused) continue;
    const o = outcomesOf(tw.twins);
    rows.push({
      student: s,
      risk: o.risk,
      n: tw.n,
      status: statusOf(o.risk),
      avgCredits: avgLoad(s.terms),
      lead: Math.max(0, FOUR_YEAR_TERMS - s.terms.length),
    });
  }
  return rows.sort((a, b) => b.risk - a.risk);
}

// ---------- narration scripts (numbers are tokens, never free text) ----------
export type Seg = string | { v: string; tr: string };

export function alarmScript(st: State, o: Outcomes, tw: ToolResult<Twins>, gs: ToolResult<ReturnType<typeof getState>["data"]>): Seg[] {
  if (tw.data.refused) return ["Not enough matched students to say anything yet. ", { v: String(tw.data.n), tr: tw.id }, " found; COOKED needs thirty."];
  const pct = Math.round(o.risk * 100);
  const lead: Seg[] = [
    "Heads up. After ",
    { v: String(gs.data.termsDone), tr: gs.id },
    " terms, your load is averaging ",
    { v: gs.data.avgCredits.toFixed(1), tr: gs.id },
    " credits. Among ",
    { v: String(o.n), tr: tw.id },
    " matched students at your work hours, ",
    { v: String(pct), tr: tw.id },
    " percent ended up cooked: past five years, or five withdrawals.",
  ];
  if (o.risk < 0.2) return ["You look fine. ", ...lead.slice(1), " Keep this pace."];
  return [...lead, " This is the point where it usually becomes visible."];
}

export function drillScript(d: ToolResult<Drill>): Seg[] {
  const x = d.data;
  if (x.alreadyCooked)
    return [
      "Stress test complete. At this pace the plan is already past five years: ",
      { v: x.baseline.years.toFixed(1), tr: d.id },
      " years projected, before any shock.",
    ];
  if (x.shocksToCooked === null)
    return ["Stress test complete. Your plan survives ", { v: String(x.path.length), tr: d.id }, " plausible shocks in a row. It's resilient."];
  return [
    "Stress test complete. ",
    { v: String(x.shocksToCooked), tr: d.id },
    x.shocksToCooked === 1 ? " shock breaks your plan. " : " shocks break your plan. ",
    "The weakest point is ",
    { v: (x.spof?.label ?? "").toLowerCase(), tr: x.spof?.tr ?? d.id },
    ".",
  ];
}

export function repairScript(r: ToolResult<Repair>): Seg[] {
  const p = r.data.primary;
  if (!p) return [r.data.refusal ?? "No supported change found."];
  const yrs = Math.max(0, p.diffYears);
  return [
    p.pool === "matched students" ? "Matched students who held " : "Students at your work hours who held ",
    { v: String(p.target), tr: r.id },
    " or more credits a term finished a median ",
    { v: yrs.toFixed(1), tr: r.id },
    " years sooner. ",
    { v: String(p.n), tr: r.id },
    " students support this. That's what happened to them, not a promise.",
  ];
}

// Provenance rule (§8.4): every digit must sit inside a token that came from a tool result.
export function checkProvenance(segs: Seg[]) {
  const tokens = segs.filter((s) => typeof s !== "string").length;
  const stray = segs.filter((s): s is string => typeof s === "string").join("").match(/\d+(\.\d+)?/g) ?? [];
  return { tokens, stray, ok: stray.length === 0 };
}

export const segText = (segs: Seg[]) => segs.map((s) => (typeof s === "string" ? s : s.v)).join("");
