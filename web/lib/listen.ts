"use client";

import { useSyncExternalStore } from "react";

// Voice input via the browser's speech recognition (Chrome, Edge, Safari). Push-to-talk.
interface Rec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecCtor = new () => Rec;

function ctor(): RecCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecCtor; webkitSpeechRecognition?: RecCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const canListen = () => ctor() !== null;

const subscribeCapability = () => () => {};

export function useCanListen(): boolean {
  return useSyncExternalStore(subscribeCapability, canListen, () => false);
}

export function listen(onText: (text: string, final: boolean) => void, onEnd: (error?: string) => void): { stop: () => void } {
  const C = ctor();
  if (!C) {
    onEnd("unsupported");
    return { stop: () => {} };
  }
  const rec = new C();
  rec.lang = "en-US";
  rec.interimResults = true;
  rec.continuous = false;
  rec.onresult = (e) => {
    let text = "";
    let final = false;
    for (let i = 0; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
      final = final || e.results[i].isFinal;
    }
    onText(text.trim(), final);
  };
  rec.onerror = (e) => onEnd(e.error);
  rec.onend = () => onEnd();
  rec.start();
  return { stop: () => rec.stop() };
}
