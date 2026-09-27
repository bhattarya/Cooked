"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "../Sponsors";
import { SAMPLES } from "./model";

export function Home({ ds: _ds, live: _live, name: _name, error, hasJourney, onFile, onSample, onResume }: {
  ds: Dataset | null;
  live: SponsorLive;
  name: string | null;
  error: string | null;
  hasJourney: boolean;
  onFile: (f: File) => void;
  onSample: (id: string) => void;
  onGreet: () => void;
  onResume: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  useEffect(() => { if (error) setLoadingFile(false); }, [error]);
  const choose = (file?: File) => { if (!file) return; setLoadingFile(true); onFile(file); };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]); };

  return <section className="flex h-full overflow-y-auto px-4 py-8 sm:px-8 lg:px-12">
    <div className="m-auto grid w-full max-w-6xl gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(320px,420px)] lg:items-center lg:gap-16">
      <div>
        <p className="label !text-gold">Your student guide</p>
        <h1 className="display mt-4 max-w-xl text-4xl font-bold text-cream sm:text-6xl">Know where your degree stands.</h1>
        <p className="mt-6 max-w-xl text-base leading-relaxed text-muted">Add your degree audit. Ask COOKED about this fall, your credits, or your timeline by voice or text. See what the audit says, what the trained model estimates, and how comparable students did.</p>
        <p className="mt-5 max-w-xl text-xs leading-relaxed text-dim">Your audit is read for courses and credits. Model scores and cohort comparisons come from the synthetic HackUMBC dataset and describe patterns, not promises.</p>
        {hasJourney && <button type="button" onClick={onResume} className="mt-7 rounded-lg border border-gold/50 px-4 py-2 text-sm text-gold hover:border-gold">Continue your plan →</button>}
      </div>
      <div>
        <div className={`rounded-xl border bg-panel p-5 sm:p-7 ${over ? "border-gold" : "border-line-2"}`} onDragOver={e => {e.preventDefault(); setOver(true);}} onDragLeave={() => setOver(false)} onDrop={drop}>
          <h2 className="text-xl font-semibold text-text">Start with your audit</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">PDF or image · up to 8 MB. COOKED checks completed and in-progress courses before making a plan.</p>
          <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" aria-label="Upload degree audit" onChange={e => {choose(e.target.files?.[0]); e.target.value = "";}} />
          <button type="button" disabled={loadingFile} onClick={() => input.current?.click()} className="mt-6 w-full rounded-lg bg-gold px-4 py-3 text-sm font-semibold text-bg disabled:opacity-60">{loadingFile ? "Reading your audit…" : over ? "Drop your audit here" : "Choose degree audit"}</button>
          {error && <div role="alert" className="mt-4 border-t border-line pt-4 text-sm text-hot"><p>{error}</p><p className="mt-1 text-xs text-muted">Try another file, or use a clearly labeled synthetic sample below.</p></div>}
        </div>
        <div className="mt-5"><h3 className="label">Try a synthetic sample</h3><div className="mt-3 flex flex-wrap gap-2">{SAMPLES.map(s => <button key={s.id} type="button" onClick={() => onSample(s.id)} className="rounded-lg border border-line-2 px-3 py-2 text-sm text-muted hover:border-gold/50 hover:text-text">{s.label}</button>)}</div></div>
      </div>
    </div>
  </section>;
}
