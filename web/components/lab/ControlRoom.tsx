"use client";

import { useState } from "react";
import type { ArenaReport, CareerClass, Family, SimulateResponse, TaskId } from "@/lib/arena-types";
import { CAREER_CLASSES, CAREER_COLOR, FAMILIES, FAMILY_NAME, careerP, clampNotes, pct0, salaryBias, usdK } from "@/lib/labModel";
import { ModelPulse, ThinkingChip } from "@/components/theatre";
import { CountUp, Donut, LineChart, RiskRing, patternColor, useChartSize } from "@/components/viz";
import { ControlPanel } from "./ControlPanel";
import { RAIL_GUTTER } from "./frame";
import { NarrateButton, type useNarrator } from "./Narrate";
import { Champ, Crown, Drivers, FamilyDots, FamilyLegend, Panel, RangeStrip } from "./parts";
import type { LabSim } from "./useLabSim";

const PULSE = [{ name: "Risk" }, { name: "Timeline" }, { name: "Career" }, { name: "Salary" }];

export interface ControlRoomProps {
  sim: LabSim;
  arena: ArenaReport | null;
  narrator: ReturnType<typeof useNarrator>;
  onOpenArena: (task: TaskId) => void;
}

export function ControlRoom({ sim, arena, narrator, onOpenArena }: ControlRoomProps) {
  const r = sim.result;
  const [spot, setSpot] = useState<Family | null>(null);
  const busy = sim.pending;
  return (
    <div className={`grid h-full min-h-0 gap-3 overflow-y-auto px-3 pb-3 pt-3 sm:px-5 lg:grid-cols-[minmax(288px,320px)_minmax(0,1fr)] lg:overflow-hidden lg:pb-2 lg:pr-6 ${RAIL_GUTTER}`}>
      <ControlPanel sim={sim} />
      <div className="flex min-h-0 min-w-0 flex-col gap-2.5">
        <StatusStrip sim={sim} narrator={narrator} />
        {r ? (
          <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-6 lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
            <RiskPanel r={r} arena={arena} busy={busy} spot={spot} onOpenArena={onOpenArena} />
            <TimelinePanel r={r} arena={arena} busy={busy} spot={spot} onOpenArena={onOpenArena} />
            <CareerPanel r={r} busy={busy} spot={spot} onOpenArena={onOpenArena} arena={arena} />
            <SalaryPanel r={r} arena={arena} busy={busy} spot={spot} onOpenArena={onOpenArena} />
          </div>
        ) : (
          <Warming error={sim.error} onRetry={sim.retry} />
        )}
        <footer className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-[10.5px] leading-snug text-dim">
          <FamilyLegend spot={spot} onSpot={setSpot} champions={r ? Object.values(r.candidates.champions) : undefined} />
          <span className="min-w-0 flex-1 basis-64">
            {r ? r.disclaimer : "Synthetic data. Associations, not promises."} <span className="num text-gold/80">{"↳"} {r?.tool_result_id ?? "…"}</span>
          </span>
          {sim.ms !== null && (
            <span className="num shrink-0 text-dim" title="One request scores all four models; identical scenarios are answered from a cache">
              one call {"·"} {Math.round(sim.ms)} ms {"·"} {sim.calls} run{sim.calls === 1 ? "" : "s"}
            </span>
          )}
        </footer>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- status strip */

function StatusStrip({ sim, narrator }: { sim: LabSim; narrator: ReturnType<typeof useNarrator> }) {
  const r = sim.result;
  const held = r ? clampNotes(r) : [];
  const idle = !sim.pending;
  return (
    <div className="flex min-h-[38px] flex-wrap items-center gap-x-2.5 gap-y-1.5">
      {r && r.pattern && (
        <span className="num inline-flex items-center gap-1.5 rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-muted" title="Trajectory pattern of this scenario's term history">
          <i className="size-2 rounded-full" style={{ background: r.pattern === "not enough history" ? "var(--dim)" : patternColor(r.pattern) }} />
          {r.pattern === "not enough history" ? "no history yet" : r.pattern}
        </span>
      )}
      {held.length > 0 && (
        <span className="num inline-flex items-center gap-1.5 rounded-full border border-ember/40 px-2.5 py-1 text-[11px] text-ember" title={held.map((h) => `${h.label}: asked ${h.requested}, the models saw ${h.saw ?? "the training maximum"}`).join("\n")}>
          held at the training edge {"·"} {held.map((h) => h.label.toLowerCase()).join(", ")}
        </span>
      )}
      {sim.error && (
        <button type="button" onClick={sim.retry} className="num inline-flex items-center gap-1.5 rounded-full border border-hot/40 px-2.5 py-1 text-[11px] text-hot hover:bg-hot/10">
          {sim.error} {"·"} retry
        </button>
      )}
      <div className="ml-auto flex flex-wrap items-center justify-end gap-x-3 gap-y-1.5">
        <ModelPulse busy={sim.pending} models={PULSE.map((m) => ({ ...m, done: idle && !!r }))} />
        <NarrateButton narrator={narrator} disabled={!r} />
      </div>
    </div>
  );
}

function Warming({ error, onRetry }: { error: string | null; onRetry: () => void }) {
  return (
    <div className="panel grid min-h-[260px] flex-1 place-items-center p-8 text-center">
      <div>
        <ThinkingChip state={error ? "breathing" : "working"} label={error ? "The models did not answer" : "Waking the four models"} />
        <p className="mt-3 text-sm text-muted">{error ?? "Loading the frozen HackUMBC models."}</p>
        {error && (
          <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-gold/40 px-4 py-1.5 text-xs text-gold hover:bg-gold/10">
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

interface PanelProps {
  r: SimulateResponse;
  arena: ArenaReport | null;
  busy: boolean;
  spot: Family | null;
  onOpenArena: (task: TaskId) => void;
}

const BIG = "display text-[clamp(40px,7.4vh,66px)] font-extrabold leading-[0.95] text-cream";

/** The likely range as words, right-aligned beside the big number. */
function Likely({ children }: { children: React.ReactNode }) {
  return (
    <span className="num pb-1 text-right text-[10.5px] leading-tight text-dim">
      likely
      <br />
      <span className="text-[13px] text-text">{children}</span>
    </span>
  );
}

/* ---------------------------------------------------------------- 01 · risk */

function RiskPanel({ r, arena, busy, spot, onOpenArena }: PanelProps) {
  const champ = r.candidates.champions.risk;
  const entries = r.candidates.risk.map((c) => ({ family: c.family, value: c.risk, champion: c.is_champion }));
  const learned = entries.filter((e) => e.family !== "baseline").map((e) => e.value);
  const support = r.models.find((m) => m.task === "risk")?.support;
  const [ref, box] = useChartSize<HTMLDivElement>("fill");
  const ring = Math.max(120, Math.min(box.width, box.height, 300));
  return (
    <Panel n={1} title="Academic risk" sub="risk of getting cooked" busy={busy} className="lg:col-span-2 lg:row-span-2" badge={<Champ family={champ} beats={arena?.tasks.risk.champion.beats_baseline} onClick={() => onOpenArena("risk")} />}>
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <div ref={ref} className="relative h-[230px] min-h-[130px] lg:h-auto lg:flex-1">
          <div className="absolute inset-0 grid place-items-center">
            <RiskRing value={r.risk} size={ring} n={support} range={learned.length ? { low: Math.min(...learned), high: Math.max(...learned) } : undefined} label="risk of getting cooked" />
          </div>
        </div>
        <Drivers drivers={r.drivers} basis={r.drivers_basis} />
        <FamilyDots label="Do the models agree?" entries={entries} min={0} max={1} format={pct0} spot={spot} />
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ 02 · timeline */

function TimelinePanel({ r, arena, busy, spot, onOpenArena }: PanelProps) {
  const [ref, size] = useChartSize<HTMLDivElement>("fill");
  const champ = r.candidates.champions.time_to_degree;
  const t = r.time_to_degree;
  const done = r.scenario.completed_terms;
  const traj = r.trajectory;
  const hi = Math.max(8, Math.ceil(t.high + 0.5));
  const dots = r.candidates.time_to_degree.map((c) => ({ family: c.family, value: c.mid, champion: c.is_champion }));
  return (
    <Panel n={2} title="Time to degree" sub="risk by term, and the likely range" busy={busy} className="lg:col-span-4" badge={<Champ family={champ} beats={arena?.tasks.time_to_degree.champion.beats_baseline} onClick={() => onOpenArena("time_to_degree")} />}>
      <div className="grid min-h-0 flex-1 gap-4 sm:grid-cols-[1.2fr_1fr]">
        <div className="flex min-h-0 min-w-0 flex-col">
          <div className="mb-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[9.5px] leading-none text-dim">
            <span className="label !text-[9.5px] !tracking-[0.1em]">Risk by term</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-px w-4 bg-gold" />completed</span>
            <span className="inline-flex items-center gap-1"><i className="inline-block h-0 w-4 border-t border-dashed border-gold" />projected</span>
          </div>
          <div ref={ref} className="relative h-[170px] min-h-0 lg:h-auto lg:flex-1">
            <LineChart
              x={traj.map((p) => p.term)}
              xFormat={(v) => `T${v}`}
              xTicks={traj.map((p) => p.term)}
              xLabel="terms completed"
              series={[
                { key: "done", label: "Completed terms", color: "var(--gold)", y: traj.map((p) => (p.term <= done ? p.risk : null)), emphasis: true },
                { key: "proj", label: "Projected, same load", color: "var(--gold)", dashed: true, y: traj.map((p) => (p.term >= done ? p.risk : null)), emphasis: false },
              ]}
              yDomain={[0, 1]}
              yTicks={4}
              yFormat={pct0}
              thresholds={[{ value: 0.5, label: "50%", tone: "risk" }]}
              legend={false}
              height={Math.max(100, size.height)}
              label={`Risk by completed term for this scenario: ${traj.map((p) => `term ${p.term} ${pct0(p.risk)}${p.projected ? " projected" : ""}`).join(", ")}.`}
            />
          </div>
        </div>
        <div className="flex min-w-0 flex-col justify-between gap-2">
          <div className="flex items-end justify-between gap-2">
            <div className="leading-none">
              <span className="label !text-[9.5px] !tracking-[0.1em]">Median</span>
              <div className="mt-1 flex items-baseline gap-1.5">
                <CountUp value={t.mid} format={(v) => v.toFixed(1)} duration={500} className={BIG} />
                <span className="display text-[20px] font-bold text-muted">years</span>
              </div>
            </div>
            <Likely>
              {t.low.toFixed(1)} {"–"} {t.high.toFixed(1)}
            </Likely>
          </div>
          <RangeStrip low={t.low} mid={t.mid} high={t.high} min={3} max={hi} format={(v) => v.toFixed(1)} marks={[{ value: 5, label: "5-year line" }]} dots={dots} spot={spot} />
        </div>
      </div>
    </Panel>
  );
}

/* -------------------------------------------------------------- 03 · career */

function CareerPanel({ r, arena, busy, spot, onOpenArena }: PanelProps) {
  const [ref, box] = useChartSize<HTMLDivElement>("fill");
  const champ = r.candidates.champions.career;
  const slices = CAREER_CLASSES.map((c) => ({ key: c, label: c, value: careerP(r.career, c) * 100, color: CAREER_COLOR[c] }));
  const top = slices.reduce((a, b) => (b.value > a.value ? b : a), slices[0]);
  const entries = r.candidates.career.map((c) => ({ family: c.family, value: careerP(c.probabilities, "Employed"), champion: c.is_champion }));
  // the stacked "what each would say" needs room; on short screens the dots beneath already carry the disagreement
  const roomy = box.height >= 236;
  return (
    <Panel n={3} title="Career path" sub="where similar alumni went first" busy={busy} className="lg:col-span-2" badge={<Champ family={champ} beats={arena?.tasks.career.champion.beats_baseline} onClick={() => onOpenArena("career")} />}>
      <div ref={ref} className="flex min-h-0 flex-1 flex-col justify-between gap-2">
        <div className="grid grid-cols-[112px_minmax(0,1fr)] items-center gap-2">
          <Donut data={slices} height={108} thickness={0.3} labels="none" legend={false} centerValue={top.value} centerFormat={(v) => `${Math.round(v)}%`} centerLabel={top.label} format={(v) => `${v.toFixed(0)}%`} unit="of answered alumni" label={`Career odds: ${slices.map((s) => `${s.label} ${Math.round(s.value)} percent`).join(", ")}. These are base rates and do not move with the sliders.`} />
          <ul className="grid gap-1.5">
            {slices.map((s) => (
              <li key={s.key} className="flex items-center gap-2 text-[11px] leading-none">
                <i className="size-2 shrink-0 rounded-full" style={{ background: s.color }} />
                <span className="min-w-0 flex-1 truncate text-muted">{s.label}</span>
                <span className="num text-text">{Math.round(s.value)}%</span>
              </li>
            ))}
            <li className="mt-0.5 text-[9.5px] leading-snug text-gold/90">Same for every scenario: no model beat these base rates.</li>
          </ul>
        </div>
        {roomy && <Stacks r={r} />}
        <FamilyDots label="P(employed) by model" entries={entries} min={0} max={1} format={pct0} spot={spot} />
      </div>
    </Panel>
  );
}

/** What each family would say, as stacked class shares: the models do vary, they just were no better than the flat one. */
function Stacks({ r }: { r: SimulateResponse }) {
  return (
    <div>
      <div className="label !text-[9.5px] !tracking-[0.1em]">What each would say</div>
      <ul className="mt-1.5 grid gap-[5px]" aria-label="Career odds by model family">
        {FAMILIES.map((f) => {
          const c = r.candidates.career.find((x) => x.family === f);
          if (!c) return null;
          return (
            <li key={f} className="grid grid-cols-[56px_1fr] items-center gap-2" title={CAREER_CLASSES.map((k) => `${k} ${pct0(careerP(c.probabilities, k as CareerClass))}`).join(" · ")}>
              <span className="flex items-center gap-1 text-[10px] leading-none text-muted">
                {c.is_champion && <Crown size={9} className="text-gold" />}
                {FAMILY_NAME[f]}
              </span>
              <span className="flex h-[7px] overflow-hidden rounded-full bg-line">
                {CAREER_CLASSES.map((k) => (
                  <i key={k} className="block h-full transition-[width] duration-500 ease-[cubic-bezier(.16,1,.3,1)]" style={{ width: `${careerP(c.probabilities, k) * 100}%`, background: CAREER_COLOR[k] }} />
                ))}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/* --------------------------------------------------------------- 04 · salary */

function SalaryPanel({ r, arena, busy, spot, onOpenArena }: PanelProps) {
  const champ = r.candidates.champions.salary;
  const s = r.salary;
  const lo = Math.min(20000, Math.floor(s.low / 10000) * 10000);
  const hi = Math.max(130000, Math.ceil(s.high / 10000) * 10000 + 10000);
  const dots = r.candidates.salary.map((c) => ({ family: c.family, value: c.mid, champion: c.is_champion }));
  const bias = salaryBias(arena, r);
  const years = arena?.protocol.test_years;
  return (
    <Panel n={4} title="First salary" sub="nominal dollars" busy={busy} className="lg:col-span-2" badge={<Champ family={champ} beats={arena?.tasks.salary.champion.beats_baseline} onClick={() => onOpenArena("salary")} />}>
      <div className="flex min-h-0 flex-1 flex-col justify-between gap-2">
        <div className="flex items-end justify-between gap-2">
          <div className="leading-none">
            <span className="label !text-[9.5px] !tracking-[0.1em]">Median</span>
            <div className="mt-1">
              <CountUp value={s.mid} format={usdK} duration={500} className={BIG} />
            </div>
          </div>
          <Likely>
            {usdK(s.low)} {"–"} {usdK(s.high)}
          </Likely>
        </div>
        <RangeStrip low={s.low} mid={s.mid} high={s.high} min={lo} max={hi} format={usdK} dots={dots} spot={spot} />
        <p className="text-[10.5px] leading-snug text-muted">
          {bias !== null && bias < 0 && years ? (
            <>
              <span className="text-ember">Runs ~{usdK(Math.abs(bias))} low</span> on the {years[0]}
              {"–"}
              {years[1]} holdout (pay rose after training).{" "}
            </>
          ) : null}
          Employed only, n={s.support.toLocaleString("en-US")}.
        </p>
      </div>
    </Panel>
  );
}
