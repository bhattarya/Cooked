"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { Donut, Sparkline } from "@/components/viz";
import { ThinkingChip } from "@/components/theatre";
import type { ArenaReport, CareerTask, SalaryTask, TaskId, YearRange } from "@/lib/arena-types";
import { CAREER_CLASSES, CAREER_COLOR, FAMILY_FULL, FAMILY_NAME, TASKS, usdK } from "@/lib/labModel";
import { RAIL_GUTTER, SceneTitle, Tag } from "./frame";
import { Crown } from "./parts";

type Tone = "cool" | "gold" | "ember";

/** The verdict, worded from the arena's own flags: a champion that is the baseline is a headline, not a footnote. */
export function verdictOf(arena: ArenaReport, task: TaskId): { tone: Tone; headline: string; short: string } {
  const c = arena.tasks[task].champion;
  if (c.family === "baseline") return { tone: "gold", headline: "No model beat base rates", short: "Base rates ship" };
  if (c.beats_baseline) return { tone: "cool", headline: `${FAMILY_NAME[c.family]} beats the baseline`, short: `${FAMILY_NAME[c.family]} beats baseline` };
  return { tone: "ember", headline: "Not beyond noise", short: "Not beyond noise" };
}

const TONE: Record<Tone, string> = { cool: "var(--cool)", gold: "var(--gold)", ember: "var(--ember)" };

