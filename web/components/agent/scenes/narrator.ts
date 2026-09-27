"use client";

// The clip narrator (ElevenLabs clips via /voice, browser voice as the offline stand-in), kept
// outside React state so a 15 Hz loudness signal re-renders only the orbs that subscribe to it.
// While the live voice agent is connected the narrator goes silent: two voices at once is noise.
import { useSyncExternalStore } from "react";
import { speak, type Speaking } from "@/lib/voice";

interface Snap {
  caption: string;
  speaking: boolean;
  level: number;
}

let snap: Snap = { caption: "", speaking: false, level: 0 };
let current: Speaking | null = null;
let muted = false;
let lastPublish = 0;
const subs = new Set<() => void>();

function publish(next: Partial<Snap>) {
  const merged = { ...snap, ...next };
  if (merged.caption === snap.caption && merged.speaking === snap.speaking && merged.level === snap.level) return;
  snap = merged;
  subs.forEach((f) => f());
}

export const narrator = {
  /** Show the line and, unless the live agent is talking, speak it. Never rejects. */
  say(line: string, voice: "narrator" | "coach" = "narrator"): Promise<void> {
    current?.stop();
    current = null;
    publish({ caption: line, speaking: false, level: 0 });
    if (muted || !line) return Promise.resolve();
    const s = speak(
      line,
      voice,
      () => {},
      (level) => {
        const now = performance.now();
        if (now - lastPublish < 66) return;
        lastPublish = now;
        publish({ level: Math.round(level * 100) / 100 });
      },
    );
    current = s;
    publish({ speaking: true });
    return s.done
      .catch(() => undefined) // autoplay can be refused before the first gesture; the caption still shows
      .finally(() => {
        if (current === s) {
          current = null;
          publish({ speaking: false, level: 0 });
        }
      });
  },
  stop() {
    current?.stop();
    current = null;
    publish({ speaking: false, level: 0 });
  },
  setMuted(on: boolean) {
    muted = on;
    if (on) narrator.stop();
  },
  caption(text: string) {
    publish({ caption: text });
  },
  subscribe(fn: () => void) {
    subs.add(fn);
    return () => void subs.delete(fn);
  },
  snapshot: () => snap,
};

const SERVER: Snap = { caption: "", speaking: false, level: 0 };

export function useNarrator(): Snap {
  return useSyncExternalStore(narrator.subscribe, narrator.snapshot, () => SERVER);
}
