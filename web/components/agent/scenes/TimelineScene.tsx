"use client";

import { RangeBar, type RangeMark } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import type { SponsorLive } from "../Sponsors";
import { timelineTakeaway } from "./copy";
import { Action, Sponsors, Stage } from "./kit";
import { yrs, type Journey, type TwinFacts } from "./model";

/** A single model range, with matched alumni shown only when the match was accepted. */
export function TimelineScene({ j, tw, live, onNext }: { j: Journey; tw: TwinFacts | null; live: SponsorLive; onNext: () => void }) {
  const { st } = j;
  const t = st.time_to_degree;
  const lo = Math.min(t.low, tw?.ttd.median ?? t.low, 3.5);
  const hi = Math.max(t.high, tw?.ttd.median ?? t.high, 5.5);
  const min = Math.max(0, Math.floor(lo - 0.5));
  const max = Math.ceil(hi + 0.5);
  const marks: RangeMark[] = tw ? [{ value: Math.round(tw.ttd.median * 10) / 10, label: "matched alumni median", tone: "gold" }] : [];
  return (
    <SceneFrame wide kicker="time to degree" title="Model median" accent={`${yrs(t.mid)} years`} takeaway={timelineTakeaway(j, tw)}
      meta={<><Provenance n={t.support} tr={t.tool_result_id} />{tw && <Chip title="Matched alumni in the synthetic dataset">{tw.n} matched alumni</Chip>}<Sponsors live={live} keys={["model", "tiger"]} /></>}
      actions={<Action primary onClick={onNext}>See matched alumni →</Action>}>
      <Stage>{() => <div className="flex h-full flex-col justify-center gap-6">
        <RangeBar label="Trained time-to-degree model" value={t.mid} low={t.low} high={t.high} min={min} max={max} format={(v) => v.toFixed(1)} unit="years" marks={marks} n={t.support} lowLabel="p25" highLabel="p75" />
        <p className="max-w-xl text-sm leading-relaxed text-muted">The band spans the model’s 25th to 75th percentile predictions. {st.terms_done.value === 0 ? "No completed regular terms were found, so this is a starting-stage estimate rather than a projection from completed semesters." : `Your audit shows ${st.terms_done.value} completed regular terms and ${st.credits_earned} earned credits.`}</p>
      </div>}</Stage>
    </SceneFrame>
  );
}
