"use client";

import { ThinkingOrb, type OrbState } from "thinking-orbs";
import type { VoiceState } from "@/lib/voiceAgent";

// listening = the waveform rolls through the rings; thinking = particles on orbits (a tool call
// is running); speaking = the undulating sash. Idle breathes, so the dock never looks dead.
const ORB_STATE: Record<VoiceState, OrbState> = {
  idle: "breathing",
  connecting: "connecting",
  listening: "listening",
  thinking: "working",
  speaking: "composing",
  error: "shaping",
};

const GOLD = "#f6b41a";
const HOT = "#ff4a3d";

export function VoiceOrb({ state, size = 64 }: { state: VoiceState; size?: 64 | 32 | 20 }) {
  return (
    <ThinkingOrb
      state={ORB_STATE[state]}
      size={size}
      theme="dark"
      color={state === "error" ? HOT : GOLD}
      speed={state === "speaking" ? 1.15 : state === "thinking" ? 1.3 : 1}
      dotSize={1.2}
      aria-label={`Voice ${state}`}
    />
  );
}
