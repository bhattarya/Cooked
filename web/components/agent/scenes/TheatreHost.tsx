"use client";

import { AnimatePresence } from "motion/react";
import { CookingLoader } from "./CookingLoader";
import { useCookedVoice } from "@/lib/voiceAgent";
import type { Step } from "../Pipeline";
import { RunErrorPanel, WorkHoursPanel } from "./Overlays";

/** Audit progress with a retriever animation and accessible work-hours/error dialogs. */
export function TheatreHost({ steps, exiting, error, askingWork, onWork, onExited, onBack }: { steps: Step[]; exiting: boolean; error: string | null; askingWork: boolean; onWork: (h: number) => void; onExited: () => void; onBack: () => void }) {
  const { connected } = useCookedVoice();

  return (
    <div className="relative">
      <CookingLoader steps={steps} exiting={exiting} paused={askingWork || Boolean(error)} onExited={onExited} />
      <AnimatePresence>
        {askingWork && !exiting && <WorkHoursPanel key="work" onAnswer={onWork} agentConnected={connected} />}
        {error && !exiting && <RunErrorPanel key="error" message={error} onBack={onBack} />}
      </AnimatePresence>
    </div>
  );
}
