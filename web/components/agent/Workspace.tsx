"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppChrome, useSceneDeck } from "@/components/scenes";
import { ThinkingChip } from "@/components/theatre";
import { availableCommands, runCommand, type CommandOutcome, type SceneId, type ScreenContext } from "@/lib/commands";
import { useDataset } from "@/lib/data";
import { apiHealth, type Health } from "@/lib/live";
import type { SessionUser } from "@/lib/session";
import { useCookedVoice, useVoiceCommands, useVoiceScreen } from "@/lib/voiceAgent";
import { parseIntent } from "@/lib/voiceIntents";
import { Dashboard } from "./Dashboard";
import { sponsorLive } from "./Sponsors";
import { AskPalette } from "./scenes/AskPalette";
import { BUS_SCENE, answerVoice, careersVoice, drillVoice, repairVoice, riskVoice, timelineVoice, twinsVoice, type SceneVoice } from "./scenes/copy";
import { Home } from "./scenes/Home";
import { SAMPLES, twinFacts, type DeckScene } from "./scenes/model";
import { narrator } from "./scenes/narrator";
import { TheatreHost } from "./scenes/TheatreHost";
import { useAdvisorSession } from "./AdvisorSession";
import { NO_STUDENT } from "./scenes/useJourney";

export function Workspace({ user }: { user: SessionUser }) {
  return (
    <MotionConfig reducedMotion="user">
      <Journey user={user} />
    </MotionConfig>
  );
}

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

