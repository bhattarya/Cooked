"use client";

import Link from "next/link";
import { ConversationProvider, useConversation } from "@elevenlabs/react";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { alarmCheck, askAgent, findRepair, getMyths, getState, narrate, remember, runDrill, sayLine, setWorkHours, uploadAudit, type Answer, type Myths } from "@/lib/agentApi";
import { auditLines, auditPdf } from "@/lib/audit";
import { signOutOfGoogle } from "@/lib/auth";
import { useDataset } from "@/lib/data";
import { listen, useCanListen } from "@/lib/listen";
import { apiHealth, type Health, type ServerDrill, type ServerRepair } from "@/lib/live";
import { speak, type Speaking } from "@/lib/voice";
import type { SessionUser } from "@/lib/session";
import { Wordmark } from "../brand";
import { AnswerCard } from "./AnswerCard";
import { Dashboard, type FullState } from "./Dashboard";
import { Orb, type OrbMode } from "./Orb";
import { Pipeline, type Step } from "./Pipeline";
import { SponsorChip, sponsorLive, type SponsorKey, type SponsorLive } from "./Sponsors";

type Phase = "intro" | "reading" | "work" | "dashboard";

// Synthetic students from the pinned dataset, checked against the trained model (none refused).
const SAMPLES = [
  { id: "CID-510094", label: "Working 22 h/week", hint: "the alarm fires early" },
  { id: "CID-137153", label: "Light load, heavy job", hint: "already cooked" },
  { id: "CID-104853", label: "Full loads", hint: "on track" },
];

const SPONSOR_ORDER: SponsorKey[] = ["gemini", "elevenlabs", "backboard", "tiger", "model", "digitalocean"];

export function Workspace({ user, liveAgentConfigured }: { user: SessionUser; liveAgentConfigured: boolean }) {
  return <ConversationProvider><WorkspaceContent user={user} liveAgentConfigured={liveAgentConfigured} /></ConversationProvider>;
}

