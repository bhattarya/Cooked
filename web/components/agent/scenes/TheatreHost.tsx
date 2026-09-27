"use client";

import { AnimatePresence } from "motion/react";
import { useEffect, useState } from "react";
import { ProcessingTheatre } from "@/components/theatre";
import { useCookedVoice } from "@/lib/voiceAgent";
import type { Step } from "../Pipeline";
import { RunErrorPanel, WorkHoursPanel } from "./Overlays";
import { useNarrator } from "./narrator";

/** The audit progress screen and the two panels that can interrupt it. */
export function TheatreHost({ steps, exiting, error, askingWork, onWork, onExited, onBack }: { steps: Step[]; exiting: boolean; error: string | null; askingWork: boolean; onWork: (h: number) => void; onExited: () => void; onBack: () => void }) {
  const { level } = useNarrator();
  const voice = useCookedVoice();
  const [agentLevel, setAgentLevel] = useState(0);
  const { connected, levels } = voice;

  // the live agent's loudness is read from its audio graph, so it is sampled rather than pushed
  useEffect(() => {
    if (!connected) return;
    const t = setInterval(() => setAgentLevel(Math.min(1, levels().output * 1.5)), 80);
    return () => {
      clearInterval(t);
      setAgentLevel(0);
    };
  }, [connected, levels]);

  return (
    <div className="relative">
      <ProcessingTheatre steps={steps} title="Reading your audit" subtitle="Seven steps trace the work behind your results. Live and cached sources are labeled as each finding arrives." voiceLevel={connected ? agentLevel : level} exiting={exiting} onExited={onExited} className="!h-[calc(100dvh-88px)]" />
      <AnimatePresence>
        {askingWork && !exiting && <WorkHoursPanel key="work" onAnswer={onWork} agentConnected={connected} />}
        {error && !exiting && <RunErrorPanel key="error" message={error} onBack={onBack} />}
      </AnimatePresence>
    </div>
  );
}