function Journey({ user }: { user: SessionUser }) {
  const router = useRouter();
  const voice = useCookedVoice();
  const ds = useDataset();
  const [health, setHealth] = useState<(Health & { database_kind?: string }) | null>(null);
  const live = useMemo(() => sponsorLive(health), [health]);
  const jr = useAdvisorSession();
  const search = useSearchParams();
  const { journey, phase, scenes } = jr;
  const deck = useSceneDeck(scenes, "risk");
  const { go: deckGo } = deck;
  const [askOpen, setAskOpen] = useState(false);
  const [answerIndex, setAnswerIndex] = useState(0);
  const st = journey?.st;
  const tw = useMemo(() => (journey && st ? twinFacts(ds, st) : null), [ds, journey, st]);

  // ---------- voice out: the clip narrator stays silent while the live agent is connected ----------
  useEffect(() => {
    narrator.setMuted(voice.connected);
  }, [voice.connected]);

  useEffect(() => {
    apiHealth().then((h) => setHealth(h as Health & { database_kind?: string }));
    const t = setTimeout(() => void jr.greet(), 600);
    return () => clearTimeout(t);
    // the greeting plays once per visit
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { setOnLoaded } = jr;
  useEffect(() => setOnLoaded(() => deckGo("risk")), [setOnLoaded, deckGo]);

  // ---------- moving the deck (a state update must land before the scene list lets us in) ----------
  const goRequest = useRef<{ scene: DeckScene; resolve: (ok: boolean) => void } | null>(null);
  const [goTick, setGoTick] = useState(0);
  const goScene = useCallback(
    (scene: DeckScene) =>
      new Promise<boolean>((resolve) => {
        goRequest.current?.resolve(false);
        goRequest.current = { scene, resolve };
        setGoTick((t) => t + 1);
      }),
    [],
  );
  useEffect(() => {
    const r = goRequest.current;
    if (!r) return;
    goRequest.current = null;
    r.resolve(deckGo(r.scene));
  }, [goTick, deckGo]);

  // ---------- what is on screen, for the voice agent and for describeScreen ----------
  const sceneVoice = useCallback(
    (id: DeckScene, careersState = jr.careers): SceneVoice | null => {
      if (!journey) return null;
      const a = jr.answers[answerIndex];
      switch (id) {
        case "risk":
          return riskVoice(journey);
        case "timeline":
          return timelineVoice(journey, tw);
        case "twins":
          return twinsVoice(journey, tw);
        case "drill":
          return journey.drill ? drillVoice(journey, journey.drill, jr.overrides.drill) : null;
        case "repair":
          return journey.repair ? repairVoice(journey, journey.repair, jr.overrides.repair) : null;
        case "careers":
          return careersVoice(careersState);
        case "answer":
          return a ? answerVoice(a) : null;
      }
    },
    [journey, tw, jr.careers, jr.answers, jr.overrides, answerIndex],
  );

  const screen = useMemo((): ScreenContext => {
    const reachable = ["explore", "models", "advisor", "audit"] as SceneId[];
    if (phase === "theatre") {
      const lead = jr.steps.find((s) => s.status === "running");
      const done = jr.steps.filter((s) => s.status === "done" || s.status === "warn").length;
      return {
        scene: null,
        title: "Reading the audit",
        summary: jr.askingWork ? "The audit is read and the analysis is waiting for one answer: how many hours a week the student works. Say the number, or use setScenario for work hours." : `The agents are working on the audit: ${done} of ${jr.steps.length} steps finished${lead ? `, now ${lead.task}` : ""}. The scenes appear when they finish.`,
        facts: { steps_finished: done, steps_total: jr.steps.length, waiting_for_work_hours: jr.askingWork },
        student: false,
        scenes: reachable,
      };
    }
    const cur = deck.id as DeckScene | undefined;
    const v = phase === "deck" && cur ? sceneVoice(cur) : null;
    if (phase === "deck" && journey && cur && v) {
      const open = scenes.filter((s) => !s.disabled).map((s) => BUS_SCENE[s.id as DeckScene]).filter((s): s is NonNullable<typeof s> => !!s);
      return { scene: BUS_SCENE[cur], title: v.title, summary: v.summary, facts: { student: journey.label, ...v.facts }, student: true, scenes: [...open, ...reachable] as SceneId[] };
    }
    return {
      scene: null,
      title: "Start",
      summary: journey
        ? `The start screen. A student (${journey.label}) is already loaded and can be reopened. To begin fresh: drop a degree audit, or load a sample student: working (22 hours a week), cooked (light load, heavy job) or on_track (full loads).`
        : "The start screen. No student is loaded. Drop a degree audit, or load a sample student: working (works 22 hours a week), cooked (light load, heavy job) or on_track (full loads). The cohort explorer and the Model Lab are also available.",
      facts: { student_loaded: Boolean(journey) },
      student: Boolean(journey),
      scenes: reachable,
    };
  }, [phase, jr.steps, jr.askingWork, deck.id, journey, scenes, sceneVoice]);
  useVoiceScreen(screen);
  const requestedScene = search.get("scene");
  const { showDeck } = jr;
  useEffect(() => {
    if (!journey || !requestedScene) return;
    showDeck();
    deckGo(requestedScene);
  }, [requestedScene, journey, deckGo, showDeck]);

  // ---------- questions ----------
  const showAnswer = useCallback(
    async (scene: DeckScene | undefined) => {
      setAskOpen(false);
      jr.showDeck();
      setAnswerIndex(0);
      await goScene(scene ?? "answer");
    },
    [goScene, jr],
  );

  const askAndShow = useCallback(
    async (q: string): Promise<CommandOutcome> => {
      const r = await jr.ask(q);
      if (!r.ok) return { ok: false, message: r.message };
      await showAnswer(r.scene);
      return { message: r.message, data: r.data };
    },
    [jr, showAnswer],
  );

  const submitAsk = useCallback(
    async (text: string): Promise<string | void> => {
      // control phrases ("next", "show the twins", "set work hours to 30") go through the same bus the voice uses
      const intent = parseIntent(text, { scene: screen.scene, hasStudent: true, available: availableCommands() });
      if (intent && intent.command !== "askStudent" && intent.command !== "exploreCohort") {
        setAskOpen(false);
        const res = await runCommand(intent.command, intent.args, { source: "typed" });
        return res.ok ? undefined : res.message;
      }
      const r = await askAndShow(text);
      if (typeof r !== "string" && r.ok === false) return r.message;
    },
    [askAndShow, screen.scene],
  );

  const suggestions = useMemo(() => {
    // course ideas come from what the catalogue check says is actually open next term
    const picks = (journey?.repair?.primary?.feasibility?.picks ?? []).map((p) => p.course_id).filter((c) => /^(CMSC|IS)/.test(c));
    const course = picks.length >= 2 ? `What if I take ${picks[1]} instead of ${picks[0]}?` : picks.length ? `Can I take ${picks[0]} next term?` : "Can I take CMSC341 next term?";
    return ["Am I cooked?", "What if I take 3 more credits a term?", course, "What if I work 10 hours a week?", "Stress test my plan", "How do I get un-cooked?"];
  }, [journey?.repair]);

  // "/" opens the palette from any scene
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target) || phase !== "deck") return;
      e.preventDefault();
      setAskOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase]);

  // ---------- voice: what the agent can do here ----------
  const step = useCallback(
    async (by: 1 | -1): Promise<CommandOutcome> => {
      if (!journey) return { ok: false, message: NO_STUDENT };
      if (phase === "theatre") return { ok: false, message: "Still reading the audit. The scenes appear in a moment." };
      jr.showDeck();
      let i = deck.index + by;
      while (i >= 0 && i < scenes.length && scenes[i].disabled) i += by;
      if (i < 0 || i >= scenes.length) return { ok: false, message: `That's the ${by > 0 ? "last" : "first"} scene, ${scenes[deck.index]?.label ?? "this one"}.` };
      const target = scenes[i].id as DeckScene;
      const careers = target === "careers" ? await jr.careersReady() : null;
      await goScene(target);
      const v = sceneVoice(target, careers ?? jr.careers);
      return { message: v ? `${v.title}. ${v.summary}` : `Showing ${scenes[i].label}.`, data: v?.facts };
    },
    [journey, phase, jr, deck.index, scenes, goScene, sceneVoice],
  );

  useVoiceCommands({
    describeScreen: () => ({ message: screen.summary, data: { scene: screen.scene, title: screen.title, student_loaded: screen.student, values: screen.facts, reachable_scenes: screen.scenes } }),
    askStudent: ({ question }) => (journey ? askAndShow(question) : { ok: false, message: NO_STUDENT }),
    runStressTest: () => (journey ? askAndShow("Stress test my plan") : { ok: false, message: NO_STUDENT }),
    findRepair: () => (journey ? askAndShow("How do I get un-cooked?") : { ok: false, message: NO_STUDENT }),
    loadSampleStudent: async ({ which }) => {
      const s = SAMPLES.find((x) => x.key === (which ?? "working")) ?? SAMPLES[0];
      const r = await jr.runSample(s.id);
      return { ok: r.ok, message: r.message, data: r.data };
    },
    showScene: async ({ scene }) => {
      if (scene === "advisor") { router.push("/app/advisor"); return "Opening the advisor overview."; }
      if (scene === "audit") { jr.backHome(); return "Your audit workspace is open. Choose a file to upload, or reopen your results."; }
      if (scene === "models") {
        router.push("/app/lab");
        return "Opening the Model Lab, where the four models can be compared side by side.";
      }
      if (scene === "explore") {
        router.push("/app/explore");
        return "Opening the cohort explorer.";
      }
      if (!journey) return { ok: false, message: NO_STUDENT };
      if (phase === "theatre") return { ok: false, message: "Still reading the audit. The scenes appear in a moment." };
      const careers = scene === "careers" ? await jr.careersReady() : null;
      if (careers?.status === "unavailable") return { ok: false, message: careers.reason };
      jr.showDeck();
      if (!(await goScene(scene))) return { ok: false, message: `The ${scene} scene isn't available for this student right now.` };
      const v = sceneVoice(scene, careers ?? jr.careers);
      return { message: v ? `${v.title}. ${v.summary}` : `Showing ${scene}.`, data: v?.facts };
    },
    nextScene: () => step(1),
    previousScene: () => step(-1),
  });

  // dev-only handle so the voice handlers can be driven from the console; removed with the verification pass
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    (window as unknown as { __cookedRun?: typeof runCommand }).__cookedRun = runCommand;
  }, []);

  // ---------- render ----------
  const heat = journey ? Math.min(1, journey.st.risk.value * 1.1) : 0;

  if (phase === "theatre") {
    return <TheatreHost steps={jr.steps} exiting={jr.exiting} error={jr.error} askingWork={jr.askingWork} onWork={jr.answerWork} onExited={jr.finishExit} onBack={jr.backHome} />;
  }

  const right = (
    <>
      {phase === "deck" && (
        <>
          <button type="button" onClick={() => setAskOpen(true)} aria-label="Ask a question about your plan" aria-keyshortcuts="/" className="inline-flex items-center gap-2 rounded-full border border-gold/45 bg-gold/[0.07] px-3.5 py-1.5 text-xs text-gold transition hover:bg-gold/15">
            Ask <kbd className="num rounded border border-gold/30 px-1.5 text-[10px] text-gold/70">/</kbd>
          </button>
          <button type="button" onClick={jr.backHome} className="hidden text-xs text-muted transition hover:text-text sm:inline">
            New audit
          </button>
        </>
      )}
    </>
  );

  return (
    <AppChrome user={user} active="home" right={right} heat={phase === "deck" ? heat : 0}>
      <AnimatePresence mode="wait" initial={false}>
        {phase === "deck" && journey ? (
          <motion.div key="deck" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="relative flex min-h-0 flex-1 flex-col">
            <Dashboard
              deck={deck}
              j={journey}
              tw={tw}
              ds={ds}
              live={live}
              careers={jr.careers}
              answers={jr.answers}
              answerIndex={answerIndex}
              overrides={jr.overrides}
              actions={{
                ask: () => setAskOpen(true),
                askAbout: (q) => void askAndShow(q),
                hear: () => void narrator.say(journey.headline),
                canHear: !voice.connected,
                go: (s) => void goScene(s),
                selectAnswer: setAnswerIndex,
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="relative flex min-h-0 flex-1 flex-col">
            <Home ds={ds} live={live} name={journey?.name ?? (user.guest ? null : user.firstName)} error={jr.error} hasJourney={Boolean(journey)} onFile={(f) => void jr.runAudit(f, f.name)} onSample={(id) => void jr.runSample(id)} onGreet={() => void jr.greet()} onResume={jr.showDeck} />
          </motion.div>
        )}
      </AnimatePresence>

      <AskPalette open={askOpen && phase === "deck"} onClose={() => setAskOpen(false)} onSubmit={submitAsk} busy={jr.busy} suggestions={suggestions} agentConnected={voice.connected} />

      {/* a voice-triggered question or re-run has no palette open: show the agents working */}
      <AnimatePresence>
        {jr.busy && !askOpen && phase === "deck" && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="pointer-events-none fixed left-1/2 top-[4.4rem] z-[61] -translate-x-1/2">
            <ThinkingChip state="working" label={jr.busy} />
          </motion.div>
        )}
      </AnimatePresence>
    </AppChrome>
  );
}
