"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  alarmCheck,
  alarmScript,
  checkProvenance,
  repairScript,
  avgLoad,
  fireDrill,
  findTwins,
  getState,
  outcomesOf,
  planOutcome,
  project,
  repair,
  stateFrom,
  statusOf,
  survival,
  type Seg,
} from "@/lib/engine";
import { useDataset } from "@/lib/data";
import { api, toDrill, toOutcomes, toRepair, toSegs, toSurvival, useApiHealth, type ServerDrill, type ServerNarration, type ServerRepair, type ServerState } from "@/lib/live";
import type { Dataset, Student } from "@/lib/types";
import { AgentConsole, parseIntent, type LogEntry } from "./AgentConsole";
import { CliffChart } from "./Charts";
import { HeatGauge, RangeTile } from "./Gauges";
import { PrereqMap } from "./PrereqMap";
import { AlarmStage, DrillStage, RepairStage } from "./Stages";
import { TrajectoryField } from "./TrajectoryField";
import { Loading, Nav, Panel, PatternChip, StatusBadge, pct, riskColor } from "./ui";

type Phase = "alarm" | "drill" | "repair";

export function Cockpit({ id }: { id: string }) {
  const ds = useDataset();
  if (!ds) return <Shell><Loading /></Shell>;
  const s = ds.current.find((x) => x.id === id);
  if (!s)
    return (
      <Shell>
        <div className="py-32 text-center">
          <p className="num text-muted">{id}</p>
          <h1 className="display mt-2 text-3xl">No current student with that ID</h1>
          <Link href="/" className="mt-6 inline-block text-heat">
            ← Pick a student
          </Link>
        </div>
      </Shell>
    );
  return <CockpitInner key={s.id} ds={ds} student={s} />;
}

function Shell({ children, heat = 0 }: { children: React.ReactNode; heat?: number }) {
  return (
    <div className="relative min-h-screen" style={{ "--heat-level": heat } as CSSProperties}>
      <div className="haze" />
      <Nav />
      <div className="relative z-10">{children}</div>
    </div>
  );
}

