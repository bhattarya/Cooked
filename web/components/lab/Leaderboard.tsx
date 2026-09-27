"use client";

import { CountUp } from "@/components/viz";
import type { ArenaReport, Family, Selection } from "@/lib/arena-types";
import { METRICS, type Board, gainText } from "@/lib/labArena";
import { FAMILIES, FAMILY_BLURB, FAMILY_COLOR, FAMILY_FULL, FAMILY_NAME } from "@/lib/labModel";
import { Segmented } from "./Segmented";
import { Crown } from "./parts";

const VALUE_W = 74;

/**
 * The four families on one bar chart: the same holdout, the same rows, the champion crowned, and a dashed line at
 * what the naive baseline scored. A bar is only "a win" if it clears that line by more than noise.
 */
export function Leaderboard({ board, metricId, onMetric, stage, onStage, arena }: { board: Board; metricId: string; onMetric: (id: string) => void; stage: number; onStage: (s: number) => void; arena: ArenaReport }) {
  const { metric, rows, domain, baseline } = board;
  const span = domain[1] - domain[0] || 1;
  const pos = (v: number) => Math.max(0, Math.min(1, (v - domain[0]) / span)) * 100;
  const zero = pos(0);
  const task = board.task;
  const stages = arena.tasks.risk.split.stages;
  const leak = arena.tasks.risk.card.limitations.find((l) => l.toLowerCase().includes("partly reading"));

  return (
    <div className="flex h-full min-h-0 flex-col gap-[clamp(8px,1.5vh,14px)]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Metric" value={metricId} onChange={onMetric} options={METRICS[task].map((m) => ({ value: m.id, label: m.label, title: m.hint }))} className="min-w-[210px] flex-1 sm:max-w-[290px]" />
        <span className="num inline-flex items-center gap-1 text-[10.5px] text-dim" title={metric.hint}>
          {metric.better === "higher" ? "↑ higher" : "↓ lower"} is better
        </span>
      </div>

      {task === "risk" && (
        <div className="flex items-center gap-2" onPointerDown={(e) => e.stopPropagation()}>
          <span className="label whitespace-nowrap !text-[9.5px]" title="Completed terms before the prediction is made">Terms</span>
          <div role="radiogroup" aria-label="Completed terms" className="flex gap-[3px]">
            {stages.map((s) => (
              <button
                key={s}
                type="button"
                role="radio"
                aria-checked={s === stage}
                onClick={() => onStage(s)}
                className={`num h-[22px] w-[22px] rounded-md border text-[11px] leading-none transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold ${s === stage ? "border-gold/60 bg-gold/15 text-gold-hi" : "border-line text-dim hover:text-muted"}`}
              >
                {s}
              </button>
            ))}
          </div>
          {stage === 0 ? <span className="text-[10px] text-dim">enrollment only</span> : <span className="text-[10px] text-ember">partly reads the answer</span>}
        </div>
      )}

      <div className="relative mb-3">
        <ol className="grid gap-[clamp(4px,1vh,14px)]" aria-label={`${metric.label} on the holdout`}>
          {rows.map((r) => {
            const left = Math.min(zero, pos(r.value));
            const width = Math.abs(pos(r.value) - zero);
            const col = FAMILY_COLOR[r.family];
            return (
              <li key={r.family} title={FAMILY_BLURB[r.family]}>
                <div className="flex items-center gap-2">
                  <i className="size-2.5 shrink-0 rounded-full" style={{ background: r.family === "baseline" ? "transparent" : col, border: r.family === "baseline" ? `1.5px dashed ${col}` : undefined }} />
                  <span className={`text-[13px] ${r.champion ? "font-semibold text-cream" : "text-text"}`}>{FAMILY_FULL[r.family]}</span>
                  {r.champion && (
                    <span className="num inline-flex items-center gap-1 rounded-full border border-gold/50 bg-gold/10 px-1.5 py-[3px] text-[9px] uppercase leading-none tracking-wider text-gold">
                      <Crown size={10} /> champion
                    </span>
                  )}
                  {r.holdoutBest && !r.champion && <span className="num rounded-full border border-line-2 px-1.5 py-[3px] text-[9px] uppercase leading-none tracking-wider text-muted" title="Highest score on the 2023 to 2026 holdout. The champion was fixed earlier, on a validation year, so it stays.">best on holdout</span>}
                  <span className="ml-auto text-[10px] leading-none" style={{ color: r.family === "baseline" ? "var(--dim)" : r.beats ? "var(--cool)" : "var(--ember)" }}>
                    {r.family === "baseline" ? "the yardstick" : r.beats ? "beats baseline" : "not beyond noise"}
                  </span>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <div className="relative h-[11px] flex-1 rounded-full bg-line">
                    <div
                      className="absolute top-0 h-full rounded-full transition-[left,width] duration-700 ease-[cubic-bezier(.16,1,.3,1)]"
                      style={{ left: `${left}%`, width: `${width}%`, minWidth: 2, background: r.champion ? "linear-gradient(90deg, var(--gold-lo), var(--gold), var(--gold-hi))" : col, opacity: r.champion ? 1 : 0.85, boxShadow: r.champion ? "0 0 18px rgba(246,180,26,.5)" : undefined }}
                    />
                  </div>
                  <CountUp value={r.value} format={metric.format} duration={600} className={`num text-right text-[14px] ${r.champion ? "text-gold-hi" : "text-text"}`} style={{ width: VALUE_W }} />
                </div>
              </li>
            );
          })}
        </ol>
        {/* the baseline yardstick across every bar */}
        <div className="pointer-events-none absolute inset-y-[-6px] left-0" style={{ right: VALUE_W + 8 }} aria-hidden="true">
          <div className="absolute inset-y-0 border-l border-dashed border-cream/60 transition-[left] duration-700 ease-[cubic-bezier(.16,1,.3,1)]" style={{ left: `${pos(baseline)}%` }}>
            <span className="num absolute -bottom-1 left-1 translate-y-full whitespace-nowrap text-[9px] uppercase tracking-wider text-cream/80">baseline</span>
          </div>
          {zero > 0 && <div className="absolute inset-y-0 border-l border-line-2" style={{ left: `${zero}%` }} />}
        </div>
      </div>

      <Verdict board={board} />
      <Ladder selection={arena.tasks[task].selection} champion={board.champion} testYears={arena.protocol.test_years} />
      {task === "risk" && stage > 0 && leak && <p className="text-[10.5px] leading-snug text-ember">{leak}</p>}
    </div>
  );
}

