"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { SceneDeck, useSceneDeck } from "@/components/scenes";
import type { ModelLabScenario, SimulateResponse, TaskId } from "@/lib/arena-types";
import { fieldSpec, type ScenarioField } from "@/lib/commands";
import { METRICS } from "@/lib/labArena";
import { appliedMessage, careerTop, headline, narration, pct0, usdK, type LabField } from "@/lib/labModel";
import type { SessionUser } from "@/lib/session";
import { useVoiceScreen } from "@/lib/voiceAgent";
import { ArenaScene } from "../lab/ArenaScene";
import { CardsScene } from "../lab/CardsScene";
import { ConstellationScene } from "../lab/ConstellationScene";
import { ControlRoom } from "../lab/ControlRoom";
import { DECK_CLASS } from "../lab/frame";
import { useNarrator } from "../lab/Narrate";
import { useArena } from "../lab/useArena";
import { useLabSim, type Baseline, type LabSim } from "../lab/useLabSim";
import { screenContext, sceneSentence, type LabScene, type LabView } from "../lab/voiceText";
import { useStudio, useStudioIntent } from "../studio/context";

const SCENES: { id: LabScene; label: string }[] = [
  { id: "lab", label: "Shape a future" },
  { id: "constellation", label: "Constellation" },
  { id: "arena", label: "Arena" },
  { id: "cards", label: "Model cards" },
];
// the Studio's scene ids for this chapter
const SCENE_ALIAS: Record<string, LabScene> = { models: "lab", lab: "lab", control: "lab", constellation: "constellation", arena: "arena", cards: "cards" };
const FIRST_METRIC = Object.fromEntries((Object.keys(METRICS) as TaskId[]).map((t) => [t, METRICS[t][0].id])) as Record<TaskId, string>;

/** Models chapter: shape a scenario (starting from the student's own audit when one is loaded), watch four models answer, see how far to trust them. */
export function ModelsChapter({ user }: { user: SessionUser }) {
  const { student } = useStudio();
  // a different student is a different starting point: remount so the sliders re-seed cleanly
  return <Lab key={student?.id ?? "none"} user={user} studentId={student?.id ?? null} />;
}

// ------------------------------------------------------------------ what-if language

const NUM_WORDS: Record<string, number> = { a: 1, an: 1, one: 1, another: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, zero: 0, no: 0, none: 0 };
const NUM = "(\\d+(?:\\.\\d+)?|a|an|one|another|two|three|four|five|six|seven|eight|nine|ten|zero|no|none)";
const num = (w: string) => (/^\d/.test(w) ? Number(w) : (NUM_WORDS[w] ?? NaN));

interface Change {
  field: LabField;
  value: number | string;
}

