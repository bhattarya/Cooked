"use client";

import Link from "next/link";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { motion, AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { api } from "@/lib/live";
import { listen, useCanListen } from "@/lib/listen";
import { speak, type Speaking } from "@/lib/voice";
import { Wordmark } from "../brand";
import { Orb, type OrbMode } from "./Orb";
import { Pipeline, type Step } from "./Pipeline";

interface CohortRow { label: string; n: number; value: number | null; unknown?: number; tool_result_id: string }
interface CohortAnswer {
  question: string; topic: string; router: "gemini" | "local"; title: string; detail: string;
  measure: string; dimension: string; unit: string; rows: CohortRow[];
  source: string; tool_result_id: string; disclaimer: string;
  narration: { text: string };
}

const IDEAS = [
  "I work a lot. Where are the bottlenecks?",
  "Does a lighter course load change the timeline?",
  "How do internships relate to first jobs?",
  "Where did graduates go after college?",
  "Compare Computer Science and Information Systems",
  "What does degree cost look like by year?",
];

function format(value: number | null, unit: string) {
  if (value == null) return "—";
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "years") return `${value.toFixed(2)}y`;
  if (unit === "ratio") return value.toFixed(2);
  return Math.round(value).toLocaleString();
}

export function ExploreWorkspace({ name, liveAgentConfigured }: { name: string; liveAgentConfigured: boolean }) {
  return <ConversationProvider><ExploreContent name={name} liveAgentConfigured={liveAgentConfigured} /></ConversationProvider>;
}

