"use client";

import { useRouter } from "next/navigation";
import { useAdvisorSession } from "./AdvisorSession";
import { useEffect, useMemo, useRef, useState } from "react";
import { AppChrome, SceneDeck, useSceneDeck, type SceneDef } from "@/components/scenes";
import type { CommandHandlers, SceneId } from "@/lib/commands";
import { api, useApiHealth } from "@/lib/live";
import { listen, useCanListen } from "@/lib/listen";
import type { SessionUser } from "@/lib/session";
import { speak, type Speaking } from "@/lib/voice";
import { useCookedVoice, useVoiceCommands, useVoiceScreen } from "@/lib/voiceAgent";
import { CohortAnswerView } from "./explore/CohortAnswerView";
import { AskScene } from "./explore/AskScene";
import styles from "./explore/explore.module.css";
import { Filmstrip } from "./explore/Filmstrip";
import { SUGGESTIONS, groupsText, norm, shortQuestion, smallNote, spokenAnswer, type CohortAnswer, type Entry } from "./explore/model";
import { Prompt } from "./explore/Prompt";
import { routeToScene } from "./explore/sceneRoutes";
import { currentHistory, useHistory, useNarratePref } from "./explore/store";

const MAX_ENTRIES = 12;
// every scene the voice agent may name; the journey ones live on /app
const ALL_SCENES: SceneId[] = ["explore", "risk", "timeline", "twins", "drill", "repair", "careers", "models"];

