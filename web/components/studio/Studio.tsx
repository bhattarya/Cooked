"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { signOutOfGoogle } from "@/lib/auth";
import { registerCommands, type CommandHandlers, type SceneId } from "@/lib/commands";
import { apiHealth, type Health } from "@/lib/live";
import type { SessionUser } from "@/lib/session";
import { routeUtterance } from "@/lib/studioRoute";
import { Wordmark } from "../brand";
import { SponsorDots, sponsorLive } from "../agent/Sponsors";
import { AdvisorChapter } from "../chapters/AdvisorChapter";
import { AuditChapter } from "../chapters/AuditChapter";
import { CohortChapter } from "../chapters/CohortChapter";
import { ModelsChapter } from "../chapters/ModelsChapter";
import { DOCK_CLEARANCE } from "../scenes";
import { AboutData } from "./AboutData";
import { CommandBar } from "./CommandBar";
import { CHAPTERS, StudioProvider, useStudio, type ChapterId } from "./context";

/** Catalogue scene id -> the chapter that owns it and that chapter's own scene id. */
export function sceneTarget(scene: SceneId): { chapter: ChapterId; scene: string } {
  switch (scene) {
    case "home": return { chapter: "audit", scene: "home" };
    case "risk": return { chapter: "audit", scene: "verdict" };
    case "timeline": case "twins": case "drill": case "repair": case "careers": case "receipt":
      return { chapter: "audit", scene };
    case "models": case "constellation": case "arena": case "cards":
      return { chapter: "models", scene };
    case "explore": return { chapter: "cohort", scene: "explore" };
    case "advisor": return { chapter: "advisor", scene: "advisor" };
  }
}

const isChapter = (v: string | undefined): v is ChapterId => CHAPTERS.some((c) => c.id === v);

/** Everything /app renders: the provider plus the host. `initial` is the validated `?c=` from the URL. */
export function StudioApp({ user, canSeeRows, initial }: { user: SessionUser; canSeeRows: boolean; initial?: string }) {
  return (
    <StudioProvider initialChapter={isChapter(initial) ? initial : "audit"}>
      <Studio user={user} canSeeRows={canSeeRows} />
    </StudioProvider>
  );
}

/** Test seam: the dev harness swaps the real chapters for fakes. */
export type ChapterComponents = {
  audit: ComponentType<{ user: SessionUser }>;
  cohort: ComponentType<{ user: SessionUser }>;
  models: ComponentType<{ user: SessionUser }>;
  advisor: ComponentType<{ user: SessionUser; canSeeRows: boolean }>;
};
const REAL: ChapterComponents = { audit: AuditChapter, cohort: CohortChapter, models: ModelsChapter, advisor: AdvisorChapter };

