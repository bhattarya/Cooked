"use client";

import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { Dataset } from "@/lib/types";
import { GoldOrb } from "@/components/theatre";
import { Mark } from "../../brand";
import type { SponsorLive } from "../Sponsors";
import { useBox } from "./kit";
import { SAMPLES } from "./model";
import { useNarrator } from "./narrator";

const HINT_TONE: Record<string, string> = { "the alarm fires early": "var(--gold)", "already cooked": "var(--hot)", "on track": "var(--cool)" };
const EASE = [0.16, 1, 0.3, 1] as const;

function UploadGlyph() {
  return (
    <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
    </svg>
  );
}

/** The command screen: one confident viewport with three ways in. */
export function Home({ ds, live, name, error, hasJourney, onFile, onSample, onGreet, onResume }: { ds: Dataset | null; live: SponsorLive; name: string | null; error: string | null; hasJourney: boolean; onFile: (f: File) => void; onSample: (id: string) => void; onGreet: () => void; onResume: () => void }) {
  const { caption, speaking, level } = useNarrator();
  const reduced = !!useReducedMotion();
  const [ref, box] = useBox<HTMLElement>();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const orb = box.h >= 720 ? 150 : box.h >= 620 ? 124 : 96;

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const f = e.dataTransfer.files[0];
    if (f) onFile(f);
  };
  const key = (e: KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      input.current?.click();
    }
  };

  return (
    <section ref={ref} className="relative flex h-full min-h-0 flex-col items-center overflow-y-auto px-5 pb-6 pt-1 lg:justify-center lg:overflow-hidden lg:px-10">
      {/* the emblem, faint, behind everything */}
      <div aria-hidden className="pointer-events-none absolute inset-0 grid place-items-center overflow-hidden">
        <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={reduced ? { opacity: 0.1, scale: 1 } : { opacity: 0.1, scale: [1, 1.025, 1], y: [0, -10, 0] }} transition={reduced ? { duration: 0.8 } : { opacity: { duration: 1.6 }, scale: { duration: 16, repeat: Infinity, ease: "easeInOut" }, y: { duration: 16, repeat: Infinity, ease: "easeInOut" } }} className="[mask-image:radial-gradient(closest-side,black_55%,transparent_100%)]">
          <Mark width={box.desk ? 880 : 520} priority className="h-auto w-auto max-w-none" />
        </motion.div>
      </div>

      <div className="relative z-10 flex w-full max-w-5xl flex-1 flex-col items-center justify-center gap-4 lg:flex-none lg:gap-5">
        <motion.button
          type="button"
          onClick={onGreet}
          aria-label="Hear the greeting again"
          title="Tap to hear it again"
          initial={{ opacity: 0, scale: 0.7 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 110, damping: 16 }}
          className="rounded-full outline-offset-4 transition hover:scale-105"
        >
          <GoldOrb state={speaking ? "composing" : "breathing"} size={orb} level={level} />
        </motion.button>

        <div className="text-center">
          <motion.h1 initial={{ opacity: 0, y: 18, filter: "blur(8px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.9, delay: 0.15, ease: EASE }} className="display text-gold-grad text-[3.6rem] font-black leading-[0.9] sm:text-[5.5rem] lg:text-[clamp(4.5rem,11vh,8rem)]">
            Am I cooked?
          </motion.h1>
          <AnimatePresence mode="wait" initial={false}>
            <motion.p key={caption || "idle"} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.35 }} className="serif mx-auto mt-3 max-w-xl text-lg leading-snug text-muted sm:text-xl">
              {caption || (name ? `Hey ${name}. Drop your degree audit and I'll show you where you're headed.` : "Hey. Drop your degree audit and I'll show you where you're headed.")}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1.5 text-[11px] text-dim">{live.elevenlabs ? "Voice by ElevenLabs" : "browser voice · ElevenLabs offline"} · tap the orb to hear it again</p>
        </div>

        <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8, delay: 0.35, ease: EASE }} className="grid w-full gap-3 lg:grid-cols-[1.25fr_1fr] lg:gap-4">
          {/* portal a: the audit */}
          <div
            role="button"
            tabIndex={0}
            aria-label="Drop your degree audit, or press Enter to choose a file"
            onClick={() => input.current?.click()}
            onKeyDown={key}
            onDragOver={(e) => {
              e.preventDefault();
              setOver(true);
            }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
            className={`group relative flex cursor-pointer flex-col items-center justify-center overflow-hidden rounded-3xl border border-dashed px-6 py-7 text-center transition duration-300 lg:py-8 ${over ? "border-gold bg-gold/[0.09] shadow-[0_0_60px_rgba(246,180,26,0.25)]" : "border-gold/35 bg-panel/60 hover:border-gold/70 hover:bg-gold/[0.04]"}`}
          >
            <input
              ref={input}
              type="file"
              accept="application/pdf,image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            <span aria-hidden className="pointer-events-none absolute -inset-px rounded-3xl opacity-0 transition duration-500 group-hover:opacity-100" style={{ background: "radial-gradient(60% 80% at 50% 0%, rgba(246,180,26,0.12), transparent 70%)" }} />
            <span className="relative flex h-14 w-14 items-center justify-center rounded-full bg-gold/10 text-gold transition duration-300 group-hover:scale-110">
              <span aria-hidden className="pulse-ring absolute inset-0 rounded-full border border-gold/40" />
              <UploadGlyph />
            </span>
            <div className="display relative mt-4 text-[1.9rem] font-extrabold leading-none text-cream sm:text-[2.2rem]">{over ? "Release to read it" : "Drop your degree audit"}</div>
            <div className="relative mt-2 text-sm text-muted">PDF or photo · read by Gemini · the file is never stored</div>
            {!live.gemini && <div className="relative mt-2 text-xs text-amber">Gemini isn&apos;t configured yet: real audits won&apos;t read. Samples work.</div>}
          </div>

          {/* portal b: the samples */}
          <div className="flex flex-col rounded-3xl border border-line bg-panel/60 p-3 lg:p-4">
            <div className="flex items-baseline justify-between px-2">
              <span className="label !text-gold">or try a sample</span>
              <span className="text-[11px] text-dim">synthetic students</span>
            </div>
            <div className="mt-2 flex flex-1 flex-col gap-1.5">
              {SAMPLES.map((s) => (
                <button key={s.id} type="button" disabled={!ds} onClick={() => onSample(s.id)} className="group flex flex-1 items-center gap-3 rounded-2xl border border-transparent px-3 py-2 text-left transition hover:border-gold/40 hover:bg-gold/[0.06] disabled:opacity-40">
                  <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: HINT_TONE[s.hint] ?? "var(--gold)", boxShadow: `0 0 10px ${HINT_TONE[s.hint] ?? "var(--gold)"}` }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] leading-tight text-text">{s.label}</span>
                    <span className="block text-xs text-dim">{s.hint}</span>
                  </span>
                  <span aria-hidden className="text-muted transition group-hover:translate-x-1 group-hover:text-gold">→</span>
                </button>
              ))}
            </div>
            {!ds && <div className="px-2 pt-1.5 text-[11px] text-dim">loading the sample dataset…</div>}
          </div>
        </motion.div>

        {error && (
          <p role="alert" className="text-center text-sm text-hot">
            {error}
          </p>
        )}

        <motion.nav initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8, duration: 0.8 }} aria-label="More ways in" className="flex flex-wrap items-center justify-center gap-x-6 gap-y-1 text-[13px] text-muted">
          {hasJourney && (
            <button type="button" onClick={onResume} className="text-gold underline-offset-4 hover:underline">
              Back to your results
            </button>
          )}
          <Link href="/app/explore" className="underline-offset-4 transition hover:text-text hover:underline">
            No audit? Ask the cohort first
          </Link>
          <Link href="/app/lab" className="underline-offset-4 transition hover:text-text hover:underline">
            Build a scenario in the Model lab
          </Link>
        </motion.nav>
      </div>
    </section>
  );
}
