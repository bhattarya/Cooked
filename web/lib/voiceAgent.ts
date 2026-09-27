"use client";

// The voice controller. One ElevenLabs conversation (speech to text, LLM, tool calls, text to
// speech) whose client tools are the app's command bus: what the user says is HEARD by the agent
// and ACTED ON in the UI, instead of the browser transcribing a question that is then read back.
//
//   <CookedVoiceProvider> ... <VoiceDock /> ... </CookedVoiceProvider>     (once, above the scenes)
//   const voice = useCookedVoice();                                        (state + controls)
//   useVoiceCommands({ showScene, nextScene, ... });                       (scenes register what they can do)
//   useVoiceScreen({ scene, summary, facts, student });                    (scenes publish what is on screen)
//
// When the live agent cannot start (not signed in, not configured, offline, demo mode) the same
// command routing keeps working through browser push-to-talk and typed text (see voiceIntents.ts),
// so the demo never depends on one provider.
import { ConversationProvider, useConversation, type ClientTools } from "@elevenlabs/react";
import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import {
  COMMANDS,
  agentPayload,
  availableCommands,
  getScreenContext,
  registerCommands,
  runCommand,
  screenToText,
  setScreenContext,
  subscribeCommandEvents,
  subscribeScreenContext,
  type CommandEvent,
  type CommandHandlers,
  type CommandSource,
  type ScreenContext,
} from "./commands";
import { canListen, listen } from "./listen";
import { speak, type Speaking } from "./voice";
import { parseIntent } from "./voiceIntents";

export type VoiceState = "idle" | "connecting" | "listening" | "thinking" | "speaking" | "error";
/** Which path is handling speech right now. */
export type VoiceEngine = "elevenlabs" | "browser" | "none";
/** Best path available on this device / deployment (known after the probe). */
export type VoiceSupport = "checking" | "elevenlabs" | "browser" | "text";

export interface CaptionLine {
  id: number;
  role: "user" | "agent";
  text: string;
  /** Agent lines carry ElevenLabs' event id so an interruption can trim them to what was actually said. */
  eventId?: number;
}

export interface CookedVoice {
  state: VoiceState;
  engine: VoiceEngine;
  support: VoiceSupport;
  /** Why the live agent is not in use (shown as a quiet note), when relevant. */
  supportNote: string | null;
  /** A session (live agent or browser push-to-talk) is active. */
  connected: boolean;
  /** The microphone is currently feeding speech recognition. */
  micOpen: boolean;
  handsFree: boolean;
  setHandsFree: (on: boolean) => void;
  error: string | null;
  clearError: () => void;
  /** Most recent finished lines, oldest first. */
  lines: CaptionLine[];
  /** What the user is saying right now (partial transcript); empty when silent. */
  interim: string;
  /** Latest command the app ran, from any source. */
  lastCommand: CommandEvent | null;
  /** Live audio levels, 0..1. Read inside your own animation frame; calling it never re-renders. */
  levels: () => { input: number; output: number };
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => void;
  /** Push-to-talk: press opens the mic (starting a session if needed), release closes it unless hands-free. */
  pressTalk: () => void;
  releaseTalk: () => void;
  /** Silence the agent mid-sentence. Speaking over it also interrupts. */
  interrupt: () => void;
  /** Typed message: goes to the live agent when connected, otherwise straight through the command router. */
  sendText: (text: string) => Promise<void>;
}

const VoiceContext = createContext<CookedVoice | null>(null);

export function useCookedVoice(): CookedVoice {
  const v = useContext(VoiceContext);
  if (!v) throw new Error("useCookedVoice must be used inside <CookedVoiceProvider>");
  return v;
}

/** Register the commands this component can perform for as long as it is mounted. Handlers may close over fresh state. */
export function useVoiceCommands(handlers: Partial<CommandHandlers>): void {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });
  const names = Object.keys(handlers).sort().join(",");
  useEffect(() => {
    const wrapped: Record<string, (args: never) => unknown> = {};
    for (const name of names ? names.split(",") : []) {
      wrapped[name] = (args) => (latest.current as Record<string, (a: never) => unknown>)[name](args);
    }
    return registerCommands(wrapped as Partial<CommandHandlers>);
  }, [names]);
}

/** Publish what is on screen so the agent narrates real numbers. Pass null while nothing is showing. */
export function useVoiceScreen(ctx: ScreenContext | null): void {
  const json = JSON.stringify(ctx);
  useEffect(() => setScreenContext(JSON.parse(json) as ScreenContext | null), [json]);
}

