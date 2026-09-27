"use client";

import { Bars, money } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import { ThinkingChip } from "@/components/theatre";
import type { SponsorLive } from "../Sponsors";
import { careersTakeaway } from "./copy";
import { Action, Honest, Sponsors, Stage } from "./kit";
import { pct, type CareersState } from "./model";

/**
 * Scene 6: careers. The student's real record is mapped onto a Model Lab scenario, so this is a
 * planning scenario, never a forecast. The career model is a baseline and says so.
 */
export function CareersScene({ state, live, onNext }: { state: CareersState; live: SponsorLive; onNext: () => void }) {
  if (state.status !== "ready") {
    return (
      <SceneFrame wide kicker="exploratory outlook" title="Career" accent="outlook" takeaway={careersTakeaway(state)} meta={<Sponsors live={live} keys={["model"]} />}>
        <Honest title={state.status === "unavailable" ? "not available" : "scoring your record"} tone={state.status === "unavailable" ? "hot" : "gold"}>
          {state.status === "loading" || state.status === "idle" ? <ThinkingChip state="working" label="Scoring your record in the Model Lab" /> : state.reason}
        </Honest>
      </SceneFrame>
    );
  }
  const { input, sim, trust } = state.data;
  const top = sim.career[0];
  const baseline = trust.careerFamily === "baseline";
  const held = [...sim.out_of_range.map((f) => f.replace(/_/g, " ")), ...input.clamped];

  return (
    <SceneFrame
      wide
      kicker="a planning scenario · exploratory"
      title="Career"
      accent="outlook"
      takeaway={careersTakeaway(state)}
      meta={
        <>
          <Provenance n={sim.salary.support} tr={sim.tool_result_id} />
          <Chip tone="hot" title="observed associations in synthetic data, not causal promises">
            not a promise
          </Chip>
          <Sponsors live={live} keys={["model"]} />
        </>
      }
      actions={
        <Action primary onClick={onNext}>
          Ask a question →
        </Action>
      }
    >
      <Stage>
        {() => (
          <div className="flex h-full min-h-0 flex-col justify-center gap-4">
            <div className={`grid items-center gap-4 sm:grid-cols-2`}>
              <div>
                <div className="label mb-1">first destination · model odds</div>
                <div className="display mb-3 text-5xl font-bold text-text">{pct(top.probability)}</div>
                <p className="mb-3 text-sm text-muted">{top.label.toLowerCase()} · first destination</p>
                <Bars data={sim.career.map((c) => ({ label: c.label, value: c.probability }))} domain={[0, 1]} format={pct} axisFormat={pct} unit="model odds" height={190} />
              </div>
              <div className="space-y-2 text-[13px] leading-snug text-muted">
                {baseline ? (
                  <p>
                    <span className="text-gold">The career model is the baseline.</span> No learned model beat guessing the class frequencies{trust.careerMacroF1 !== null ? <> (macro-F1 <span className="num text-text">{trust.careerMacroF1.toFixed(3)}</span> for every family)</> : ""}, so these odds are the cohort&apos;s base rates. They do not move with your record.
                  </p>
                ) : (
                  <p>These odds come from the {trust.careerFamily ?? "career"} model. They are associations in synthetic data, not a forecast.</p>
                )}
                <p className="text-dim">No Response and Military are never treated as outcomes here.</p>
              </div>
            </div>

            <p className="text-sm leading-relaxed text-muted">First salary model: {money(sim.salary.mid)} median, with 25th to 75th percentile predictions from {money(sim.salary.low)} to {money(sim.salary.high)} in nominal dollars. {trust.salaryBias !== null ? `On its 2023–2026 holdout, the ${trust.salaryFamily ?? "salary"} model ran about ${money(Math.abs(trust.salaryBias))} ${trust.salaryBias < 0 ? "low" : "high"}.` : ""}</p>

            <div>
              <div className="label mb-1.5">scenario built from your record</div>
              <div className="flex flex-wrap gap-1.5">
                {input.real.map((c) => (
                  <Chip key={c}>{c}</Chip>
                ))}
                {input.assumed.map((c) => (
                  <span key={c} title="an audit does not carry this; held at the Model Lab default" className="num inline-flex items-center rounded-full border border-dashed border-gold/40 px-2.5 py-1 text-[11px] text-gold/80">
                    {c}*
                  </span>
                ))}
              </div>
              <p className="mt-1.5 text-[11px] leading-snug text-dim">
                * not on an audit, so held at the Model Lab default.{held.length ? ` Held inside the training range: ${held.join(", ")}.` : ""} {sim.disclaimer}
              </p>
            </div>
          </div>
        )}
      </Stage>
    </SceneFrame>
  );
}
