"use client";

import { motion } from "motion/react";
import { useRef, useState, type DragEvent } from "react";
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
  const choose = (f?: File) => { if (!f) return; setLoadingFile(true); onFile(f); };
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); choose(e.dataTransfer.files[0]); };

  return (
    <section className="home-shell relative flex min-h-full flex-1 overflow-y-auto px-5 pb-36 pt-8 sm:px-10 sm:pt-10 lg:px-16">
      <div className="home-aurora home-aurora-one" aria-hidden /><div className="home-aurora home-aurora-two" aria-hidden /><div className="home-gridline" aria-hidden />
      <div className="relative z-10 m-auto grid w-full max-w-[1240px] items-center gap-12 py-8 lg:grid-cols-[minmax(0,1.05fr)_minmax(420px,.8fr)] lg:gap-20 lg:py-14">
        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: .7, ease: [.22, 1, .36, 1] }}>
          <div className="home-kicker"><span className="home-kicker-dot" /> Personal degree intelligence</div>
          <h1 className="home-title mt-6">Your degree,<span>decoded.</span></h1>
          <p className="home-lede mt-6 max-w-xl">Upload the audit you already have. COOKED turns the fine print into a clear path, a little less panic, and one very opinionated next move.</p>
          {hasJourney && <button onClick={onResume} className="home-resume mt-9">Continue your active plan <span>↗</span></button>}
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30, scale: .98 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: .75, delay: .12, ease: [.22, 1, .36, 1] }} className="relative">
          <div className={`upload-card ${over ? "upload-card-over" : ""}`} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={drop}>
            <div className="upload-card-head"><span>Start here</span><b>01 / 03</b></div>
            <div className="upload-icon-wrap" aria-hidden><div className="upload-icon">↑</div></div>
            <h2>{loadingFile ? "Reading the fine print…" : over ? "Release to upload" : "Bring your audit."}</h2>
            <p>PDF, PNG, JPEG, or WebP. We’ll find completed credits, requirements, and courses in progress.</p>
            <input ref={input} type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" className="sr-only" aria-label="Upload degree audit" onChange={(e) => { choose(e.target.files?.[0]); e.target.value = ""; }} />
            <button type="button" disabled={loadingFile} onClick={() => input.current?.click()} className="upload-button"><span>{loadingFile ? "Reading your audit…" : "Choose degree audit"}</span><span aria-hidden>↗</span></button>
            <div className="upload-foot"><span>Private by default</span><span>Up to 8 MB</span><span>PDFs welcome</span></div>
          </div>
          {/* Quiet, always-available fallback: no audit on hand, or the demo needs a guaranteed-working path.
              Real synthetic students, checked against the trained model — same pipeline as a real upload. */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-center text-[13px] text-muted">
            <span className="text-dim">No audit on hand?</span>
            {SAMPLES.map((s) => (
              <button key={s.id} onClick={() => onSample(s.id)} className="underline decoration-line-2 underline-offset-4 transition hover:text-text hover:decoration-gold/60">
                {s.label}
              </button>
            ))}
          </div>
        </motion.div>

        {error && <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="home-error lg:col-start-2"><span className="home-error-mark">!</span><div><strong>That upload needs another look.</strong><p>{error}</p><button onClick={() => onSample(SAMPLES[0].id)}>Try a sample plan →</button></div></motion.div>}
      </div>
    </section>
  );
}