function micMessage(e: unknown): string {
  if (typeof window !== "undefined" && !window.isSecureContext) return "The microphone needs https or localhost.";
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError" || name === "not-allowed" || name === "service-not-allowed") return "Microphone access is blocked. Allow it in the address bar, then try again.";
  if (name === "NotFoundError" || name === "OverconstrainedError" || name === "audio-capture") return "No microphone found. Plug one in, or type instead.";
  if (name === "NotReadableError") return "Another app is using the microphone.";
  return "Couldn't open the microphone. Type instead.";
}

async function ensureMic(): Promise<void> {
  if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new DOMException("no mediaDevices", "NotFoundError");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  stream.getTracks().forEach((t) => t.stop()); // the agent SDK opens its own stream; this only surfaces permission errors early
}

/**
 * The ElevenLabs client tools, one per catalogue command. They only touch the module-level command
 * bus, so the closures never go stale during a long session. Exported so the dev harness can show
 * exactly what the agent receives back.
 */
export function makeClientTools(onBusy: (delta: 1 | -1) => void = () => {}): ClientTools {
  return Object.fromEntries(
    COMMANDS.map((c) => [
      c.name,
      async (params: Record<string, unknown>) => {
        onBusy(1);
        try {
          return agentPayload(await runCommand(c.name, params, { source: "voice" }));
        } finally {
          onBusy(-1);
        }
      },
    ]),
  );
}

const MAX_LINES = 14;

// Hands-free preference: remembered per browser, read through useSyncExternalStore so server and
// client agree on first paint. `memory` keeps the toggle working when storage is blocked.
const HANDS_FREE_KEY = "cooked.voice.handsFree";
const prefListeners = new Set<() => void>();
let handsFreeMemory: boolean | null = null;
const subscribePref = (fn: () => void) => {
  prefListeners.add(fn);
  return () => void prefListeners.delete(fn);
};
function readHandsFree(): boolean {
  if (handsFreeMemory !== null) return handsFreeMemory;
  try {
    return localStorage.getItem(HANDS_FREE_KEY) !== "0";
  } catch {
    return true;
  }
}
function writeHandsFree(on: boolean) {
  handsFreeMemory = on;
  try {
    localStorage.setItem(HANDS_FREE_KEY, on ? "1" : "0");
  } catch {
    /* storage blocked: the in-memory value still applies */
  }
  prefListeners.forEach((fn) => fn());
}

