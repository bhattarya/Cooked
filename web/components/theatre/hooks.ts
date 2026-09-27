"use client";

import { useEffect, useState, type RefObject } from "react";

// Measures an element; the first value arrives from ResizeObserver, so SSR and the first paint see 0x0.
export function useElementSize(ref: RefObject<HTMLElement | null>) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setSize((s) => (Math.round(s.w) === Math.round(width) && Math.round(s.h) === Math.round(height) ? s : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return size;
}

// Reveals `text` character by character. Text that is already there on mount (or under
// reduced motion) shows at once; text that arrives later types itself out.
export function useTyped(text: string | undefined, instant: boolean) {
  const value = text ?? "";
  const [mountedWith] = useState(value);
  const [state, setState] = useState({ text: value, n: value.length });
  if (state.text !== value) setState({ text: value, n: instant || (value !== "" && value === mountedWith) ? value.length : 0 });
  const done = state.n >= value.length;
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setState((s) => (s.text === value ? { text: s.text, n: Math.min(value.length, s.n + 3) } : s)), 30);
    return () => clearInterval(id);
  }, [done, value]);
  return { shown: value.slice(0, state.n), rest: value.slice(state.n), done };
}

// Milliseconds a step has been running, measured here on the client so the counter is honest
// even when the caller only reports `ms` at completion. It freezes when the step stops running.
export function useElapsed(running: boolean) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    if (!running) return;
    const t0 = performance.now();
    const id = setInterval(() => setMs(performance.now() - t0), 60);
    return () => clearInterval(id);
  }, [running]);
  return ms;
}
