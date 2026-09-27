"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { FromStudentResponse, ModelLabScenario, SimulateResponse } from "@/lib/arena-types";
import { DEFAULT_SCENARIO, LabApiError, fromStudent, isAbort, scenarioKey, simulate, withField, type LabField, type NumericField } from "@/lib/labModel";

// Fast enough to feel live while dragging, slow enough to stay polite: a change waits DEBOUNCE ms for
// company, but never longer than MAX_WAIT ms in total, so a long drag still updates about four times a second.
const DEBOUNCE = 110;
const MAX_WAIT = 240;
const CACHE = 96;

/** The student's own unmodified prediction ("you today"), for the what-if comparison. */
export interface Baseline {
  risk: number;
  time_to_degree: { low: number; mid: number; high: number };
  salary: { low: number; mid: number; high: number };
}
/** Where the sliders started: the audit ("audit"), the default scenario because the audit could not seed it ("fallback"), or nobody loaded ("default"). */
export interface Seed {
  kind: "audit" | "fallback" | "default";
  terms: number | null;
  note?: string;
}

export interface LabSim {
  seed: Seed;
  /** null until the starting point is known. */
  baseline: Baseline | null;
  /** True when the scenario differs from where it started. */
  changed: boolean;
  /** Back to the starting scenario (the audit's own values when seeded). */
  reset: () => void;
  scenario: ModelLabScenario;
  /** The newest answer we have; stays on screen (dimmed by `pending`) while the next one is fetched. */
  result: SimulateResponse | null;
  /** True when `result` is the answer to `scenario` as it stands now. */
  fresh: boolean;
  pending: boolean;
  error: string | null;
  /** Round trip of the last network call, milliseconds. */
  ms: number | null;
  /** The sampled alumni constellation, identical in every response, kept from the first so charts get a stable array. */
  cloud: SimulateResponse["constellation"]["points"] | null;
  /** Where the training data ends for inputs the API has clamped so far: the value the models actually saw. */
  edges: Partial<Record<NumericField, number>>;
  /** Network calls made so far (cache hits are free). */
  calls: number;
  set: (field: LabField, value: number | string) => void;
  /** Voice path: apply now, no debounce, and resolve with the answer to the newest scenario. */
  apply: (field: LabField, value: number | string) => Promise<SimulateResponse>;
  retry: () => void;
}

/**
 * Owns the scenario and keeps the four models in step with it.
 * Stale answers never overwrite newer ones: every request carries a sequence number, a superseded
 * request is aborted at the network (AbortController wired into fetch), and repeats are served from a small cache.
 */
