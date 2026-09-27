"use client";

import { Waterfall } from "@/components/viz";
import { Chip, Provenance, SceneFrame } from "@/components/scenes";
import type { Answer } from "@/lib/agentApi";
import type { SponsorLive } from "../Sponsors";
import { drillTakeaway, readDrill } from "./copy";
import { Action, AnswerText, Sponsors, Stage, fit, type Box } from "./kit";
import { pct, type DrillFull } from "./model";

// A shock can move risk by a point or two: show one decimal there, so small steps do not all read "+1%".
const risk = (v: number) => (Math.abs(v) < 0.1 && v !== 0 ? `${(v * 100).toFixed(1)}%` : pct(v));

/** The drill's charts and shock list, sized by the box they are given (the answer scene reuses them). */
export function DrillStage({ d, box }: { d: DrillFull; box: Box }) {
  const line = d.threshold ?? 0.5;
  const plural = (n: number) => (n === 1 ? "1 shock" : `${n} shocks`);
  // when every step stays far below the line, zoom to the steps so they can be read; the line itself is then off the chart, and the label says so
  const top = Math.max(d.baseline_risk, ...d.path.map((s) => s.risk_after));
  const far = top < line * 0.3;
  const zoom = Math.min(line, Math.max(0.02, Math.ceil(top * 140) / 100));
  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div>
        <div className="label mb-1">model risk as each shock lands · {far ? `the ${pct(line)} cooked line is far above this chart` : `the line is ${pct(line)}`}</div>
        <Waterfall
          start={{ label: `Plan at ${d.plan_load} cr`, value: d.baseline_risk }}
          steps={d.path.map((s, i) => ({ key: `${i}:${s.term}`, label: s.term, delta: s.risk_after - s.risk_before }))}
          total={d.path.length ? { label: "After shocks" } : false}
          threshold={far ? undefined : { value: line, label: `cooked ${pct(line)}` }}
          domain={far ? [0, zoom] : [0, Math.max(line * 1.15, d.baseline_risk * 1.1, ...d.path.map((s) => s.risk_after * 1.1))]}
          format={risk}
          orientation="vertical"
          height={fit(box, 0.5, 190, 300, 250)}
          label={`Risk starts at ${pct(d.baseline_risk)} and ${d.path.length ? `ends at ${pct(d.path[d.path.length - 1].risk_after)} after ${plural(d.path.length)}` : "is already past the line"}, against a ${pct(line)} cooked line.`}
        />
      </div>
      <div className="min-h-0">
        <ol className="min-w-0 space-y-1.5 text-[12.5px]" aria-label="The shocks, in order">
          <li className="label">the shocks</li>
          {d.path.length === 0 && <li className="rounded-xl border border-hot/30 bg-hot/[0.06] p-3 text-[13px] text-hot">No shock needed: at {d.plan_load} credits a term the plan starts past the line.</li>}
          {d.path.map((s, i) => (
            <li key={i} className={`rounded-xl border px-3 py-2 ${s.cooked ? "border-hot/40 bg-hot/[0.06]" : "border-line"}`}>
              <div className="flex justify-between gap-2">
                <span className="text-text">
                  {i + 1}. {s.label}
                </span>
                <span className="num text-dim">{s.term}</span>
              </div>
              <div className="num mt-0.5 text-[11px] text-muted">
                {risk(s.risk_before)} → <span style={{ color: s.risk_after >= line ? "var(--hot)" : "var(--text)" }}>{risk(s.risk_after)}</span> · p={s.prob.toFixed(2)} a term
              </div>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-xs text-muted">{d.sims} simulated futures · {d.rows_stored} stored trajectories.</p>
      </div>
    </div>
  );
}

/** Scene 4: the fire drill. Realistic shocks, one after another, until the plan breaks (or does not). */
export function DrillScene({ d, answer, live, onNext }: { d: DrillFull; answer?: Answer; live: SponsorLive; onNext: () => void }) {
  const r = readDrill(d);
  const plural = (n: number) => (n === 1 ? "1 shock" : `${n} shocks`);
  const title = r.kind === "resilient" ? "Survives" : r.kind === "breaks" ? "Broken by" : "Past the";
  const accent = r.kind === "past" ? "the line" : plural(r.shocks);

  return (
    <SceneFrame
      wide
      kicker={answer ? `you asked · “${answer.question}”` : "the fire drill"}
      title={title}
      accent={accent}
      takeaway={answer ? <AnswerText segments={answer.segments} /> : drillTakeaway(d)}
      meta={
        <>
          <Provenance n={d.sims} tr={d.tool_result_id} />
          <Chip tone="gold" title="Monte Carlo trajectories written to the database by this drill">
            {d.rows_stored} rows → app.drill_trajectory
          </Chip>
          <Sponsors live={live} keys={["tiger", "model"]} />
        </>
      }
      actions={
        <Action primary onClick={onNext}>
          Find the smallest fix →
        </Action>
      }
    >
      <Stage>{(box) => <DrillStage d={d} box={box} />}</Stage>
    </SceneFrame>
  );
}
