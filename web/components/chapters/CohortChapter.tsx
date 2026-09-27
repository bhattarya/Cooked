"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { SceneDeck, useSceneDeck, type SceneDef } from "@/components/scenes";
import { ProcessingTheatre, type OrbState } from "@/components/theatre";
import type { SceneId } from "@/lib/commands";
import { api, useApiHealth } from "@/lib/live";
import { listen, useCanListen } from "@/lib/listen";
import type { SessionUser } from "@/lib/session";
import { speak, type Speaking } from "@/lib/voice";
import { useCookedVoice, useVoiceScreen } from "@/lib/voiceAgent";
import { useStudioIntent } from "../studio/context";
import { AnswerScene } from "../agent/explore/AnswerScene";
import { AskScene } from "../agent/explore/AskScene";
import styles from "../agent/explore/explore.module.css";
import { Filmstrip } from "../agent/explore/Filmstrip";
import { KIND_LABEL, SUGGESTIONS, fmtN, groupsText, norm, read, shortQuestion, smallNote, spokenAnswer, type CohortAnswer, type Entry } from "../agent/explore/model";
import { Prompt } from "../agent/explore/Prompt";
import { currentHistory, useHistory, useNarratePref } from "../agent/explore/store";
import type { Step } from "../agent/Pipeline";

const MAX_ENTRIES = 12;
// Broad on purpose: the API routes fuzzy wording itself; this only stops questions about something else entirely.
const mapsToQuery = (q: string) => /intern|job|employ|career|offer|salary|pay|cost|loan|debt|roi|major|computer|information|work|hour|load|credit|course|term|graduat|degree|destination|alumni|year|time|light|heavy|first/i.test(q);
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
// every scene the voice agent may name; the journey ones live on /app
const ALL_SCENES: SceneId[] = ["explore", "risk", "timeline", "twins", "drill", "repair", "careers", "models"];

const micError = (e: string) => (e === "not-allowed" || e === "service-not-allowed" ? "access is blocked. Allow it in the address bar, then try again." : e === "audio-capture" ? "no microphone found." : e === "unsupported" ? "this browser can't listen." : e);
const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

interface TheatreState {
  question: string;
  steps: Step[];
  exiting: boolean;
}

