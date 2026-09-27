"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSceneDeck } from "@/components/scenes";
import { ThinkingChip } from "@/components/theatre";
import type { ManualAudit } from "@/lib/agentApi";
import type { SampleKey, SceneId } from "@/lib/commands";
import { useDataset } from "@/lib/data";
import { apiHealth, type Health } from "@/lib/live";
import type { SessionUser } from "@/lib/session";
import { useCookedVoice, useVoiceScreen } from "@/lib/voiceAgent";
import { parseIntent } from "@/lib/voiceIntents";
import { availableCommands, runCommand, type ScreenContext } from "@/lib/commands";
import { Dashboard } from "../agent/Dashboard";
import { ManualForm, type ManualDraft } from "../agent/audit/ManualForm";
import { sponsorLive } from "../agent/Sponsors";
import { AskPalette } from "../agent/scenes/AskPalette";
import { BUS_SCENE, answerVoice, careersVoice, drillVoice, receiptVoice, repairVoice, riskVoice, timelineVoice, twinsVoice, type SceneVoice } from "../agent/scenes/copy";
import { Home } from "../agent/scenes/Home";
import { SAMPLES, twinFacts, type DeckScene } from "../agent/scenes/model";
import { narrator } from "../agent/scenes/narrator";
import { UploadIssuePanel } from "../agent/scenes/Overlays";
import { TheatreHost } from "../agent/scenes/TheatreHost";
import { useJourney } from "../agent/scenes/useJourney";
import { useStudio, useStudioIntent, type Intent } from "../studio/context";

const isTyping = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** Voice/scene names that mean the same deck scene. */
const SCENE_ALIAS: Record<string, DeckScene | "home"> = { verdict: "risk", risk: "risk", timeline: "timeline", twins: "twins", drill: "drill", repair: "repair", careers: "careers", receipt: "receipt", answer: "answer", home: "home" };
const SAMPLE_KEYS: SampleKey[] = ["working", "cooked", "on_track"];
const NONE_LOADED = "No degree audit is loaded yet. Upload your audit, enter your terms by hand, or load a sample student. I've opened the start screen.";

export function AuditChapter({ user }: { user: SessionUser }) {
  return (
    <MotionConfig reducedMotion="user">
      <Chapter user={user} />
    </MotionConfig>
  );
}