export function useLabSim(studentId: string | null = null): LabSim {
  const [scenario, setScenario] = useState<ModelLabScenario>(DEFAULT_SCENARIO);
  const [shown, setShown] = useState<{ key: string; result: SimulateResponse } | null>(null);
  const [pending, setPending] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ms, setMs] = useState<number | null>(null);
  const [calls, setCalls] = useState(0);
  const [edges, setEdges] = useState<Partial<Record<NumericField, number>>>({});
  const [seed, setSeed] = useState<Seed>({ kind: studentId ? "audit" : "default", terms: null });
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [start, setStart] = useState<ModelLabScenario>(DEFAULT_SCENARIO);
  const [cloud, setCloud] = useState<SimulateResponse["constellation"]["points"] | null>(null);

  const live = useRef({
    scenario: DEFAULT_SCENARIO,
    seq: 0,
    ctrl: null as AbortController | null,
    newest: null as Promise<SimulateResponse> | null,
    timer: 0,
    firstAt: 0,
    cache: new Map<string, SimulateResponse>(),
    gone: false,
    /** Set once the audit seeded the scenario; edits then send only their difference from it. */
    base: null as ModelLabScenario | null,
    mode: studentId ? ("seeding" as "seeding" | "student" | "default") : ("default" as "seeding" | "student" | "default"),
  });

  const show = useCallback((key: string, result: SimulateResponse) => {
    setShown({ key, result });
    setCloud((c) => c ?? result.constellation.points);
    setPending(false);
    setError(null);
    // a clamped input reveals the edge of the training range: the value the models used instead
    const held = result.out_of_range.flatMap((f) => (f === "work_hours" || f === "credential_count" || f === "engagement_count" ? [[f, result.effective[f]] as const] : []));
    if (held.length) setEdges((e) => (held.every(([f, v]) => e[f] === v) ? e : { ...e, ...Object.fromEntries(held) }));
  }, []);

  const run = useCallback(
    (scn: ModelLabScenario): Promise<SimulateResponse> => {
      const L = live.current;
      const key = scenarioKey(scn);
      const hit = L.cache.get(key);
      if (hit) {
        L.ctrl?.abort();
        L.seq++;
        L.newest = Promise.resolve(hit);
        show(key, hit);
        return L.newest;
      }
      L.ctrl?.abort();
      const mine = ++L.seq;
      const ctrl = new AbortController();
      L.ctrl = ctrl;
      setPending(true);
      const overrides = () => {
        const base = L.base as ModelLabScenario;
        return Object.fromEntries((Object.keys(scn) as LabField[]).filter((k) => scn[k] !== base[k]).map((k) => [k, scn[k]])) as Partial<ModelLabScenario>;
      };
      const req = L.mode === "student" && studentId && L.base ? fromStudent(studentId, overrides(), ctrl.signal) : simulate(scn, ctrl.signal);
      const p: Promise<SimulateResponse> = req.then(
        ({ data, ms: took }) => {
          L.cache.set(key, data);
          if (L.cache.size > CACHE) L.cache.delete(L.cache.keys().next().value as string);
          if (mine === L.seq && !L.gone) {
            show(key, data);
            setMs(took);
            setCalls((c) => c + 1);
          }
          return data;
        },
        (e: unknown) => {
          // superseded: whoever awaited this request gets the newest answer instead
          if (isAbort(e) && L.newest && L.newest !== p) return L.newest;
          if (mine === L.seq && !L.gone && !isAbort(e)) {
            setError(e instanceof Error ? e.message : "The models did not answer.");
            setPending(false);
          }
          throw e;
        },
      );
      L.newest = p;
      return p;
    },
    [show, studentId],
  );

  const schedule = useCallback(
    (scn: ModelLabScenario) => {
      const L = live.current;
      window.clearTimeout(L.timer);
      const hit = L.cache.get(scenarioKey(scn));
      if (hit) {
        void run(scn);
        return;
      }
      const now = performance.now();
      if (!L.firstAt) L.firstAt = now;
      const wait = Math.max(0, Math.min(DEBOUNCE, L.firstAt + MAX_WAIT - now));
      setPending(true);
      L.timer = window.setTimeout(() => {
        L.firstAt = 0;
        run(scn).catch(() => undefined);
      }, wait);
    },
    [run],
  );

  const commit = useCallback((next: ModelLabScenario) => {
    live.current.scenario = next;
    setScenario(next);
  }, []);

  const set = useCallback(
    (field: LabField, value: number | string) => {
      const next = withField(live.current.scenario, field, value);
      if (scenarioKey(next) === scenarioKey(live.current.scenario)) return;
      commit(next);
      schedule(next);
    },
    [commit, schedule],
  );

  const apply = useCallback(
    (field: LabField, value: number | string) => {
      const L = live.current;
      const next = withField(L.scenario, field, value);
      commit(next);
      window.clearTimeout(L.timer);
      L.firstAt = 0;
      return run(next);
    },
    [commit, run],
  );

  const retry = useCallback(() => {
    run(live.current.scenario).catch(() => undefined);
  }, [run]);

  useEffect(() => {
    const L = live.current;
    L.gone = false;
    const ctrl = new AbortController();
    if (!studentId) {
      run(L.scenario).catch(() => undefined);
    } else {
      // Seed from the audit: the API derives the whole scenario from the student's terms, so the sliders start at real values.
      fromStudent(studentId, {}, ctrl.signal).then(
        ({ data, ms: took }) => {
          if (L.gone) return;
          const start = data.scenario;
          L.base = start;
          L.mode = "student";
          const key = scenarioKey(start);
          L.cache.set(key, data);
          commit(start);
          setStart(start);
          show(key, data);
          setMs(took);
          setCalls((c) => c + 1);
          setSeed({ kind: "audit", terms: data.derived_from?.terms_used ?? null });
          setBaseline(baselineOf(data));
        },
        (e: unknown) => {
          if (L.gone || isAbort(e)) return;
          // The audit could not seed the models (older API, or the profile is unknown): say so and use the default scenario.
          L.mode = "default";
          const why = e instanceof LabApiError && e.status === 404 ? "this API has no audit seeding yet" : e instanceof Error ? e.message : "the audit could not be read";
          setSeed({ kind: "fallback", terms: null, note: why });
          run(L.scenario).then((d) => !L.gone && setBaseline(baselineOf(d)), () => undefined);
        },
      );
    }
    return () => {
      L.gone = true;
      ctrl.abort();
      window.clearTimeout(L.timer);
      L.ctrl?.abort();
    };
  }, [run, commit, show, studentId]);

  const reset = useCallback(() => {
    const L = live.current;
    commit(start);
    window.clearTimeout(L.timer);
    L.firstAt = 0;
    run(start).catch(() => undefined);
  }, [commit, run, start]);

  return {
    seed,
    baseline,
    changed: scenarioKey(scenario) !== scenarioKey(start),
    reset,
    scenario,
    result: shown?.result ?? null,
    fresh: shown?.key === scenarioKey(scenario),
    pending,
    error,
    ms,
    cloud,
    edges,
    calls,
    set,
    apply,
    retry,
  };
}

function baselineOf(d: FromStudentResponse | SimulateResponse): Baseline {
  const b = (d as FromStudentResponse).baseline;
  return b && typeof b.risk === "number" ? b : { risk: d.risk, time_to_degree: d.time_to_degree, salary: { low: d.salary.low, mid: d.salary.mid, high: d.salary.high } };
}