// unique across hot reloads and remounts
const logKey = () => `l${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function CockpitInner({ ds, student }: { ds: Dataset; student: Student }) {
  const currentLoad = student.terms.length ? Math.round(avgLoad(student.terms)) : 15;
  const [work, setWork] = useState(student.work);
  const [plan, setPlan] = useState(currentLoad);
  const [phase, setPhase] = useState<Phase>("alarm");
  const [muted, setMuted] = useState(false);
  const [drillPlan, setDrillPlan] = useState<"current" | "repair">("current");
  const [drillRun, setDrillRun] = useState(0);
  const [applied, setApplied] = useState(false);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState(false);
  const timers = useRef<number[]>([]);

  const st = useMemo(() => stateFrom(student, { work, planLoad: plan }), [student, work, plan]);
  const gs = useMemo(() => getState(st), [st]);
  // twins depend on history + work hours only
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tw = useMemo(() => findTwins(ds, st), [ds, student, work]);
  const base = useMemo(() => outcomesOf(tw.data.twins), [tw]);
  const po = useMemo(() => planOutcome(ds, st, tw.data), [ds, st, tw]);
  const alarm = useMemo(() => alarmCheck(st, base, tw.data), [st, base, tw]);
  const rep = useMemo(() => repair(ds, stateFrom(student, { work }), tw.data), [ds, student, work, tw]);
  const localRepairLoad = rep.data.primary?.target ?? null;
  const localDrillLoad = drillPlan === "repair" && localRepairLoad ? localRepairLoad : currentLoad;
  const drillLocal = useMemo(() => fireDrill(ds.meta, { ...st, planLoad: localDrillLoad }), [ds, st, localDrillLoad]);
  const survNowLocal = useMemo(() => survival(ds.meta, st, currentLoad), [ds, st, currentLoad]);
  const survRepLocal = useMemo(() => (localRepairLoad ? survival(ds.meta, st, localRepairLoad) : null), [ds, st, localRepairLoad]);
  const proj = useMemo(() => project(st, []), [st]);
  const localTwinIds = useMemo(() => new Set(tw.data.twins.map((a) => a.id)), [tw]);
  const onGood = useMemo(() => ds.alumni.filter((a) => !a.cooked && a.entry === student.entry), [ds, student.entry]);

  const localRisk = po.data.outcomes.risk;
  const localO = po.data.outcomes;

  // ---------- live mode: trained, checksummed models behind the FastAPI backend ----------
  const health = useApiHealth();
  const live = !!health?.live;
  const [srv, setSrv] = useState<ServerState | null>(null);
  const [srvAlarm, setSrvAlarm] = useState<{ id: number | null; fires: boolean } | null>(null);
  const [srvRepair, setSrvRepair] = useState<ServerRepair | null>(null);
  const [srvDrills, setSrvDrills] = useState<Record<string, ServerDrill>>({});
  const [narr, setNarr] = useState<Record<string, Seg[]>>({});

  const liveO = live && srv ? toOutcomes(srv) : null;
  const o = liveO ?? localO;
  const risk = liveO ? liveO.risk : localRisk;
  const nowRisk = live && srv ? srv.risk.value : base.risk;
  const refused = live && srv ? srv.twins.refused : tw.data.refused;
  const status = statusOf(nowRisk, refused);
  const repV = live && srvRepair ? toRepair(srvRepair, ds.catalog) : rep;
  const repairLoad = repV.data.primary?.target ?? null;
  const drillLoad = drillPlan === "repair" && repairLoad ? repairLoad : currentLoad;
  const dkey = (load: number) => `${load}|${work}`;
  const drill = live && srvDrills[dkey(drillLoad)] ? toDrill(srvDrills[dkey(drillLoad)], { ...st, planLoad: drillLoad }) : drillLocal;
  const survNow = live && srvDrills[dkey(currentLoad)] ? toSurvival(srvDrills[dkey(currentLoad)]) : survNowLocal;
  const survRep = live && repairLoad && srvDrills[dkey(repairLoad)] ? toSurvival(srvDrills[dkey(repairLoad)]) : survRepLocal;
  const projYears = live && srv?.plan ? srv.plan.projected_years.value : null;
  const twV = live && srv ? { ...tw, id: srv.twins.tool_result_id, data: { ...tw.data, n: srv.twins.n, refused: srv.twins.refused } } : tw;
  const alarmV = live && srv ? { ...alarm, data: { ...alarm.data, fires: srvAlarm ? srvAlarm.fires : nowRisk >= 0.35, status, risk: nowRisk } } : alarm;

  const srvTwinIds = srv?.twins.ids;
  const twinIds = useMemo(() => (live && srvTwinIds ? new Set(srvTwinIds) : localTwinIds), [live, srvTwinIds, localTwinIds]);

  const push = useCallback((entries: Omit<LogEntry, "key">[], gap = 420) => {
    timers.current.push(window.setTimeout(() => setBusy(true), 0));
    entries.forEach((e, i) => {
      timers.current.push(
        window.setTimeout(() => {
          setLog((l) => [...l.slice(-60), { ...e, key: logKey() }]);
          if (i === entries.length - 1) setBusy(false);
        }, i * gap + 1),
      );
    });
  }, []);

  // boot sequence: the Watchtower checks this student (local engine only when the API is offline)
  const booted = useRef(false);
  useEffect(() => {
    if (health === null || booted.current) return;
    booted.current = true;
    if (health.live) {
      push([{ agent: "watchtower", call: "GET /healthz", result: `trained model ${health.version} · all §7.5 gates passed`, ok: true }]);
      return;
    }
    push([
      { agent: "watchtower", call: `get_state("${student.id}")`, result: `${gs.data.termsDone} terms · ${gs.data.avgCredits.toFixed(1)} cr/term · ${gs.data.wTotal} W · ${student.work} h/wk`, tr: gs.id, ms: gs.ms },
      { agent: "watchtower", call: `find_twins(${tw.args})`, result: tw.data.refused ? `only ${tw.data.n} matches → refuse` : `${tw.data.n} matched alumni (tier ${tw.data.tier})`, tr: tw.id, ms: tw.ms, ok: !tw.data.refused },
      { agent: "watchtower", call: `alarm_check(risk=${base.risk.toFixed(2)})`, result: alarm.data.fires ? `ALARM · ${alarm.data.pattern ?? "pattern"} · lead ${alarm.data.leadTimeTerms} terms` : "no alarm", tr: alarm.id, ms: alarm.ms },
      (() => {
        const pv = checkProvenance(alarmScript(st, base, tw, gs));
        return { agent: "narrator" as const, call: "fill_template(ALARM)", result: `${pv.tokens} number tokens from tool results · template, no LLM (offline)` };
      })(),
      (() => {
        const pv = checkProvenance(alarmScript(st, base, tw, gs));
        return { agent: "claim-check" as const, call: "verify_numbers(alarm_script)", result: pv.ok ? `no stray digits · ${pv.tokens} tokens traced` : `stray digits: ${pv.stray.join(", ")}`, ok: pv.ok };
      })(),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [health]);
  useEffect(() => {
    const t = timers.current;
    return () => t.forEach(clearTimeout);
  }, []);

  // live: state + tiles (debounced on the what-if sliders), narration and repair follow work hours
  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(async () => {
      try {
        const c = await api<ServerState>(`/students/${student.id}/state?work_hours=${work}&plan_load=${plan}`);
        setSrv(c.data);
        push([{ agent: "watchtower", call: `GET /students/${student.id}/state?work=${work}&plan=${plan}`, result: `model risk ${pct(c.data.risk.value)} now · ${c.data.plan ? pct(c.data.plan.risk.value) : "–"} on plan · ${c.data.twins.refused ? `twins refused (${c.data.twins.reason})` : `${c.data.twins.n} balanced twins`}`, tr: c.data.risk.tool_result_id, ms: c.ms, ok: !c.data.twins.refused }], 0);
      } catch {
        push([{ agent: "watchtower", call: "GET /state", result: "API error · showing local engine", ok: false }], 0);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [live, work, plan, student.id, push]);

  useEffect(() => {
    if (!live) return;
    const t = window.setTimeout(async () => {
      try {
        const [n, r] = await Promise.all([
          api<ServerNarration>("/narrate", { kind: "alarm", campus_id: student.id, work_hours: work }),
          api<ServerRepair>("/repair", { campus_id: student.id, work_hours: work }),
        ]);
        setNarr((m) => ({ ...m, [`alarm|${work}`]: toSegs(n.data) }));
        setSrvRepair(r.data);
        push([
          { agent: "narrator", call: "POST /narrate kind=alarm", result: `${n.data.source === "gemini" ? "Gemini" : n.data.source === "cache" ? "cached Gemini" : "template (no LLM)"} · ${n.data.provenance.tokens} tokens`, ms: n.ms },
          { agent: "claim-check", call: "provenance(alarm)", result: n.data.provenance.ok ? `every number traced · ${n.data.provenance.tokens} tokens` : "blocked: untraced number", ok: n.data.provenance.ok },
        ], 200);
      } catch {
        /* the local engine keeps serving */
      }
    }, 300);
    return () => clearTimeout(t);
  }, [live, work, student.id, push]);

  // live: one Watchtower check on open (hysteresis decides whether an alarm opens)
  useEffect(() => {
    if (!live) return;
    api<{ id: number | null; fires: boolean; decision: string; tool_result_id: string }>(`/students/${student.id}/alarm/check`, {})
      .then((c) => {
        setSrvAlarm({ id: c.data.id, fires: c.data.fires });
        push([{ agent: "watchtower", call: "POST /alarm/check", result: `${c.data.decision} · ${c.data.fires ? `alarm #${c.data.id} open` : "no alarm"} (hysteresis 0.35/0.25)`, tr: c.data.tool_result_id, ms: c.ms, ok: true }], 0);
      })
      .catch(() => undefined);
  }, [live, student.id, push]);

  // live: drills for the current pace and the repair plan (stored in Timescale)
  useEffect(() => {
    if (!live || phase !== "drill") return;
    const loads = [currentLoad, ...(repairLoad ? [repairLoad] : [])];
    loads.forEach(async (load) => {
      const key = `${load}|${work}`;
      if (srvDrills[key]) return;
      try {
        const [d, n] = await Promise.all([
          api<ServerDrill>("/drill", { campus_id: student.id, plan_load: load, work_hours: work }),
          api<ServerNarration>("/narrate", { kind: "drill", campus_id: student.id, plan_load: load, work_hours: work }),
        ]);
        setSrvDrills((m) => ({ ...m, [key]: d.data }));
        setNarr((m) => ({ ...m, [`drill|${key}`]: toSegs(n.data) }));
        push([
          { agent: "fire-drill", call: `POST /drill plan=${load} cr`, result: d.data.shocks_to_cooked === null ? `resilient · survived ${d.data.path.length} shocks` : `shocks_to_cooked=${d.data.shocks_to_cooked.value}`, tr: d.data.tool_result_id, ms: d.ms },
          { agent: "fire-drill", call: `COPY ${d.data.rows_stored} rows → app.drill_trajectory`, result: `survival after ${d.data.survival.length - 1} terms: ${pct(d.data.survival[d.data.survival.length - 1]?.survival ?? 1)}` },
        ], 250);
      } catch {
        /* local drill stays on screen */
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, phase, currentLoad, repairLoad, work, student.id]);

  // log what-if changes (debounced)
  const first = useRef(true);
  useEffect(() => {
    if (first.current || live || health === null) {
      first.current = false;
      return;
    }
    const id = window.setTimeout(() => {
      push(
        [
          { agent: "watchtower", call: `find_twins(${tw.args})`, result: tw.data.refused ? `only ${tw.data.n} → refuse` : `${tw.data.n} matched alumni`, tr: tw.id, ms: tw.ms },
          { agent: "watchtower", call: `plan_outcome(plan_load=${plan}, work=${work})`, result: `risk ${pct(risk)} · n=${o.n} (${po.data.pool})`, tr: po.id, ms: po.ms },
        ],
        250,
      );
    }, 450);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [work, plan]);

  const goDrill = useCallback(() => {
    setPhase("drill");
    setDrillRun((r) => r + 1);
    if (live) return; // the live drill effect logs the server's results
    push([
      { agent: "fire-drill", call: `run_shock(withdraw, lighter_load) × ≤4 · plan=${drillLoad} cr`, result: drill.data.alreadyCooked ? "already past 5y before any shock" : `shocks_to_cooked=${drill.data.shocksToCooked ?? "none (resilient)"}`, tr: drill.id, ms: drill.ms },
      { agent: "fire-drill", call: "survival(sims=500)", result: `alive after 10 terms: ${pct(survNow.data[survNow.data.length - 1].alive)}`, tr: survNow.id, ms: survNow.ms },
    ]);
  }, [push, drill, drillLoad, survNow, live]);

  const goRepair = useCallback(() => {
    setPhase("repair");
    if (live) {
      api<ServerNarration>("/narrate", { kind: "repair", campus_id: student.id, work_hours: work })
        .then((n) => setNarr((m) => ({ ...m, [`repair|${work}`]: toSegs(n.data) })))
        .catch(() => undefined);
      const p = srvRepair?.primary;
      push([
        { agent: "repair", call: "POST /repair (escapee_stats)", result: p ? `${p.title} → ${p.diff_years.toFixed(1)}y sooner · n=${p.support} · CI ${p.ci90?.map((x) => x.toFixed(1)).join("–")}` : srvRepair?.refusal ?? "no supported change", tr: srvRepair?.tool_result_id ?? undefined, ok: !!p },
        ...(p?.feasibility ? [{ agent: "repair" as const, call: "catalog_feasibility (Spring 2027)", result: p.feasibility.feasible ? `feasible · ${p.feasibility.picks.length} courses open` : "not feasible", tr: p.feasibility.tool_result_id, ok: p.feasibility.feasible }] : []),
      ]);
      return;
    }
    const p = rep.data.primary;
    push([
      { agent: "repair", call: `escapee_stats(twins=${tw.data.n}, lever=load)`, result: p ? `${p.title} → ${p.diffYears.toFixed(1)}y sooner · n=${p.n}` : rep.data.refusal ?? "no lever", tr: rep.id, ms: rep.ms, ok: !!p },
      ...(rep.data.feasibility
        ? [{ agent: "repair" as const, call: `catalog_feasibility(target=${p!.target})`, result: rep.data.feasibility.data.feasible ? `feasible · ${rep.data.feasibility.data.picks.length} courses open` : "not feasible", tr: rep.data.feasibility.id, ms: rep.data.feasibility.ms, ok: rep.data.feasibility.data.feasible }]
        : []),
      (() => {
        const pv = checkProvenance(repairScript(rep));
        return { agent: "claim-check" as const, call: "verify_numbers(repair_script)", result: pv.ok ? `no stray digits · ${pv.tokens} tokens traced` : `stray digits: ${pv.stray.join(", ")}`, ok: pv.ok };
      })(),
    ]);
  }, [push, rep, tw, live, student.id, work, srvRepair]);

  const apply = (load: number) => {
    setPlan(load);
    setApplied(true);
    setDrillPlan("repair");
    if (live) {
      push([{ agent: "you", call: `apply_plan(load=${load})` }], 0);
      api<{ stored: string }>(`/students/${student.id}/memory`, { kind: "decision", note: `Chose ${load} credits per term after the repair check.` })
        .then((c) => push([{ agent: "memory", call: "POST /students/…/memory", result: c.data.stored === "backboard" ? "stored in Backboard" : "stored in app.memory_note (Backboard not configured)", ms: c.ms, ok: true }], 0))
        .catch(() => undefined);
      return;
    }
    push([
      { agent: "you", call: `apply_plan(load=${load})` },
      { agent: "memory", call: `remember("chose ${load} credits/term")`, result: "noted in this demo session · Backboard pending" },
    ]);
  };

  const onAsk = (q: string) => {
    const it = parseIntent(q);
    push([{ agent: "you", call: `"${q}"` }], 0);
    if (it.kind === "work") setWork(Math.max(0, Math.min(40, Math.round(it.value))));
    else if (it.kind === "load") setPlan(Math.max(6, Math.min(18, Math.round(it.value))));
    else if (it.kind === "drill") goDrill();
    else if (it.kind === "repair") goRepair();
    else if (it.kind === "alarm") setPhase("alarm");
    else push([{ agent: "narrator", call: "route(question)", result: "I answer with tools only: try work hours, credits, the drill, or a fix." }], 300);
  };

  const heat = Math.min(1, risk * 1.1);
  const fillPct = (v: number, lo: number, hi: number) => `${((v - lo) / (hi - lo)) * 100}%`;
  const cliffBins = work >= 20 ? ds.meta.cliff.heavy : ds.meta.cliff.light;

  return (
    <Shell heat={heat}>
      <main className="mx-auto max-w-[1400px] space-y-5 px-4 pb-24 pt-6 sm:px-6">
        {/* header */}
        <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="panel grid items-center gap-6 p-6 lg:grid-cols-[1fr_auto_auto]">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="num text-xs text-muted">{student.id}</span>
              <PatternChip pattern={(live && srv?.pattern ? srv.pattern : student.pattern) as Student["pattern"]} />
              <StatusBadge status={status} />
              <span className={`rounded-full border px-2 py-0.5 text-[10px] ${live ? "border-cool/40 text-cool" : "border-line text-dim"}`} title={live ? "Scored by the trained, checksummed model behind the API" : "API offline: browser-side engine on the same dataset"}>
                {live ? `live model · ${health?.version}` : "local engine"}
              </span>
            </div>
            <h1 className="display mt-2 text-3xl font-semibold sm:text-4xl">
              {student.major}
              <span className="text-muted"> · {student.track}</span>
            </h1>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
              <span>{student.entry === "T" ? "Transfer" : "First-time freshman"}</span>
              <span>{student.res === "O" ? "Out-of-state" : "In-state"}</span>
              <span>
                <span className="num text-text">{student.terms.length}</span> terms done
              </span>
              <span>
                <span className="num text-text">{student.credEarned}</span>/{student.credReq} credits
              </span>
              <span>
                <span className="num text-text">{work}</span> h/week work
              </span>
            </div>
            <TermStrip student={student} ipCredits={student.ip.reduce((s, id) => s + (ds.catalog.find((c) => c.id === id)?.credits ?? 3), 0)} />
          </div>
          <HeatGauge
            risk={risk}
            n={o.n}
            tr={live && srv?.plan ? srv.plan.risk.tool_result_id : po.id}
            label={live ? (plan === currentLoad ? "model risk if this pace holds" : `model risk at ${plan} cr/term`) : plan === currentLoad ? "observed plan cohort share" : `observed share at ${plan} cr/term`}
          />
          <div className="flex flex-col items-start gap-3 lg:items-end">
            <div className="text-right">
              <div className="label">projected finish</div>
              <div className="num mt-1 text-3xl font-semibold" style={{ color: (projYears ?? proj.years) > 5 ? "#ff2e4d" : (projYears ?? proj.years) > 4 ? "#ffb020" : "#2dd4bf" }}>
                {(projYears ?? proj.years).toFixed(1)}
                <span className="text-base text-muted"> yrs</span>
              </div>
              <div className="num text-[11px] text-dim">
                {proj.remaining} cr left ÷ {plan}/term
              </div>
            </div>
            <button onClick={() => setMuted((m) => !m)} className="rounded-full border border-line px-3 py-1.5 text-xs text-muted transition hover:text-text">
              <span className={`mr-1.5 inline-block h-1.5 w-1.5 rounded-full ${muted ? "bg-dim" : "bg-cool"}`} />
              {muted ? "Voice off · captions" : "Voice on"}
            </button>
          </div>
        </motion.section>

        {/* tiles */}
        <div className="grid gap-4 md:grid-cols-3">
          <RangeTile
            label={live ? "Expected delay" : "Matched delay"}
            lo={o.delay[0]}
            mid={o.delay[1]}
            hi={o.delay[2]}
            max={5}
            fmt={(x) => `+${x.toFixed(1)}y`}
            hint={live ? "beyond 4 years · model p25–p75" : "beyond 4 years · p25–p75"}
            tr={live && srv ? srv.delay.tool_result_id : po.id}
            n={live && srv ? srv.delay.support : o.n}
            color={riskColor(risk)}
          />
          {live && srv?.twins.refused ? (
            <div className="panel col-span-2 flex items-center gap-3 p-4 text-sm text-muted md:col-span-2">
              <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px]">refused</span>
              Not enough balanced twins for outcome tiles ({srv.twins.reason}). COOKED doesn&apos;t guess below 30.
            </div>
          ) : (
          <>
          <RangeTile label="Still-seeking share" lo={o.seeking.ci95[0]} mid={o.seeking.rate} hi={o.seeking.ci95[1]} max={0.4} fmt={(x) => `${Math.round(x * 100)}%`} hint={live ? "matched twins · 90% interval" : "reported destinations · 95% interval"} tr={live && srv?.still_seeking_risk ? srv.still_seeking_risk.tool_result_id : po.id} n={o.seeking.n} color="#ffb020" />
          {o.burden ? (
            <RangeTile label="Degree burden" lo={o.burden[0]} mid={o.burden[1]} hi={o.burden[2]} max={1.2} fmt={(x) => x.toFixed(2)} hint="net cost ÷ first salary" tr={po.id} n={o.burdenN} color="#a78bfa" />
          ) : (
            <div className="panel flex items-center p-4 text-sm text-muted">Degree burden: not enough salaried twins</div>
          )}
          </>
          )}
        </div>

        {/* story + agents */}
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_400px]">
          <section className="panel overflow-hidden">
            <div className="flex items-center gap-1 border-b border-line px-3">
              {(
                [
                  ["alarm", "01", "Alarm"],
                  ["drill", "02", "Fire drill"],
                  ["repair", "03", "Repair"],
                ] as [Phase, string, string][]
              ).map(([k, n, l]) => (
                <button key={k} onClick={() => (k === "drill" ? goDrill() : k === "repair" ? goRepair() : setPhase(k))} className="relative px-4 py-3.5 text-sm">
                  <span className={`num mr-2 text-[11px] ${phase === k ? "text-heat" : "text-dim"}`}>{n}</span>
                  <span className={phase === k ? "text-text" : "text-muted"}>{l}</span>
                  {phase === k && <motion.span layoutId="phase-underline" className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-heat" />}
                </button>
              ))}
            </div>
            <AnimatePresence mode="wait">
              <motion.div key={phase} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
                {phase === "alarm" && (
                  <AlarmStage
                    st={st}
                    gs={gs}
                    tw={twV}
                    base={base}
                    alarm={alarmV}
                    liveSegs={live ? narr[`alarm|${work}`] ?? null : null}
                    onGood={onGood}
                    muted={muted}
                    onDrill={goDrill}
                    onFeedback={(u) => {
                      if (live && srvAlarm?.id) {
                        api<{ saved: boolean; memory: string }>(`/alarms/${srvAlarm.id}/feedback`, { useful: u, reason: u ? "useful" : "not useful" })
                          .then((c) => push([{ agent: "memory", call: `POST /alarms/${srvAlarm.id}/feedback`, result: `saved to app.feedback · memory: ${c.data.memory}`, ms: c.ms, ok: true }], 0))
                          .catch(() => undefined);
                      } else push([{ agent: "memory", call: `store_feedback(useful=${u})`, result: "noted in this demo session · persistence pending" }]);
                    }}
                  />
                )}
                {phase === "drill" && (
                  <DrillStage
                    drill={drill}
                    plan={drillPlan}
                    setPlan={(p) => {
                      setDrillPlan(p);
                      setDrillRun((r) => r + 1);
                    }}
                    currentLoad={currentLoad}
                    repairLoad={repairLoad}
                    survNow={survNow}
                    survRep={survRep}
                    muted={muted}
                    onRepair={goRepair}
                    runKey={drillRun}
                    liveSegs={live ? narr[`drill|${drillLoad}|${work}`] ?? null : null}
                  />
                )}
                {phase === "repair" && <RepairStage rep={repV} applied={applied} onApply={apply} muted={muted} status={status} liveSegs={live ? narr[`repair|${work}`] ?? null : null} />}
              </motion.div>
            </AnimatePresence>
          </section>

          <div className="flex flex-col gap-5">
            <Panel title="What if">
              <div className="space-y-5 p-5">
                <Slider label="Work hours / week" value={work} min={0} max={40} onChange={setWork} fill={fillPct(work, 0, 40)} fmt={(v) => `${v} h`} />
                <Slider label="Credits per term from now" value={plan} min={6} max={18} onChange={setPlan} fill={fillPct(plan, 6, 18)} fmt={(v) => `${v} cr`} />
                <div className="flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3">
                  <div>
                    <div className="text-[11px] text-muted">{live ? "Model risk on this plan" : "Observed share on this plan"}</div>
                    <div className="num text-[11px] text-dim">{live ? `after two terms at ${plan} cr · ${health?.version}` : `n=${o.n} · ${po.data.pool}`}</div>
                  </div>
                  <div className="num text-2xl font-semibold" style={{ color: riskColor(risk) }}>
                    {pct(risk)}
                  </div>
                </div>
                {(work !== student.work || plan !== currentLoad) && (
                  <button
                    onClick={() => {
                      setWork(student.work);
                      setPlan(currentLoad);
                      setApplied(false);
                    }}
                    className="text-xs text-muted underline-offset-4 hover:text-text hover:underline"
                  >
                    Reset to actual
                  </button>
                )}
              </div>
            </Panel>
            <Panel title="Agents" className="flex h-[440px] flex-col" right={<span className={`num text-[10px] ${live ? "text-cool" : "text-dim"}`}>{live ? `FastAPI · ${health?.demo ? "demo replay" : "live"}` : "local engine · offline-safe"}</span>}>
              <div className="min-h-0 flex-1">
                <AgentConsole log={log} onAsk={onAsk} busy={busy} />
              </div>
            </Panel>
          </div>
        </div>

        {/* where you sit + cliff */}
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <Panel title="Where you sit · 3,200 alumni, credits earned by term" right={<span className="num text-[10px] text-dim">bright = your {live && srv ? srv.twins.n : tw.data.n} matched twins</span>}>
            <div className="p-5">
              <TrajectoryField alumni={ds.alumni} height={340} highlight={twinIds} focus={{ terms: student.terms, planLoad: plan, color: riskColor(risk) }} intro={false} />
            </div>
          </Panel>
          <Panel title={work >= 20 ? "The load cliff · students working 20+ h/week" : "The load cliff · students working under 20 h/week"}>
            <div className="p-5">
              <CliffChart bins={cliffBins} current={avgLoad(student.terms)} plan={plan} />
              <p className="mt-2 text-[11px] leading-relaxed text-dim">
                Cooked rate by average credits per term, measured on alumni. Small n in the middle bins; it&apos;s an association, not a cause.
              </p>
            </div>
          </Panel>
        </div>

        <Panel title={`Prerequisite map · ${student.major}`} right={<span className="text-[10px] text-dim">hover a course to trace its chain</span>}>
          <div className="p-5">
            <PrereqMap catalog={ds.catalog} major={student.major} done={student.done} ip={student.ip} picks={phase === "repair" ? repV.data.feasibility?.data.picks.map((c) => c.id) : []} />
          </div>
        </Panel>

        <p className="text-center text-[11px] text-dim">
          Synthetic HackUMBC 2026 data. COOKED shows what happened to similar alumni — it doesn&apos;t predict what will happen to you. Browser voice is used when ElevenLabs is not connected.
        </p>
      </main>
    </Shell>
  );
}

function Slider({ label, value, min, max, onChange, fill, fmt }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; fill: string; fmt: (v: number) => string }) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs text-muted">{label}</span>
        <motion.span key={value} initial={{ y: -4, opacity: 0.4 }} animate={{ y: 0, opacity: 1 }} className="num text-sm">
          {fmt(value)}
        </motion.span>
      </div>
      <input type="range" className="slider" min={min} max={max} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} style={{ "--fill": fill } as CSSProperties} />
    </label>
  );
}

// Credits attempted per completed term, with withdrawals marked and the in-progress term hatched.
function TermStrip({ student, ipCredits }: { student: Student; ipCredits: number }) {
  const max = 18;
  const terms = [...student.terms.map((t) => ({ att: t[0], w: t[2], ip: false })), ...(student.ip.length ? [{ att: ipCredits, w: 0, ip: true }] : [])];
  return (
    <div className="mt-5 flex h-14 items-end gap-1.5">
      {terms.map((t, i) => (
        <div key={i} className="group relative flex w-7 flex-col items-center justify-end" style={{ height: "100%" }}>
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: `${(t.att / max) * 100}%` }}
            transition={{ delay: 0.2 + i * 0.07, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="w-full rounded-t-md"
            style={{
              background: t.ip ? "repeating-linear-gradient(45deg, rgba(255,176,32,0.35) 0 3px, transparent 3px 6px)" : t.att < 12 ? "var(--heat)" : "rgba(255,255,255,0.22)",
            }}
          />
          {t.w > 0 && (
            <span className="absolute -top-1 flex gap-0.5">
              {Array.from({ length: t.w }, (_, j) => (
                <span key={j} className="h-1.5 w-1.5 rounded-full bg-hot" />
              ))}
            </span>
          )}
          <span className="num pointer-events-none absolute -top-6 whitespace-nowrap rounded bg-panel-2 px-1.5 text-[10px] opacity-0 ring-1 ring-line-2 transition group-hover:opacity-100">
            {t.ip ? "in progress" : `${t.att} cr${t.w ? ` · ${t.w}W` : ""}`}
          </span>
        </div>
      ))}
      <div className="ml-2 self-center text-[10px] leading-tight text-dim">
        credits / term
        <br />
        <span className="text-heat">■</span> under 12 · <span className="text-hot">●</span> W
      </div>
    </div>
  );
}
