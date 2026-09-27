"use client";

import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";

/** Live pixel size of an element, so a fixed-height chart can fill the stage it sits in. 0×0 until the first measure. */
export function useBox(ref: RefObject<HTMLElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setBox((b) => (Math.round(b.w) === Math.round(width) && Math.round(b.h) === Math.round(height) ? b : { w: width, h: height }));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

const DESKTOP = "(min-width: 1024px)";

/** True from the `lg` breakpoint up, where scenes are fixed to the viewport; below it they stack and grow. */
export function useDesktop(): boolean {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia(DESKTOP);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => window.matchMedia(DESKTOP).matches,
    () => true,
  );
}