/** The one-sentence verdict, from the arena's own bootstrap intervals. */
function Verdict({ board }: { board: Board }) {
  const champ = board.rows.find((r) => r.champion);
  const learned = board.rows.filter((r) => r.family !== "baseline");
  const best = learned.filter((r) => r.gain).sort((a, b) => (b.gain?.delta ?? 0) - (a.gain?.delta ?? 0))[0];
  const gain = champ?.gain ?? best?.gain;
  const who = champ && champ.family !== "baseline" ? champ : best;
  if (board.nobodyBeatsBaseline) {
    return (
      <div className="rounded-xl border border-gold/35 bg-gold/[.06] px-3 py-2">
        <div className="display text-[clamp(1.25rem,3vh,2rem)] font-extrabold leading-none text-gold-hi">No model beat base rates</div>
        <p className="mt-1 text-[11px] leading-snug text-muted">
          The naive baseline stays champion. Best challenger: {best ? FAMILY_NAME[best.family] : "none"}{gain ? `, ${gainText(board.task, gain)}` : ""}. No challenger&apos;s 95% interval clears zero.
        </p>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-cool/30 bg-cool/[.05] px-3 py-2">
      <div className="display text-[clamp(1.25rem,3vh,2rem)] font-extrabold leading-none text-cream">
        {who ? FAMILY_NAME[who.family] : "Champion"} <span className="text-cool">beats the baseline</span>
      </div>
      {gain && who && <p className="num mt-1 text-[10.5px] leading-snug text-muted">{gainText(board.task, gain)}</p>}
    </div>
  );
}

/** The pre-registered selection rule as a picture: validation scores, who is within tolerance, who won. */
function Ladder({ selection, champion, testYears }: { selection: Selection; champion: Family; testYears: [number, number] }) {
  const tol = Math.round(selection.tolerance_relative * 100);
  const v = selection.validation_years;
  return (
    <div className="mt-auto">
      <div className="flex items-baseline justify-between gap-2">
        <span className="label !text-[9.5px] !tracking-[0.1em]">How the champion was chosen</span>
        <span className="num text-[9.5px] text-dim">before scoring {testYears[0]}{"–"}{testYears[1]}</span>
      </div>
      <ol className="relative mt-3 grid grid-cols-4" aria-label="Validation scores in order of complexity">
        <span className="absolute left-[12.5%] right-[12.5%] top-[9px] h-px bg-line-2" aria-hidden="true" />
        {FAMILIES.map((f) => {
          const ok = selection.eligible.includes(f);
          const won = f === champion;
          return (
            <li key={f} className="relative flex flex-col items-center gap-1 text-center">
              <span
                className="relative grid size-[19px] place-items-center rounded-full border-2 bg-panel"
                style={{ borderColor: won ? "var(--gold-hi)" : ok ? FAMILY_COLOR[f] : "var(--line-2)", boxShadow: won ? "0 0 12px rgba(246,180,26,.6)" : undefined }}
              >
                <i className="size-[7px] rounded-full" style={{ background: ok ? (f === "baseline" ? "transparent" : FAMILY_COLOR[f]) : "var(--dim)", opacity: ok ? 1 : 0.5 }} />
                {won && <Crown size={11} className="absolute -top-[14px] text-gold" />}
              </span>
              <span className="text-[10px] leading-none" style={{ color: ok ? "var(--text)" : "var(--dim)" }}>{FAMILY_NAME[f]}</span>
              <span className="num text-[9.5px] leading-none text-dim">{selection.scores[f].toLocaleString("en-US", { maximumFractionDigits: selection.scores[f] > 100 ? 0 : 3 })}</span>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-[10px] leading-snug text-dim [@media(max-height:800px)]:hidden">
        Fitted on the years before {v[0]}, scored on {v[0] === v[1] ? v[0] : `${v[0]}–${v[1]}`}. The simplest family within {tol}% of the best wins. {selection.metric}. The holdout is never consulted.
      </p>
    </div>
  );
}