function ExploreContent({ name, liveAgentConfigured }: { name: string; liveAgentConfigured: boolean }) {
  const [query, setQuery] = useState("");
  const [answers, setAnswers] = useState<CohortAnswer[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [heard, setHeard] = useState("");
  const [level, setLevel] = useState(0);
  const [error, setError] = useState("");
  const [tiger, setTiger] = useState(false);
  const [gemini, setGemini] = useState(false);
  const [elevenlabs, setElevenlabs] = useState(false);
  const voiceInput = useCanListen();
  const [voice, setVoice] = useState<Speaking | null>(null);
  const [stopListen, setStopListen] = useState<(() => void) | null>(null);
  const [liveTranscript, setLiveTranscript] = useState("");
  const [liveAgentError, setLiveAgentError] = useState("");
  const conversation = useConversation({
    clientTools: {
      exploreCohort: async ({ question }: { question: string }) => {
        const answer = await ask(question, false);
        return answer ? JSON.stringify({ summary: answer.narration.text, title: answer.title, chart: answer.rows.map((r) => ({ group: r.label, value: r.value, unit: answer.unit, sample_size: r.n })), caution: answer.disclaimer }) : "The cohort query failed. Ask the user to try again.";
      },
    },
    onMessage: (message) => {
      if (message.message) setLiveTranscript(message.message);
    },
    onError: (message) => setLiveAgentError(message),
  });
  const liveConnected = conversation.status === "connected";
  const liveConnecting = conversation.status === "connecting";
  const mode: OrbMode = liveConnected ? conversation.isSpeaking ? "speaking" : "listening" : listening ? "listening" : speaking ? "speaking" : busy || liveConnecting ? "thinking" : "idle";

  useEffect(() => {
    if (!liveConnected) return;
    const timer = window.setInterval(() => setLevel(conversation.getOutputVolume()), 80);
    return () => window.clearInterval(timer);
  }, [liveConnected, conversation]);

  useEffect(() => {
    import("@/lib/live").then(({ apiHealth }) => apiHealth()).then((h) => {
      setTiger((h as typeof h & { database_kind?: string }).database_kind === "tiger-cloud");
      setGemini(Boolean(h?.providers?.gemini));
      setElevenlabs(Boolean(h?.providers?.elevenlabs));
    }).catch(() => undefined);
  }, []);

  async function ask(question: string, speakAnswer = true): Promise<CohortAnswer | null> {
    const q = question.trim();
    if (!q || busy) return null;
    voice?.stop();
    stopListen?.();
    setListening(false);
    setQuery("");
    setError("");
    setBusy(true);
    setSteps([
      { key: "route", agent: "Orchestrator", task: "understanding the question", sponsor: "gemini", live: gemini, status: "running" },
      { key: "query", agent: "Evidence", task: "checking the synthetic cohort", sponsor: "tiger", live: tiger, status: "pending" },
      { key: "chart", agent: "Visualizer", task: "building the comparison", sponsor: "model", live: true, status: "pending" },
      { key: "voice", agent: "Narrator", task: "speaking the result", sponsor: "elevenlabs", live: elevenlabs, status: "pending" },
    ]);
    try {
      const result = await api<CohortAnswer>("/explore", { question: q });
      const a = result.data;
      const ms = result.ms;
      setSteps((s) => s.map((x) => x.key === "route" ? { ...x, status: "done", live: a.router === "gemini" && gemini, result: `${a.router} chose ${a.topic}` } : x.key === "query" ? { ...x, status: "done", result: `${a.rows.length} groups · ${a.source}`, tr: a.tool_result_id, ms } : x.key === "chart" ? { ...x, status: "done", result: `${a.measure} by ${a.dimension}` } : x));
      setAnswers((old) => [a, ...old].slice(0, 5));
      setSteps((s) => s.map((x) => x.key === "voice" ? { ...x, status: "running" } : x));
      if (speakAnswer) {
        setSpeaking(true);
        const clip = speak(a.narration.text, "narrator", () => {}, setLevel, (source) => {
          setSteps((s) => s.map((x) => x.key === "voice" ? { ...x, live: source === "elevenlabs", result: source === "elevenlabs" ? "ElevenLabs voice" : source === "browser" ? "browser voice" : "voice unavailable" } : x));
        });
        setVoice(clip);
        clip.done.finally(() => {
          setSpeaking(false);
          setLevel(0);
          setSteps((s) => s.map((x) => x.key === "voice" ? { ...x, status: "done" } : x));
        });
      } else {
        setSteps((s) => s.map((x) => x.key === "voice" ? { ...x, status: "done", live: true, result: "ElevenLabs live agent speaking" } : x));
      }
      return a;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not explore the cohort.");
      setSteps((s) => s.map((x) => x.status === "running" || x.status === "pending" ? { ...x, status: "error" } : x));
      return null;
    } finally {
      setBusy(false);
    }
  }

  function toggleMic() {
    if (liveConnected || liveConnecting) { conversation.endSession(); setLiveTranscript(""); return; }
    if (listening) { stopListen?.(); setListening(false); return; }
    voice?.stop();
    setSpeaking(false);
    setHeard("");
    setListening(true);
    const handle = listen((text, final) => {
      setHeard(text);
      if (final) { setListening(false); void ask(text); }
    }, (err) => {
      setListening(false);
      if (err && err !== "no-speech" && err !== "aborted") setError(`Microphone: ${err}`);
    });
    setStopListen(() => handle.stop);
  }

  async function toggleLiveAgent() {
    if (liveConnected || liveConnecting) { conversation.endSession(); return; }
    setLiveAgentError("");
    voice?.stop();
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const response = await fetch("/voice-session", { cache: "no-store" });
      const body = await response.json() as { signedUrl?: string; error?: string };
      if (!response.ok || !body.signedUrl) throw new Error(body.error || "Live agent unavailable.");
      conversation.startSession({ signedUrl: body.signedUrl });
    } catch (e) {
      setLiveAgentError(e instanceof Error ? e.message : "Could not start live voice.");
    }
  }

  return <div className="relative min-h-dvh">
    <div className="haze" />
    <header className="relative z-10 border-b border-line bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-[1200px] items-center gap-5 px-5">
        <Link href="/app"><Wordmark /></Link>
        <span className="h-5 w-px bg-line-2" />
        <span className="text-sm text-muted">Cohort explorer</span>
        <Link href="/app" className="ml-auto rounded-full border border-line-2 px-4 py-2 text-xs transition hover:border-heat/50">Upload an audit →</Link>
      </div>
    </header>
    <main className="relative z-10 mx-auto max-w-[1200px] px-5 pb-32 pt-10">
      <div className="grid items-center gap-8 lg:grid-cols-[0.95fr_1.05fr]">
        <div>
          <div className="label !text-cool">Explore before you upload</div>
          <h1 className="display mt-4 max-w-xl text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">Ask what the data <span className="text-heat">actually says.</span></h1>
          <p className="mt-5 max-w-lg text-base leading-relaxed text-muted">Hey {name}. Talk through a plan, a bottleneck, or an outcome. COOKED finds a grounded cohort comparison, shows its sample sizes, and talks you through it.</p>
          <div className="mt-7 flex flex-wrap gap-2">
            {IDEAS.map((idea) => <button key={idea} disabled={busy} onClick={() => void ask(idea)} className="rounded-full border border-line-2 bg-panel px-4 py-2 text-left text-xs text-muted transition hover:border-heat/60 hover:text-text disabled:opacity-40">{idea}</button>)}
          </div>
        </div>
        <div className="panel relative flex min-h-[380px] flex-col items-center justify-center overflow-hidden p-8 text-center">
          <div className="absolute inset-0 grid-bg opacity-60" />
          <div className="relative"><Orb mode={mode} level={level} size={145} onClick={toggleMic} /></div>
          <div className="display relative mt-6 text-xl">{liveConnected ? liveTranscript || (conversation.isSpeaking ? "Agent speaking…" : "Live agent listening…") : listening ? heard || "Listening…" : busy ? "Following the evidence…" : speaking ? "Talking it through…" : "Ask me anything about the cohort"}</div>
          <div className="relative mt-2 text-xs text-dim">{liveConnected ? "Tap the orb to end the session" : voiceInput ? "Tap the orb to speak" : "Type a question below"} · {elevenlabs ? "ElevenLabs voice available" : "browser voice"}</div>
          {liveAgentConfigured && <button onClick={() => void toggleLiveAgent()} className="relative mt-4 rounded-full border border-cool/50 bg-cool/10 px-5 py-2 text-sm text-cool transition hover:bg-cool/20">{liveConnected || liveConnecting ? "End live voice agent" : "Start live ElevenLabs agent"}</button>}
          {liveAgentError && <p role="alert" className="relative mt-3 text-xs text-hot">{liveAgentError}</p>}
          {steps.length > 0 && <div className="relative mt-7 w-full max-w-md rounded-2xl border border-line bg-bg/85 p-4 text-left"><Pipeline steps={steps} /></div>}
        </div>
      </div>
      <form onSubmit={(e) => { e.preventDefault(); void ask(query); }} className="mx-auto mt-8 flex max-w-3xl gap-2 rounded-2xl border border-line-2 bg-panel-2 p-2 shadow-xl">
        <input value={query} onChange={(e) => { setQuery(e.target.value); if (liveConnected) conversation.sendUserActivity(); }} placeholder="Hey COOKED, what happens when I work more and take fewer credits?" className="min-w-0 flex-1 bg-transparent px-3 text-sm outline-none placeholder:text-dim" />
        <button disabled={busy || !query.trim()} className="rounded-xl bg-heat px-5 py-3 text-sm font-semibold text-bg disabled:opacity-40">Explore</button>
      </form>
      {error && <p role="alert" className="mx-auto mt-3 max-w-3xl text-sm text-hot">{error}</p>}
      <div className="mt-10 space-y-6"><AnimatePresence initial={false}>{answers.map((a, i) => <CohortChart key={`${a.question}-${i}`} answer={a} />)}</AnimatePresence></div>
      <p className="mt-8 text-xs text-dim">All records are synthetic. Group patterns show associations, not causal effects or personal forecasts. Upload a degree audit for a plan-specific view.</p>
    </main>
  </div>;
}

