"use client";

import { motion } from "motion/react";
import { useRef, type ReactNode, type Ref } from "react";
import { GoldOrb, type OrbState } from "@/components/theatre";
import styles from "./explore.module.css";
import { SUGGESTIONS, norm } from "./model";
import { Prompt, type MicUi } from "./Prompt";
import { useBox } from "./useBox";

const GLYPH: Record<(typeof SUGGESTIONS)[number]["kind"], ReactNode> = {
  bars: <path d="M5 20V11M12 20V5M19 20v-7" />,
  shares: <path d="M12 3a9 9 0 1 0 9 9h-9V3Z" />,
  trend: <path d="M3 17l5-6 4 3 8-9" />,
};

export interface AskSceneProps {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onPick: (q: string) => void;
  busy: boolean;
  orb: { state: OrbState; level: number };
  mic?: MicUi;
  /** Live voice agent is connected: it owns the microphone. */
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

/** The start state: a huge prompt, a breathing orb, and the six questions the backend can actually answer. */
export function AskScene(p: AskSceneProps) {
  const root = useRef<HTMLDivElement>(null);
  const box = useBox(root);
  const orb = Math.round(Math.max(88, Math.min(150, (box.h || 700) * 0.17)));
  const done = new Set(p.answered.map(norm));

  return (
    <div ref={root} className="h-full overflow-y-auto overscroll-contain px-5 [scrollbar-width:none] sm:px-8">
      <div className="mx-auto flex min-h-full max-w-4xl flex-col items-center justify-center gap-[clamp(10px,2.2vh,24px)] py-3 text-center">
        <motion.div initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }} className="shrink-0">
          <GoldOrb state={p.orb.state} size={orb} level={p.orb.level} speed={p.orb.state === "breathing" ? 0.7 : 1} aria-label={p.orb.state === "listening" ? "Listening" : "Waiting for your question"} />
        </motion.div>

        <div>
          <div className="label !text-gold">Cohort explorer</div>
          <h1 className={`${styles.askTitle} display mt-2 font-black leading-[0.88]`}>
            Ask the cohort
            <br />
            <span className="text-gold-grad">anything</span>
          </h1>
        </div>

        <p className="serif max-w-xl text-[17px] leading-snug text-muted sm:text-xl">Six fixed comparisons, computed live in Tiger Data. The model only routes your question; it never writes a number.</p>

        <div className="w-full max-w-3xl">
          <Prompt value={p.value} onChange={p.onChange} onSubmit={p.onSubmit} busy={p.busy} inputRef={p.inputRef} mic={p.mic} onEdge={p.onEdge} placeholder={p.orb.state === "listening" ? "Listening…" : "Work hours, course load, internships, first jobs, majors, cost…"} />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5 px-2 text-[11px] text-dim">
            <div className="num min-h-4 text-left" aria-live="polite">
              {p.error ? (
                <span role="alert" className="text-hot">
                  {p.error}
                </span>
              ) : p.apiDown ? (
                <span className="text-ember">The cohort API isn&apos;t reachable, so questions can&apos;t be answered right now.</span>
              ) : p.voiceLive ? (
                "Voice is live: just say it, or type."
              ) : p.mic ? (
                "Type, or tap the mic and say it."
              ) : (
                "Type your question."
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5">
              {p.count > 0 && (
                <span className="num">
                  <kbd className="rounded border border-line-2 px-1.5 py-0.5 text-muted">←</kbd> <kbd className="rounded border border-line-2 px-1.5 py-0.5 text-muted">→</kbd> replay {p.count} {p.count === 1 ? "answer" : "answers"}
                </span>
              )}
              <label className="inline-flex cursor-pointer items-center gap-2">
                <input type="checkbox" checked={p.narrate} onChange={(e) => p.onNarrate(e.target.checked)} className="peer sr-only" />
                <span aria-hidden className="relative h-4 w-7 rounded-full border border-line-2 bg-panel transition peer-checked:border-gold/60 peer-checked:bg-gold/25 peer-focus-visible:ring-2 peer-focus-visible:ring-gold/60 after:absolute after:left-0.5 after:top-0.5 after:h-2.5 after:w-2.5 after:rounded-full after:bg-muted after:transition peer-checked:after:translate-x-3 peer-checked:after:bg-gold" />
                Read answers aloud
              </label>
            </div>
          </div>
        </div>

        <ul className="grid w-full max-w-4xl grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SUGGESTIONS.map((s, i) => {
            const seen = done.has(norm(s.q));
            return (
              <motion.li key={s.q} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + i * 0.06, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>
                <button
                  onClick={() => p.onPick(s.q)}
                  disabled={p.busy}
                  className={`group flex h-full w-full items-start gap-2.5 rounded-2xl border px-3.5 py-2.5 text-left text-[13px] leading-snug transition disabled:opacity-50 ${seen ? "border-gold/40 bg-gold/[0.07] text-cream" : "border-line-2 bg-panel/60 text-muted hover:border-gold/50 hover:bg-panel-2 hover:text-text"}`}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 ${seen ? "text-gold" : "text-dim group-hover:text-gold"}`} aria-hidden>
                    {GLYPH[s.kind]}
                  </svg>
                  <span className="min-w-0 flex-1">{s.q}</span>
                  {seen && <span className="num shrink-0 text-[10px] uppercase tracking-wider text-gold/80">view</span>}
                </button>
              </motion.li>
            );
          })}
        </ul>

      </div>
    </div>
  );
}
