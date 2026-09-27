"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { availableCommands, subscribeRegistry, type CommandName } from "@/lib/commands";
import { useCookedVoice, type VoiceState } from "@/lib/voiceAgent";
import { CommandToast } from "./CommandToast";
import { VoiceOrb } from "./VoiceOrb";

const HINTS: { cmd: CommandName; text: string }[] = [
  { cmd: "askStudent", text: "“How's my Fall schedule timing?”" },
  { cmd: "askStudent", text: "“Am I on track for graduation?”" },
  { cmd: "showScene", text: "“Compare me with UMBC alumni”" },
  { cmd: "askStudent", text: "“Explain how ML got 79%”" },
  { cmd: "findRepair", text: "“How do I get un-cooked?”" },
  { cmd: "runStressTest", text: "“Run a stress test”" },
];

const SHORTCUTS = [
  "How's my Fall schedule timing?",
  "Am I on track for graduation?",
  "Compare me with UMBC alumni",
  "Explain how ML got 79%",
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

export interface DockPreview { state: VoiceState; user?: string; agent?: string }

export function VoiceDock({ preview }: { preview?: DockPreview }) {
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
  const input = useRef<HTMLInputElement>(null);
  const press = useRef<{ at: number; wasConnected: boolean; wasSpeaking: boolean } | null>(null);

  const { state, connected, pressTalk, releaseTalk, stop, sendText, interrupt } = voice;
  const textOnly = voice.support === "text";
  const showInput = typing || textOnly;

  const hints = useMemo(() => {
    const ok = HINTS.filter((h) => available.includes(h.cmd));
    return ok.length ? ok : HINTS;
  }, [available]);

  useEffect(() => {
    if (typing) input.current?.focus();
  }, [typing]);

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
    voice.engine === "elevenlabs" || (!connected && voice.support === "elevenlabs") ? "COOKED Voice" : voice.support === "text" ? "Typing only" : "Browser speech";
  const idleHint = hints[0]?.text ?? "a question about your plan";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = draft.trim();
    if (!text) return;
    setDraft("");
    await sendText(text);
  };

  const handleShortcutClick = (text: string) => {
    void sendText(text);
  };

  return (
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-3 pb-[max(14px,env(safe-area-inset-bottom))]">
        <CommandToast />

        {/* Spoken Response Card when Agent Speaks */}
        {lastAgent && connected && (
          <div className="pointer-events-auto w-full max-w-[680px] rounded-xl border border-gold/40 bg-panel/95 p-3.5 shadow-2xl backdrop-blur-xl transition-all">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 shrink-0">
                <VoiceOrb state={state} size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="label !text-gold">COOKED Spoken Response</span>
                  <span className="text-[10px] text-dim">ElevenLabs Voice</span>
                </div>
                <p className="text-xs font-medium leading-relaxed text-cream">{lastAgent.text}</p>
              </div>
            </div>
          </div>
        )}

        {/* Voice Prompt Shortcut Bar */}
        {!connected && (
          <div className="pointer-events-auto hidden sm:flex items-center gap-1.5 overflow-x-auto max-w-[680px] w-full px-1 py-1">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-gold/80 shrink-0 mr-1">Voice Shortcuts:</span>
            {SHORTCUTS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleShortcutClick(s)}
                className="shrink-0 rounded-full border border-line-2 bg-panel/80 px-2.5 py-1 text-[11px] text-muted transition hover:border-gold/50 hover:bg-gold/10 hover:text-gold"
              >
                {s}
              </button>
            ))}
          </div>
        )}

        {/* Main Floating Voice Control Dock */}
        <section
          data-voice-dock
          aria-label="Ask COOKED"
          className="pointer-events-auto relative flex w-full max-w-[680px] items-center gap-2 rounded-2xl border border-line-2 bg-bg-2 p-2.5 shadow-2xl backdrop-blur-xl sm:gap-3"
        >
          {/* Orb & Mic Button */}
          <div className="relative shrink-0">
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
              className={`relative grid size-12 touch-none select-none place-items-center rounded-xl border outline-none focus-visible:ring-2 focus-visible:ring-gold disabled:opacity-40 transition-all ${
                connected ? "border-gold bg-gold/15 text-gold shadow-lg shadow-gold/20" : "border-line-2 text-gold hover:border-gold/40"
              } ${muted ? "opacity-60" : ""}`}
            >
              {connected ? (
                <VoiceOrb state={state} size={32} />
              ) : (
                <svg aria-hidden viewBox="0 0 24 24" className="size-5 text-gold" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3M8 21h8" />
                </svg>
              )}
            </button>
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className={`label ${state === "error" ? "!text-hot" : muted ? "" : connected ? "!text-gold font-bold" : ""}`}>
                {label}
              </span>
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
                  placeholder="Type a command or a question for your plan"
                  aria-label="Type a command or question for COOKED"
                  autoComplete="off"
                  className="h-8 min-w-0 flex-1 rounded-full border border-line-2 bg-black/40 px-3.5 text-[13.5px] text-text outline-none placeholder:text-dim focus:border-gold/60"
                />
                <button type="submit" disabled={!draft.trim()} className="h-8 shrink-0 rounded-full bg-gold px-3.5 text-[12px] font-bold text-bg transition disabled:opacity-35">
                  Send
                </button>
              </form>
            ) : voice.error ? (
              <button type="button" onClick={voice.clearError} role="alert" className="mt-0.5 block w-full truncate text-left text-[13px] text-hot">
                {voice.error}
              </button>
            ) : (
              <div role="log" aria-live="polite" className="mt-0.5 min-h-[34px] sm:min-h-[38px] flex items-center">
                {userText ? (
                  <p key={`u-${voice.interim ? "live" : lastUser?.id}`} className={`truncate text-[13px] italic text-muted ${voice.interim ? "caret" : ""}`}>
                    {userText}
                  </p>
                ) : null}
                {lastAgent && connected ? (
                  <p key={`a-${lastAgent.id}`} className="line-clamp-2 text-[13.5px] leading-snug text-cream font-medium">
                    {lastAgent.text}
                  </p>
                ) : !connected && !userText ? (
                  <p className="truncate text-[13.5px] text-muted">
                    {voice.supportNote ?? (
                      <>
                        Tap mic or hold <kbd className="num rounded border border-line-2 px-1 text-[11px] text-cream">Space</kbd> and say {idleHint}
                      </>
                    )}
                  </p>
                ) : null}
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
              title={voice.handsFree ? "Hands-free: mic stays open" : "Push-to-talk: hold Space or mic to talk"}
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
              <svg aria-hidden viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2.5" y="5" width="15" height="10" rx="2.5" />
                <path d="M6 8.5h.01M9 8.5h.01M12 8.5h.01M14.5 8.5h.01M6.5 11.5h7" />
              </svg>
            </button>
            {connected && (
              <button
                type="button"
                aria-label="End voice session"
                onClick={stop}
                className="grid size-9 place-items-center rounded-full border border-line-2 text-muted outline-none transition hover:border-hot/50 hover:text-hot focus-visible:ring-2 focus-visible:ring-gold"
              >
                <svg aria-hidden viewBox="0 0 20 20" className="size-4" fill="currentColor">
                  <rect x="5" y="5" width="10" height="10" rx="2" />
                </svg>
              </button>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
