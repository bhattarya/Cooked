"use client";

import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { availableCommands, subscribeRegistry, type CommandName } from "@/lib/commands";
import { useCookedVoice, type VoiceState } from "@/lib/voiceAgent";
import { CommandToast } from "./CommandToast";
import { VoiceOrb } from "./VoiceOrb";

const HINTS: { cmd: CommandName; text: string }[] = [
  { cmd: "showScene", text: "“Show me the twins”" },
  { cmd: "askStudent", text: "“Am I cooked?”" },
  { cmd: "setScenario", text: "“Set internships to three”" },
  { cmd: "runStressTest", text: "“Run a stress test”" },
  { cmd: "findRepair", text: "“How do I get un-cooked?”" },
  { cmd: "showScene", text: "“Compare the four models”" },
  { cmd: "nextScene", text: "“Next”" },
  { cmd: "loadSampleStudent", text: "“Load a sample student”" },
];

const STATE_LABEL: Record<VoiceState, string> = {
  idle: "Ask COOKED",
  connecting: "Connecting",
  listening: "Listening",
  thinking: "Working on it",
  speaking: "Speaking",
  error: "Voice unavailable",
};

const useAvailable = (): CommandName[] => {
  const key = useSyncExternalStore(subscribeRegistry, () => availableCommands().join(","), () => "");
  return useMemo(() => (key ? (key.split(",") as CommandName[]) : []), [key]);
};

const isEditable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return Boolean(el?.closest?.('input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="textbox"], [role="slider"]'));
};

/**
 * Persistent floating voice control. Tap the orb (or press Space) to start; hold to talk when
 * hands-free is off; tap again to end. Captions, a live "what the voice just did" toast, and a
 * typed fallback live here too. Must sit inside <CookedVoiceProvider>.
 */
export interface DockPreview { state: VoiceState; user?: string; agent?: string }

