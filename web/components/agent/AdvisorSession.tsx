"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { SessionUser } from "@/lib/session";
import { apiHealth, type Health } from "@/lib/live";
import { getScreenContext, registerCommands, runCommand, subscribeScreenContext, type CommandName, type SceneId } from "@/lib/commands";
import { sponsorLive } from "./Sponsors";
import { SAMPLES } from "./scenes/model";
import { useJourney } from "./scenes/useJourney";

const Session = createContext<ReturnType<typeof useJourney> | null>(null);
export function useAdvisorSession() {
  const value = useContext(Session);
  if (!value) throw new Error("Advisor session is missing");
  return value;
}

/** An audit belongs to the conversation, not to an individual screen. */
export function AdvisorSession({ user, children }: { user: SessionUser; children: ReactNode }) {
  const [health, setHealth] = useState<Health | null>(null);
  const journey = useJourney({ user, live: sponsorLive(health) });
  const router = useRouter();
  const pathname = usePathname();
  useEffect(() => { void apiHealth().then(setHealth); }, []);

  useEffect(() => {
    const forward = async (scene: SceneId, command: CommandName, args: Record<string, unknown>) => {
      const ready = new Promise<boolean>((resolve) => {
        let off = () => {};
        const timer = setTimeout(() => { off(); resolve(false); }, 8000);
        off = subscribeScreenContext((screen) => {
          if (screen?.scene === scene || (scene === "audit" && screen?.title === "Start")) {
            clearTimeout(timer); off(); resolve(true);
          }
        });
      });
      router.push(scene === "explore" ? "/app/explore" : scene === "models" ? "/app/lab" : "/app");
      if (!(await ready)) return { ok: false, message: "The workspace couldn't open. Try again." };
      // Let the destination register its handlers before dispatching the original request.
      await new Promise((r) => setTimeout(r, 0));
      return runCommand(command, args, { source: "ui" });
    };
    return registerCommands({
      exploreCohort: ({ question }) => getScreenContext()?.scene === "explore"
        ? { ok: false, message: "The cohort is still loading. Try again in a moment." }
        : forward("explore", "exploreCohort", { question }),
      askStudent: async ({ question }) => {
        const result = await journey.ask(question);
        if (result.ok) { journey.showDeck(); router.push(`/app?scene=${result.scene ?? "answer"}`); }
        return result;
      },
      runStressTest: async () => {
        const result = await journey.ask("Stress test my plan");
        if (result.ok) { journey.showDeck(); router.push("/app?scene=drill"); }
        return result;
      },
      findRepair: async () => {
        const result = await journey.ask("Find the smallest fix for my plan");
        if (result.ok) { journey.showDeck(); router.push("/app?scene=repair"); }
        return result;
      },
      setScenario: ({ field, value }) => {
        if (field === "work_hours" && pathname !== "/app/lab") {
          const hours = Math.round(Number(value));
          if (journey.waitingForWork()) {
            journey.answerWork(hours);
            return `Got it: ${hours} hours a week. Continuing your analysis.`;
          }
          if (journey.journey) return journey.applyWork(hours);
        }
        if (pathname === "/app/lab") return { ok: false, message: "The model workspace is still loading. Try again in a moment." };
        return forward("models", "setScenario", { field, value });
      },
      loadSampleStudent: ({ which }) => {
        router.push("/app");
        return journey.runSample((SAMPLES.find((s) => s.key === (which ?? "working")) ?? SAMPLES[0]).id);
      },
    }, true);
  }, [journey, router, pathname]);
  return <Session.Provider value={journey}>{children}</Session.Provider>;
}