function Chapter({ user }: { user: SessionUser }) {
  const studio = useStudio();
  const { setStudent, goChapter } = studio;
  const voice = useCookedVoice();
  const ds = useDataset();
  const [health, setHealth] = useState<(Health & { database_kind?: string }) | null>(null);
  const live = useMemo(() => sponsorLive(health), [health]);
  const jr = useJourney({ user, live });
  const { journey, phase, scenes } = jr;
  const deck = useSceneDeck(scenes, "risk");
  const { go: deckGo } = deck;
  const [askOpen, setAskOpen] = useState(false);
  const [manual, setManual] = useState<ManualDraft | null>(null);
  const [answerIndex, setAnswerIndex] = useState(0);
  const st = journey?.st;
  const tw = useMemo(() => (journey && st ? twinFacts(ds, st) : null), [ds, journey, st]);

  // the clip narrator stays silent while the live voice agent is connected
  useEffect(() => {
    narrator.setMuted(voice.connected);
    return () => narrator.setMuted(false);
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

  // the other chapters (Models) seed from whoever is loaded here
  const jId = journey?.id;
  const jName = journey?.name ?? null;
  const jWork = journey?.work;
  const jSource = journey?.source;
  useEffect(() => {
    if (jId && jSource) setStudent({ id: jId, name: jName, work: jWork, source: jSource });
  }, [jId, jName, jWork, jSource, setStudent]);

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

  // ---------- what is on screen ----------
  const sceneVoice = useCallback(
    (id: DeckScene, careersState = jr.careers): SceneVoice | null => {
      if (!journey) return null;
      const a = jr.answers[answerIndex];
      switch (id) {
        case "risk":
          return riskVoice(journey);
        case "receipt":
          return receiptVoice(journey, jr.receipt);
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
    [journey, tw, jr.careers, jr.receipt, jr.answers, jr.overrides, answerIndex],
  );

  const screen = useMemo((): ScreenContext => {
    const reachable = ["explore", "models"] as SceneId[];
    if (phase === "theatre") {
      const lead = jr.steps.find((s) => s.status === "running");
      const done = jr.steps.filter((s) => s.status === "done" || s.status === "warn").length;
      return {
        scene: null,
        title: "Reading the audit",
        summary: jr.issue
          ? `The audit could not be used: ${jr.issue.title}. ${jr.issue.body}`
          : jr.askingWork
            ? "The audit is read and the analysis is waiting for one answer: how many hours a week the student works. Say the number, or use setScenario for work hours."
            : `The agents are working on the audit: ${done} of ${jr.steps.length} steps finished${lead ? `, now ${lead.task}` : ""}. The scenes appear when they finish.`,
        facts: { steps_finished: done, steps_total: jr.steps.length, waiting_for_work_hours: jr.askingWork, error: jr.issue?.title ?? null },
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
      title: manual ? "Enter terms by hand" : "Start",
      summary: manual
        ? "The manual entry form is open: major, entry type, residency, credits required, and each term's credits attempted, earned and withdrawals, or course by course."
        : journey
          ? `The start screen. A student (${journey.label}) is already loaded and can be reopened. To begin fresh: drop a degree audit, enter terms by hand, or load a sample student: working (22 hours a week), cooked (light load, heavy job) or on_track (full loads).`
          : "The start screen. No student is loaded. Drop a degree audit, enter your terms by hand, or load a sample student: working (works 22 hours a week), cooked (light load, heavy job) or on_track (full loads). The cohort explorer and the Model Lab are also available.",
      facts: { student_loaded: Boolean(journey) },
      student: Boolean(journey),
      scenes: reachable,
    };
  }, [phase, jr.steps, jr.askingWork, jr.issue, deck.id, journey, scenes, sceneVoice, manual]);
  useVoiceScreen(screen);

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
    async (q: string): Promise<{ ok: boolean; message: string }> => {
      const r = await jr.ask(q);
      if (!r.ok) return { ok: false, message: r.message };
      await showAnswer(r.scene);
      return { ok: true, message: r.message };
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
      if (!r.ok) return r.message;
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

  // ---------- manual entry ----------
  const openFix = useCallback(() => {
    if (!journey) return setManual({});
    const s = journey.st;
    const rows = jr.receipt.status === "ready" ? jr.receipt.data.terms : s.terms.map((t, i) => ({ label: `Term ${i + 1}`, ...t }));
    setManual({
      firstName: journey.name ?? undefined,
      major: s.major,
      entry: s.entry_type === "Transfer" ? "Transfer" : "First-Time Freshman",
      residency: s.residency === "In-State" || s.residency === "Out-of-State" ? s.residency : "",
      creditsRequired: s.credits_required,
      terms: rows.map((t) => ({ label: t.label, attempted: t.attempted, earned: t.earned, withdrawals: t.withdrawals })),
      inProgress: s.courses_in_progress,
    });
  }, [journey, jr.receipt]);

  const submitManual = useCallback(
    (body: ManualAudit) => {
      setManual(null);
      void jr.runManual(body);
    },
    [jr],
  );

  // ---------- intents from the studio (voice, the global ask bar, other chapters) ----------
  const step = useCallback(
    async (by: 1 | -1): Promise<string> => {
      if (!journey) return NONE_LOADED;
      if (phase === "theatre") return "Still reading the audit. The scenes appear in a moment.";
      jr.showDeck();
      let i = deck.index + by;
      while (i >= 0 && i < scenes.length && scenes[i].disabled) i += by;
      if (i < 0 || i >= scenes.length) return `That's the ${by > 0 ? "last" : "first"} scene, ${scenes[deck.index]?.label ?? "this one"}.`;
      const target = scenes[i].id as DeckScene;
      const careers = target === "careers" ? await jr.careersReady() : null;
      await goScene(target);
      const v = sceneVoice(target, careers ?? jr.careers);
      return v ? `${v.title}. ${v.summary}` : `Showing ${scenes[i].label}.`;
    },
    [journey, phase, jr, deck.index, scenes, goScene, sceneVoice],
  );

  const needStudent = useCallback((): string | null => {
    if (journey && phase !== "theatre") return null;
    if (phase === "theatre") return "Still reading the audit. Ask again in a moment.";
    return NONE_LOADED;
  }, [journey, phase]);

  useStudioIntent("audit", async (i: Intent): Promise<string> => {
    switch (i.kind) {
      case "describe":
        return screen.summary;
      case "ask": {
        const no = needStudent();
        if (no) return no;
        return (await askAndShow(i.question)).message;
      }
      case "next":
      case "previous":
        return step(i.kind === "next" ? 1 : -1);
      case "scene": {
        const target = SCENE_ALIAS[i.scene.toLowerCase()];
        if (!target) return `There is no audit scene called ${i.scene}. The scenes are verdict, what we read, timeline, twins, fire drill, repair and careers.`;
        if (target === "home") {
          if (phase === "theatre") return "Still reading the audit. The start screen is available when it finishes.";
          jr.backHome();
          return "Showing the start screen: drop an audit, enter terms by hand, or load a sample student.";
        }
        const no = needStudent();
        if (no) return no;
        const careers = target === "careers" ? await jr.careersReady() : null;
        if (careers?.status === "unavailable") return careers.reason;
        jr.showDeck();
        if (!(await goScene(target))) return `The ${i.scene} scene isn't available for this student right now.`;
        const v = sceneVoice(target, careers ?? jr.careers);
        return v ? `${v.title}. ${v.summary}` : `Showing ${i.scene}.`;
      }
      case "scenario": {
        if (i.field !== "work_hours") return "On the audit screen I can only change work hours. The Models chapter lets you change the other inputs.";
        const no = needStudent();
        const hours = Math.round(Number(i.value));
        if (jr.waitingForWork()) {
          jr.answerWork(hours);
          return `Got it: ${hours} hours a week. Continuing the analysis.`;
        }
        if (no) return no;
        return (await jr.applyWork(hours)).message;
      }
      case "action": {
        if (i.action === "load-sample") {
          const key = (SAMPLE_KEYS as string[]).includes(i.arg ?? "") ? i.arg : "working";
          const sample = SAMPLES.find((x) => x.key === key) ?? SAMPLES[0];
          return (await jr.runSample(sample.id)).message;
        }
        const no = needStudent();
        if (no) return no;
        return (await askAndShow(i.action === "stress-test" ? "Stress test my plan" : "How do I get un-cooked?")).message;
      }
      default:
        return "The audit screen can't do that.";
    }
  });

  // ---------- render ----------
  const heat = journey ? Math.min(1, journey.st.risk.value * 1.1) : 0;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {phase === "deck" && (
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0" style={{ background: `radial-gradient(60% 50% at 78% 0%, rgba(233,74,45,${(heat * 0.09).toFixed(3)}), transparent 70%)` }} />
      )}
      <AnimatePresence mode="wait" initial={false}>
        {phase === "theatre" ? (
          <motion.div key="theatre" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative min-h-0 flex-1">
            <TheatreHost steps={jr.steps} exiting={jr.exiting} askingWork={jr.askingWork} onWork={jr.answerWork} onExited={jr.finishExit} />
          </motion.div>
        ) : phase === "deck" && journey ? (
          <motion.div key="deck" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.7 }} className="relative flex min-h-0 flex-1 flex-col">
            <div className="absolute right-4 top-1 z-20 flex items-center gap-3">
              <button type="button" onClick={() => setAskOpen(true)} aria-label="Ask a question about your plan" aria-keyshortcuts="/" className="inline-flex items-center gap-2 rounded-full border border-gold/45 bg-gold/[0.07] px-3.5 py-1.5 text-xs text-gold transition hover:bg-gold/15">
                Ask <kbd className="num rounded border border-gold/30 px-1.5 text-[10px] text-gold/70">/</kbd>
              </button>
              <button type="button" onClick={jr.backHome} className="text-xs text-muted transition hover:text-text">
                New audit
              </button>
            </div>
            <Dashboard
              deck={deck}
              j={journey}
              tw={tw}
              ds={ds}
              live={live}
              careers={jr.careers}
              receipt={jr.receipt}
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
                fixTerms: openFix,
              }}
            />
          </motion.div>
        ) : (
          <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} className="relative flex min-h-0 flex-1 flex-col">
            <Home ds={ds} name={journey?.name ?? (user.guest ? null : user.firstName)} hasJourney={Boolean(journey)} onFile={(f) => void jr.runAudit(f, f.name)} onSample={(id) => void jr.runSample(id)} onGreet={() => void jr.greet()} onResume={jr.showDeck} onManual={() => setManual({})} onChapter={goChapter} />
          </motion.div>
        )}
      </AnimatePresence>

      <AskPalette open={askOpen && phase === "deck"} onClose={() => setAskOpen(false)} onSubmit={submitAsk} busy={jr.busy} suggestions={suggestions} agentConnected={voice.connected} />

      <AnimatePresence>{manual && <ManualForm key="manual" draft={manual} onSubmit={submitManual} onClose={() => setManual(null)} />}</AnimatePresence>
      <AnimatePresence>
        {jr.issue && !manual && (
          <UploadIssuePanel
            key="issue"
            issue={jr.issue}
            canRetryNow
            actions={{ onRetry: jr.retry, onManual: () => { jr.dismissIssue(); setManual({}); }, onSample: jr.backHome, onClose: jr.backHome }}
          />
        )}
      </AnimatePresence>

      {/* a voice-triggered question or re-run has no palette open: show the agents working */}
      <AnimatePresence>
        {jr.busy && !askOpen && phase === "deck" && (
          <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="pointer-events-none absolute left-1/2 top-2 z-[61] -translate-x-1/2">
            <ThinkingChip state="working" label={jr.busy} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