/** "one more internship", "worked 30 hours", "took 15 credits", "transfer student" -> validated field changes. Unknown phrasing yields nothing. */
export function parseWhatIf(text: string, now: ModelLabScenario): Change[] {
  const q = text.toLowerCase();
  const out: Change[] = [];
  const add = (field: LabField, value: number | string) => {
    if (!out.some((c) => c.field === field)) out.push({ field, value });
  };
  const rel = (re: RegExp, field: LabField) => {
    const m = re.exec(q);
    if (m) add(field, (now[field] as number) + num(m[1]));
  };
  const abs = (re: RegExp, field: LabField) => {
    const m = re.exec(q);
    if (m && !Number.isNaN(num(m[1]))) add(field, num(m[1]));
  };
  rel(new RegExp(`${NUM}\\s+more\\s+internships?`), "internship_count");
  rel(new RegExp(`${NUM}\\s+more\\s+(?:credentials?|certifications?)`), "credential_count");
  rel(new RegExp(`${NUM}\\s+more\\s+(?:withdrawals?)`), "withdrawals");
  rel(new RegExp(`${NUM}\\s+more\\s+(?:failures?|failed)`), "failures");
  if (/no internships?|without (?:an? )?internships?/.test(q)) add("internship_count", 0);
  abs(new RegExp(`(?:with|had|have|do|did)\\s+${NUM}\\s+internships?`), "internship_count");
  abs(new RegExp(`${NUM}\\s+credentials?`), "credential_count");
  abs(new RegExp(`(?:work(?:ed|ing)?|job)[^0-9a-z]*(?:for |about |around )?${NUM}\\s*(?:hours?|hrs?|h)\\b`), "work_hours");
  abs(new RegExp(`${NUM}\\s*(?:work )?(?:hours?|hrs?)\\s*(?:a|per|/)\\s*week`), "work_hours");
  if (/stop(?:ped)? working|quit my job|not work|don'?t work|no job/.test(q)) add("work_hours", 0);
  abs(new RegExp(`(?:took|take|taking|load of|carry|carrying)\\s+${NUM}\\s+credits?`), "credits_per_term");
  abs(new RegExp(`${NUM}\\s+credits?\\s+(?:a|per|each)\\s+(?:term|semester)`), "credits_per_term");
  abs(new RegExp(`${NUM}\\s+(?:withdrawals?|withdrew)`), "withdrawals");
  abs(new RegExp(`(?:failed|fail)\\s+${NUM}`), "failures");
  abs(new RegExp(`${NUM}\\s+(?:failures?|failed courses?)`), "failures");
  abs(new RegExp(`${NUM}\\s+(?:enrollment )?(?:gaps?|stop-?outs?)`), "enrollment_gaps");
  abs(new RegExp(`${NUM}\\s+(?:terms?|semesters?)\\s+(?:done|completed|in)`), "completed_terms");
  if (/\btransfer\b/.test(q)) add("entry_type", "Transfer");
  if (/freshman|first[- ]time/.test(q)) add("entry_type", "First-Time Freshman");
  if (/out[- ]of[- ]state/.test(q)) add("residency", "Out-of-State");
  if (/in[- ]state/.test(q)) add("residency", "In-State");
  if (/information systems|\binfo(?:rmation)? sys/.test(q)) add("major", "Information Systems");
  if (/computer science|\bcs\b/.test(q)) add("major", "Computer Science");
  return out;
}

/** Numbers only from the two responses: what changed against where the student started. */
function compareText(base: Baseline | null, r: SimulateResponse, label: string): string {
  if (!base) return "";
  const d = Math.round((r.risk - base.risk) * 100);
  const dir = d === 0 ? "unchanged" : d > 0 ? `up ${d} points` : `down ${Math.abs(d)} points`;
  return `Against ${label}: risk ${pct0(base.risk)} to ${pct0(r.risk)} (${dir}); median time to degree ${base.time_to_degree.mid.toFixed(1)} to ${r.time_to_degree.mid.toFixed(1)} years; first salary median ${usdK(base.salary.mid)} to ${usdK(r.salary.mid)}.`;
}
const baseLabel = (sim: LabSim) => (sim.seed.kind === "audit" ? "you today, from the audit" : "the default scenario");

const CAVEAT = "Career odds are base rates that do not move with these inputs, and the salary model runs low. Synthetic data, associations not promises.";

function clampValue(field: LabField, value: number | string): number | string {
  const spec = fieldSpec(field as ScenarioField);
  if (typeof value === "number" && spec && typeof spec.min === "number" && typeof spec.max === "number") return Math.min(spec.max, Math.max(spec.min, value));
  return value;
}

// ------------------------------------------------------------------ the chapter

function Lab({ studentId }: { user: SessionUser; studentId: string | null }) {
  const sim = useLabSim(studentId);
  const { arena, error: arenaError, retry: retryArena } = useArena();
  const deck = useSceneDeck(SCENES);
  const { dispatch, student } = useStudio();

  const [task, setTask] = useState<TaskId>("risk");
  const [metrics, setMetrics] = useState(FIRST_METRIC);
  const [stage, setStage] = useState(0);
  const metricId = metrics[task];

  const script = useMemo(() => (sim.result ? narration(sim.result, arena) : null), [sim.result, arena]);
  const narrator = useNarrator(script);

  const scene = (deck.id ?? "lab") as LabScene;
  const view: LabView = { sim, arena, task, metricId, stage };
  const openArena = (t: TaskId) => {
    setTask(t);
    deck.go("arena");
  };
  const where = () => (sim.seed.kind === "audit" ? ` Sliders started from the student's audit (${sim.seed.terms ?? "some"} terms read).` : sim.seed.kind === "fallback" ? ` These are the default scenario's numbers, not the student's: ${sim.seed.note}.` : " No audit is loaded, so this is the default scenario.");

  const move = (by: 1 | -1) => {
    const target = SCENES[deck.index + by];
    if (!target) return by > 0 ? "That is the last models scene, the model cards. Say previous to go back." : "That is the first models scene, Shape a future. Say next to move on.";
    deck.go(deck.index + by);
    return `${target.label}. ${sceneSentence(target.id, view)}`;
  };

  const ready = async (): Promise<SimulateResponse | null> => sim.result;

  useStudioIntent("models", async (i) => {
    if (i.kind === "next" || i.kind === "previous") return move(i.kind === "next" ? 1 : -1);
    if (i.kind === "describe") {
      const r = await ready();
      return `${sceneSentence(scene, view)}${where()}${r && sim.changed ? ` ${compareText(sim.baseline, r, baseLabel(sim))}` : ""}`;
    }
    if (i.kind === "scene") {
      const to = SCENE_ALIAS[i.scene];
      if (!to) return `The models chapter has four scenes: models (the control room), constellation, arena and cards. There is no "${i.scene}" here.`;
      deck.go(to);
      return sceneSentence(to, view);
    }
    if (i.kind === "scenario") {
      const field = i.field as LabField;
      const spec = fieldSpec(field as ScenarioField);
      if (!spec) return `${i.field} is not something the models take. The inputs are major, entry type, residency, work hours, completed terms, credits per term, credits earned, withdrawals, failures, enrollment gaps, internships, credentials and campus engagement.`;
      const value = clampValue(field, i.value);
      const r = await sim.apply(field, value);
      if (scene === "arena" || scene === "cards") deck.go("lab");
      return `${appliedMessage(field, value, r)} ${compareText(sim.baseline, r, baseLabel(sim))} ${CAVEAT}`.trim();
    }
    if (i.kind === "ask") {
      const changes = parseWhatIf(i.question, sim.scenario);
      if (changes.length) {
        let r: SimulateResponse | null = null;
        const done: string[] = [];
        for (const c of changes) {
          r = await sim.apply(c.field, clampValue(c.field, c.value));
          done.push(`${fieldSpec(c.field as ScenarioField)?.label ?? c.field} set to ${clampValue(c.field, c.value)}`);
        }
        deck.go("lab");
        const top = careerTop(r as SimulateResponse);
        return `What-if applied: ${done.join(", ")}. ${headline(r as SimulateResponse)} ${compareText(sim.baseline, r as SimulateResponse, baseLabel(sim))} Career stays at base rates, ${pct0(top.probability)} ${top.label.toLowerCase()}. ${CAVEAT}`;
      }
      const r = await ready();
      if (!r) return "The four models are still answering. Ask again in a moment.";
      return `I did not find a change to apply in that, so here is where the models stand. ${headline(r)} ${sim.changed ? compareText(sim.baseline, r, baseLabel(sim)) : ""}${where()} You can say things like: what if I had one more internship, worked 30 hours, or took 15 credits. ${CAVEAT}`;
    }
    return "That does not apply to the models screen.";
  });

  useVoiceScreen(
    sim.result && !sim.pending
      ? (() => {
          const ctx = screenContext(scene, view);
          const b = sim.baseline;
          return {
            ...ctx,
            summary: `${ctx.summary}${where()}${sim.changed ? ` ${compareText(b, sim.result, baseLabel(sim))}` : ""}`,
            facts: { ...ctx.facts, started_from: sim.seed.kind, ...(b ? { baseline_risk_percent: Math.round(b.risk * 100), baseline_time_to_degree_years: b.time_to_degree.mid, baseline_first_salary_median_usd: b.salary.mid } : {}) },
            student: !!student,
          };
        })()
      : null,
  );

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ ["--heat-level" as string]: sim.result?.risk ?? 0 }}>
      <SeedStrip sim={sim} onLoadAudit={() => void dispatch({ chapter: "audit", kind: "scene", scene: "home" })} deckId={deck.id} onGo={(i) => deck.go(i)} />
      <SceneDeck
        deck={deck}
        className={DECK_CLASS}
        render={(id) =>
          id === "lab" ? (
            <ControlRoom sim={sim} arena={arena} narrator={narrator} onOpenArena={openArena} />
          ) : id === "constellation" ? (
            <ConstellationScene sim={sim} arena={arena} />
          ) : id === "arena" ? (
            <ArenaScene arena={arena} error={arenaError} onRetry={retryArena} task={task} onTask={setTask} metricId={metricId} onMetric={(m) => setMetrics((all) => ({ ...all, [task]: m }))} stage={stage} onStage={setStage} />
          ) : (
            <CardsScene arena={arena} error={arenaError} onRetry={retryArena} />
          )
        }
      />
    </div>
  );
}

