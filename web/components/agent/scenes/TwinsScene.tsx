"use client";

import { useMemo } from "react";
import { Bars, type BarItem } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "../Sponsors";
import { twinsTakeaway } from "./copy";
import { Action, Honest, Sponsors, Stage } from "./kit";
import { pct, type Journey, type TwinFacts } from "./model";

/** Scene 3: the twins. The real share who got cooked as the headline, with a clean breakdown of what became of them. */
export function TwinsScene({ j, tw, ds: _ds, live, onNext }: { j: Journey; tw: TwinFacts | null; ds: Dataset | null; live: SponsorLive; onNext: () => void }) {
  const { st } = j;
  const { twins } = st;

  const outcomes = useMemo<BarItem[]>(() => tw ? [
    { label: "Finished on time", value: tw.onTime, n: tw.onTime },
    { label: "Got cooked", value: tw.cooked, n: tw.cooked },
  ] : [], [tw]);

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
          if (twins.refused) return (
            <Honest title="No supported comparison">
              <p>{twins.reason ?? "No balanced match was found."}</p>
              <p className="mt-3">COOKED requires at least 30 alumni balanced on work hours and credit load before it shows matched outcomes.</p>
            </Honest>
          );
          if (!tw) return <Honest title="loading the alumni">Matching your {twins.n} twins and totting up what happened to them.</Honest>;
          const cookedShare = share ?? tw.cooked / tw.n;
          return (
            <div className="flex h-full min-h-0 flex-col justify-center gap-5">
              <div>
                <div className="label">Among {tw.n} matched alumni</div>
                <div className="display mt-2 text-[clamp(3.2rem,5vw,5rem)] font-bold leading-none text-text">{pct(cookedShare)}</div>
                <p className="mt-2 text-sm text-muted">{tw.cooked} of {tw.n} had the modeled cooked outcome.</p>
              </div>
              <Bars data={outcomes} format={(v) => String(Math.round(v))} unit="matched alumni" height={180} label="Outcomes of matched alumni" />
              <p className="max-w-xl text-sm leading-relaxed text-muted">Matched outcomes describe these alumni, not your future. Of {tw.reported} who reported a first destination, {tw.noResponse} others gave no response and remain unknown.</p>
            </div>
          );
        }}
      </Stage>
    </SceneFrame>
  );
}