function VoiceEngineProvider({ children }: { children: ReactNode }) {
  const [sessionStatus, setSessionStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [engine, setEngine] = useState<VoiceEngine>("none");
  const [support, setSupport] = useState<VoiceSupport>("checking");
  const [supportNote, setSupportNote] = useState<string | null>(null);
  const handsFree = useSyncExternalStore(subscribePref, readHandsFree, () => true);
  const [ptt, setPtt] = useState(false);
  const [mode, setMode] = useState<"speaking" | "listening">("listening");
  const [awaiting, setAwaiting] = useState(false);
  const [inflight, setInflight] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lines, setLines] = useState<CaptionLine[]>([]);
  const [interim, setInterim] = useState("");
  const [fb, setFb] = useState<"idle" | "listening" | "thinking" | "speaking">("idle");
  const [lastCommand, setLastCommand] = useState<CommandEvent | null>(null);

  const lineId = useRef(0);
  const engineRef = useRef<VoiceEngine>("none");
  const handsFreeRef = useRef(true);
  const fbActive = useRef(false);
  const [fbOn, setFbOn] = useState(false);
  const fbRec = useRef<{ stop: () => void } | null>(null);
  const fbSpeech = useRef<Speaking | null>(null);
  const fbOut = useRef(0);
  const silenced = useRef(false);
  const errorTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const beginListenRef = useRef<() => void>(() => {});
  const volumeRef = useRef<(o: { volume: number }) => void>(() => {});

  const setFbActive = useCallback((on: boolean) => {
    fbActive.current = on;
    setFbOn(on);
  }, []);

  const setEngineBoth = useCallback((e: VoiceEngine) => {
    engineRef.current = e;
    setEngine(e);
  }, []);

  const pushLine = useCallback((role: CaptionLine["role"], text: string, eventId?: number) => {
    const clean = text.trim();
    if (!clean) return;
    setLines((old) => [...old, { id: ++lineId.current, role, text: clean, eventId }].slice(-MAX_LINES));
  }, []);

  const flashError = useCallback((message: string) => {
    setError(message);
    clearTimeout(errorTimer.current);
    errorTimer.current = setTimeout(() => setError(null), 9000);
  }, []);

  const clientTools = useMemo(() => makeClientTools((delta) => setInflight((n) => Math.max(0, n + delta))), []);

  const conversation = useConversation({
    clientTools,
    onStatusChange: ({ status }) => {
      if (status === "connecting" || status === "connected") setSessionStatus(status);
      else {
        setSessionStatus("disconnected");
        setAwaiting(false);
        setMode("listening");
        setInterim("");
        setPtt(false);
        silenced.current = false;
        if (engineRef.current === "elevenlabs") setEngineBoth("none");
      }
    },
    onConnect: () => {
      setError(null);
      setSupportNote(null);
    },
    onDisconnect: (details) => {
      if (details.reason === "error") flashError(details.message || "The voice session dropped. Tap the orb to reconnect.");
      else if (details.reason === "agent") setSupportNote("The session ended. Tap the orb to start again.");
    },
    // A non-fatal provider error must not be mistaken for a dead session, so status comes from onStatusChange.
    onError: (message) => flashError(typeof message === "string" && message ? message : "The voice agent reported an error."),
    onMessage: ({ role, message, event_id }) => {
      if (role === "user") {
        setInterim("");
        pushLine("user", message, event_id);
        setAwaiting(true);
      } else {
        setAwaiting(false);
        pushLine("agent", message, event_id);
      }
    },
    onModeChange: ({ mode: next }) => {
      setMode(next);
      if (next === "speaking") setAwaiting(false);
      if (next === "listening" && silenced.current) {
        silenced.current = false;
        try {
          volumeRef.current({ volume: 1 });
        } catch {
          /* session already closed */
        }
      }
    },
    // Interrupted replies are trimmed by ElevenLabs to what was actually spoken.
    onAgentResponseCorrection: ({ corrected_agent_response, event_id }) =>
      setLines((old) => old.map((l) => (l.role === "agent" && l.eventId === event_id ? { ...l, text: corrected_agent_response.trim() || l.text } : l))),
    onIncomingEvent: (event: unknown) => {
      const e = event as { type?: string; tentative_user_transcription_event?: { user_transcript?: string } };
      if (e?.type === "tentative_user_transcript") setInterim(e.tentative_user_transcription_event?.user_transcript ?? "");
    },
  });
  const { startSession, endSession, sendUserMessage, sendContextualUpdate, setVolume, setMuted, getInputVolume, getOutputVolume } = conversation;
  useEffect(() => {
    volumeRef.current = setVolume;
  }, [setVolume]);

  // ---- capability probe: live agent if the server can mint a session, otherwise browser speech.
  useEffect(() => {
    const ac = new AbortController();
    const fallback = (note: string) => {
      setSupport(canListen() ? "browser" : "text");
      setSupportNote(note);
    };
    fetch("/voice-session?probe=1", { cache: "no-store", signal: ac.signal })
      .then((r) => {
        if (r.ok) setSupport("elevenlabs");
        else fallback(r.status === 401 ? "Sign in to talk to the voice agent. Push-to-talk still works." : "Live voice isn't set up here. Push-to-talk still works.");
      })
      .catch(() => {
        if (!ac.signal.aborted) fallback("Live voice is unreachable. Push-to-talk still works.");
      });
    return () => ac.abort();
  }, []);

  useEffect(() => {
    handsFreeRef.current = handsFree;
  }, [handsFree]);

  useEffect(() => subscribeCommandEvents(setLastCommand), []);

  // If the agent never answers (provider hiccup), do not leave the orb "thinking" forever.
  useEffect(() => {
    if (!awaiting) return;
    const t = setTimeout(() => setAwaiting(false), 25_000);
    return () => clearTimeout(t);
  }, [awaiting]);

  // ---- push the screen to the agent: once on connect, then whenever a scene republishes it.
  useEffect(() => {
    if (sessionStatus !== "connected") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const push = () => {
      try {
        sendContextualUpdate(screenToText(getScreenContext()), { contextId: "screen" });
      } catch {
        /* session closed between the timer and the send */
      }
    };
    push();
    const off = subscribeScreenContext(() => {
      clearTimeout(timer);
      timer = setTimeout(push, 350);
    });
    return () => {
      off();
      clearTimeout(timer);
    };
  }, [sessionStatus, sendContextualUpdate]);

  // ---- mic gating: hands-free keeps it open, push-to-talk opens it only while held.
  useEffect(() => {
    if (sessionStatus !== "connected") return;
    try {
      setMuted(!(handsFree || ptt));
    } catch {
      /* session closed */
    }
  }, [sessionStatus, handsFree, ptt, setMuted]);

  // ---- browser push-to-talk fallback -------------------------------------------------------
  const speakFallback = useCallback((text: string): Promise<void> => {
    fbSpeech.current?.stop();
    setFb("speaking");
    const s = speak(text.slice(0, 600), "narrator", () => {}, (level) => {
      fbOut.current = level;
    });
    fbSpeech.current = s;
    return s.done
      .catch(() => undefined)
      .finally(() => {
        if (fbSpeech.current === s) fbSpeech.current = null;
        fbOut.current = 0;
      });
  }, []);

  const routeLine = useCallback(
    async (text: string, source: CommandSource, spoken: boolean) => {
      const clean = text.trim();
      if (!clean) return;
      pushLine("user", clean);
      setFb("thinking");
      const ctx = getScreenContext();
      const intent = parseIntent(clean, { scene: ctx?.scene ?? null, hasStudent: Boolean(ctx?.student), available: availableCommands() });
      const reply = intent
        ? (await runCommand(intent.command, intent.args, { source })).message
        : "I didn't catch a command in that. Try “show the twins”, “next”, “set work hours to 30” or “run a stress test”.";
      pushLine("agent", reply);
      if (spoken) await speakFallback(reply);
    },
    [pushLine, speakFallback],
  );

  const beginListen = useCallback(() => {
    if (!canListen()) {
      flashError("Voice input needs Chrome, Edge or Safari. Type instead.");
      setFbActive(false);
      setFb("idle");
      setEngineBoth("none");
      return;
    }
    if (fbRec.current) return;
    fbSpeech.current?.stop();
    setFb("listening");
    setInterim("");
    let finalText = "";
    fbRec.current = listen(
      (text, final) => {
        setInterim(text);
        if (final) finalText = text;
      },
      (err) => {
        fbRec.current = null;
        setInterim("");
        if (err && err !== "no-speech" && err !== "aborted") {
          flashError(err === "network" ? "Speech recognition needs an internet connection. Type instead." : micMessage(err));
          setFbActive(false);
          setFb("idle");
          setEngineBoth("none");
          return;
        }
        const again = () => {
          if (fbActive.current && handsFreeRef.current) beginListenRef.current();
          else setFb("idle");
        };
        if (finalText) void routeLine(finalText, "voice", true).then(again);
        else again();
      },
    );
  }, [flashError, routeLine, setEngineBoth, setFbActive]);
  useEffect(() => {
    beginListenRef.current = beginListen;
  }, [beginListen]);

  const startFallback = useCallback(() => {
    setFbActive(true);
    setEngineBoth("browser");
    if (handsFreeRef.current) beginListen();
  }, [beginListen, setEngineBoth, setFbActive]);

  // ---- session control -----------------------------------------------------------------------
  const start = useCallback(async () => {
    if (sessionStatus !== "disconnected" || engineRef.current === "browser") return;
    clearTimeout(errorTimer.current);
    setError(null);
    setLines([]);
    if (support === "text") {
      flashError("This browser can't listen. Type instead.");
      return;
    }
    if (support === "browser") {
      startFallback();
      return;
    }
    setEngineBoth("elevenlabs");
    setSessionStatus("connecting");
    try {
      await ensureMic();
    } catch (e) {
      setSessionStatus("disconnected");
      setEngineBoth("none");
      flashError(micMessage(e));
      return;
    }
    let signedUrl = "";
    try {
      const res = await fetch("/voice-session", { cache: "no-store" });
      const body = (await res.json().catch(() => ({}))) as { signedUrl?: string; error?: string };
      if (!res.ok || !body.signedUrl) throw new Error(body.error || "Live agent unavailable.");
      signedUrl = body.signedUrl;
    } catch (e) {
      setSessionStatus("disconnected");
      setEngineBoth("none");
      setSupportNote(`${e instanceof Error ? e.message : "Live agent unavailable."} Using push-to-talk.`);
      if (canListen()) {
        setSupport("browser");
        startFallback();
      } else flashError("Live voice is unavailable and this browser can't listen. Type instead.");
      return;
    }
    const screen = getScreenContext();
    startSession({
      signedUrl,
      connectionType: "websocket",
      dynamicVariables: {
        screen_scene: screen?.scene ?? "none",
        screen_summary: (screen?.summary ?? "nothing is showing yet").slice(0, 400),
        student_loaded: screen?.student ? "yes" : "no",
      },
    });
  }, [flashError, sessionStatus, setEngineBoth, startFallback, startSession, support]);

  const stop = useCallback(() => {
    setFbActive(false);
    fbRec.current?.stop();
    fbRec.current = null;
    fbSpeech.current?.stop();
    fbSpeech.current = null;
    fbOut.current = 0;
    setFb("idle");
    setInterim("");
    setPtt(false);
    if (engineRef.current === "browser") setEngineBoth("none");
    if (engineRef.current === "elevenlabs" || sessionStatus !== "disconnected") {
      endSession();
      setSessionStatus("disconnected");
      setEngineBoth("none");
    }
  }, [endSession, sessionStatus, setEngineBoth, setFbActive]);

  const interrupt = useCallback(() => {
    fbSpeech.current?.stop();
    if (engineRef.current === "elevenlabs" && sessionStatus === "connected") {
      // The SDK has no explicit stop: silence the output until the agent finishes its turn.
      silenced.current = true;
      try {
        setVolume({ volume: 0 });
      } catch {
        silenced.current = false;
      }
    }
  }, [sessionStatus, setVolume]);

  const pressTalk = useCallback(() => {
    setPtt(true);
    if (engineRef.current === "none") {
      void start();
      return;
    }
    if (engineRef.current === "elevenlabs") {
      if (mode === "speaking") interrupt();
      return;
    }
    beginListen();
  }, [beginListen, interrupt, mode, start]);

  const releaseTalk = useCallback(() => {
    setPtt(false);
    if (engineRef.current === "browser" && !handsFreeRef.current) fbRec.current?.stop();
  }, []);

  const sendText = useCallback(
    async (text: string) => {
      const clean = text.trim();
      if (!clean) return;
      if (engineRef.current === "elevenlabs" && sessionStatus === "connected") {
        try {
          sendUserMessage(clean);
          pushLine("user", clean);
          setAwaiting(true);
          return;
        } catch {
          /* the session dropped: fall through to the offline router */
        }
      }
      await routeLine(clean, "typed", false);
      setFb("idle");
    },
    [pushLine, routeLine, sendUserMessage, sessionStatus],
  );

  useEffect(
    () => () => {
      clearTimeout(errorTimer.current);
      fbActive.current = false;
      fbRec.current?.stop();
      fbSpeech.current?.stop();
    },
    [],
  );

  const live = sessionStatus === "connected";
  const connecting = sessionStatus === "connecting";
  const connected = live || (engine === "browser" && fbOn);
  const micOpen = engine === "elevenlabs" ? live && (handsFree || ptt) : engine === "browser" && fb === "listening";

  let state: VoiceState;
  if (engine === "elevenlabs") {
    if (connecting) state = "connecting";
    else if (live) state = mode === "speaking" ? "speaking" : inflight > 0 || awaiting ? "thinking" : "listening";
    else state = error ? "error" : "idle";
  } else if (engine === "browser") state = fb === "idle" ? "idle" : fb;
  else state = error ? "error" : "idle";

  const levels = useCallback(
    () => (engineRef.current === "elevenlabs" ? { input: getInputVolume(), output: getOutputVolume() } : { input: 0, output: fbOut.current }),
    [getInputVolume, getOutputVolume],
  );

  const value = useMemo<CookedVoice>(
    () => ({
      state, engine, support, supportNote, connected, micOpen, handsFree, setHandsFree: writeHandsFree, error, clearError: () => setError(null),
      lines, interim, lastCommand, levels, start, stop, toggle: () => (connected ? stop() : void start()), pressTalk, releaseTalk, interrupt, sendText,
    }),
    [state, engine, support, supportNote, connected, micOpen, handsFree, error, lines, interim, lastCommand, levels, start, stop, pressTalk, releaseTalk, interrupt, sendText],
  );

  // The callbacks in `value` read refs only when invoked (events), never while rendering.
  // eslint-disable-next-line react-hooks/refs
  return createElement(VoiceContext.Provider, { value }, children);
}

/** Mount once above the scenes; the conversation then survives scene changes. */
export function CookedVoiceProvider({ children }: { children: ReactNode }) {
  return createElement(ConversationProvider, null, createElement(VoiceEngineProvider, null, children));
}
