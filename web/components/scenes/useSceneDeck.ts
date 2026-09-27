"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export interface SceneDef {
  id: string;
  label: string;
  /** Not reachable yet (data still loading, or nothing to show). Skipped by next/prev and the rail. */
  disabled?: boolean;
}

export interface SceneDeckState {
  scenes: SceneDef[];
  index: number;
  id: string | undefined;
  /** +1 when the last move went forward, -1 when it went back; drives the transition direction. */
  dir: 1 | -1;
  /** Go to a scene by id or index. Returns false (and stays put) if it doesn't exist or is disabled. */
  go: (to: string | number) => boolean;
  next: () => boolean;
  prev: () => boolean;
}

/** State for a SceneDeck. Voice commands and buttons drive it through go/next/prev. */
export function useSceneDeck(scenes: SceneDef[], initial?: string): SceneDeckState {
  // handlers read the newest list without being recreated when the caller rebuilds it
  const latest = useRef(scenes);
  useEffect(() => {
    latest.current = scenes;
  }, [scenes]);
  const [pos, setPos] = useState<{ index: number; dir: 1 | -1 }>(() => ({
    index: Math.max(0, initial ? scenes.findIndex((s) => s.id === initial) : 0),
    dir: 1,
  }));

  const go = useCallback((to: string | number) => {
    const list = latest.current;
    const i = typeof to === "string" ? list.findIndex((s) => s.id === to) : to;
    if (i < 0 || i >= list.length || list[i].disabled) return false;
    setPos((p) => (p.index === i ? p : { index: i, dir: i > p.index ? 1 : -1 }));
    return true;
  }, []);

  const step = useCallback((by: 1 | -1) => {
    const list = latest.current;
    for (let i = pos.index + by; i >= 0 && i < list.length; i += by) if (!list[i].disabled) return go(i);
    return false;
  }, [go, pos.index]);

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => step(-1), [step]);

  return useMemo(
    () => ({ scenes, index: pos.index, id: scenes[pos.index]?.id, dir: pos.dir, go, next, prev }),
    [scenes, pos, go, next, prev],
  );
}
