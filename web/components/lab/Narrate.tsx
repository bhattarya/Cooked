"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useCookedVoice } from "@/lib/voiceAgent";
import { speak, type Speaking } from "@/lib/voice";

/**
 * "Narrate this future": the recorded narrator reads a script built only from returned numbers.
 * It stays silent while the live voice agent is connected, so the two never talk over each other.
 */
export function useNarrator(script: string | null): { speaking: boolean; blocked: boolean; toggle: () => void; stop: () => void } {
  const voice = useCookedVoice();
  const [speaking, setSpeaking] = useState(false);
  const cur = useRef<Speaking | null>(null);

  const stop = useCallback(() => {
    cur.current?.stop();
    cur.current = null;
    setSpeaking(false);
  }, []);

  const toggle = useCallback(() => {
    if (cur.current) {
      stop();
      return;
    }
    if (!script || voice.connected) return;
    const sp = speak(script, "narrator", () => undefined, () => undefined);
    cur.current = sp;
    setSpeaking(true);
    void sp.done.finally(() => {
      if (cur.current === sp) {
        cur.current = null;
        setSpeaking(false);
      }
    });
  }, [script, voice.connected, stop]);

  // the live agent took the floor: stop the clip (its `done` handler resets the button)
  useEffect(() => {
    if (voice.connected) cur.current?.stop();
  }, [voice.connected]);
  useEffect(() => () => cur.current?.stop(), []);

  return { speaking: speaking && !voice.connected, blocked: voice.connected, toggle, stop };
}

export function NarrateButton({ narrator, disabled }: { narrator: ReturnType<typeof useNarrator>; disabled?: boolean }) {
  const off = disabled || narrator.blocked;
  return (
    <button
      type="button"
      onClick={narrator.toggle}
      disabled={off && !narrator.speaking}
      title={narrator.blocked ? "The voice agent is connected: ask it to describe the screen instead." : "Hear this scenario read aloud, using only the numbers on screen"}
      className="inline-flex h-8 items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3.5 text-[12px] text-gold transition hover:bg-gold/20 focus-visible:outline focus-visible:outline-1 focus-visible:outline-gold disabled:cursor-not-allowed disabled:border-line-2 disabled:bg-transparent disabled:text-dim"
    >
      <span aria-hidden="true" className="text-[9px]">
        {narrator.speaking ? "■" : "▶"}
      </span>
      {narrator.speaking ? "Stop" : narrator.blocked ? "Voice agent is live" : "Narrate this future"}
    </button>
  );
}
