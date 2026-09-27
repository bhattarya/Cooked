"use client";

import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";

export const useIsoLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

/* ---------------------------------- easing --------------------------------- */

export type Ease = (t: number) => number;
export const clamp01 = (t: number): number => (t < 0 ? 0 : t > 1 ? 1 : t);
export const easeOutCubic: Ease = (t) => 1 - Math.pow(1 - t, 3);
export const easeOutExpo: Ease = (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t));
export const easeInOutCubic: Ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
/** Overshoots slightly then settles: a cheap spring. */
export const easeOutBack: Ease = (t) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
};

/* ------------------------------ reduced motion ----------------------------- */

const RM = "(prefers-reduced-motion: reduce)";
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(RM);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(RM).matches,
    () => false,
  );
}

/* ---------------------------------- sizing --------------------------------- */

/**
 * Measures an element with a ResizeObserver. `height` may be a number, a function of the measured
 * width (for aspect-ratio charts) or "fill" (take the parent's height). Width is 0 until measured.
 * Returns `[ref, { width, height }]`: attach `ref` to the element whose box you want.
 */
export function useChartSize<T extends HTMLElement = HTMLDivElement>(
  height: number | "fill" | ((width: number) => number) = "fill",
): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const w = Math.round(el.clientWidth);
      const h = Math.round(el.clientHeight);
      setBox((p) => (p.w === w && p.h === h ? p : { w, h }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const h = typeof height === "number" ? height : typeof height === "function" ? height(box.w) : box.h;
  return [ref, { width: box.w, height: h }];
}

/** True once the element has scrolled into view. `once: false` tracks visibility both ways (to pause ambient loops). */
export function useInView(ref: RefObject<Element | null>, opts: { once?: boolean; margin?: string } = {}): boolean {
  const { once = true, margin = "80px" } = opts;
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(
      ([e]) => {
        setInView(e.isIntersecting);
        if (e.isIntersecting && once) io.disconnect();
      },
      { rootMargin: margin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, once, margin]);
  return inView;
}

/* ---------------------------------- tweens --------------------------------- */

export interface TweenOptions {
  duration?: number;
  ease?: Ease;
  /** Per-index start delay in ms. Applies to the entry animation only (data changes move together). */
  delay?: (index: number) => number;
  /** Starting value for index `i` on entry and for indices that appear later. Defaults to 0. */
  from?: (index: number, target: number) => number;
  /** Hold at the starting values until true (e.g. until the chart scrolls into view). */
  enabled?: boolean;
}

const lerp = (a: number, b: number, t: number) => (Number.isFinite(a) && Number.isFinite(b) ? a + (b - a) * t : b);

/**
 * Animates a numeric array toward `target`, from the starting values on mount and from whatever is
 * currently displayed on every later change (interruptible). One React update per frame for the
 * whole chart, so marks stay plain SVG. Returns `target` untouched under prefers-reduced-motion.
 */
export function useTween(target: readonly number[], opts: TweenOptions = {}): number[] {
  const { duration = 800, ease = easeOutCubic, enabled = true } = opts;
  const reduced = usePrefersReducedMotion();
  const [vals, setVals] = useState<number[]>(() => target.map((t, i) => (opts.from ? opts.from(i, t) : 0)));
  const cur = useRef(vals);
  const latest = useRef({ target, opts });
  const entered = useRef(false);
  useIsoLayoutEffect(() => {
    latest.current = { target, opts };
  });
  const sig = `${target.length}:${target.join(",")}`;

  useEffect(() => {
    if (!enabled || reduced) return;
    const { target: to, opts: o } = latest.current;
    const from = to.map((t, i) => (i < cur.current.length ? cur.current[i] : o.from ? o.from(i, t) : 0));
    const first = !entered.current;
    entered.current = true;
    if (to.every((t, i) => Object.is(t, from[i]))) return;
    const delays = to.map((_, i) => (first && o.delay ? o.delay(i) : 0));
    const total = duration + Math.max(0, ...delays);
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const el = now - t0;
      const next = to.map((t, i) => {
        const p = clamp01((el - delays[i]) / duration);
        return p >= 1 ? t : lerp(from[i], t, ease(p));
      });
      cur.current = next;
      setVals(next);
      if (el < total) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // `ease` is a stable module function in every caller; `sig` is the change signal for `target`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig, enabled, reduced, duration]);

  if (reduced) return target as number[];
  return target.map((t, i) => (i < vals.length ? vals[i] : opts.from ? opts.from(i, t) : 0));
}

/** Single-value convenience over `useTween`. */
export function useTweenValue(target: number, opts: TweenOptions = {}): number {
  return useTween([target], opts)[0];
}

/** Progress 0 to 1 that plays once when `enabled` flips true. */
export function useEntry(enabled: boolean, opts: { duration?: number; delay?: number; ease?: Ease } = {}): number {
  const { duration = 900, delay = 0, ease } = opts;
  return useTween([1], { from: () => 0, duration, delay: () => delay, enabled, ease })[0];
}

/* -------------------------------- keyboard nav ------------------------------ */

/**
 * Next index for an arrow-key press over `count` marks. `cols` > 0 treats them as a grid
 * (up/down move a row). Returns null for keys that are not navigation.
 */
export function navIndex(key: string, i: number, count: number, cols = 0): number | null {
  if (count <= 0) return null;
  const last = count - 1;
  const at = i < 0 ? -1 : i;
  const step = (d: number) => Math.max(0, Math.min(last, at + d));
  switch (key) {
    case "ArrowRight":
      return step(1);
    case "ArrowLeft":
      return step(-1);
    case "ArrowDown":
      return step(cols > 0 ? cols : 1);
    case "ArrowUp":
      return step(cols > 0 ? -cols : -1);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** Pointer position relative to an element's top-left (the chart plot), for tooltip anchoring. */
export function localXY(e: { clientX: number; clientY: number }, el: Element | null): [number, number] {
  const r = el?.getBoundingClientRect();
  return r ? [e.clientX - r.left, e.clientY - r.top] : [0, 0];
}
