"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { segText, type Seg } from "@/lib/engine";
import { speak, type Speaking, type VoiceName, type VoiceSource } from "@/lib/voice";

interface Props {
  segs: Seg[];
  voice?: VoiceName;
  muted?: boolean;
  autoplay?: boolean;
  playKey?: string | number;
  onDone?: () => void;
  size?: "md" | "lg";
}

// Speaks a script and reveals it word by word. Numbers are tokens from tool results:
// they render as highlighted chips and can be traced to their tool_result id.
export function Narration({ segs, voice = "narrator", muted = false, autoplay = true, playKey, onDone, size = "md" }: Props) {
  const text = useMemo(() => segText(segs), [segs]);
  const offsets = useMemo(() => {
    const lens = segs.map((s) => (typeof s === "string" ? s.length : s.v.length));
    return lens.map((_, i) => lens.slice(0, i).reduce((a, b) => a + b, 0));
  }, [segs]);
  const [pos, setPos] = useState(autoplay ? 0 : text.length);
  const [level, setLevel] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [source, setSource] = useState<VoiceSource | null>(null);
  const cur = useRef<Speaking | null>(null);
  const typer = useRef<number>(0);

  const stop = useCallback(() => {
    cur.current?.stop();
    cur.current = null;
    clearInterval(typer.current);
    setPlaying(false);
    setLevel(0);
  }, []);

  const play = useCallback(() => {
    stop();
    setPos(0);
    setPlaying(true);
    if (muted) {
      let p = 0;
      typer.current = window.setInterval(() => {
        p += 2;
        setPos(p);
        setLevel(0.2 + Math.random() * 0.4);
        if (p >= text.length) {
          clearInterval(typer.current);
          setPlaying(false);
          setLevel(0);
          onDone?.();
        }
      }, 28);
      return;
    }
    const s = speak(
      text,
      voice,
      (i) => setPos((p) => Math.max(p, i + (text.slice(i).match(/^\S+/)?.[0].length ?? 0))),
      setLevel,
      setSource,
    );
    cur.current = s;
    s.done.then(() => {
      if (cur.current !== s) return;
      setPos(text.length);
      setPlaying(false);
      onDone?.();
    });
  }, [muted, text, voice, onDone, stop]);

  useEffect(() => {
    const id = window.setTimeout(() => (autoplay ? play() : setPos(text.length)), 0);
    return () => {
      clearTimeout(id);
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playKey, text]);

  const bars = 42;
  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <button
          onClick={playing ? stop : play}
          className="group relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-text text-bg transition hover:scale-105"
          aria-label={playing ? "Stop" : "Play"}
        >
          {playing && <span className="pulse-ring absolute inset-0 rounded-full bg-heat/50" />}
          {playing ? (
            <svg width="14" height="14" viewBox="0 0 14 14">
              <rect x="2" y="2" width="4" height="10" rx="1" fill="currentColor" />
              <rect x="8" y="2" width="4" height="10" rx="1" fill="currentColor" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 14 14">
              <path d="M3 1.5v11l9-5.5z" fill="currentColor" />
            </svg>
          )}
        </button>
        <div className="flex h-10 flex-1 items-center gap-[3px]">
          {Array.from({ length: bars }, (_, i) => {
            const center = 1 - Math.abs(i - bars / 2) / (bars / 2);
            const h = playing ? 4 + level * 34 * (0.35 + center * 0.9) * (0.6 + 0.4 * Math.sin(i * 1.7 + pos * 0.3) ** 2) : 3;
            return (
              <motion.span
                key={i}
                className="w-[3px] rounded-full"
                animate={{ height: h }}
                transition={{ duration: 0.12 }}
                style={{ background: i / bars < pos / Math.max(text.length, 1) ? "var(--heat)" : "var(--line-2)" }}
              />
            );
          })}
        </div>
        <span className="text-[10px] text-dim" title={source === "browser" ? "ElevenLabs isn't connected, so your browser's built-in voice is standing in" : undefined}>
          {muted ? "captions only" : source === "elevenlabs" ? "Voice by ElevenLabs" : source === "browser" ? "browser voice · ElevenLabs offline" : ""}
        </span>
      </div>
      <p className={`leading-relaxed ${size === "lg" ? "text-[22px] display" : "text-[17px]"} text-text/90`}>
        {segs.map((s, i) => {
          const start = offsets[i];
          if (start >= pos) return null;
          if (typeof s === "string") {
            const vis = s.slice(0, Math.max(0, pos - start));
            return <span key={i}>{vis}</span>;
          }
          return (
            <AnimatePresence key={i}>
              <motion.span
                initial={{ opacity: 0, y: 6, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className="num group relative mx-0.5 inline-block rounded-md bg-heat/15 px-1.5 text-heat ring-1 ring-heat/30"
                title={`from ${s.tr}`}
              >
                {s.v}
                <span className="pointer-events-none absolute -top-6 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-panel-2 px-1.5 py-0.5 text-[10px] text-muted opacity-0 ring-1 ring-line-2 transition group-hover:opacity-100">
                  {s.tr}
                </span>
              </motion.span>
            </AnimatePresence>
          );
        })}
        {playing && <span className="caret" />}
      </p>
    </div>
  );
}