const micError = (e: string) => (e === "not-allowed" || e === "service-not-allowed" ? "access is blocked. Allow it in the address bar, then try again." : e === "audio-capture" ? "no microphone found." : e === "unsupported" ? "this browser can't listen." : e);
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/** "Ask the cohort": each answer is a scene, so the arrow keys scrub the conversation like a film strip. */
export function ExploreWorkspace({ user }: { user: SessionUser }) {
  const { journey } = useAdvisorSession();
  const router = useRouter();
  const voice = useCookedVoice();
  const health = useApiHealth();
  const canMic = useCanListen();

  const [entries, updateEntries] = useHistory();
  const [narrate, setNarrate] = useNarratePref();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // mirrors so async flows and voice handlers always read the newest state
  const busyRef = useRef(false);
  const narrateRef = useRef(narrate);
  const connectedRef = useRef(voice.connected);
  const lastError = useRef("");
  const seq = useRef(0);
  const clip = useRef<Speaking | null>(null);
  const narratedFor = useRef<string | null>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  const pendingAnswer = useRef<string | null>(null);
  const pendingNarration = useRef<{ id: string; answer: CohortAnswer } | null>(null);
  useEffect(() => {
    narrateRef.current = narrate;
    connectedRef.current = voice.connected;
  });

  const scenes = useMemo<SceneDef[]>(() => [{ id: "ask", label: "Ask" }, ...entries.map((e) => ({ id: e.id, label: shortQuestion(e.answer.question) }))], [entries]);
  const deck = useSceneDeck(scenes, "ask");
  useEffect(() => {
    if (pendingAnswer.current && scenes.some(scene => scene.id === pendingAnswer.current)) {
      deck.go(pendingAnswer.current);
      pendingAnswer.current = null;
    }
  }, [scenes, deck]);

  // ---------------------------------------------------------------- speech out (only when the live agent is not talking)
  const stopSpeech = () => {
    clip.current?.stop();
    clip.current = null;
    setSpeaking(false);
  };
  const speakAnswer = (id: string, a: CohortAnswer) => {
    if (connectedRef.current) return;
    stopSpeech();
    narratedFor.current = id;
    setSpeaking(true);
    const c = speak(spokenAnswer(a).message, "narrator", () => {}, () => {});
    clip.current = c;
    void c.done
      .catch(() => undefined)
      .finally(() => {
        if (clip.current === c) {
          clip.current = null;
          setSpeaking(false);
        }
      });
  };
  useEffect(() => stopSpeech, []);
  useEffect(() => {
    const next = pendingNarration.current;
    if (next && next.id === deck.id) {
      pendingNarration.current = null;
      speakAnswer(next.id, next.answer);
    }
  }, [deck.id]);
  useEffect(() => {
    // leaving the answer that is being read (or the agent taking over) cuts the narration
    if (deck.id !== narratedFor.current || voice.connected) stopSpeech();
  }, [deck.id, voice.connected]);

  // ---------------------------------------------------------------- mic (browser push-to-talk when the live agent isn't connected)
  // stopping recognition ends through listen()'s own onEnd callback, which resets `listening`
  const stopMic = () => stopListen.current?.();
  useEffect(() => stopMic, []);
  useEffect(() => {
    if (voice.connected) stopMic();
  }, [voice.connected]);

  // A question resolves directly to the SQL-backed answer.
  async function ask(raw: string, via: "ui" | "voice"): Promise<Entry | null> {
    const q = raw.trim().slice(0, 500);
    if (!q) return null;
    stopSpeech();
    stopMic();
    const seen = currentHistory().find((e) => norm(e.answer.question) === norm(q));
    if (seen) {
      // already answered: scrub to it instead of asking the database the same thing again
      deck.go(seen.id);
      setDraft("");
      if (via === "ui" && narrateRef.current) speakAnswer(seen.id, seen.answer);
      return seen;
    }
    if (busyRef.current) return null;
    busyRef.current = true;
    setBusy(true);
    setError("");
    lastError.current = "";

    try {
      const call = await api<CohortAnswer>("/explore", { question: q });
      const a = call.data;
      const entry: Entry = { id: `a${++seq.current}`, answer: a };
      pendingAnswer.current = entry.id;
      updateEntries((old) => [...old, entry].slice(-MAX_ENTRIES));
      setDraft("");
      if (via === "ui" && narrateRef.current) pendingNarration.current = { id: entry.id, answer: a };
      return entry;
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Could not reach the cohort API.";
      setError(msg);
      lastError.current = msg;
      setDraft(q);
      return null;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  const askRef = useRef(ask);
  useEffect(() => {
    askRef.current = ask;
  });
  // sequence numbers continue from whatever the strip already holds
  useEffect(() => {
    seq.current = Math.max(seq.current, ...entries.map((e) => Number(e.id.slice(1)) || 0));
  }, [entries]);

  function toggleMic() {
    if (listening) return stopMic();
    stopSpeech();
    setError("");
    setDraft("");
    setListening(true);
    const h = listen(
      (text, final) => {
        setDraft(text);
        if (final) void askRef.current(text, "ui");
      },
      (err) => {
        stopListen.current = null;
        setListening(false);
        if (err && err !== "no-speech" && err !== "aborted") setError(`Microphone: ${micError(err)}`);
      },
    );
    stopListen.current = h.stop;
  }

  // "/" jumps to the prompt from anywhere on the page
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      const box = document.querySelector<HTMLInputElement>('input[aria-label="Ask the cohort a question"]');
      if (!box) return;
      e.preventDefault();
      box.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // a fresh visit starts with the cursor in the prompt (not on touch screens: that pops the keyboard)
  useEffect(() => {
    if (currentHistory().length === 0 && window.matchMedia("(pointer: fine)").matches) promptRef.current?.focus();
  }, []);

  // ---------------------------------------------------------------- what the voice agent can do here
  const at = deck.index; // 0 is the prompt, 1.. are answers
  const current = at > 0 ? entries[at - 1] : undefined;
  const describe = (e?: Entry) => {
    if (!e) {
      return {
        message: `The cohort explorer is waiting for a question. It answers six fixed cohort comparisons: course load and time to degree, work hours, internships and first destinations, where graduates went, the two majors, and degree cost by graduation year.${entries.length ? ` There ${entries.length === 1 ? "is 1 answer" : `are ${entries.length} answers`} in the strip; say next to replay them.` : ""}`,
        data: { scene: "explore", screen: "prompt", answers_in_strip: entries.length, questions: SUGGESTIONS.map((s) => s.q) },
      };
    }
    const s = spokenAnswer(e.answer);
    const i = entries.indexOf(e) + 1;
    return { message: `Answer ${i} of ${entries.length}: “${e.answer.question}”. ${s.message}`, data: { scene: "explore", screen: "answer", position: i, of: entries.length, ...s.data } };
  };

  const shown = describe(current);
  const idea = SUGGESTIONS.find((s) => !entries.some((e) => norm(e.answer.question) === norm(s.q)))?.q;

  useVoiceScreen({
    scene: "explore",
    title: current ? current.answer.title : "Ask the cohort",
    summary: shown.message,
    facts: current
      ? {
          question: current.answer.question,
          query: current.answer.topic,
          measure: current.answer.measure,
          by: current.answer.dimension,
          groups: groupsText(current.answer),
          small_samples: smallNote(current.answer) ?? "none",
          evidence_id: current.answer.tool_result_id,
          routed_by: current.answer.router === "gemini" ? "AI router" : "keyword router",
          answers_in_strip: entries.length,
        }
      : { answers_in_strip: entries.length },
    student: Boolean(journey),
    scenes: ALL_SCENES,
  });

  const move = (by: 1 | -1) => {
    const target = deck.index + by;
    if (target < 0) return { ok: false, message: "That's the start of the strip: the prompt is showing." };
    if (target >= deck.scenes.length) return { ok: false, message: entries.length ? "That's the newest answer. Ask a new question to add another." : "There are no answers yet. Ask a question first." };
    deck.go(target);
    const d = describe(target > 0 ? entries[target - 1] : undefined);
    return { message: d.message, data: d.data };
  };

  const handlers: Partial<CommandHandlers> = {
    exploreCohort: async ({ question }) => {
      if (busyRef.current) return { ok: false, message: "I'm still working on the last question. Give it a moment, then ask again." };
      const e = await askRef.current(question, "voice");
      if (!e) return { ok: false, message: lastError.current || "The cohort query failed. Ask the user to try again." };
      const s = spokenAnswer(e.answer);
      return { message: s.message, data: s.data };
    },
    showScene: ({ scene }) => {
      if (scene === "explore") return { message: `You're in the cohort explorer. ${shown.message}`, data: shown.data };
      return routeToScene(scene, router.push);
    },
    nextScene: () => move(1),
    previousScene: () => move(-1),
    describeScreen: () => shown,
  };
  useVoiceCommands(handlers);

  // ---------------------------------------------------------------- render
  const promptProps = {
    value: draft,
    onChange: setDraft,
    onSubmit: () => void ask(draft, "ui"),
    busy,
    mic: canMic && !voice.connected ? { listening, onToggle: toggleMic } : undefined,
    onEdge: (d: -1 | 1) => void (d > 0 ? deck.next() : deck.prev()),
  };

  const renderScene = (id: string) => {
    if (id === "ask") {
      return (
        <AskScene
          {...promptProps}
          onPick={(q) => void ask(q, "ui")}
          inputRef={promptRef}
          voiceLive={voice.connected}
          answered={entries.map((e) => e.answer.question)}
          count={entries.length}
          error={error}
          apiDown={health !== null && !health.live}
          narrate={narrate}
          onNarrate={(on) => {
            setNarrate(on);
            if (!on) stopSpeech();
          }}
        />
      );
    }
    const e = entries.find((x) => x.id === id);
    if (!e) return null;
    return <CohortAnswerView answer={e.answer} idea={idea} onIdea={(q) => void ask(q, "ui")} narration={{ available: !voice.connected, speaking, onSpeak: () => speakAnswer(e.id, e.answer), onStop: stopSpeech }} />;
  };

  return (
    <>
      <AppChrome user={user} active="explore" heat={0}>
        {entries.length > 0 && <Filmstrip scenes={deck.scenes} index={deck.index} onGo={deck.go} />}
        <SceneDeck deck={deck} render={renderScene} className={styles.deck} />
        {deck.id !== "ask" && (
          <div className="shrink-0 px-4 pb-1 pt-2 sm:px-8 lg:pl-28 lg:pr-10">
            <div className="mx-auto max-w-2xl">
              <Prompt {...promptProps} size="compact" placeholder="Ask another question…" />
              {error && (
                <p role="alert" className="num mt-1.5 text-center text-[11px] text-hot">
                  {error}
                </p>
              )}
            </div>
          </div>
        )}
      </AppChrome>

    </>
  );
}