function WorkspaceContent({ user, liveAgentConfigured }: { user: SessionUser; liveAgentConfigured: boolean }) {
  const ds = useDataset();
  const [health, setHealth] = useState<(Health & { database_kind?: string }) | null>(null);
  const live: SponsorLive = useMemo(() => sponsorLive(health), [health]);
  const [phase, setPhase] = useState<Phase>("intro");
  const [caption, setCaption] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const [level, setLevel] = useState(0);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [steps, setSteps] = useState<Step[]>([]);
  const [id, setId] = useState<string | null>(null);
  const [name, setName] = useState<string | null>(user.guest ? null : user.firstName);
  const [work, setWork] = useState<number | undefined>(undefined);
  const [st, setSt] = useState<FullState | null>(null);
  const [drill, setDrill] = useState<ServerDrill | null>(null);
  const [repair, setRepair] = useState<ServerRepair | null>(null);
  const [myths, setMyths] = useState<Myths | null>(null);
  const [feed, setFeed] = useState<Answer[]>([]);
  const [highlight, setHighlight] = useState<string[]>([]);
  const [text, setText] = useState("");
  const voiceInput = useCanListen();
  const [liveAgentError, setLiveAgentError] = useState("");
  const voice = useRef<Speaking | null>(null);
  const stopListen = useRef<(() => void) | null>(null);
  const workResolve = useRef<((h: number) => void) | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const conversation = useConversation({
    clientTools: {
      askStudent: async ({ question }: { question: string }) => {
        if (!id) return "Please ask the student to upload a degree audit or try a synthetic sample first.";
        setBusy(true);
        try {
          const loadNow = st?.terms.length ? Math.round(st.terms.reduce((a, t) => a + t.attempted, 0) / st.terms.length) : undefined;
          const result = await askAgent(id, question, work, loadNow);
          setFeed((f) => [result.data, ...f].slice(0, 8));
          if (result.data.visual.type === "course" && result.data.visual.highlight) setHighlight(result.data.visual.highlight);
          window.scrollTo({ top: 0, behavior: "smooth" });
          return JSON.stringify({ answer: result.data.text, visual: result.data.visual.type, evidence: result.data.provenance, instruction: "The chart is now visible. Speak the answer exactly; do not invent other numbers." });
        } catch {
          return "The student analysis failed. Ask them to try again.";
        } finally {
          setBusy(false);
        }
      },
    },
    onMessage: (message) => { if (message.message) setCaption(message.message); },
    onError: (message) => setLiveAgentError(message),
  });
  const liveConnected = conversation.status === "connected";
  const liveConnecting = conversation.status === "connecting";

  const mode: OrbMode = liveConnected ? conversation.isSpeaking ? "speaking" : "listening" : listening ? "listening" : speaking ? "speaking" : busy || liveConnecting ? "thinking" : "idle";
  const heat = st ? st.risk.value : 0;

  // ---------- voice out ----------
  const say = useCallback((line: string, v: "narrator" | "coach" = "narrator") => {
    voice.current?.stop();
    setCaption(line);
    setSpeaking(true);
    const s = speak(line, v, () => {}, setLevel);
    voice.current = s;
    s.done.finally(() => {
      if (voice.current === s) {
        setSpeaking(false);
        setLevel(0);
      }
    });
  }, []);
  const sayServer = useCallback(
    (line: "greeting" | "thanks" | "ask_work" | "ready") =>
      sayLine(line, name ?? undefined)
        .then((c) => say(c.data.text))
        .catch(() => undefined),
    [name, say],
  );

  useEffect(() => {
    apiHealth().then((h) => setHealth(h as Health & { database_kind?: string }));
    const t = setTimeout(() => sayServer("greeting"), 600);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!liveConnected) return;
    const timer = window.setInterval(() => setLevel(conversation.getOutputVolume()), 80);
    return () => window.clearInterval(timer);
  }, [liveConnected, conversation]);

  const toggleLiveAgent = async () => {
    if (liveConnected || liveConnecting) { conversation.endSession(); return; }
    setLiveAgentError("");
    voice.current?.stop();
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      const response = await fetch("/voice-session", { cache: "no-store" });
      const body = await response.json() as { signedUrl?: string; error?: string };
      if (!response.ok || !body.signedUrl) throw new Error(body.error || "Live agent unavailable.");
      conversation.startSession({ signedUrl: body.signedUrl });
    } catch (e) {
      setLiveAgentError(e instanceof Error ? e.message : "Could not start live voice.");
    }
  };

  // ---------- pipeline ----------
  const patch = (key: string, p: Partial<Step>) => setSteps((s) => s.map((x) => (x.key === key ? { ...x, ...p } : x)));

  const runAudit = useCallback(
    async (file: Blob, filename: string) => {
      setError(null);
      setPhase("reading");
      setBusy(true);
      sayServer("thanks");
      setSteps([
        { key: "read", agent: "Reader", task: "reading your audit", sponsor: "gemini", live: live.gemini, status: "running" },
        { key: "match", agent: "Matcher", task: "finding alumni like you", sponsor: "tiger", live: live.tiger, status: "pending" },
        { key: "risk", agent: "Watchtower", task: "scoring your trajectory", sponsor: "model", live: live.model, status: "pending" },
        { key: "drill", agent: "Fire drill", task: "simulating what could go wrong", sponsor: "tiger", live: live.tiger, status: "pending" },
        { key: "fix", agent: "Repair", task: "finding the smallest fix", sponsor: "model", live: live.model, status: "pending" },
        { key: "voice", agent: "Narrator", task: "writing it up", sponsor: "elevenlabs", live: live.elevenlabs, status: "pending" },
        { key: "memory", agent: "Memory", task: "remembering this session", sponsor: "backboard", live: live.backboard, status: "pending" },
      ]);
      try {
        const intake = await uploadAudit(file, filename);
        const d = intake.data;
        if (!d.id) {
          patch("read", { status: "error", result: d.error });
          setError(d.error ?? "Couldn't read that audit.");
          setBusy(false);
          setPhase("intro");
          say(d.error ?? "I couldn't read that audit.");
          return;
        }
        const s = d.summary!;
        if (d.first_name && user.guest) setName(d.first_name);
        patch("read", {
          status: "done",
          live: d.source === "gemini" && live.gemini,
          result: `${d.source === "sample" ? "sample audit · synthetic student" : "read by Gemini"} · ${s.terms} terms · ${s.courses_done} courses done · ${s.in_progress} in progress · ${s.credits_earned}/${s.credits_required} credits`,
          tr: s.tool_result_id,
          ms: intake.ms,
        });
        let hours: number | undefined;
        if (d.needs_work_hours) {
          setBusy(false);
          setPhase("work");
          sayServer("ask_work");
          hours = await new Promise<number>((resolve) => (workResolve.current = resolve));
          await setWorkHours(d.id, hours);
          setPhase("reading");
          setBusy(true);
        }
        setWork(hours);
        setId(d.id);

        patch("match", { status: "running" });
        const state = await getState(d.id, hours, undefined);
        const sd = state.data as FullState;
        const loadNow = sd.terms.length ? Math.round(sd.terms.reduce((a, t) => a + t.attempted, 0) / sd.terms.length) : 15;
        const withPlan = await getState(d.id, hours, loadNow);
        setSt(withPlan.data as FullState);
        patch("match", {
          status: sd.twins.refused ? "warn" : "done",
          result: sd.twins.refused ? `refused: ${sd.twins.reason} (COOKED doesn't guess below 30)` : `${sd.twins.n} balanced twins · SMD ${Object.values(sd.twins.smd).map((v) => v.toFixed(2)).join(" / ")}`,
          tr: sd.twins.tool_result_id,
          ms: state.ms,
        });
        patch("risk", { status: "running" });
        const alarm = await alarmCheck(d.id).catch(() => null);
        patch("risk", {
          status: "done",
          result: `model risk ${Math.round(sd.risk.value * 100)}% · ${sd.pattern ?? "no pattern yet"}${alarm?.data.fires ? ` · alarm #${alarm.data.id} open` : ""}`,
          tr: sd.risk.tool_result_id,
        });
        patch("drill", { status: "running" });
        const [dr, rp, my] = await Promise.all([runDrill(d.id, loadNow, hours), findRepair(d.id, hours), getMyths().catch(() => null)]);
        setDrill(dr.data);
        patch("drill", {
          status: "done",
          result: `${dr.data.shocks_to_cooked === null ? `resilient to ${dr.data.path.length} shocks` : dr.data.shocks_to_cooked.value === 0 ? "past the line before any shock" : `${dr.data.shocks_to_cooked.value} shocks break the plan`} · ${dr.data.rows_stored} trajectories stored`,
          tr: dr.data.tool_result_id,
          ms: dr.ms,
        });
        setRepair(rp.data);
        if (my) setMyths(my.data);
        patch("fix", {
          status: rp.data.primary ? "done" : "warn",
          result: rp.data.primary ? `${rp.data.primary.title} · ${rp.data.primary.diff_years.toFixed(1)} yrs sooner · n=${rp.data.primary.support}` : rp.data.refusal ?? "nothing to fix",
          tr: rp.data.tool_result_id ?? undefined,
        });
        patch("voice", { status: "running" });
        const n = await narrate("alarm", d.id, hours, false);
        patch("voice", {
          status: "done",
          live: n.data.source !== "template" && live.gemini,
          result: `${n.data.source === "cache" ? "Gemini script (cached)" : n.data.source.startsWith("template (gemini") ? "template now · Gemini writing its version" : "template"} · ${n.data.provenance.tokens} numbers, every one traced · ${live.elevenlabs ? "ElevenLabs voice" : "browser voice"}`,
          ms: n.ms,
        });
        // memory can take a few seconds (Backboard); don't hold the dashboard for it
        patch("memory", { status: "running" });
        remember(d.id, `Uploaded an audit and saw the COOKED dashboard (${sd.pattern ?? "no pattern"}).`)
          .then((mem) => patch("memory", { status: "done", live: mem.data.stored === "backboard", result: mem.data.stored === "backboard" ? "remembered in Backboard" : "saved to app.memory_note", ms: mem.ms }))
          .catch(() => patch("memory", { status: "warn", result: "memory unavailable" }));

        setBusy(false);
        await new Promise((r) => setTimeout(r, 700));
        setPhase("dashboard");
        say(n.data.text);
      } catch (e) {
        setBusy(false);
        setError(e instanceof Error ? e.message : "Something went wrong.");
        setSteps((s) => s.map((x) => (x.status === "running" ? { ...x, status: "error", result: "failed" } : x)));
      }
    },
    [live, say, sayServer, user.guest],
  );

  const onFile = (f: File | undefined) => f && runAudit(f, f.name);
  const onSample = (cid: string) => {
    if (!ds) return;
    const s = ds.current.find((x) => x.id === cid);
    if (s) runAudit(auditPdf(auditLines(s, ds.catalog)), `sample-${cid}.pdf`);
  };

  // ---------- questions ----------
  const ask = useCallback(
    async (q: string) => {
      if (!id || !q.trim()) return;
      if (liveConnected) { conversation.sendUserMessage(q.trim()); setText(""); return; }
      setBusy(true);
      setText("");
      try {
        const loadNow = st?.terms.length ? Math.round(st.terms.reduce((a, t) => a + t.attempted, 0) / st.terms.length) : undefined;
        const c = await askAgent(id, q.trim(), work, loadNow);
        setFeed((f) => [c.data, ...f].slice(0, 8));
        if (c.data.visual.type === "course" && c.data.visual.highlight) setHighlight(c.data.visual.highlight);
        say(c.data.text, c.data.tool === "find_fix" ? "coach" : "narrator");
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch {
        say("Sorry, I couldn't answer that one.");
      } finally {
        setBusy(false);
      }
    },
    [id, st, work, say, liveConnected, conversation],
  );

  const toggleListen = () => {
    if (liveConnected || liveConnecting) { conversation.endSession(); return; }
    if (listening) {
      stopListen.current?.();
      return;
    }
    voice.current?.stop();
    setHeard("");
    setListening(true);
    const h = listen(
      (t, final) => {
        setHeard(t);
        if (final) {
          if (phase === "work") {
            const n = t.match(/\d+/);
            if (n) workResolve.current?.(Number(n[0]));
            else if (/no|none|don'?t/i.test(t)) workResolve.current?.(0);
          } else if (phase === "dashboard") ask(t);
        }
      },
      (err) => {
        setListening(false);
        if (err && err !== "no-speech" && err !== "aborted") setError(err === "unsupported" ? "Voice input needs Chrome, Edge or Safari. Type instead." : `Microphone: ${err}`);
      },
    );
    stopListen.current = h.stop;
  };

  const suggestions = useMemo(() => {
    // course ideas come from what the catalog check says is actually open next term
    const picks = (repair?.primary?.feasibility?.picks ?? []).map((p) => p.course_id).filter((c) => /^(CMSC|IS)/.test(c));
    const course = picks.length >= 2 ? `What if I take ${picks[1]} instead of ${picks[0]}?` : picks.length ? `Can I take ${picks[0]} next term?` : "Can I take CMSC341 next term?";
    return ["Am I cooked?", "What if I take 3 more credits a term?", course, "What if I work 10 hours a week?", "Stress test my plan", "How do I get un-cooked?"];
  }, [repair]);

  // ---------- render ----------
  return (
    <div className="relative min-h-dvh" style={{ ["--heat-level" as string]: Math.min(1, heat * 1.1) }}>
      <div className="haze" />
      <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-[1300px] items-center gap-3 px-4 sm:px-6">
          <Link href="/app">
            <Wordmark />
          </Link>
          <div className="ml-4 hidden flex-wrap gap-1.5 lg:flex">
            {SPONSOR_ORDER.map((k) => (
              <SponsorChip key={k} k={k} live={live[k]} compact />
            ))}
          </div>
          <div className="ml-auto flex items-center gap-3">
            {phase === "dashboard" && liveAgentConfigured && <button onClick={() => void toggleLiveAgent()} className="hidden rounded-full border border-cool/40 px-3 py-1.5 text-xs text-cool transition hover:bg-cool/10 sm:inline">{liveConnected || liveConnecting ? "End live agent" : "Live voice agent"}</button>}
            <Link href="/app/explore" className="hidden text-xs text-muted hover:text-text sm:inline">
              Explore the cohort
            </Link>
            <Link href="/app/advisor" className="hidden text-xs text-muted hover:text-text sm:inline">
              Advisor view
            </Link>
            {user.picture ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.picture} alt="" className="h-7 w-7 rounded-full" referrerPolicy="no-referrer" />
            ) : (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white/10 text-xs">{user.name[0]}</span>
            )}
            <form
              action="/auth/logout"
              method="POST"
              onSubmit={(e) => {
                e.preventDefault();
                const form = e.currentTarget;
                void signOutOfGoogle().finally(() => form.submit());
              }}
            >
              <button className="text-xs text-muted hover:text-text">Sign out</button>
            </form>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1300px] px-4 pb-40 pt-6 sm:px-6">
        <AnimatePresence mode="wait">
          {phase !== "dashboard" ? (
            <motion.div key="stage" exit={{ opacity: 0, scale: 0.97 }} transition={{ duration: 0.35 }} className="grid min-h-[72vh] items-center gap-10 lg:grid-cols-[1fr_1fr]">
              <div className="flex flex-col items-center text-center">
                <Orb mode={mode} level={level} size={190} heat={0} onClick={phase === "work" ? toggleListen : () => sayServer("greeting")} />
                <motion.p key={caption} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="display mt-8 max-w-md text-2xl leading-snug">
                  {caption || (name ? `Hey ${name}.` : "Hey.")}
                </motion.p>
                {listening && <p className="mt-2 text-sm text-ice">{heard || "listening…"}</p>}
                <p className="mt-2 text-xs text-dim">{live.elevenlabs ? "Voice by ElevenLabs" : "browser voice · ElevenLabs offline"} · tap the orb to hear it again</p>
              </div>

              <div>
                {phase === "intro" && (
                  <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="space-y-4">
                    <Link href="/app/explore" className="block rounded-3xl border border-cool/30 bg-cool/[0.05] p-5 transition hover:bg-cool/[0.09]">
                      <div className="label !text-cool">Start with a conversation</div>
                      <div className="display mt-2 text-xl font-semibold">No audit? Ask the cohort first →</div>
                      <div className="mt-1 text-sm text-muted">Talk through work, classes, internships, career outcomes, and cost before sharing your own plan.</div>
                    </Link>
                    <div
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={(e) => {
                        e.preventDefault();
                        onFile(e.dataTransfer.files[0]);
                      }}
                      onClick={() => fileInput.current?.click()}
                      className="group flex cursor-pointer flex-col items-center justify-center rounded-3xl border border-dashed border-line-2 bg-panel/60 px-6 py-12 text-center transition hover:border-heat/60 hover:bg-heat/[0.03]"
                    >
                      <input ref={fileInput} type="file" accept="application/pdf,image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
                      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-heat/10 text-heat transition group-hover:scale-110">
                        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                          <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
                        </svg>
                      </div>
                      <div className="mt-4 text-lg font-medium">Drop your degree audit</div>
                      <div className="mt-1 text-sm text-muted">PDF or photo · read by Gemini · the file is never stored</div>
                      {!live.gemini && <div className="mt-2 text-xs text-amber">Gemini isn&apos;t configured yet: real audits won&apos;t read. Samples work.</div>}
                    </div>
                    <div>
                      <div className="label mb-2">or try a sample audit (synthetic students)</div>
                      <div className="grid gap-2 sm:grid-cols-3">
                        {SAMPLES.map((s) => (
                          <button key={s.id} disabled={!ds} onClick={() => onSample(s.id)} className="rounded-2xl border border-line bg-panel p-3 text-left transition hover:border-line-2 disabled:opacity-40">
                            <div className="text-sm">{s.label}</div>
                            <div className="text-xs text-dim">{s.hint}</div>
                          </button>
                        ))}
                      </div>
                    </div>
                    {error && <p className="text-sm text-hot">{error}</p>}
                  </motion.div>
                )}
                {(phase === "reading" || phase === "work") && (
                  <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} className="panel p-6">
                    <div className="label mb-3">agents at work</div>
                    <Pipeline steps={steps} />
                    {phase === "work" && (
                      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 border-t border-line pt-5">
                        <div className="text-sm">About how many hours a week do you work?</div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {[0, 10, 15, 20, 25, 30].map((h) => (
                            <button key={h} onClick={() => workResolve.current?.(h)} className="num rounded-full border border-line px-4 py-1.5 text-sm hover:border-heat/60">
                              {h === 0 ? "I don't" : `${h} h`}
                            </button>
                          ))}
                          {voiceInput && (
                            <button onClick={toggleListen} className="rounded-full bg-text px-4 py-1.5 text-sm text-bg">
                              {listening ? "Listening…" : "Say it"}
                            </button>
                          )}
                        </div>
                      </motion.div>
                    )}
                    {error && <p className="mt-4 text-sm text-hot">{error}</p>}
                  </motion.div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div key="dash" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-5">
              {liveAgentError && <p role="alert" className="rounded-xl border border-hot/30 bg-hot/5 px-4 py-3 text-sm text-hot">{liveAgentError}</p>}
              {liveAgentConfigured && !liveConnected && <button onClick={() => void toggleLiveAgent()} className="rounded-full border border-cool/40 px-4 py-2 text-xs text-cool sm:hidden">Start live voice agent</button>}
              {liveConnected && <div className="panel flex items-center gap-4 p-4"><Orb mode={mode} level={level} size={30} heat={heat} onClick={() => conversation.endSession()} /><span className="text-sm text-cool">ElevenLabs agent {conversation.isSpeaking ? "speaking" : "listening"} · ask about your audit</span></div>}
              <AnimatePresence initial={false}>
                {feed.map((a, i) => (
                  <AnswerCard key={`${a.question}-${feed.length - i}`} a={a} live={live} />
                ))}
              </AnimatePresence>
              {st && <Dashboard name={name} st={st} drill={drill} repair={repair} myths={myths} ds={ds} highlight={highlight} live={live} />}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {phase === "dashboard" && (
        <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="fixed inset-x-0 bottom-0 z-40 px-3 pb-3 sm:px-6 sm:pb-5">
          <div className="mx-auto max-w-3xl rounded-3xl border border-line-2 bg-panel-2/90 p-3 shadow-2xl backdrop-blur-xl">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {suggestions.map((s) => (
                <button key={s} onClick={() => ask(s)} disabled={busy} className="shrink-0 rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-heat/50 hover:text-text disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(text);
              }}
              className="flex items-center gap-3"
            >
              <div className="shrink-0">
                <Orb mode={mode} level={level} size={30} heat={heat} onClick={toggleListen} />
              </div>
              <input
                value={listening ? heard : text}
                onChange={(e) => setText(e.target.value)}
                placeholder={busy ? "Agents are thinking…" : voiceInput ? "Tap the orb and talk, or type: what if I take CMSC 341 instead?" : "Ask: what if I take CMSC 341 instead?"}
                className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-dim"
                disabled={busy}
              />
              <button disabled={busy || !text.trim()} className="rounded-full bg-text px-4 py-2 text-sm font-medium text-bg transition disabled:opacity-30">
                Ask
              </button>
            </form>
          </div>
        </motion.div>
      )}
    </div>
  );
}
