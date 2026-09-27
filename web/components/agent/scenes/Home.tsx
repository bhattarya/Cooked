"use client";

import Link from "next/link";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { Dataset } from "@/lib/types";
import { Mark } from "../../brand";
import type { SponsorLive } from "../Sponsors";
import { SAMPLES } from "./model";
import { useNarrator } from "./narrator";

export function Home({ ds, live, name, error, hasJourney, onFile, onSample, onGreet, onResume }: { ds: Dataset | null; live: SponsorLive; name: string | null; error: string | null; hasJourney: boolean; onFile: (f: File) => void; onSample: (id: string) => void; onGreet: () => void; onResume: () => void }) {
  const { caption } = useNarrator();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } };

  return (
    <section className="relative h-full min-h-0 overflow-y-auto px-5 pb-8 pt-9 sm:px-8 lg:px-12 lg:pt-12">
      <div className="mx-auto max-w-[1320px]">
        <div className="flex items-center gap-3 border-b border-line-2 pb-5">
          <span className="label !text-gold">01 / START HERE</span>
          <span className="ml-auto text-xs text-dim">Synthetic student data · HackUMBC 2026</span>
        </div>
        <div className="grid gap-10 pt-10 lg:grid-cols-[minmax(0,1fr)_minmax(380px,.8fr)] lg:gap-16">
          <div className="flex flex-col justify-between">
            <div>
              <p className="label mb-5 !text-muted">YOUR DEGREE, IN CONTEXT</p>
              <h1 className="display max-w-[9ch] text-[clamp(4.7rem,8vw,9rem)] font-semibold leading-[.88] text-cream">Am I <span className="text-gold">cooked?</span></h1>
              <p className="mt-7 max-w-[46ch] text-base leading-relaxed text-muted sm:text-lg">{caption || (name ? `${name}, bring your degree audit and we’ll show you where the road bends.` : "Bring your degree audit and see where the road bends.")}</p>
              <button type="button" onClick={onGreet} className="mt-3 text-xs text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold">Hear the introduction again</button>
            </div>
            <div className="mt-12 flex items-end gap-6 border-t border-line-2 pt-6">
              <div className="w-24 shrink-0 opacity-55 sm:w-32"><Mark width={140} /></div>
              <p className="max-w-[35ch] text-xs leading-relaxed text-dim">See the risk, inspect the evidence, then test a better plan. Your results are a simulation based on synthetic data, not a prediction.</p>
            </div>
          </div>
          <div className="space-y-4">
            <div role="button" tabIndex={0} aria-label="Drop your degree audit, or press Enter to choose a file" onClick={() => input.current?.click()} onKeyDown={key} onDragOver={(e) => {e.preventDefault(); setOver(true);}} onDragLeave={() => setOver(false)} onDrop={drop} className={`group cursor-pointer rounded-md border p-7 transition sm:p-9 ${over ? "border-gold bg-gold/10" : "border-line-2 bg-panel hover:border-gold/60"}`}>
              <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
              <span className="num text-[11px] text-gold">01 / YOUR AUDIT</span>
              <div className="mt-12 flex items-end justify-between gap-4"><h2 className="display text-[2.4rem] font-medium text-cream sm:text-[3rem]">{over ? "Release to read" : "Upload your audit"}</h2><span aria-hidden className="text-2xl text-gold">↗</span></div>
              <p className="mt-3 text-sm text-muted">PDF or photo · read by Gemini · file is never stored</p>
              {!live.gemini && <p className="mt-3 text-xs text-amber">Gemini is not configured. Try a sample student below.</p>}
            </div>
            <div className="rounded-md border border-line-2 bg-panel p-7 sm:p-9">
              <div className="flex items-baseline justify-between"><span className="num text-[11px] text-gold">02 / EXPLORE A SAMPLE</span><span className="text-xs text-dim">Synthetic students</span></div>
              <div className="mt-6 divide-y divide-line-2">
                {SAMPLES.map((s, i) => <button key={s.id} type="button" disabled={!ds} onClick={() => onSample(s.id)} className="flex w-full items-center gap-4 py-4 text-left transition hover:text-gold disabled:opacity-40"><span className="num text-xs text-dim">{String(i + 1).padStart(2,"0")}</span><span className="flex-1"><strong className="block text-sm font-medium">{s.label}</strong><small className="text-xs text-muted">{s.hint}</small></span><span aria-hidden>↗</span></button>)}
              </div>
              {!ds && <p className="mt-2 text-xs text-dim">Loading sample data…</p>}
            </div>
            {error && <p role="alert" className="text-sm text-hot">{error}</p>}
            <nav aria-label="Other ways to explore" className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted">
              {hasJourney && <button type="button" onClick={onResume} className="text-gold hover:underline">Back to your results</button>}
              <Link href="/app/explore" className="hover:text-text hover:underline">Explore the cohort ↗</Link>
              <Link href="/app/lab" className="hover:text-text hover:underline">Build a scenario ↗</Link>
            </nav>
          </div>
        </div>
      </div>
    </section>
  );
}