export function Studio({ user, canSeeRows, chapters = REAL }: { user: SessionUser; canSeeRows: boolean; chapters?: ChapterComponents }) {
  const studio = useStudio();
  const { chapter, goChapter, dispatch, student } = studio;
  const reduce = useReducedMotion();
  const [health, setHealth] = useState<(Health & { database_kind?: string }) | null>(null);
  const [barOpen, setBarOpen] = useState(false);
  const live = useMemo(() => sponsorLive(health), [health]);

  useEffect(() => {
    apiHealth().then((h) => setHealth(h));
  }, []);

  // Keep ?c= in step so a refresh or a shared link lands on the same chapter, without adding history entries.
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("c") === chapter) return;
    url.searchParams.set("c", chapter);
    window.history.replaceState(null, "", url);
  }, [chapter]);

  // Global keys: "/" and Ctrl/Cmd+K open the Ask bar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setBarOpen((o) => !o);
      } else if (e.key === "/" && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        setBarOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // The router and the voice tools share one function; refs keep it reading the latest chapter/student.
  const latest = useRef({ chapter, student: !!student });
  useEffect(() => {
    latest.current = { chapter, student: !!student };
  });

  const ask = useCallback(
    async (text: string): Promise<{ answer: string; chapter: ChapterId }> => {
      const r = routeUtterance(text, latest.current);
      let answer: string;
      switch (r.intent) {
        case "open": {
          const opened = await dispatch({ chapter: "audit", kind: "scene", scene: "home" });
          answer = r.note ?? opened;
          break;
        }
        case "scenario":
          answer = await dispatch({ chapter: "models", kind: "scenario", field: r.field ?? "", value: r.value ?? 0 });
          break;
        case "stress-test": answer = await dispatch({ chapter: "audit", kind: "action", action: "stress-test" }); break;
        case "repair": answer = await dispatch({ chapter: "audit", kind: "action", action: "repair" }); break;
        case "load-sample": answer = await dispatch({ chapter: "audit", kind: "action", action: "load-sample" }); break;
        case "describe": answer = await dispatch({ chapter: r.chapter, kind: "describe" }); break;
        default: answer = await dispatch({ chapter: r.chapter, kind: "ask", question: r.question });
      }
      return { answer, chapter: r.chapter };
    },
    [dispatch],
  );

  // Every voice command lands here and is forwarded to the chapter that owns it; chapters register no bus handlers.
  useEffect(() => {
    const active = () => latest.current.chapter;
    const handlers: Partial<CommandHandlers> = {
      askAnything: async ({ question }) => (await ask(question)).answer,
      askStudent: ({ question }) => dispatch({ chapter: "audit", kind: "ask", question }),
      exploreCohort: ({ question }) => dispatch({ chapter: "cohort", kind: "ask", question }),
      showScene: ({ scene }) => {
        const t = sceneTarget(scene);
        return dispatch({ chapter: t.chapter, kind: "scene", scene: t.scene });
      },
      nextScene: () => dispatch({ chapter: active(), kind: "next" }),
      previousScene: () => dispatch({ chapter: active(), kind: "previous" }),
      setScenario: ({ field, value }) => dispatch({ chapter: "models", kind: "scenario", field, value }),
      runStressTest: () => dispatch({ chapter: "audit", kind: "action", action: "stress-test" }),
      findRepair: () => dispatch({ chapter: "audit", kind: "action", action: "repair" }),
      loadSampleStudent: ({ which }) => dispatch({ chapter: "audit", kind: "action", action: "load-sample", arg: which }),
      describeScreen: () => dispatch({ chapter: active(), kind: "describe" }),
    };
    return registerCommands(handlers);
  }, [ask, dispatch]);

  const Active = chapters[chapter] as ComponentType<{ user: SessionUser; canSeeRows: boolean }>;

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden">
      <div className="haze" />
      <header className="relative z-40 flex shrink-0 flex-wrap items-center gap-x-2 border-b border-line-2 bg-bg px-4 sm:h-16 sm:flex-nowrap sm:gap-4 sm:px-6">
        <Link href="/app" aria-label="COOKED home" className="flex h-12 shrink-0 items-center sm:h-auto">
          <Wordmark size={15} />
        </Link>
        <nav aria-label="Chapters" className="order-3 -mx-1 flex w-full gap-1 overflow-x-auto pb-2 sm:order-none sm:mx-0 sm:ml-4 sm:w-auto sm:pb-0">
          {CHAPTERS.map((c) => {
            const on = c.id === chapter;
            return (
              <button
                key={c.id}
                type="button"
                aria-current={on ? "page" : undefined}
                title={c.hint}
                onClick={() => goChapter(c.id)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-xs transition ${on ? "border-gold/60 bg-gold/10 text-text" : "border-transparent text-muted hover:text-text"}`}
              >
                {c.label}
              </button>
            );
          })}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-2.5 sm:gap-3">
          <SponsorDots live={live} />
          <button
            type="button"
            onClick={() => setBarOpen(true)}
            aria-label="Ask anything (press slash)"
            aria-keyshortcuts="/ Control+K Meta+K"
            className="flex items-center gap-2 rounded-full border border-line-2 bg-panel/60 px-3 py-1.5 text-xs text-muted transition hover:border-gold/40 hover:text-text"
          >
            <span>Ask</span>
            <kbd className="num hidden rounded border border-line-2 px-1 text-[10px] text-dim sm:inline">/</kbd>
          </button>
          <AboutData />
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt="" className="h-7 w-7 rounded-full ring-1 ring-line-2" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 text-xs text-gold">{user.name[0]}</span>
          )}
          <form
            action="/auth/logout"
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void signOutOfGoogle().finally(() => form.submit());
            }}
          >
            <button className="text-xs text-muted hover:text-text">Sign out</button>
          </form>
        </div>
      </header>
      <main className={`relative z-10 flex min-h-0 flex-1 flex-col ${DOCK_CLEARANCE}`}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={chapter}
            className="flex min-h-0 flex-1 flex-col"
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4 }}
            transition={{ duration: reduce ? 0 : 0.18, ease: "easeOut" }}
          >
            <Active user={user} canSeeRows={canSeeRows} />
          </motion.div>
        </AnimatePresence>
      </main>
      <CommandBar open={barOpen} onClose={() => setBarOpen(false)} chapter={chapter} ask={ask} />
    </div>
  );
}