export function CardsScene({ arena, error, onRetry }: { arena: ArenaReport | null; error: string | null; onRetry: () => void }) {
  const [task, setTask] = useState<TaskId>("risk");
  if (!arena) {
    return (
      <div className={`grid h-full place-items-center px-6 ${RAIL_GUTTER}`}>
        <div className="text-center">
          <ThinkingChip state={error ? "breathing" : "searching"} label={error ? "The model cards did not load" : "Opening the model cards"} />
          {error && (
            <button type="button" onClick={onRetry} className="mt-3 block rounded-full border border-gold/40 px-4 py-1.5 text-xs text-gold hover:bg-gold/10">
              Try again
            </button>
          )}
        </div>
      </div>
    );
  }
  return (
    <section className={`grid h-full min-h-0 grid-cols-1 gap-4 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] lg:gap-7 lg:overflow-hidden lg:pb-2 lg:pr-6 ${RAIL_GUTTER}`}>
      <div className="flex min-h-0 flex-col justify-center gap-[clamp(10px,2.2vh,20px)]">
        <SceneTitle kicker="Model cards" title="How far to" accent="trust it" />
        <ul className="grid gap-2" aria-label="Tasks">
          {TASKS.map((t) => {
            const v = verdictOf(arena, t.id);
            const on = t.id === task;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setTask(t.id)}
                  aria-pressed={on}
                  className="group relative w-full rounded-xl border px-3.5 py-[clamp(7px,1.5vh,12px)] text-left transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold"
                  style={{ borderColor: on ? "color-mix(in srgb, var(--gold) 55%, transparent)" : "var(--line)", background: on ? "linear-gradient(180deg, rgba(246,180,26,.1), rgba(246,180,26,.03))" : "transparent" }}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="label !text-[10px]" style={{ color: on ? "var(--gold)" : undefined }}>{t.label}</span>
                    <span className="num text-[10px]" style={{ color: TONE[v.tone] }}>
                      {v.tone === "cool" ? "✓" : v.tone === "gold" ? "○" : "±"} {v.tone === "gold" ? "base rates" : v.tone === "cool" ? "beats baseline" : "noise"}
                    </span>
                  </span>
                  <span className="display mt-1 block text-[clamp(1.1rem,2.8vh,1.5rem)] font-bold leading-none" style={{ color: on ? "var(--cream)" : "var(--text)" }}>
                    {v.headline}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <div className="panel relative min-h-[420px] min-w-0 overflow-hidden lg:min-h-0">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={task} className="absolute inset-0 flex flex-col overflow-hidden p-[clamp(14px,2.4vh,24px)]" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}>
            <Card arena={arena} task={task} />
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}

function Card({ arena, task }: { arena: ArenaReport; task: TaskId }) {
  const t = arena.tasks[task];
  const card = t.card;
  const v = verdictOf(arena, task);
  const champ = t.champion;
  const trained = card.trained_on;
  const split = t.split;
  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <span className="label !text-gold">{card.name}</span>
          <Tag tone={v.tone === "cool" ? "cool" : v.tone === "gold" ? "gold" : "ember"}>
            {champ.family !== "baseline" && <Crown size={11} />}
            champion: {FAMILY_FULL[champ.family]}
          </Tag>
          {champ.beats_linear === true && <Tag tone="cool">also beats the linear model</Tag>}
          {champ.holdout_best_family !== champ.family && <Tag title="Fixed on the validation year, before the holdout was opened">holdout best: {FAMILY_NAME[champ.holdout_best_family]}</Tag>}
        </div>
        <h3 className="display mt-2 text-[clamp(1.9rem,5.6vh,3.6rem)] font-extrabold leading-[0.9]" style={{ color: v.tone === "cool" ? "var(--cream)" : TONE[v.tone] }}>
          {v.headline}
        </h3>
        <p className="serif mt-2 max-w-3xl text-[clamp(0.98rem,2.15vh,1.2rem)] leading-snug text-muted">{champ.note}</p>
      </header>

      <div className="mt-[clamp(10px,2vh,18px)] grid gap-[clamp(14px,2.6vh,24px)] lg:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-[clamp(10px,1.9vh,16px)]">
          <Block title="What it predicts">
            <p className="text-[clamp(11.5px,1.6vh,13.5px)] leading-snug text-text">{card.predicts}</p>
          </Block>
          <Block title="Trained and tested on">
            <p className="num text-[11.5px] leading-snug text-muted">
              <span className="text-cream">{trained.rows_train.toLocaleString("en-US")}</span> alumni {trained.train_years[0]}{"–"}{trained.train_years[1]}
              {" · "}
              tested once on <span className="text-cream">{trained.rows_test.toLocaleString("en-US")}</span> from {trained.test_years[0]}{"–"}{trained.test_years[1]}
            </p>
            <YearSplit split={split} />
          </Block>
          {task === "career" ? <Baseline t={t as CareerTask} /> : <Features features={card.features} salary={task === "salary" ? (t as SalaryTask) : null} />}
        </div>
        <div className="flex min-w-0 flex-col gap-[clamp(10px,1.9vh,16px)]">
          <Block title="Where it falls short">
            <ul className="grid gap-1.5">
              {card.limitations.map((l) => (
                <li key={l} className="flex gap-2 text-[clamp(11px,1.5vh,12.5px)] leading-snug text-muted">
                  <span aria-hidden="true" className="mt-[7px] size-1 shrink-0 rounded-full bg-ember" />
                  {l}
                </li>
              ))}
            </ul>
          </Block>
          <Block title="Do not use it for" tone="hot">
            <ul className="grid gap-1.5">
              {card.should_not_be_used_for.map((l) => (
                <li key={l} className="flex gap-2 text-[clamp(11px,1.5vh,12.5px)] leading-snug text-muted">
                  <span aria-hidden="true" className="num shrink-0 text-hot">{"✕"}</span>
                  {l}
                </li>
              ))}
            </ul>
          </Block>
        </div>
      </div>
      </div>
      <footer className="shrink-0 border-t border-line pt-2 text-[10.5px] leading-snug text-dim">
        {arena.dataset.disclaimer} Associational, not causal: nothing here shows that changing an input changes an outcome.
      </footer>
    </>
  );
}

function Block({ title, tone, children }: { title: string; tone?: "hot"; children: ReactNode }) {
  return (
    <div>
      <div className="label !text-[9.5px] !tracking-[0.12em]" style={{ color: tone === "hot" ? "var(--hot)" : undefined }}>
        {title}
      </div>
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ year split */

function span([a, b]: YearRange): number[] {
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

/** The temporal split as a picture: which graduating classes fitted, chose, calibrated and judged the models. */
function YearSplit({ split }: { split: ArenaReport["tasks"][TaskId]["split"] }) {
  const first = split.fit_years[0];
  const last = split.test_years[1];
  const years = span([first, last]);
  const inR = (y: number, r: YearRange | null) => !!r && y >= r[0] && y <= r[1];
  type Row = { label: string; cells: { on: boolean; color: string; name: string }[] };
  const pick: Row = {
    label: "Choosing the champion",
    cells: years.map((y) => (inR(y, split.fit_years) ? { on: true, color: "var(--gold-lo)", name: "fit" } : inR(y, split.validation_years) ? { on: true, color: "var(--viz-3)", name: "validation" } : { on: false, color: "", name: "" })),
  };
  const final: Row = {
    label: "Final model",
    cells: years.map((y) => (inR(y, split.calibration_years) ? { on: true, color: "var(--viz-4)", name: "calibration" } : inR(y, split.train_years) ? { on: true, color: "var(--gold)", name: "fit" } : inR(y, split.test_years) ? { on: true, color: "var(--cream)", name: "holdout" } : { on: false, color: "", name: "" })),
  };
  return (
    <div className="mt-2" role="img" aria-label={`Years ${first} to ${last}. Champion chosen by fitting ${split.fit_years[0]} to ${split.fit_years[1]} and validating ${split.validation_years[0]}. Final model fitted ${split.train_years[0]} to ${split.train_years[1]}, scored once on ${split.test_years[0]} to ${split.test_years[1]}.`}>
      {[pick, final].map((row) => (
        <div key={row.label} className="mb-1 grid grid-cols-[112px_1fr] items-center gap-2">
          <span className="text-[9.5px] leading-none text-dim">{row.label}</span>
          <span className="grid gap-[2px]" style={{ gridTemplateColumns: `repeat(${years.length}, 1fr)` }}>
            {row.cells.map((c, i) => (
              <i key={years[i]} title={c.on ? `${years[i]} · ${c.name}` : String(years[i])} className="block h-[9px] rounded-[2px]" style={{ background: c.on ? c.color : "var(--line)", opacity: c.on ? 0.95 : 1 }} />
            ))}
          </span>
        </div>
      ))}
      <div className="grid grid-cols-[112px_1fr] gap-2">
        <span />
        <span className="num flex justify-between text-[9px] text-dim">
          <span>{first}</span>
          <span>{last}</span>
        </span>
      </div>
      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[9.5px] text-dim">
        {[
          ["var(--gold)", "fit"],
          ["var(--viz-3)", "validate"],
          ["var(--viz-4)", "calibrate"],
          ["var(--cream)", "holdout"],
        ].map(([c, n]) => (
          <span key={n} className="inline-flex items-center gap-1">
            <i className="inline-block size-[7px] rounded-[2px]" style={{ background: c }} />
            {n}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------- task extras */

function Features({ features, salary }: { features: { name: string; label: string }[]; salary: SalaryTask | null }) {
  const byYear = salary ? Object.entries(salary.card.trained_on.median_salary_by_year).sort(([a], [b]) => Number(a) - Number(b)) : [];
  return (
    <Block title={`Reads ${features.length} inputs`}>
      <p className="line-clamp-2 text-[11px] leading-relaxed text-muted" title={features.map((f) => f.label).join(", ")}>
        {features.map((f) => f.label).join(" · ")}
      </p>
      {byYear.length > 1 && (
        <div className="mt-2 flex items-center gap-3 [@media(max-height:800px)]:hidden">
          <Sparkline data={byYear.map(([, v]) => v)} width={120} height={30} color="var(--gold)" kind="line" area format={usdK} label="Median first salary by graduating class, nominal dollars" />
          <p className="text-[10.5px] leading-snug text-muted">
            Median first salary by class: <span className="num text-cream">{usdK(byYear[0][1])}</span> in {byYear[0][0]} to <span className="num text-cream">{usdK(byYear[byYear.length - 1][1])}</span> in {byYear[byYear.length - 1][0]}. Nominal dollars drifted up, so the model runs low on later classes.
          </p>
        </div>
      )}
    </Block>
  );
}

function Baseline({ t }: { t: CareerTask }) {
  const tr = t.card.trained_on;
  const data = CAREER_CLASSES.map((c) => ({ key: c, label: c, value: tr.class_counts[c], color: CAREER_COLOR[c] }));
  return (
    <Block title="What actually ships: class frequencies">
      <div className="grid grid-cols-[104px_1fr] items-center gap-3">
        <Donut data={data} height={104} thickness={0.32} labels="none" legend={false} centerValue={Math.round((tr.class_counts.Employed / data.reduce((a, d) => a + d.value, 0)) * 100)} centerFormat={(v) => `${Math.round(v)}%`} centerLabel="Employed" unit="alumni" label="Share of answered alumni by first destination in the training years." />
        <ul className="grid gap-1 text-[11px] leading-none">
          {data.map((d) => (
            <li key={d.key} className="flex items-center gap-2 text-muted">
              <i className="size-2 rounded-full" style={{ background: d.color }} />
              <span className="flex-1 truncate">{d.label}</span>
              <span className="num text-text">{d.value.toLocaleString("en-US")}</span>
            </li>
          ))}
          <li className="mt-1 text-[10px] leading-snug text-dim">
            Excluded, never counted as an outcome: No Response {tr.no_response_excluded.toLocaleString("en-US")} (unknown), Military {tr.military_excluded}.
          </li>
        </ul>
      </div>
    </Block>
  );
}
