"use client";

import { useAdvisorSession } from "./agent/AdvisorSession";
import { careersInput } from "./agent/scenes/model";
import { routeToScene } from "./agent/explore/sceneRoutes";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { AppChrome, SceneDeck, useSceneDeck } from "@/components/scenes";
import type { TaskId } from "@/lib/arena-types";
import { narration } from "@/lib/labModel";
import type { SessionUser } from "@/lib/session";
import { useVoiceCommands, useVoiceScreen } from "@/lib/voiceAgent";
import { METRICS } from "@/lib/labArena";
import { appliedMessage } from "@/lib/labModel";
import { ArenaScene } from "./lab/ArenaScene";
import { CardsScene } from "./lab/CardsScene";
import { ConstellationScene } from "./lab/ConstellationScene";
import { ControlRoom } from "./lab/ControlRoom";
import { DECK_CLASS } from "./lab/frame";
import { useNarrator } from "./lab/Narrate";
import { useArena } from "./lab/useArena";
import { useLabSim } from "./lab/useLabSim";
import { screenContext, sceneSentence, type LabScene, type LabView } from "./lab/voiceText";

const SCENES: { id: LabScene; label: string }[] = [
  { id: "lab", label: "Shape a future" },
  { id: "constellation", label: "Trajectory" },
  { id: "arena", label: "Arena" },
  { id: "cards", label: "Model cards" },
];
const FIRST_METRIC = Object.fromEntries((Object.keys(METRICS) as TaskId[]).map((t) => [t, METRICS[t][0].id])) as Record<TaskId, string>;

/** The Model Arena: shape a scenario, watch four models answer, then see how far to trust them. */
export function ModelLab({ user }: { user: SessionUser }) {
  const { journey } = useAdvisorSession();
  const auditInput = journey ? careersInput(journey.st, journey.sample) : null;
  const sim = useLabSim(auditInput?.scenario);
  const { arena, error: arenaError, retry: retryArena } = useArena();
  const deck = useSceneDeck(SCENES);
  const router = useRouter();

  // arena state lives here so the control room's "why" badges, the voice bus and the arena scene share it
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

  const move = (by: 1 | -1) => {
    const i = deck.index + by;
    const target = SCENES[i];
    if (!target) return { ok: false, message: by > 0 ? "That is the last lab scene, the model cards. Say previous to go back." : "That is the first lab scene, Shape a future. Say next to move on." };
    deck.go(i);
    return `${target.label}. ${sceneSentence(target.id, view)}`;
  };

  useVoiceCommands({
    showScene: ({ scene: to }) => {
      if (to === "models") {
        deck.go("lab");
        return sceneSentence("lab", view);
      }
      if (to === "explore") {
        router.push("/app/explore");
        return "Opening the cohort explorer.";
      }
      return routeToScene(to, router.push);
    },
    nextScene: () => move(1),
    previousScene: () => move(-1),
    setScenario: async ({ field, value }) => {
      const r = await sim.apply(field, value);
      // from the arena or the cards, take the user back to where the sliders live; the constellation already moves with them
      if (scene === "arena" || scene === "cards") deck.go("lab");
      return {
        message: appliedMessage(field, value, r),
        data: {
          field,
          value,
          risk_percent: Math.round(r.risk * 100),
          time_to_degree_years: r.time_to_degree,
          first_salary_usd: { low: r.salary.low, median: r.salary.mid, high: r.salary.high },
          career_top: r.career[0],
          pattern: r.pattern,
        },
      };
    },
  });

  // publish only settled answers so the agent is not re-briefed on every step of a drag
  useVoiceScreen(sim.result && !sim.pending
    ? { ...screenContext(scene, view), student: Boolean(journey) }
    : { scene: "models", title: "What-if", summary: "The model workspace is calculating the current scenario.", student: Boolean(journey) });

  const tabs = (
    <nav aria-label="Lab scenes" className="relative hidden items-center gap-0.5 lg:flex">
      {SCENES.map((s, i) => {
        const on = s.id === deck.id;
        return (
          <button key={s.id} type="button" onClick={() => deck.go(i)} aria-current={on ? "step" : undefined} className={`num relative rounded-full px-2.5 py-1 text-[10.5px] uppercase tracking-[0.12em] transition focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold ${on ? "text-gold" : "text-dim hover:text-muted"}`}>
            {on && <span className="absolute inset-x-2.5 -bottom-px h-px bg-gold" />}
            {s.label}
          </button>
        );
      })}
    </nav>
  );

  return (
    <AppChrome user={user} active="lab" heat={0} right={tabs}>
      {auditInput && <p className="px-6 py-2 text-xs text-muted">Based on your audit · scenario changes are exploratory. Assumed: {auditInput.assumed.join(", ") || "none"}.{auditInput.clamped.length ? ` Limited to training range: ${auditInput.clamped.join(", ")}.` : ""}</p>}
      <SceneDeck
        deck={deck}
        className={DECK_CLASS}
        render={(id) =>
          id === "lab" ? (
            <ControlRoom sim={sim} arena={arena} narrator={narrator} onOpenArena={openArena} />
          ) : id === "constellation" ? (
            <ConstellationScene sim={sim} arena={arena} />
          ) : id === "arena" ? (
            <ArenaScene
              arena={arena}
              error={arenaError}
              onRetry={retryArena}
              task={task}
              onTask={setTask}
              metricId={metricId}
              onMetric={(m) => setMetrics((all) => ({ ...all, [task]: m }))}
              stage={stage}
              onStage={setStage}
            />
          ) : (
            <CardsScene arena={arena} error={arenaError} onRetry={retryArena} />
          )
        }
      />
    </AppChrome>
  );
}
