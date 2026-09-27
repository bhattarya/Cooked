"use client";

import { useEffect } from "react";
import { useCookedVoice } from "@/lib/voiceAgent";
import type { Step } from "../Pipeline";
import { RunErrorPanel, WorkHoursPanel } from "./Overlays";

/** Show only completed and current work from the actual audit pipeline. */
export function TheatreHost({ steps, exiting, error, askingWork, onWork, onExited, onBack }: { steps: Step[]; exiting: boolean; error: string | null; askingWork: boolean; onWork: (h: number) => void; onExited: () => void; onBack: () => void }) {
  const voice = useCookedVoice();
  useEffect(() => { if (exiting) onExited(); }, [exiting, onExited]);
  const active = steps.find(step => step.status === "running");
  const finished = steps.filter(step => step.status === "done" || step.status === "warn");
  return <main className="flex min-h-dvh items-center justify-center bg-bg px-4 py-10 text-text">
    <div className="w-full max-w-2xl">
      <p className="label !text-gold">Your audit</p>
      <h1 className="display mt-3 text-3xl font-bold text-cream sm:text-4xl">Reading your degree path</h1>
      <p role="status" aria-live="polite" className="mt-5 text-base text-muted">{active ? active.task : "Preparing your results"}</p>
      <ol className="mt-7 border-t border-line">
        {finished.map(step => <li key={step.key} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line py-3 text-sm"><span className="text-text">{step.task}</span><span className="num text-xs text-muted">{step.result ?? (step.status === "warn" ? "Check needed" : "Done")}</span></li>)}
      </ol>
      <p className="mt-5 text-xs leading-relaxed text-dim">Each result comes from your parsed audit, a trained model, or the synthetic alumni dataset. You can inspect the evidence in the next screen.</p>
    </div>
    {askingWork && !exiting && <WorkHoursPanel onAnswer={onWork} agentConnected={voice.connected} />}
    {error && !exiting && <RunErrorPanel message={error} onBack={onBack} />}
  </main>;
}
