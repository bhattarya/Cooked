"use client";

import type { Ref } from "react";
import { SUGGESTIONS, norm } from "./model";
import { Prompt, type MicUi } from "./Prompt";

export interface AskSceneProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onPick: (q: string) => void;
  busy: boolean;
  mic?: MicUi;
  voiceLive: boolean;
  onEdge: (dir: -1 | 1) => void;
  inputRef: Ref<HTMLInputElement>;
  answered: string[];
  count: number;
  error: string;
  apiDown: boolean;
  narrate: boolean;
  onNarrate: (on: boolean) => void;
}

export function AskScene(p: AskSceneProps) {
  const done = new Set(p.answered.map(norm));
  return <section className="h-full overflow-y-auto px-4 py-8 sm:px-8">
    <div className="mx-auto flex min-h-full max-w-4xl flex-col justify-center">
      <p className="label !text-gold">Cohort explorer</p>
      <h1 className="display mt-3 text-4xl font-bold text-cream sm:text-6xl">Ask the cohort</h1>
      <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">Ask about course load, work hours, internships, first jobs, majors, or degree cost. The model selects a fixed query; the database computes the answer.</p>
      <div className="mt-8 max-w-3xl">
        <Prompt value={p.value} onChange={p.onChange} onSubmit={p.onSubmit} busy={p.busy} inputRef={p.inputRef} mic={p.mic} onEdge={p.onEdge} placeholder="How do work hours relate to time to degree?" />
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <p aria-live="polite">{p.error ? <span role="alert" className="text-hot">{p.error}</span> : p.apiDown ? <span className="text-ember">The cohort API is unavailable.</span> : p.voiceLive ? "Voice is live. Speak or type your question." : p.mic ? "Type or use the microphone." : "Type a question and press Enter."}</p>
          <label className="flex items-center gap-2"><input type="checkbox" checked={p.narrate} onChange={e => p.onNarrate(e.target.checked)} className="accent-gold" />Read answers aloud</label>
        </div>
      </div>
      <div className="mt-10 border-t border-line pt-5">
        <h2 className="label">Questions this dataset can answer</h2>
        <ul className="mt-4 grid gap-2 sm:grid-cols-2">
          {SUGGESTIONS.map(s => <li key={s.q}><button type="button" onClick={() => p.onPick(s.q)} disabled={p.busy} className="flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-panel px-4 py-3 text-left text-sm text-text hover:border-gold/50 disabled:opacity-50"><span>{s.q}</span><span className="shrink-0 text-gold">{done.has(norm(s.q)) ? "View" : "Ask"} →</span></button></li>)}
        </ul>
        {p.count > 0 && <p className="num mt-4 text-xs text-dim">{p.count} saved {p.count === 1 ? "answer" : "answers"} · use the question strip to revisit them</p>}
      </div>
    </div>
  </section>;
}