function CohortChart({ answer: a }: { answer: CohortAnswer }) {
  const max = Math.max(1, ...a.rows.map((r) => r.value ?? 0));
  return <motion.section initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="panel overflow-hidden">
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-5 sm:p-7">
      <div><div className="label">“{a.question}”</div><h2 className="display mt-2 text-2xl font-semibold">{a.title}</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">{a.detail}</p></div>
      <span className="rounded-full border border-amber/40 px-3 py-1 text-xs text-amber">Tiger Data · {a.router === "gemini" ? "Gemini routed" : "local route"}</span>
    </div>
    <div className="p-5 sm:p-7">
      <div className="mb-4 flex justify-between text-[11px] uppercase tracking-widest text-dim"><span>{a.dimension}</span><span>{a.measure}</span></div>
      <div className="space-y-4">{a.rows.map((r, i) => <div key={r.label} className="grid grid-cols-[minmax(90px,150px)_1fr_auto] items-center gap-3 text-sm">
        <span className="min-w-0 truncate text-muted" title={r.label}>{r.label}</span>
        <div className="h-8 overflow-hidden rounded-lg bg-white/[0.04]"><motion.div initial={{ width: 0 }} animate={{ width: `${Math.max(2, ((r.value ?? 0) / max) * 100)}%` }} transition={{ duration: 0.7, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] }} className="flex h-full items-center rounded-lg bg-gradient-to-r from-heat/60 to-heat px-2" /></div>
        <span className="num min-w-16 text-right font-semibold text-heat" title={r.tool_result_id}>{format(r.value, a.unit)}</span>
        <span className="col-start-2 text-[11px] text-dim">n={r.n.toLocaleString()}{r.unknown ? ` · ${r.unknown} No Response excluded` : ""}</span>
      </div>)}</div>
      <div className="mt-6 border-t border-line pt-4 text-[11px] leading-relaxed text-dim">{a.disclaimer} · Evidence {a.tool_result_id}</div>
    </div>
  </motion.section>;
}
