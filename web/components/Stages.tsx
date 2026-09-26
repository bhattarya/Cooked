"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import {
  alarmScript,
  drillScript,
  median,
  NEXT_TERM,
  repairScript,
  type Alarm,
  type Drill,
  type getState,
  type Outcomes,
  type Repair,
  type State,
  type SurvivalPoint,
  type ToolResult,
  type Twins,
} from "@/lib/engine";
import type { Alum } from "@/lib/types";
import { SurvivalChart } from "./Charts";
import { Narration } from "./Narration";
import { Evidence, PATTERN_COLOR } from "./ui";

type GS = ToolResult<ReturnType<typeof getState>["data"]>;

// ---------------- Alarm ----------------
export function AlarmStage({
  st,
  gs,
  tw,
  base,
  alarm,
  onGood,
  muted,
  onDrill,
  onFeedback,
}: {
  st: State;
  gs: GS;
  tw: ToolResult<Twins>;
  base: Outcomes;
  alarm: ToolResult<Alarm>;
  onGood: Alum[];
  muted: boolean;
  onDrill: () => void;
  onFeedback: (useful: boolean) => void;
}) {
  const segs = useMemo(() => alarmScript(st, base, tw, gs), [st, base, tw, gs]);
  const [fb, setFb] = useState<boolean | null>(null);
  const a = alarm.data;
  const fires = a.fires;
  const col = a.status === "cooked" ? "#ff2e4d" : a.status === "watch" ? "#ffb020" : "#2dd4bf";
  const k = tw.data.k;
  const drivers = useMemo(() => {
    const good = onGood.filter((x) => x.terms.length >= Math.max(k, 1));
    const avgK = (x: Alum) => x.terms.slice(0, Math.max(k, 1)).reduce((s, t) => s + t[0], 0) / Math.max(k, 1);
    const wK = (x: Alum) => x.terms.slice(0, Math.max(k, 1)).reduce((s, t) => s + t[2], 0);
    return [
      { label: "Credits per term", you: gs.data.avgCredits, ref: median(good.map(avgK)), max: 18, worse: gs.data.avgCredits < median(good.map(avgK)) - 1, fmt: (v: number) => v.toFixed(1) },
      { label: "Work hours / week", you: st.work, ref: median(good.map((x) => x.work)), max: 40, worse: st.work > median(good.map((x) => x.work)) + 5, fmt: (v: number) => v.toFixed(0) },
      { label: "Withdrawals so far", you: gs.data.wTotal, ref: median(good.map(wK)), max: 5, worse: gs.data.wTotal > median(good.map(wK)), fmt: (v: number) => v.toFixed(0) },
    ];
  }, [onGood, k, gs, st.work]);

  if (tw.data.refused) {
    return (
      <div className="p-6">
        <div className="label">Watchtower</div>
        <h3 className="display mt-2 text-2xl">Not enough evidence yet</h3>
        <p className="mt-2 max-w-xl text-muted">
          Only <span className="num text-text">{tw.data.n}</span> alumni match this profile. COOKED refuses to guess below 30.
        </p>
        <div className="mt-3">
          <Evidence id={tw.id} />
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-6 p-6 lg:grid-cols-[1fr_280px]">
      <div>
        <div className="flex items-center gap-3">
          <div className="relative flex h-11 w-11 items-center justify-center rounded-full" style={{ background: `${col}1f` }}>
            {fires && <span className="pulse-ring absolute inset-0 rounded-full" style={{ background: `${col}55` }} />}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={col} strokeWidth="2" strokeLinecap="round">
              {fires ? (
                <>
                  <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                  <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                </>
              ) : (
                <path d="M20 6 9 17l-5-5" />
              )}
            </svg>
          </div>
          <div>
            <div className="text-[15px] font-medium">
              {fires ? "Watchtower alarm" : "All clear"}
              {a.pattern && (
                <span className="ml-2 text-sm" style={{ color: PATTERN_COLOR[a.pattern] }}>
                  · {a.pattern} pattern
                </span>
              )}
            </div>
            <div className="text-xs text-muted">
              {fires ? (
                <>
                  Fired after term {k} · <span className="num text-text">{a.leadTimeTerms}</span> terms before the 4-year mark
                </>
              ) : (
                "Watching every term. Nothing to report."
              )}
            </div>
            <div className="mt-1 text-[11px] text-dim">Alarm uses completed-term matches; the plan comparison above uses future course load.</div>
          </div>
        </div>
        <div className="mt-6">
          <Narration segs={segs} muted={muted} playKey={`${st.id}-${st.work}`} size="lg" />
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="text-[11px] text-dim">evidence</span>
          <Evidence id={gs.id}>
            <span className="text-dim">get_state</span>
          </Evidence>
          <Evidence id={tw.id}>
            <span className="text-dim">find_twins · n={tw.data.n}</span>
          </Evidence>
          <Evidence id={alarm.id}>
            <span className="text-dim">alarm_check</span>
          </Evidence>
        </div>
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button onClick={onDrill} className="group flex items-center gap-2 rounded-full bg-text px-5 py-2.5 text-sm font-medium text-bg transition hover:scale-[1.02]">
            Run the fire drill
            <span className="transition group-hover:translate-x-0.5">→</span>
          </button>
          <AnimatePresence mode="wait">
            {fb === null ? (
              <motion.div key="ask" exit={{ opacity: 0 }} className="flex gap-2">
                {[true, false].map((u) => (
                  <button
                    key={String(u)}
                    onClick={() => {
                      setFb(u);
                      onFeedback(u);
                    }}
                    className="rounded-full border border-line px-4 py-2.5 text-sm text-muted transition hover:border-line-2 hover:text-text"
                  >
                    {u ? "Useful" : "Not useful"}
                  </button>
                ))}
              </motion.div>
            ) : (
              <motion.span key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-muted">
                Feedback noted in this demo session · persistence pending
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>
      <div className="space-y-4 border-t border-line pt-5 lg:border-l lg:border-t-0 lg:pl-6 lg:pt-0">
        <div className="label">What&apos;s driving it</div>
        {drivers.map((d, i) => (
          <motion.div key={d.label} initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.15 }}>
            <div className="flex items-baseline justify-between text-xs">
              <span className="text-muted">{d.label}</span>
              <span className="num">
                <span className={d.worse ? "text-heat" : "text-text"}>{d.fmt(d.you)}</span>
                <span className="text-dim"> vs {d.fmt(d.ref)}</span>
              </span>
            </div>
            <div className="relative mt-1.5 h-1.5 rounded-full bg-white/[0.05]">
              <motion.div
                className="absolute h-full rounded-full"
                style={{ background: d.worse ? "var(--heat)" : "var(--muted)" }}
                initial={{ width: 0 }}
                animate={{ width: `${Math.min(100, (d.you / d.max) * 100)}%` }}
                transition={{ duration: 0.9, delay: 0.4 + i * 0.15 }}
              />
              <div className="absolute -top-1 h-3.5 w-0.5 bg-cool" style={{ left: `${Math.min(100, (d.ref / d.max) * 100)}%` }} />
            </div>
          </motion.div>
        ))}
        <p className="text-[11px] leading-relaxed text-dim">
          <span className="text-cool">│</span> median of alumni who finished on time, at the same stage. Associations, not causes.
        </p>
      </div>
    </div>
  );
}

// ---------------- Fire drill ----------------
export function DrillStage({
  drill,
  plan,
  setPlan,
  currentLoad,
  repairLoad,
  survNow,
  survRep,
  muted,
  onRepair,
  runKey,
}: {
  drill: ToolResult<Drill>;
  plan: "current" | "repair";
  setPlan: (p: "current" | "repair") => void;
  currentLoad: number;
  repairLoad: number | null;
  survNow: ToolResult<SurvivalPoint[]>;
  survRep: ToolResult<SurvivalPoint[]> | null;
  muted: boolean;
  onRepair: () => void;
  runKey: number;
}) {
  const d = drill.data;
  const [shown, setShown] = useState(0);
  const total = d.alreadyCooked ? 1 : d.path.length;
  useEffect(() => {
    const ids = [setTimeout(() => setShown(0), 0), ...Array.from({ length: total }, (_, i) => setTimeout(() => setShown(i + 1), 500 + i * 850))];
    return () => ids.forEach(clearTimeout);
  }, [drill.id, runKey, total]);
  const revealed = shown >= total;
  const segs = useMemo(() => drillScript(drill), [drill]);
  const broke = d.shocksToCooked !== null;
  const load = plan === "repair" && repairLoad ? repairLoad : currentLoad;

  return (
    <div className="p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="label">Stress-testing</div>
          <div className="mt-1 text-sm text-muted">
            Plan: <span className="num text-text">{load}</span> credits/term · shocks drawn at rates measured for your work hours
          </div>
        </div>
        <div className="flex rounded-full border border-line p-1 text-xs">
          {(["current", "repair"] as const).map((p) => (
            <button
              key={p}
              disabled={p === "repair" && !repairLoad}
              onClick={() => setPlan(p)}
              className={`relative rounded-full px-3 py-1.5 transition disabled:opacity-30 ${plan === p ? "text-bg" : "text-muted hover:text-text"}`}
            >
              {plan === p && <motion.span layoutId="plan-pill" className="absolute inset-0 rounded-full bg-text" />}
              <span className="relative">{p === "current" ? `Current pace · ${currentLoad} cr` : `Repair plan · ${repairLoad ?? "–"} cr`}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className="space-y-2.5">
          {d.alreadyCooked ? (
            <AnimatePresence>
              {shown > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -20, rotateX: 40 }}
                  animate={{ opacity: 1, y: 0, rotateX: 0 }}
                  className="rounded-xl border border-hot/40 bg-hot/[0.07] p-4"
                >
                  <div className="text-sm font-medium text-hot">Broken before the first shock</div>
                  <div className="num mt-2 text-[13px] leading-relaxed text-text/80">
                    {d.baseline.remaining} credits left ÷ {load}/term = {d.baseline.termsNeeded} more terms
                    <br />→ {d.baseline.totalTerms} regular terms = <span className="text-hot">{d.baseline.years.toFixed(1)} years</span>
                  </div>
                  <div className="mt-2 text-xs text-muted">At this pace, the 5-year line is already behind you. The fix matters more than the drill.</div>
                  {plan === "current" && repairLoad && (
                    <button
                      onClick={() => setPlan("repair")}
                      className="group mt-3 inline-flex items-center gap-2 rounded-full bg-cool px-4 py-2 text-xs font-medium text-bg transition hover:scale-[1.02]"
                    >
                      Stress-test the {repairLoad}-credit repair plan instead
                      <span className="transition group-hover:translate-x-0.5">→</span>
                    </button>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          ) : (
            <>
              <div className="num flex items-center justify-between rounded-lg border border-line px-3 py-2 text-xs text-muted">
                <span>Baseline projection</span>
                <span className="text-text">{d.baseline.years.toFixed(1)} years</span>
              </div>
              <AnimatePresence>
                {d.path.slice(0, shown).map((s, i) => (
                  <motion.div
                    key={`${s.key}-${i}`}
                    initial={{ opacity: 0, y: -24, scale: 0.96 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    transition={{ type: "spring", stiffness: 380, damping: 26 }}
                    className={`rounded-xl border p-3.5 ${s.cooked ? "border-hot/50 bg-hot/[0.08]" : "border-heat/25 bg-heat/[0.04]"}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <span className="num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-heat/15 text-[11px] text-heat">{i + 1}</span>
                        <div>
                          <div className="text-sm font-medium">{s.label}</div>
                          <div className="text-xs text-muted">
                            {s.termLabel} · {s.detail}
                          </div>
                        </div>
                      </div>
                      <div className="num text-right text-[11px] text-muted">
                        p={s.prob.toFixed(2)}
                        <div className="text-dim">per term</div>
                      </div>
                    </div>
                    <div className="num mt-2.5 flex items-center gap-2 text-xs">
                      <span className="text-muted">{s.yearsBefore.toFixed(1)}y</span>
                      <div className="relative h-1 flex-1 rounded-full bg-white/[0.06]">
                        <motion.div
                          className="absolute h-full rounded-full"
                          style={{ background: s.cooked ? "#ff2e4d" : "#ff5a1f" }}
                          initial={{ width: `${(s.yearsBefore / 7) * 100}%` }}
                          animate={{ width: `${Math.min(100, (s.yearsAfter / 7) * 100)}%` }}
                          transition={{ duration: 0.7, delay: 0.2 }}
                        />
                        <div className="absolute -top-1 h-3 w-px bg-hot" style={{ left: `${(5 / 7) * 100}%` }} />
                      </div>
                      <span className={s.cooked ? "text-hot" : "text-text"}>{s.yearsAfter.toFixed(1)}y</span>
                    </div>
                    {s.cooked && <div className="mt-2 text-xs font-medium text-hot">Plan breaks here · past 5 years{s.yearsAfter <= 5 ? " or 5 withdrawals" : ""}</div>}
                  </motion.div>
                ))}
              </AnimatePresence>
            </>
          )}
          <AnimatePresence>
            {revealed && (
              <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-center justify-between rounded-xl border border-line-2 bg-panel-2 p-4">
                <div>
                  <div className="label">Shocks to cooked</div>
                  <div className={`display mt-1 text-4xl font-semibold ${broke ? "text-hot" : "text-cool"}`}>{d.shocksToCooked ?? `${d.path.length}+`}</div>
                </div>
                <div className="text-right text-xs text-muted">
                  {broke ? (d.spof ? <>Weakest point<div className="mt-0.5 text-sm text-text">{d.spof.label}</div></> : "No margin at all") : <>Survived every plausible shock</>}
                  <div className="mt-1.5">
                    <Evidence id={drill.id} />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div>
          <div className="label">Survival · 500 simulated futures</div>
          <div className="mt-3">
            <SurvivalChart
              series={[
                { key: "now", label: `current · ${currentLoad} cr`, color: "#ff2e4d", points: survNow.data },
                ...(survRep && repairLoad ? [{ key: "rep", label: `repair · ${repairLoad} cr`, color: "#2dd4bf", points: survRep.data }] : []),
              ]}
            />
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-dim">
            Each future draws a withdrawal and a forced lighter load every term at the measured rates. Survival = not yet projected past 5 years or 5 withdrawals.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            {d.outcomeShocks.map((o) => (
              <div key={o.key} className="rounded-lg border border-line p-3">
                <div className="text-xs">{o.label}</div>
                <div className="num mt-1 text-lg text-amber">{Math.round(o.prob * 100)}%</div>
                <div className="text-[10.5px] text-dim">{o.detail}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {revealed && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mt-6 border-t border-line pt-5">
            <Narration segs={segs} muted={muted} playKey={`${drill.id}-${runKey}`} />
            <button onClick={onRepair} className="group mt-4 flex items-center gap-2 rounded-full bg-text px-5 py-2.5 text-sm font-medium text-bg transition hover:scale-[1.02]">
              Find the smallest fix <span className="transition group-hover:translate-x-0.5">→</span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------- Repair ----------------
export function RepairStage({
  rep,
  applied,
  onApply,
  muted,
  status,
}: {
  rep: ToolResult<Repair>;
  applied: boolean;
  onApply: (load: number) => void;
  muted: boolean;
  status: string;
}) {
  const r = rep.data;
  const p = r.primary;
  const segs = useMemo(() => repairScript(rep), [rep]);
  const feas = r.feasibility?.data;

  if (!p) {
    return (
      <div className="p-6">
        <div className="label">Repair</div>
        <h3 className="display mt-2 text-2xl">{status === "fine" ? "Nothing to fix. Keep this pace." : "No supported change found"}</h3>
        <p className="mt-2 max-w-xl text-muted">{r.refusal}</p>
        {r.fallback && <LeverCard lever={r.fallback} tr={rep.id} kind="Option" />}
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative overflow-hidden rounded-2xl border border-cool/30 bg-gradient-to-br from-cool/[0.09] to-transparent p-6"
        >
          <div className="label !text-cool">Primary change</div>
          <div className="display mt-2 text-3xl font-semibold">{p.title}</div>
          <div className="mt-5 flex items-end gap-6">
            <div>
              <div className="num text-5xl font-semibold text-cool">
                {Math.max(0, p.diffYears).toFixed(1)}
                <span className="ml-1 text-xl text-cool/70">yrs</span>
              </div>
              <div className="mt-1 text-xs text-muted">sooner, median</div>
            </div>
            <div className="num space-y-1 pb-1 text-xs text-muted">
              <div>
                90% CI <span className="text-text">{p.ci[0].toFixed(1)} – {p.ci[1].toFixed(1)}</span>
              </div>
              <div>
                n = <span className="text-text">{p.n}</span> {p.pool}
              </div>
              <div>
                cooked rate at {p.target}+: <span className="text-text">{Math.round(p.riskAt * 100)}%</span>
              </div>
              {p.reachesGoal !== undefined && (
                <div className={p.reachesGoal ? "text-cool" : "text-amber"}>{p.reachesGoal ? "✓ projection back under 5 years" : "shortens it, but not under 5 years"}</div>
              )}
            </div>
          </div>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <button
              onClick={() => onApply(p.target)}
              disabled={applied}
              className="rounded-full bg-cool px-5 py-2.5 text-sm font-medium text-bg transition hover:scale-[1.02] disabled:opacity-60"
            >
              {applied ? "Applied to your plan ✓" : "Apply to my plan"}
            </button>
            <Evidence id={rep.id} />
          </div>
          <p className="mt-4 text-[11px] text-dim">What happened to matched students who did this. Not a promise.</p>
        </motion.div>

        <div className="space-y-3">
          {feas && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="rounded-2xl border border-line p-5">
              <div className="flex items-center justify-between">
                <div className="label">Catalog check · {NEXT_TERM.label}</div>
                <span className={`rounded-full px-2 py-0.5 text-[11px] ${feas.feasible ? "bg-cool/10 text-cool" : "bg-hot/10 text-hot"}`}>{feas.feasible ? "feasible" : "not feasible"}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {feas.picks.map((c, i) => (
                  <motion.span
                    key={c.id}
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.3 + i * 0.07 }}
                    className="num rounded-md border border-heat/40 bg-heat/[0.06] px-2 py-1 text-[11px]"
                    title={c.title}
                  >
                    {c.id} <span className="text-dim">{c.credits}</span>
                  </motion.span>
                ))}
              </div>
              <ul className="mt-3 space-y-1 text-[11.5px] text-muted">
                {feas.reasons.map((x) => (
                  <li key={x}>· {x}</li>
                ))}
              </ul>
              <div className="mt-2">
                <Evidence id={r.feasibility!.id} />
              </div>
            </motion.div>
          )}
          {r.fallback && <LeverCard lever={r.fallback} tr={rep.id} kind="Fallback" />}
        </div>
      </div>
      <div className="mt-6 border-t border-line pt-5">
        <Narration segs={segs} voice="coach" muted={muted} playKey={rep.id} />
      </div>
    </div>
  );
}

function LeverCard({ lever, tr, kind }: { lever: NonNullable<Repair["fallback"]>; tr: string; kind: string }) {
  return (
    <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="mt-3 rounded-2xl border border-line p-5">
      <div className="label">{kind}</div>
      <div className="mt-1.5 text-lg font-medium">{lever.title}</div>
      <div className="num mt-1 text-xs text-muted">
        {lever.diffYears > 0 ? `${lever.diffYears.toFixed(1)} yrs sooner (median)` : "no clear time difference"} · cooked rate {Math.round(lever.riskAt * 100)}% · n={lever.n}
      </div>
      <div className="mt-2">
        <Evidence id={tr} />
      </div>
    </motion.div>
  );
}
