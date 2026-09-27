"use client";

import { Donut, RangeBar, money } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import { ThinkingChip } from "@/components/theatre";
import type { SponsorLive } from "../Sponsors";
import { careersTakeaway } from "./copy";
import { Action, Honest, Sponsors, Stage, fit } from "./kit";
import { pct, type CareersState } from "./model";

const CAREER_COLOR: Record<string, string> = { Employed: "var(--cool)", "Continuing education": "var(--ice)", "Still seeking": "var(--hot)" };

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
  const lo = Math.floor((sim.salary.low * 0.6) / 10000) * 10000;
  const hi = Math.ceil((sim.salary.high * 1.4) / 10000) * 10000;
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
        {(box) => (
          <div className="flex h-full min-h-0 flex-col justify-center gap-4">
            <div className={`grid items-center gap-4 ${box.desk ? "grid-cols-[minmax(0,34rem)_minmax(0,1fr)]" : "grid-cols-1"}`}>
              <div>
                <div className="label mb-1">first destination · model odds</div>
                <Donut
                  data={sim.career.map((c) => ({ label: c.label, value: c.probability, color: CAREER_COLOR[c.label] }))}
                  centerValue={top.probability * 100}
                  centerFormat={(v) => `${Math.round(v)}%`}
                  centerLabel={top.label.toLowerCase()}
                  labels={box.w >= 760 ? "leader" : "none"}
                  format={pct}
                  unit="odds"
                  height={fit(box, 0.3, 160, 190, 190)}
                  thickness={0.26}
                />
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

            <RangeBar
              label="First salary, model median (nominal dollars)"
              value={sim.salary.mid}
              low={sim.salary.low}
              high={sim.salary.high}
              min={lo}
              max={hi}
              format={money}
              size={box.desk && box.h < 640 ? "md" : "lg"}
              n={sim.salary.support}
              lowLabel="p25"
              highLabel="p75"
              caption={
                trust.salaryBias !== null
                  ? `The ${trust.salaryFamily ?? "salary"} model ran about ${money(Math.abs(trust.salaryBias))} ${trust.salaryBias < 0 ? "low" : "high"} on the 2023–2026 graduates it was tested on, because nominal salaries kept rising. Dollars are nominal, never adjusted.`
                  : "Dollars are nominal, never adjusted for inflation."
              }
            />

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