/** "Ask the cohort": each answer is a scene, so the arrow keys scrub the conversation like a film strip. */
export function CohortChapter(_: { user: SessionUser }) {
  const voice = useCookedVoice();
  const health = useApiHealth();
  const reduced = !!useReducedMotion();
  const canMic = useCanListen();

  const [entries, updateEntries] = useHistory();
  const [narrate, setNarrate] = useNarratePref();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [theatre, setTheatre] = useState<TheatreState | null>(null);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [rawLevel, setRawLevel] = useState(0);

  // mirrors so async flows and voice handlers always read the newest state
  const busyRef = useRef(false);
  const narrateRef = useRef(narrate);
  const connectedRef = useRef(voice.connected);
  const levelsRef = useRef(voice.levels);
  const lastError = useRef("");
  const seq = useRef(0);
  const clip = useRef<Speaking | null>(null);
  const narratedFor = useRef<string | null>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const exited = useRef<(() => void) | null>(null);
  const promptRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    narrateRef.current = narrate;
    connectedRef.current = voice.connected;
    levelsRef.current = voice.levels;
  });

  const scenes = useMemo<SceneDef[]>(() => [{ id: "ask", label: "Ask" }, ...entries.map((e) => ({ id: e.id, label: shortQuestion(e.answer.question) }))], [entries]);
  const deck = useSceneDeck(scenes, "ask");

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

  // ---------------------------------------------------------------- the visible flow: prompt -> theatre -> scene
  const patch = (key: string, p: Partial<Step>) => setTheatre((t) => t && { ...t, steps: t.steps.map((s) => (s.key === key ? { ...s, ...p } : s)) });
  const pace = (ms: number) => sleep(reduced ? Math.min(ms, 120) : ms);

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

    const geminiOn = !!health?.providers?.gemini;
    const geminiOff = health !== null && !geminiOn;
    const tigerOn = health?.database_kind === "tiger-cloud";
    setTheatre({
      question: q,
      exiting: false,
      steps: [
        { key: "route", agent: "Orchestrator", task: "picking one of the six fixed cohort queries", sponsor: "gemini", live: geminiOn, status: "running" },
        { key: "query", agent: "Evidence", task: "computing the groups in Tiger Data, no model-written SQL", sponsor: "tiger", live: tigerOn, status: "pending" },
        { key: "chart", agent: "Visualizer", task: "choosing the chart and the one-line takeaway", sponsor: "model", live: true, status: "pending" },
      ],
    });

    try {
      const call = await api<CohortAnswer>("/explore", { question: q });
      const a = call.data;
      const routed = a.router === "gemini";
      // The API answers in one round trip, so the steps below light up as their results become known. `ms` is that whole
      // round trip on the query step; the route step shows how long it waited (the client-side timer).
      patch("route", {
        status: routed || geminiOff ? "done" : "warn",
        live: routed,
        result: routed ? `Gemini chose the “${a.topic}” query` : geminiOff ? `keyword router chose “${a.topic}” (Gemini isn't configured)` : `Gemini returned no route, so the keyword fallback chose “${a.topic}”`,
      });
      await pace(360);
      patch("query", { status: "running" });
      await pace(300);
      const total = a.rows.reduce((s, r) => s + r.n, 0);
      patch("query", { status: "done", result: `${a.rows.length} ${a.rows.length === 1 ? "group" : "groups"} · ${fmtN(total)} alumni`, tr: a.tool_result_id, ms: Math.round(call.ms) });
      patch("chart", { status: "running" });
      const t0 = performance.now();
      const reading = read(a);
      const readMs = Math.max(1, Math.round(performance.now() - t0));
      const ok = a.narration.provenance?.ok !== false;
      await pace(300);
      patch("chart", {
        status: ok && reading.kind !== "refusal" && reading.kind !== "empty" ? "done" : "warn",
        result: `${KIND_LABEL[reading.kind]}${reading.small.length ? ` · ${reading.small.length} small ${reading.small.length === 1 ? "group" : "groups"} greyed` : ""}${ok ? "" : " · narration failed its provenance check, using the query description"}`,
        ms: readMs,
      });

      const entry: Entry = { id: `a${++seq.current}`, answer: a };
      updateEntries((old) => [...old, entry].slice(-MAX_ENTRIES));
      await pace(700);
      setTheatre((t) => t && { ...t, exiting: true });
      await new Promise<void>((resolve) => {
        exited.current = resolve;
        setTimeout(resolve, 4500); // a hidden tab may never finish the exit animation
      });
      exited.current = null;
      // the new scene has been in the deck since the chart step; this only retries if that render is somehow still pending
      for (let i = 0; i < 6 && !deck.go(entry.id); i++) await sleep(60);
      setTheatre(null);
      setDraft("");
      if (via === "ui" && narrateRef.current) speakAnswer(entry.id, a);
      return entry;
    } catch (e) {
      const msg = e instanceof Error && e.message ? e.message : "Could not reach the cohort API.";
      setTheatre((t) => t && { ...t, steps: t.steps.map((s) => (s.status === "running" ? { ...s, status: "error", result: msg } : s.status === "pending" ? { ...s, status: "error", result: "not reached" } : s)) });
      await sleep(1800);
      setTheatre(null);
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

  // ---------------------------------------------------------------- the orb follows whoever is listening
  useEffect(() => {
    if (!voice.connected) return;
    const id = window.setInterval(() => {
      const l = levelsRef.current();
      setRawLevel(Math.max(l.input, l.output));
    }, 100);
    return () => window.clearInterval(id);
  }, [voice.connected]);
  const level = voice.connected ? rawLevel : 0;
  const orbState: OrbState = listening
    ? "listening"
    : voice.connected
      ? voice.state === "speaking"
        ? "composing"
        : voice.state === "thinking"
          ? "working"
          : voice.state === "connecting"
            ? "connecting"
            : "listening"
      : draft.trim()
        ? "composing"
        : "breathing";

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
          routed_by: current.answer.router === "gemini" ? "Gemini" : "keyword router",
          answers_in_strip: entries.length,
        }
      : { answers_in_strip: entries.length },
    student: false,
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

  useStudioIntent("cohort", async (i) => {
    if (i.kind === "describe" || (i.kind === "scene" && i.scene !== "ask")) return shown.message;
    if (i.kind === "scene") {
      deck.go("ask");
      return describe(undefined).message;
    }
    if (i.kind === "next" || i.kind === "previous") return move(i.kind === "next" ? 1 : -1).message;
    if (i.kind === "ask") {
      if (!mapsToQuery(i.question)) return `I can only answer six cohort comparisons, and that question does not match one. Ask about: ${SUGGESTIONS.map((x) => x.q).join(" | ")}`;
      if (busyRef.current) return "I'm still working on the last question. Give it a moment, then ask again.";
      const e = await askRef.current(i.question, "voice");
      if (!e) return lastError.current || "The cohort query failed. Try again.";
      return `${spokenAnswer(e.answer).message} Sample sizes: ${e.answer.rows.map((r) => `${r.label} ${fmtN(r.n)}`).join(", ")}. Evidence ${e.answer.tool_result_id}. Synthetic alumni, an association not a cause.`;
    }
    return "That does not apply to the cohort screen.";
  });

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
          orb={{ state: orbState, level }}
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
    return <AnswerScene answer={e.answer} idea={idea} onIdea={(q) => void ask(q, "ui")} narration={{ available: !voice.connected, speaking, onSpeak: () => speakAnswer(e.id, e.answer), onStop: stopSpeech }} />;
  };

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <>
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
      </>

      <AnimatePresence>
        {theatre && (
          <motion.div key="theatre" className="fixed inset-0 z-[60]" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.55, delay: 0.15 } }} transition={{ duration: 0.4 }}>
            <ProcessingTheatre
              steps={theatre.steps}
              title="Asking the cohort"
              subtitle={`“${theatre.question.length > 90 ? `${theatre.question.slice(0, 89).trimEnd()}…` : theatre.question}”`}
              voiceLevel={level}
              exiting={theatre.exiting}
              onExited={() => exited.current?.()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
