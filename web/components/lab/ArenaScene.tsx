"use client";

import { AnimatePresence, motion } from "motion/react";
import { useMemo } from "react";
import { Bars, useChartSize } from "@/components/viz";
import { ThinkingChip } from "@/components/theatre";
import type { ArenaReport, TaskId } from "@/lib/arena-types";
import { board, featureName, importanceRows, protocol } from "@/lib/labArena";
import { FAMILY_COLOR, FAMILY_FULL, TASKS, dec3, usd } from "@/lib/labModel";
import { Evidence } from "./Evidence";
import { RAIL_GUTTER, Tag } from "./frame";
import { Leaderboard } from "./Leaderboard";
import { Segmented } from "./Segmented";

const IMP_FMT: Record<TaskId, (v: number) => string> = {
  risk: dec3,
  time_to_degree: (v) => `${v.toFixed(2)} y`,
  career: dec3,
  salary: (v) => usd(v),
};

export interface ArenaSceneProps {
  arena: ArenaReport | null;
  error: string | null;
  onRetry: () => void;
  task: TaskId;
  onTask: (t: TaskId) => void;
  metricId: string;
  onMetric: (id: string) => void;
  stage: number;
  onStage: (s: number) => void;
}

/** The leaderboard: every family on the same holdout, and the evidence behind each verdict. */
export function ArenaScene({ arena, error, onRetry, task, onTask, metricId, onMetric, stage, onStage }: ArenaSceneProps) {
  if (!arena) {
    return (
      <div className={`grid h-full place-items-center px-6 ${RAIL_GUTTER}`}>
        <div className="text-center">
          <ThinkingChip state={error ? "breathing" : "searching"} label={error ? "The arena report did not load" : "Opening the arena report"} />
          {error && (
            <>
              <p className="mt-3 text-sm text-muted">{error}</p>
              <button type="button" onClick={onRetry} className="mt-3 rounded-full border border-gold/40 px-4 py-1.5 text-xs text-gold hover:bg-gold/10">
                Try again
              </button>
            </>
          )}
        </div>
      </div>
    );
  }
  const b = board(arena, task, metricId, stage);
  const pr = protocol(arena, task, stage);
  const sel = arena.tasks[task].selection;

  return (
    <section className={`flex h-full min-h-0 flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3 sm:px-6 lg:overflow-hidden lg:pb-2 lg:pr-6 ${RAIL_GUTTER}`}>
      <header className="flex shrink-0 flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <div className="label !text-gold">The arena</div>
          <h2 className="display mt-1.5 text-[clamp(2rem,5.6vh,3.1rem)] font-extrabold leading-[0.9]">
            Four models. <span className="text-gold-grad">One holdout.</span>
          </h2>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:items-end">
          <Segmented label="Task" value={task} onChange={onTask} options={TASKS.map((t) => ({ value: t.id, label: t.label }))} className="w-full min-w-[300px] sm:w-[440px]" />
          <div className="flex flex-wrap gap-1.5 sm:justify-end">
            <Tag title="Rows every family was fitted on (the stage shown for the risk and timeline tasks)">fit n={pr.nTrain.toLocaleString("en-US")}</Tag>
            <Tag title="Rows every family was scored on, once">test n={pr.nTest.toLocaleString("en-US")}</Tag>
            <Tag tone="gold" title="Graduating classes held out of training and champion selection">
              holdout {pr.testYears[0]}
              {"\u2013"}
              {pr.testYears[1]}
            </Tag>
            <Tag title={arena.dataset.disclaimer}>synthetic data</Tag>
          </div>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.2fr)_minmax(0,0.9fr)]">
        <Card>
          <Leaderboard board={b} metricId={b.metric.id} onMetric={onMetric} stage={stage} onStage={onStage} arena={arena} />
        </Card>
        <Card>
          <Evidence key={task} arena={arena} task={task} stage={stage} />
        </Card>
        <Card>
          <Importance arena={arena} task={task} stage={stage} />
        </Card>
      </div>
      <p className="sr-only">
        Champion selection rule, fixed before scoring: {sel.rule} Tolerance {Math.round(sel.tolerance_relative * 100)} percent on {sel.metric}. Champion: {FAMILY_FULL[sel.champion]}.
      </p>
    </section>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return <div className="panel relative flex min-h-[360px] min-w-0 flex-col overflow-hidden p-3 lg:min-h-0">{children}</div>;
}

function Importance({ arena, task, stage }: { arena: ArenaReport; task: TaskId; stage: number }) {
  const imp = arena.tasks[task].importance;
  const rows = useMemo(() => importanceRows(arena, task, stage), [arena, task, stage]);
  const [ref, box] = useChartSize<HTMLDivElement>("fill");
  const fmt = IMP_FMT[task];
  const data = rows.map((f) => ({ key: f.feature, label: featureName(f), value: Math.max(0, f.importance), lo: Math.max(0, f.importance - f.std), hi: f.importance + f.std, color: FAMILY_COLOR[imp.family] }));
  const height = Math.min(8, Math.max(1, data.length)) * 52 + 30;
  const lead = rows[0];
  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      <div>
        <h3 className="serif text-[clamp(1.05rem,2.5vh,1.35rem)] leading-tight text-cream">What it leaned on</h3>
        <p className="mt-0.5 text-[10.5px] leading-snug text-dim">
          <span style={{ color: FAMILY_COLOR[imp.family] }}>{FAMILY_FULL[imp.family]}</span> {"·"} {imp.metric}. Bars show {"±"}1 std over repeats.
        </p>
      </div>
      <div ref={ref} className="relative min-h-0 flex-1 overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${task}-${task === "risk" ? stage : 0}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22 }}>
            {data.length > 0 ? (
              <Bars data={data} format={fmt} axisFormat={fmt} unit="importance" labels="all" height={Math.min(height, Math.max(120, box.height))} intervalLabel="±1 std" label={`Permutation importance for the ${task.replace(/_/g, " ")} task: ${data.map((d) => `${d.label} ${fmt(d.value)}`).join(", ")}.`} />
            ) : (
              <p className="pt-6 text-center text-sm text-muted">No input varies at this stage, so nothing can be shuffled.</p>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      {lead && (
        <p className="text-[11.5px] leading-snug text-text">
          Biggest lever: <span className="text-cream">{featureName(lead)}</span>. Shuffling it hurts the score by <span className="num">{fmt(lead.importance)}</span>.
        </p>
      )}
      <p className="text-[10.5px] leading-snug text-muted">{imp.note}</p>
    </div>
  );
}