export function VoiceDock({ preview }: { /** Dev harness only: render a state statically for visual QA. */ preview?: DockPreview }) {
  const live = useCookedVoice();
  const voice = useMemo(
    () =>
      preview
        ? {
            ...live,
            state: preview.state,
            connected: preview.state !== "idle",
            micOpen: true,
            engine: "elevenlabs" as const,
            interim: preview.user ?? "",
            lines: preview.agent ? [{ id: 1, role: "agent" as const, text: preview.agent }] : [],
            error: preview.state === "error" ? "Microphone access is blocked. Allow it in the address bar, then try again." : null,
          }
        : live,
    [live, preview],
  );
  const available = useAvailable();
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState("");
  const [hint, setHint] = useState(0);
  const glow = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const press = useRef<{ at: number; wasConnected: boolean; wasSpeaking: boolean } | null>(null);

  const { state, connected, levels, pressTalk, releaseTalk, stop, sendText, interrupt } = voice;
  const textOnly = voice.support === "text";
  const showInput = typing || textOnly;

  const hints = useMemo(() => {
    const ok = HINTS.filter((h) => available.includes(h.cmd));
    return ok.length ? ok : HINTS;
  }, [available]);

  useEffect(() => {
    if (connected || showInput) return;
    const id = setInterval(() => setHint((n) => n + 1), 4200);
    return () => clearInterval(id);
  }, [connected, showInput]);

  // Level-reactive glow, written straight to the DOM so audio never re-renders React.
  useEffect(() => {
    const el = glow.current;
    if (!el) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!connected || reduce) {
      el.style.setProperty("--lvl", "0");
      return;
    }
    let raf = 0;
    let lvl = 0;
    const tick = () => {
      const { input: i, output: o } = preview ? { input: 0, output: 0.35 + 0.3 * Math.sin(performance.now() / 260) } : levels();
      lvl += (Math.min(1, Math.max(i * 1.7, o * 1.5)) - lvl) * 0.22;
      el.style.setProperty("--lvl", lvl.toFixed(3));
      raf = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(raf);
  }, [connected, levels, preview]);

  useEffect(() => {
    if (typing) input.current?.focus();
  }, [typing]);

  // Shared press/release semantics for the orb and the Space key: a short press on a live session
  // ends it, a long press is push-to-talk, pressing while the agent speaks silences it first.
  const onPress = () => {
    press.current = { at: performance.now(), wasConnected: connected, wasSpeaking: state === "speaking" };
    pressTalk();
  };
  const onRelease = () => {
    const p = press.current;
    press.current = null;
    releaseTalk();
    if (p && p.wasConnected && !p.wasSpeaking && performance.now() - p.at < 260) stop();
  };

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const inDock = Boolean(target?.closest?.("[data-voice-dock]"));
      if (isEditable(e.target) || (!inDock && target?.closest?.("button, a, summary, [role=button], [role=switch], [role=tab]"))) return;
      e.preventDefault();
      if (!press.current) onPress();
    };
    const up = (e: KeyboardEvent) => {
      if (e.code !== "Space" || !press.current) return;
      e.preventDefault();
      onRelease();
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || isEditable(e.target)) return;
      if (state === "speaking") interrupt();
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("keydown", esc);
    };
  });

  const lastUser = [...voice.lines].reverse().find((l) => l.role === "user");
  const lastAgent = [...voice.lines].reverse().find((l) => l.role === "agent");
  const userText = voice.interim || (state === "listening" || state === "thinking" ? lastUser?.text : "") || "";
  const muted = connected && !voice.micOpen && state !== "speaking" && state !== "thinking";
  const label = muted ? "Muted · hold Space to talk" : STATE_LABEL[state];
  const engineLabel =
    voice.engine === "elevenlabs" || (!connected && voice.support === "elevenlabs") ? "COOKED voice" : voice.support === "text" ? "Typing only" : "Browser speech";
  const idleHint = hints[hint % hints.length]?.text;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendText(text);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))]">
        <CommandToast />
        <motion.section
          data-voice-dock
          aria-label="Ask COOKED"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 260, damping: 28, delay: 0.15 }}
          className="glass pointer-events-auto relative flex w-full max-w-[680px] items-center gap-2 rounded-[28px] p-1.5 pr-2 shadow-[0_18px_60px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,220,140,0.08)] sm:gap-3 sm:rounded-[36px] sm:p-2 sm:pr-2.5"
          // Dense enough that page text never shows through, even where backdrop blur is unavailable.
          style={{ background: "linear-gradient(180deg, rgba(27,22,13,0.92), rgba(13,10,6,0.95))" }}
        >
          <div
            ref={glow}
            className="relative shrink-0"
            style={{ ["--lvl" as string]: 0 }}
          >
            <button
              type="button"
              aria-label={connected ? "Voice on. Hold to talk, tap to end" : "Start voice control. Hold to talk"}
              aria-pressed={connected}
              aria-keyshortcuts="Space"
              disabled={textOnly}
              onPointerDown={(e) => {
                if (e.button !== 0) return;
                e.currentTarget.setPointerCapture(e.pointerId);
                onPress();
              }}
              onPointerUp={onRelease}
              onPointerCancel={onRelease}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.repeat) {
                  e.preventDefault();
                  voice.toggle();
                }
              }}
              onClick={(e) => e.preventDefault()}
              className="relative grid size-[64px] touch-none select-none place-items-center rounded-full outline-none transition-[box-shadow,opacity] focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40 sm:size-[76px]"
              style={{
                background: "radial-gradient(circle at 50% 36%, rgba(246,180,26,0.30), rgba(10,8,5,0.94) 74%)",
                border: `1px solid ${state === "error" ? "rgba(255,74,61,0.55)" : "rgba(246,180,26,0.5)"}`,
                boxShadow: "0 0 calc(14px + var(--lvl, 0) * 46px) rgba(246,180,26, calc(0.3 + var(--lvl, 0) * 0.5))",
                transform: "scale(calc(1 + var(--lvl, 0) * 0.1))",
                opacity: muted ? 0.62 : 1,
              }}
            >
              <span className="pointer-events-none grid place-items-center [&_canvas]:!size-[58px] sm:[&_canvas]:!size-[68px]">
                <VoiceOrb state={state} />
              </span>
            </button>
            {connected && state === "listening" && voice.micOpen && (
              <span aria-hidden className="pulse-ring pointer-events-none absolute inset-0 rounded-full border border-gold/50" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`label ${state === "error" ? "!text-hot" : muted ? "" : connected ? "!text-gold" : ""}`}>{label}</span>
              <span className="hidden items-center gap-1.5 text-[10.5px] text-dim sm:flex">
                <span aria-hidden className={`size-1.5 rounded-full ${voice.engine === "none" && !connected ? "bg-dim" : "bg-gold"}`} />
                {engineLabel}
              </span>
            </div>

            {showInput ? (
              <form onSubmit={submit} className="mt-0.5 flex items-center gap-2">
                <input
                  ref={input}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && !textOnly) setTyping(false);
                  }}
                  placeholder="Type a command or a question"
                  aria-label="Type a command or question for COOKED"
                  autoComplete="off"
                  className="h-8 min-w-0 flex-1 rounded-full border border-line-2 bg-black/30 px-3.5 text-[14px] text-text outline-none placeholder:text-dim focus:border-gold/60"
                />
                <button type="submit" disabled={!draft.trim()} className="h-8 shrink-0 rounded-full bg-gold px-3.5 text-[12.5px] font-semibold text-bg transition disabled:opacity-35">
                  Send
                </button>
              </form>
            ) : voice.error ? (
              <button type="button" onClick={voice.clearError} role="alert" className="mt-0.5 block w-full truncate text-left text-[13.5px] text-hot">
                {voice.error}
              </button>
            ) : (
              <div role="log" aria-live="polite" className="mt-0.5 min-h-[34px] sm:min-h-[38px]">
                <AnimatePresence mode="popLayout" initial={false}>
                  {userText ? (
                    <motion.p key={`u-${voice.interim ? "live" : lastUser?.id}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className={`truncate text-[13px] italic text-muted ${voice.interim ? "caret" : ""}`}>
                      {userText}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
                <AnimatePresence mode="popLayout" initial={false}>
                  {lastAgent && connected ? (
                    <motion.p key={`a-${lastAgent.id}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="line-clamp-2 text-[14px] leading-snug text-text">
                      {lastAgent.text}
                    </motion.p>
                  ) : !connected && !userText ? (
                    <motion.p key={`h-${hint % hints.length}`} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} className="truncate text-[14px] text-muted">
                      {voice.supportNote && hint % 3 === 2 ? voice.supportNote : <>Tap the orb or hold <kbd className="num rounded border border-line-2 px-1 text-[11px] text-cream">Space</kbd> and say {idleHint}</>}
                    </motion.p>
                  ) : null}
                </AnimatePresence>
              </div>
            )}
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              role="switch"
              aria-checked={voice.handsFree}
              aria-label="Hands-free listening"
              onClick={() => voice.setHandsFree(!voice.handsFree)}
              className="group flex h-9 items-center gap-2 rounded-full border border-line-2 px-2.5 text-[11.5px] text-muted outline-none transition hover:border-gold/40 hover:text-text focus-visible:ring-2 focus-visible:ring-gold"
              title={voice.handsFree ? "Hands-free: the mic stays open" : "Push-to-talk: hold Space or the orb to talk"}
            >
              <span aria-hidden className="relative h-[15px] w-[26px] rounded-full transition-colors" style={{ background: voice.handsFree ? "var(--gold)" : "rgba(255,220,140,0.16)" }}>
                <span className="absolute top-[2px] size-[11px] rounded-full bg-bg transition-all" style={{ left: voice.handsFree ? 13 : 2 }} />
              </span>
              <span className="hidden md:inline">Hands-free</span>
            </button>
            <button
              type="button"
              aria-label={showInput ? "Close typing" : "Type instead"}
              aria-pressed={showInput}
              disabled={textOnly}
              onClick={() => setTyping((t) => !t)}
              className="grid size-9 place-items-center rounded-full border border-line-2 text-muted outline-none transition hover:border-gold/40 hover:text-text focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40"
            >
              <svg aria-hidden viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="5" width="15" height="10" rx="2.5" /><path d="M6 8.5h.01M9 8.5h.01M12 8.5h.01M14.5 8.5h.01M6.5 11.5h7" /></svg>
            </button>
            {connected && (
              <button type="button" aria-label="End voice session" onClick={stop} className="grid size-9 place-items-center rounded-full border border-line-2 text-muted outline-none transition hover:border-hot/50 hover:text-hot focus-visible:ring-2 focus-visible:ring-gold">
                <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor"><rect x="5" y="5" width="10" height="10" rx="2" /></svg>
              </button>
            )}
          </div>
        </motion.section>
      </div>
    </MotionConfig>
  );
}
