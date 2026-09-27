"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "../Sponsors";
import { SAMPLES } from "./model";

export function Home({ ds, live, name, error, hasJourney, onFile, onSample, onResume }: { ds: Dataset | null; live: SponsorLive; name: string | null; error: string | null; hasJourney: boolean; onFile: (f: File) => void; onSample: (id: string) => void; onGreet: () => void; onResume: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const file = e.dataTransfer.files[0]; if (file) onFile(file); };
  return (
    <section className="flex min-h-full flex-1 overflow-y-auto px-5 py-8 pb-40 sm:px-12 sm:py-10 sm:pb-12">
      <div className="m-auto grid w-full max-w-[1080px] gap-10 sm:gap-14 lg:grid-cols-[1.05fr_.95fr] lg:gap-20">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .5 }} className="flex flex-col justify-center">
          <p className="mb-4 text-[11px] font-semibold uppercase tracking-[.24em] text-gold sm:mb-6">Your degree. Your next move.</p>
          <h1 className="display max-w-[10ch] text-[2.8rem] font-extrabold leading-[.93] tracking-tight text-cream sm:max-w-none sm:text-7xl">Less guessing.<br /><span className="text-gold">More graduating.</span></h1>
          <p className="mt-4 max-w-md text-[15px] leading-7 text-muted sm:mt-6 sm:text-base">{name ? `Hey ${name}. ` : ""}Bring your audit. We’ll connect the credits, the what-ifs, and your next steps in one conversation.</p>
          <div className="mt-4 flex items-center gap-3 text-sm text-muted sm:mt-8"><span className="h-1.5 w-1.5 rounded-full bg-gold" /> Voice or text, whenever you’re ready.</div>
          {hasJourney && <button onClick={onResume} className="mt-6 w-fit text-sm font-medium text-gold underline-offset-4 hover:underline">Continue with your audit <span aria-hidden>→</span></button>}
          <div className="mt-6 hidden flex-wrap gap-x-6 gap-y-2 border-t border-line pt-5 text-xs text-muted sm:mt-12 sm:flex">
            <Link href="/app/explore" className="hover:text-gold">Explore the cohort ↗</Link>
            <Link href="/app/lab" className="hover:text-gold">Try a what-if ↗</Link>
            <Link href="/app/advisor" className="hover:text-gold">Advisor overview ↗</Link>
          </div>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .6, delay: .1 }} className="self-center">
          <div className={`rounded-[22px] border p-5 shadow-[0_18px_70px_rgba(0,0,0,.22)] transition-colors sm:p-9 ${over ? "border-gold bg-gold/10" : "border-line bg-panel"}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
            <div className="flex items-center justify-between"><span className="text-[11px] font-semibold uppercase tracking-[.2em] text-dim">Start here</span><span className="rounded-full border border-line-2 px-2.5 py-1 text-[10px] uppercase tracking-widest text-dim">01</span></div>
            <div aria-hidden className="my-5 flex h-12 w-12 rotate-[-6deg] items-center justify-center rounded-xl border border-gold/40 bg-gold/5 text-2xl text-gold sm:my-7 sm:h-14 sm:w-14">↑</div>
            <h2 className="display text-[1.72rem] font-bold leading-[.95] text-cream sm:text-3xl">Your plan starts<br />with your audit.</h2>
            <p className="mt-3 max-w-md text-[13px] leading-5 text-muted sm:text-sm sm:leading-6">Drop it here, or choose a file. We read completed credits, requirements, and courses in progress.</p>
            <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" aria-label="Upload degree audit" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
            <button onClick={() => input.current?.click()} className="mt-5 flex w-full items-center justify-between rounded-xl bg-gold px-5 py-3.5 text-sm font-semibold text-black transition hover:bg-cream focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:mt-7">{over ? "Drop your audit here" : "Choose your degree audit"}<span aria-hidden>↑</span></button>
            <p className="mt-3 text-xs leading-relaxed text-dim">PDF, PNG, JPEG or WebP · up to 8 MB<br />The file isn’t stored. Extracted courses and totals are saved for your analysis.</p>
            {!live.gemini && <p className="mt-3 text-xs text-amber">Audit reading is currently unavailable. You can still try a sample below.</p>}
          </div>
          <details className="mt-5 border-b border-line pb-4 text-sm text-muted">
            <summary className="cursor-pointer hover:text-cream">Just looking? Try a sample student</summary>
            <div className="mt-3 grid gap-1">{SAMPLES.map((s) => <button key={s.id} disabled={!ds} onClick={() => onSample(s.id)} className="flex justify-between rounded-lg px-3 py-3 text-left transition hover:bg-panel disabled:opacity-40"><span>{s.label}</span><span className="text-gold">→</span></button>)}</div>
            <p className="px-3 text-xs text-dim">Samples and comparison models use synthetic data.</p>
          </details>
          {error && <p role="alert" className="mt-4 text-sm text-hot">{error}</p>}
        </motion.div>
      </div>
    </section>
  );
}
