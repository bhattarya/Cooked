"use client";

import { Bars, type BarItem } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import type { Answer } from "@/lib/agentApi";
import type { SponsorLive } from "../Sponsors";
import { readRepair, repairTakeaway } from "./copy";
import { Action, AnswerText, Honest, Sponsors, Stage, type Box } from "./kit";
import { pct, type Journey, type RepairFull, type RepairLever } from "./model";

// The API sends the term and course titles with the feasibility check; lib/live.ts only types the ids.
type Feasibility = { term?: string; feasible: boolean; target: number; picks: { course_id: string; title?: string; credits?: number }[]; blocked: string[]; reasons: string[]; tool_result_id: string };
const feasibilityOf = (l: RepairLever | null): Feasibility | null => (l?.feasibility as Feasibility | undefined) ?? null;

/** The repair's charts and course picks, sized by the box they are given (the answer scene reuses them). */
export function RepairStage({ j, r, box, onAskAbout }: { j: Journey; r: RepairFull; box: Box; onAskAbout: (q: string) => void }) {
  const risk = j.st.risk.value;
  const reading = readRepair(r, risk);
  const p = r.primary;
  const levers = [r.primary, r.fallback].filter((l): l is RepairLever => !!l);
  const feas = feasibilityOf(p);
  const ranked: BarItem[] = levers.map((l) => ({ key: l.title, label: l.title, value: l.diff_years, lo: l.ci90?.[0], hi: l.ci90?.[1], n: l.support }));
  if (!p) {
    return (
      <Honest title={reading.kind === "nothing" ? "nothing to repair" : "COOKED refuses to prescribe"} tone={reading.kind === "nothing" ? "cool" : "hot"}>
        <p>Model risk is {pct(risk)}. {reading.kind === "nothing" ? "No change is supported at this risk level." : "No change has enough matched students behind it."} {r.refusal}</p>
        {r.twins !== undefined && <p className="mt-3 text-xs text-muted">Searched {r.twins} matched alumni · {r.tool_result_id}</p>}
      </Honest>
    );
  }
  return (
    <div className="flex h-full min-h-0 flex-col justify-center gap-4">
      <div>
        <div className="label mb-1">ranked by years finished sooner · median, with the 90% range</div>
        <Bars data={ranked} orientation="horizontal" sort="desc" format={(v) => `${v.toFixed(1)} yrs`} axisFormat={(v) => v.toFixed(1)} unit="years sooner" intervalLabel="90% range" highlight={p.title} height={Math.max(72, ranked.length * 46 + 8)} />
      </div>
      {feas && (
        <div>
          <div className="label mb-1.5">open {feas.term ? `in ${feas.term}` : "next term"} · the courses that make it real</div>
          {feas.feasible && feas.picks.length ? (
            <div className="flex flex-wrap gap-1.5">
              {feas.picks.map((c) => (
                <button key={c.course_id} type="button" onClick={() => onAskAbout(`Can I take ${c.course_id} next term?`)} title={`Ask about ${c.course_id}`} className="rounded-full border border-cool/35 bg-cool/[0.06] px-3 py-1.5 text-left text-[12.5px] transition hover:border-cool/70 hover:bg-cool/10">
                  <span className="num text-cool">{c.course_id}</span>
                  {c.title && <span className="text-muted"> · {c.title}</span>}
                  {c.credits !== undefined && <span className="num text-dim"> · {c.credits} cr</span>}
                </button>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-amber">Not enough open, unblocked courses to reach {feas.target} credits next term.</p>
          )}
          {box.desk && feas.reasons.length > 0 && <p className="mt-2 text-[11.5px] leading-snug text-dim">{feas.reasons.join(" · ")}</p>}
        </div>
      )}
    </div>
  );
}

/** Scene 5: the repair. The smallest change that worked for alumni like you, and the courses that make it real. */
export function RepairScene({ j, r, answer, live, onNext, onAskAbout }: { j: Journey; r: RepairFull; answer?: Answer; live: SponsorLive; onNext: () => void; onAskAbout: (q: string) => void }) {
  const risk = j.st.risk.value;
  const reading = readRepair(r, risk);
  const p = r.primary;
  const feas = feasibilityOf(p);

  return (
    <SceneFrame
      wide
      kicker={answer ? `you asked · “${answer.question}”` : "the smallest fix"}
      title={reading.title}
      accent={reading.accent}
      takeaway={answer ? <AnswerText segments={answer.segments} /> : repairTakeaway(j, r)}
      meta={
        <>
          {p ? <Provenance n={p.support} tr={p.tool_result_id} /> : r.tool_result_id ? <Provenance n={r.twins} tr={r.tool_result_id} /> : null}
          {feas && (
            <Chip tone="gold" title="the catalogue check: which courses are open next term and unblocked">
              ↳ {feas.tool_result_id}
            </Chip>
          )}
          <Sponsors live={live} keys={["model"]} />
        </>
      }
      actions={
        <Action primary onClick={onNext}>
          Where this leads →
        </Action>
      }
    >
      <Stage>{(box) => <RepairStage j={j} r={r} box={box} onAskAbout={onAskAbout} />}</Stage>
    </SceneFrame>
  );
}