/** Where the sliders started, and "you today" against "what-if" (baseline vs modified). */
function SeedStrip({ sim, onLoadAudit, deckId, onGo }: { sim: LabSim; onLoadAudit: () => void; deckId?: string; onGo: (i: number) => void }) {
  const r = sim.result;
  const b = sim.baseline;
  const cmp = r && b && sim.changed;
  const cell = (label: string, a: string, w: string) => (
    <span className="num inline-flex items-baseline gap-1.5 text-[11px] text-dim">
      {label}
      <span className="text-muted">{a}</span>
      <span aria-hidden>{"→"}</span>
      <span className="text-cream">{w}</span>
    </span>
  );
  return (
    <div className="relative z-30 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line-2 px-4 py-1.5 lg:pl-[104px] lg:pr-6" role="status">
      {sim.seed.kind === "audit" ? (
        <span className="num text-[11px] text-gold">
          Starting from your audit {"·"} {sim.seed.terms ?? "…"} terms read
        </span>
      ) : sim.seed.kind === "fallback" ? (
        <span className="num text-[11px] text-ember" title={sim.seed.note}>
          Default scenario {"·"} your audit could not seed the models ({sim.seed.note})
        </span>
      ) : (
        <span className="num text-[11px] text-dim">
          Default scenario {"·"}{" "}
          <button type="button" onClick={onLoadAudit} className="text-gold underline-offset-2 hover:underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold">
            Load your audit to start from your real numbers
          </button>
        </span>
      )}
      {sim.seed.kind !== "default" && (
        <button type="button" onClick={sim.reset} disabled={!sim.changed} className="num text-[11px] text-muted underline-offset-2 hover:text-gold hover:underline disabled:opacity-40 disabled:no-underline focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold">
          reset
        </button>
      )}
      {cmp && (
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-0.5">
          <span className="label !text-[9.5px]">{sim.seed.kind === "audit" ? "you today → what-if" : "default → what-if"}</span>
          {cell("risk", pct0(b.risk), pct0(r.risk))}
          {cell("time", `${b.time_to_degree.mid.toFixed(1)}y`, `${r.time_to_degree.mid.toFixed(1)}y`)}
          {cell("salary", usdK(b.salary.mid), usdK(r.salary.mid))}
        </span>
      )}
      <nav aria-label="Models scenes" className="relative ml-auto hidden items-center gap-0.5 lg:flex">
        {SCENES.map((s, i) => {
          const on = s.id === deckId;
          return (
            <button key={s.id} type="button" onClick={() => onGo(i)} aria-current={on ? "step" : undefined} className={`num relative rounded-full px-2.5 py-1 text-[10.5px] uppercase tracking-[0.12em] transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold ${on ? "text-gold" : "text-dim hover:text-muted"}`}>
              {on && <motion.span layoutId="lab-tab" className="absolute inset-x-2.5 -bottom-px h-px bg-gold" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              {s.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
