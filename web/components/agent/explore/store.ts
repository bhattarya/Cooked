"use client";

import { useSyncExternalStore } from "react";
import type { Entry } from "./model";

// Tiny browser-storage-backed stores read through useSyncExternalStore: the server (and the first client
// paint) see the empty value, then the real one arrives without a hydration mismatch. The in-memory copy is
// the source of truth, so a blocked or full storage only costs persistence, never correctness.

function makeStore<T>(opts: { storage: () => Storage; key: string; empty: T; parse: (raw: string | null) => T; serialize: (v: T) => string }) {
  let state: T | null = null;
  const subs = new Set<() => void>();
  const get = (): T => {
    if (state === null) {
      try {
        state = opts.parse(opts.storage().getItem(opts.key));
      } catch {
        state = opts.empty;
      }
    }
    return state;
  };
  const set = (next: T) => {
    state = next;
    try {
      opts.storage().setItem(opts.key, opts.serialize(next));
    } catch {
      // private mode or quota: it just won't survive a navigation
    }
    subs.forEach((f) => f());
  };
  return {
    get,
    set,
    subscribe: (f: () => void) => {
      subs.add(f);
      return () => void subs.delete(f);
    },
    server: () => opts.empty,
  };
}

const NO_ENTRIES: Entry[] = [];
const history = makeStore<Entry[]>({
  storage: () => window.sessionStorage,
  key: "cooked.explore.v1",
  empty: NO_ENTRIES,
  parse: (raw) => {
    const parsed = raw ? (JSON.parse(raw) as Entry[]) : NO_ENTRIES;
    return Array.isArray(parsed) ? parsed.filter((e) => e && typeof e.id === "string" && e.answer && Array.isArray(e.answer.rows)) : NO_ENTRIES;
  },
  serialize: (v) => JSON.stringify(v),
});

const narrate = makeStore<boolean>({
  storage: () => window.localStorage,
  key: "cooked.explore.narrate",
  empty: true,
  parse: (raw) => raw !== "off",
  serialize: (v) => (v ? "on" : "off"),
});

/** The answers asked this browser session, oldest first. Survives navigating to another section and back. */
export function useHistory(): [Entry[], (update: (old: Entry[]) => Entry[]) => void] {
  const entries = useSyncExternalStore(history.subscribe, history.get, history.server);
  return [entries, (update) => history.set(update(history.get()))];
}

/** Whether new answers are read aloud when the live voice agent is not connected. */
export function useNarratePref(): [boolean, (on: boolean) => void] {
  return [useSyncExternalStore(narrate.subscribe, narrate.get, narrate.server), narrate.set];
}

export const currentHistory = () => history.get();
