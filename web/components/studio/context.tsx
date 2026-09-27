"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

/**
 * The Studio: audit, cohort, models and advisor as four CHAPTERS of one workspace.
 * Only the active chapter is mounted. Anything that wants a chapter to do something (the global Ask bar,
 * a voice tool, another chapter) calls `dispatch`; the studio switches chapter, waits for it to mount,
 * hands it the intent, and resolves with the text the chapter answers with (what the voice agent reads out).
 */
export type ChapterId = "audit" | "cohort" | "models" | "advisor";

export const CHAPTERS: { id: ChapterId; label: string; hint: string }[] = [
  { id: "audit", label: "Audit", hint: "your degree, your risk" },
  { id: "cohort", label: "Cohort", hint: "what happened to alumni" },
  { id: "models", label: "Models", hint: "shape a future, four models answer" },
  { id: "advisor", label: "Advisor", hint: "who is over the line" },
];

/** The student whose degree audit is loaded, shared so every chapter can use it (the Models chapter seeds from it). */
export interface StudentRef {
  /** Profile id the API knows (USR-… for an upload, CID-… for a sample). */
  id: string;
  name: string | null;
  work?: number;
  source: "sample" | "parser" | "gemini" | "manual";
}

export type Intent =
  /** A natural-language question for that chapter's own engine (askAgent / explore / lab narration…). */
  | { id: number; chapter: ChapterId; kind: "ask"; question: string }
  /** Jump to a scene inside the chapter (the chapter's own scene ids, e.g. audit: verdict|timeline|twins|drill|repair|careers|answer). */
  | { id: number; chapter: ChapterId; kind: "scene"; scene: string }
  | { id: number; chapter: ChapterId; kind: "next" | "previous" }
  /** Models chapter: change one scenario input (already validated/clamped by the command bus). */
  | { id: number; chapter: ChapterId; kind: "scenario"; field: string; value: string | number }
  /** Any chapter: what is on screen right now, as text with the real numbers. */
  | { id: number; chapter: ChapterId; kind: "describe" }
  /** Audit chapter: run one of the named actions. */
  | { id: number; chapter: ChapterId; kind: "action"; action: "stress-test" | "repair" | "load-sample"; arg?: string };

type NewIntent = Intent extends infer T ? (T extends { id: number } ? Omit<T, "id"> : never) : never;
export type IntentHandler = (intent: Intent) => string | Promise<string>;

export interface StudioApi {
  chapter: ChapterId;
  /** Switch chapter without an intent. */
  goChapter: (id: ChapterId) => void;
  student: StudentRef | null;
  setStudent: (s: StudentRef | null) => void;
  /** Switch to `intent.chapter`, deliver the intent once it is mounted, resolve with its answer text. */
  dispatch: (intent: NewIntent) => Promise<string>;
  /** Used by chapters (through useStudioIntent). Returns an unregister function. */
  registerHandler: (chapter: ChapterId, fn: IntentHandler) => () => void;
}

const Ctx = createContext<StudioApi | null>(null);

export function StudioProvider({ initialChapter = "audit", children }: { initialChapter?: ChapterId; children: ReactNode }) {
  const [chapter, setChapter] = useState<ChapterId>(initialChapter);
  const [student, setStudent] = useState<StudentRef | null>(null);
  const handlers = useRef(new Map<ChapterId, IntentHandler>());
  const queue = useRef<{ intent: Intent; resolve: (s: string) => void; timer: ReturnType<typeof setTimeout> }[]>([]);
  const seq = useRef(0);

  const flush = useCallback(() => {
    const waiting = queue.current;
    queue.current = [];
    for (const item of waiting) {
      const fn = handlers.current.get(item.intent.chapter);
      if (!fn) {
        queue.current.push(item);
        continue;
      }
      clearTimeout(item.timer);
      Promise.resolve()
        .then(() => fn(item.intent))
        .then(item.resolve, (e) => item.resolve(`That did not work: ${e instanceof Error ? e.message : "unknown error"}.`));
    }
  }, []);

  const registerHandler = useCallback(
    (ch: ChapterId, fn: IntentHandler) => {
      handlers.current.set(ch, fn);
      flush();
      return () => {
        if (handlers.current.get(ch) === fn) handlers.current.delete(ch);
      };
    },
    [flush],
  );

  const dispatch = useCallback(
    (i: NewIntent) =>
      new Promise<string>((resolve) => {
        const intent = { ...i, id: ++seq.current } as Intent;
        const timer = setTimeout(() => {
          queue.current = queue.current.filter((q) => q.intent.id !== intent.id);
          resolve(`The ${i.chapter} screen did not open in time.`);
        }, 10_000);
        queue.current.push({ intent, resolve, timer });
        setChapter(i.chapter);
        flush();
      }),
    [flush],
  );

  const api = useMemo<StudioApi>(
    () => ({ chapter, goChapter: setChapter, student, setStudent, dispatch, registerHandler }),
    [chapter, student, dispatch, registerHandler],
  );
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useStudio(): StudioApi {
  const v = useContext(Ctx);
  if (!v) throw new Error("useStudio must be used inside <StudioProvider>");
  return v;
}

/** In a chapter component: receive the intents the studio sends to this chapter. Return the text to answer with. */
export function useStudioIntent(chapter: ChapterId, handler: IntentHandler): void {
  const { registerHandler } = useStudio();
  const latest = useRef(handler);
  useEffect(() => {
    latest.current = handler;
  });
  useEffect(() => registerHandler(chapter, (i) => latest.current(i)), [chapter, registerHandler]);
}
