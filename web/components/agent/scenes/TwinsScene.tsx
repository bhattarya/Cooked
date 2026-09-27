"use client";

import { useMemo } from "react";
import { Bars, Donut, Stat, riskTone, type BarItem } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "../Sponsors";
import { twinsTakeaway } from "./copy";
import { Action, Honest, Sponsors, Stage, fit } from "./kit";
import { pct, type Journey, type TwinFacts } from "./model";

/** Scene 3: the twins. The real share who got cooked as the headline, with a clean breakdown of what became of them. */
export function TwinsScene({ j, tw, ds: _ds, live, onNext }: { j: Journey; tw: TwinFacts | null; ds: Dataset | null; live: SponsorLive; onNext: () => void }) {
  const { st } = j;
  const { twins } = st;

  const dest = useMemo<BarItem[]>(() => {
    if (!tw || !tw.reported) return [];
    const seek = st.still_seeking_risk;
    return tw.destinations.map((d) => ({
      label: d.label,
      value: d.count / tw.reported,
      n: d.count,
      ...(d.label === "Still Seeking" && seek ? { lo: seek.low, hi: seek.high } : {}),
    }));
  }, [tw, st.still_seeking_risk]);

  const smd = Math.max(0, ...Object.values(twins.smd));
  const share = st.twin_cooked_share?.value ?? null;

  return (
    <SceneFrame
      wide
      kicker={twins.refused ? "an honest refusal" : "alumni like you"}
      title={twins.refused ? "Too few" : "Meet"}
      accent={twins.refused ? "twins" : `${twins.n} twins`}
      takeaway={twinsTakeaway(j)}
      meta={
        <>
          <Provenance n={twins.refused ? undefined : twins.n} tr={twins.tool_result_id} />
          {!twins.refused && <Chip title="standardised mean difference between you and your twins: under 0.1 is a balanced match">balance SMD ≤ {smd.toFixed(2)}</Chip>}
          <Sponsors live={live} keys={["tiger"]} />
        </>
      }
      actions={
        <Action primary onClick={onNext}>
          Run the fire drill →
        </Action>
      }
    >
      <Stage>
        {(box) => {
          if (twins.refused) {
            const short = /^only \d+ close/i.test(twins.reason ?? "");
            return (
              <Honest title="COOKED refuses to guess" tone="hot">
                <div className="flex flex-wrap items-center gap-6">
                  {short ? (
                    <div className="w-[190px] shrink-0">
                      <Donut
                        half
                        data={[{ label: "close matches", value: Math.max(twins.n, 0.0001), color: "var(--hot)" }, { label: "still needed", value: Math.max(0, 30 - twins.n), color: "var(--line-2)" }]}
                        centerValue={twins.n}
                        centerLabel="of 30 needed"
                        labels="none"
                        legend={false}
                        height={120}
                        thickness={0.22}
                      />
                    </div>
                  ) : (
                    <div className="display max-w-[14rem] text-[2.4rem] font-extrabold leading-[0.95] text-hot">{twins.reason ?? "no match"}</div>
                  )}
                  <p className="min-w-0 flex-1 text-[15px] text-muted">
                    COOKED only compares you with alumni it can balance against you on work hours and credit load, and only when at least 30 remain. Without that, an outcome range would be noise dressed up as evidence, so there are no twin outcomes on this screen.
                  </p>
                </div>
              </Honest>
            );
          }
          if (!tw) return <Honest title="loading the alumni">Matching your {twins.n} twins and totting up what happened to them.</Honest>;
          const wide = box.desk && box.w >= 640;
          const cookedShare = share ?? tw.cooked / tw.n;
          return (
            <div className={`grid h-full min-h-0 gap-5 ${wide ? "grid-cols-[minmax(0,17rem)_minmax(0,1fr)]" : "grid-cols-1"}`}>
              <div className="flex min-h-0 flex-col justify-center gap-1">
                <div className="label">of {twins.n} matched twins</div>
                <Stat label="" value={cookedShare * 100} format={(v) => `${Math.round(v)}%`} unit="cooked" size="hero" tone={riskTone(cookedShare)} />
                <p className="text-[12.5px] leading-snug text-muted">
                  <span className="num text-text">{tw.cooked}</span> of {tw.n} twins got cooked; <span className="num text-text">{tw.onTime}</span> finished on time.
                </p>
              </div>
              <div className="flex min-h-0 min-w-0 flex-col gap-3">
                <div>
                  <div className="label mb-1">what happened to them</div>
                  <Donut
                    data={[
                      { label: "Finished on time", value: tw.onTime, color: "var(--cool)", n: tw.onTime },
                      { label: "Got cooked", value: tw.cooked, color: "var(--hot)", n: tw.cooked },
                    ]}
                    centerValue={cookedShare * 100}
                    centerFormat={(v) => `${Math.round(v)}%`}
                    centerLabel="got cooked"
                    labels="none"
                    unit="twins"
                    height={fit(box, 0.3, 140, 180, 170)}
                    thickness={0.24}
                  />
                </div>
                <div className="min-h-0">
                  <div className="label mb-1">first destination · {tw.reported} reported</div>
                  {dest.length ? (
                    <Bars data={dest} orientation="horizontal" highlight="Still Seeking" format={pct} unit="of twins who reported" intervalLabel="90% interval" height={Math.min(230, dest.length * 30 + 12)} />
                  ) : (
                    <p className="text-sm text-muted">No twin reported a first destination.</p>
                  )}
                  <p className="mt-1.5 text-[11px] leading-snug text-dim">{tw.noResponse} twins gave No Response: unknown, so left out rather than counted as an outcome.</p>
                </div>
              </div>
            </div>
          );
        }}
      </Stage>
    </SceneFrame>
  );
}
