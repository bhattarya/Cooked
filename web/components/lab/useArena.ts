"use client";

import { useCallback, useEffect, useState } from "react";
import type { ArenaReport } from "@/lib/arena-types";
import { fetchArena } from "@/lib/labModel";

// The report is frozen at training time (124 KB, ~2 ms), so one fetch per page load is plenty.
let inflight: Promise<ArenaReport> | null = null;
const load = (): Promise<ArenaReport> => (inflight ??= fetchArena().then((r) => r.data)).catch((e) => {
  inflight = null;
  throw e;
});

export function useArena(): { arena: ArenaReport | null; error: string | null; retry: () => void } {
  const [arena, setArena] = useState<ArenaReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let on = true;
    load().then(
      (a) => {
        if (!on) return;
        setArena(a);
        setError(null);
      },
      (e: unknown) => on && setError(e instanceof Error ? e.message : "The arena report did not load."),
    );
    return () => {
      on = false;
    };
  }, [attempt]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  return { arena, error, retry };
}
