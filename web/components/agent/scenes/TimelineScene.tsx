"use client";

import { useMemo } from "react";
import { LineChart, RangeBar, type LineSeries, type RangeMark } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import type { SponsorLive } from "../Sponsors";
import { timelineTakeaway } from "./copy";
import { Action, Sponsors, Stage, fit } from "./kit";
import { yrs, type Journey, type TwinFacts } from "./model";

/** Scene 2: time to degree. The model's range is the hero; below it, the load that separates twins who finished on time from those who did not. */
export function TimelineScene({ j, tw, live, onNext }: { j: Journey; tw: TwinFacts | null; live: SponsorLive; onNext: () => void }) {
  const { st } = j;
  const t = st.time_to_degree;
  const k = st.terms.length;

  const line = useMemo(() => {
    const T = Math.max(k, tw?.load.onTime?.x.length ?? 0, tw?.load.cooked?.x.length ?? 0);
    const x = Array.from({ length: T }, (_, i) => i + 1);
    const series: LineSeries[] = [];
    const onTime = tw?.load.onTime;
    const cooked = tw?.load.cooked;
    const pad = (arr: (number | null)[] | undefined) => x.map((_, i) => arr?.[i] ?? null);
    if (onTime) series.push({ key: "ok", label: `${tw!.onTime} twins who finished on time`, color: "var(--cool)", y: pad(onTime.median), low: pad(onTime.low), high: pad(onTime.high), dashed: true, width: 2, emphasis: false });
    if (cooked) series.push({ key: "bad", label: `${tw!.cooked} twins who got cooked`, color: "var(--hot)", y: pad(cooked.median), low: pad(cooked.low), high: pad(cooked.high), dashed: true, width: 2, emphasis: false });
    series.push({ key: "you", label: "You", color: "var(--gold)", y: x.map((_, i) => (i < k ? st.terms[i].attempted : null)), width: 3.2, emphasis: true });
    const top = Math.max(12, ...series.flatMap((s) => [...s.y, ...(s.high ?? [])].filter((v): v is number => v !== null)));
    return { x, series, top: Math.ceil(top / 3) * 3 };
  }, [k, st.terms, tw]);

  const lo = Math.min(t.low, tw?.ttd.median ?? t.low, 3.5);
  const hi = Math.max(t.high, tw?.ttd.median ?? t.high, 5.5);
  const min = Math.max(0, Math.floor(lo - 0.5));
  const max = Math.ceil(hi + 0.5);
  // reference lines by priority; a label that would sit on top of a more important one is dropped
  const marks = useMemo(() => {
    const wanted: RangeMark[] = [...(tw ? [{ value: Math.round(tw.ttd.median * 10) / 10, label: "twins' median", tone: "gold" as const }] : []), { value: 4, label: "4-year line", tone: "safe" }, { value: 5, label: "5-year line", tone: "risk" }];
    const kept: RangeMark[] = [];
    for (const m of wanted) if (kept.every((k) => Math.abs(k.value - m.value) >= (max - min) * 0.2)) kept.push(m);
    return kept;
  }, [tw, min, max]);

  return (
    <SceneFrame
      wide
      kicker="time to degree"
      title="Finish in"
      accent={`${yrs(t.mid)} years`}
      takeaway={timelineTakeaway(j, tw)}
      meta={
        <>
          <Provenance n={t.support} tr={t.tool_result_id} />
          {tw && <Chip title="how long the matched alumni actually took, from the synthetic dataset">twins: n={tw.n} in the dataset</Chip>}
          <Sponsors live={live} keys={["model", "tiger"]} />
        </>
      }
      actions={
        <Action primary onClick={onNext}>
          Meet your twins →
        </Action>
      }
    >
      <Stage>
        {(box) => (
          <div className="flex h-full flex-col justify-center gap-5">
            <RangeBar
              label="Time to degree, model median"
              value={t.mid}
              low={t.low}
              high={t.high}
              min={min}
              max={max}
              format={(v) => v.toFixed(1)}
              unit="years"
              size={box.desk && box.h < 520 ? "lg" : "hero"}
              marks={marks}
              n={t.support}
              lowLabel="p25"
              highLabel="p75"
            />
            <div>
              <div className="label mb-1">credits attempted per term · you against your twins</div>
              <LineChart
                x={line.x}
                xFormat={(v) => `T${v}`}
                xLabel="term"
                series={line.series}
                yDomain={[0, line.top]}
                yFormat={(v) => String(Math.round(v))}
                yTicks={4}
                events={[{ x: Math.min(k, line.x.length), label: "you are here", detail: `${st.avg_credits.value} credits a term so far`, tone: "gold" }]}
                height={fit(box, 0.34, 170, 260, 230)}
                bandLabel="p25 to p75"
                n={tw?.n}
                label={`Credits attempted per term. You averaged ${st.avg_credits.value} over ${k} terms${tw?.loadAfter.onTime != null ? `; twins who finished on time averaged ${tw.loadAfter.onTime.toFixed(1)} afterwards` : ""}.`}
              />
            </div>
          </div>
        )}
      </Stage>
    </SceneFrame>
  );
}
