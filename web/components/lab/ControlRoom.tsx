"use client";

import type { ArenaReport, SimulateResponse, TaskId } from "@/lib/arena-types";
import { CAREER_CLASSES, CAREER_COLOR, FAMILY_FULL, careerP, clampNotes, pct0, salaryBias, usdK } from "@/lib/labModel";
import { Bars } from "@/components/viz";
import { ControlPanel } from "./ControlPanel";
import { RAIL_GUTTER } from "./frame";
import { NarrateButton, type useNarrator } from "./Narrate";
import type { LabSim } from "./useLabSim";

export interface ControlRoomProps {
  sim: LabSim;
  arena: ArenaReport | null;
  narrator: ReturnType<typeof useNarrator>;
  onOpenArena: (task: TaskId) => void;
}

export function ControlRoom({ sim, arena, narrator, onOpenArena }: ControlRoomProps) {
  const r = sim.result;
  return <div className={`grid h-full min-h-0 gap-4 overflow-y-auto px-4 py-4 lg:grid-cols-[minmax(280px,320px)_minmax(0,1fr)] lg:overflow-hidden ${RAIL_GUTTER}`}>
    <ControlPanel sim={sim} />
    <main className="min-w-0 overflow-y-auto lg:pr-3">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div><p className="label !text-gold">Model lab</p><h2 className="display mt-1 text-2xl font-bold">Four trained models, one scenario</h2></div>
        <NarrateButton narrator={narrator} disabled={!r} />
      </div>
      {sim.error && <button type="button" onClick={sim.retry} className="mb-3 text-sm text-hot">{sim.error} · Retry</button>}
      {r ? <div className={`grid gap-3 md:grid-cols-2 ${sim.pending ? "opacity-60" : ""}`} aria-busy={sim.pending}>
        <ResultCard task="risk" title="Academic risk" value={pct0(r.risk)} detail={`Champion: ${FAMILY_FULL[r.candidates.champions.risk]}. ${r.drivers_basis}`} onOpenArena={onOpenArena}>
          <Bars data={r.candidates.risk.map(c => ({ key: c.family, label: FAMILY_FULL[c.family], value: c.risk, color: c.is_champion ? "var(--gold)" : "var(--muted)" }))} format={pct0} axisFormat={pct0} domain={[0,1]} height={180} label="Academic risk estimated by each model family" />
        </ResultCard>
        <ResultCard task="time_to_degree" title="Time to degree" value={`${r.time_to_degree.mid.toFixed(1)} years`} detail={`Likely ${r.time_to_degree.low.toFixed(1)}–${r.time_to_degree.high.toFixed(1)} years. Champion: ${FAMILY_FULL[r.candidates.champions.time_to_degree]}.`} onOpenArena={onOpenArena}>
          <Bars data={r.candidates.time_to_degree.map(c => ({ key: c.family, label: FAMILY_FULL[c.family], value: c.mid, color: c.is_champion ? "var(--gold)" : "var(--muted)" }))} format={v => `${v.toFixed(1)} y`} axisFormat={v => `${v.toFixed(1)} y`} height={180} label="Median time to degree estimated by each model family" />
        </ResultCard>
        <ResultCard task="career" title="First destination" value={topCareer(r)} detail={r.candidates.champions.career === "baseline" ? "No model beat base rates. These shares stay fixed when inputs change." : `Champion: ${FAMILY_FULL[r.candidates.champions.career]}.`} onOpenArena={onOpenArena}>
          <Bars data={CAREER_CLASSES.map(c => ({ key: c, label: c, value: careerP(r.career,c), color: CAREER_COLOR[c] }))} format={pct0} axisFormat={pct0} domain={[0,1]} height={180} label="First destination probabilities from the selected career model" />
        </ResultCard>
        <ResultCard task="salary" title="First salary" value={usdK(r.salary.mid)} detail={`Likely ${usdK(r.salary.low)}–${usdK(r.salary.high)} · nominal dollars · employed only, n=${r.salary.support.toLocaleString("en-US")}.`} onOpenArena={onOpenArena}>
          <Bars data={r.candidates.salary.map(c => ({ key: c.family, label: FAMILY_FULL[c.family], value: c.mid, color: c.is_champion ? "var(--gold)" : "var(--muted)" }))} format={usdK} axisFormat={usdK} height={180} label="Median first salary estimated by each model family" />
          {salaryBias(arena,r) !== null && salaryBias(arena,r)! < 0 && <p className="mt-1 text-xs text-muted">The selected model ran {usdK(Math.abs(salaryBias(arena,r)!))} low on the holdout.</p>}
        </ResultCard>
      </div> : <p className="py-12 text-center text-muted">Waiting for the trained models. {sim.error && <button onClick={sim.retry} className="text-gold">Retry</button>}</p>}
      {r && <footer className="mt-4 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        <p>{r.disclaimer}</p>
        {clampNotes(r).length > 0 && <p className="mt-1 text-ember">Training range: {clampNotes(r).map(h => `${h.label} requested ${h.requested}; models saw ${h.saw ?? "the training maximum"}`).join(" · ")}</p>}
        <p className="num mt-1 text-dim">Response {r.tool_result_id}</p>
      </footer>}
    </main>
  </div>;
}

function topCareer(r: SimulateResponse) {
  const top = CAREER_CLASSES.reduce((a,b) => careerP(r.career,b) > careerP(r.career,a) ? b : a);
  return `${pct0(careerP(r.career,top))} ${top}`;
}

function ResultCard({ task, title, value, detail, children, onOpenArena }: { task: TaskId; title: string; value: string; detail: string; children: React.ReactNode; onOpenArena: (task: TaskId) => void }) {
  return <section className="rounded-xl border border-line bg-panel p-4">
    <div className="flex items-start justify-between gap-3"><h3 className="label">{title}</h3><button type="button" onClick={() => onOpenArena(task)} className="text-xs text-gold hover:underline">View evidence →</button></div>
    <p className="num mt-3 text-4xl font-semibold tracking-tight text-cream">{value}</p>
    <p className="mt-2 min-h-10 text-xs leading-relaxed text-muted">{detail}</p>
    <div className="mt-3 border-t border-line pt-3">{children}</div>
  </section>;
}
