"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { extractNumber } from "@/lib/commands";
import { listen, useCanListen } from "@/lib/listen";
import { GoldOrb } from "@/components/theatre";

const CHIPS = [0, 10, 15, 20, 25, 30];

function Veil({ children, label }: { children: ReactNode; label: string }) {
  return (
    <motion.div role="dialog" aria-modal="true" aria-label={label} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.35 }} className="fixed inset-0 z-[60] grid place-items-center overflow-y-auto bg-bg/55 p-4 pb-32 backdrop-blur-sm">
      <motion.div initial={{ opacity: 0, y: 26, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ type: "spring", stiffness: 190, damping: 22, delay: 0.05 }} className="glass w-full max-w-xl rounded-[28px] p-6 shadow-[0_30px_90px_rgba(0,0,0,0.6)] sm:p-8">
        {children}
      </motion.div>
    </motion.div>
  );
}

/** The one thing an audit cannot say. The processing theatre waits behind this panel for the answer. */
export function WorkHoursPanel({ onAnswer, agentConnected }: { onAnswer: (hours: number) => void; agentConnected: boolean }) {
  const canListen = useCanListen();
  const [heard, setHeard] = useState("");
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const stop = useRef<(() => void) | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    first.current?.focus();
    return () => stop.current?.();
  }, []);

  const say = () => {
    if (listening) {
      stop.current?.();
      return;
    }
    setHeard("");
    setNote(null);
    setListening(true);
    const h = listen(
      (t, final) => {
        setHeard(t);
        if (!final) return;
        const n = extractNumber(t);
        if (n !== null) onAnswer(Math.max(0, Math.min(60, Math.round(n))));
        else if (/no|none|don'?t/i.test(t)) onAnswer(0);
        else setNote("I didn't catch a number. Tap a chip or try again.");
      },
      (err) => {
        setListening(false);
        if (err && err !== "no-speech" && err !== "aborted") setNote(err === "unsupported" ? "Voice input needs Chrome, Edge or Safari. Tap a number instead." : `Microphone: ${err}`);
      },
    );
    stop.current = h.stop;
  };

  return (
    <Veil label="How many hours a week do you work?">
      <div className="flex items-center gap-4">
        <span aria-hidden className="shrink-0">
          <GoldOrb state="listening" size={56} />
        </span>
        <div>
          <div className="label !text-gold">one thing an audit can&apos;t tell me</div>
          <h2 className="display mt-1.5 text-[1.7rem] font-extrabold leading-[1] text-cream sm:text-[2.1rem]">About how many hours a week do you work?</h2>
        </div>
      </div>
      <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-6">
        {CHIPS.map((h, i) => (
          <button key={h} ref={i === 0 ? first : undefined} type="button" onClick={() => onAnswer(h)} aria-label={h === 0 ? "I don't work" : `${h} hours a week`} className="group rounded-2xl border border-line-2 bg-panel/70 px-2 py-3 text-center transition hover:border-gold/70 hover:bg-gold/10 focus-visible:border-gold">
            <span className="display block text-[2.1rem] font-black leading-none text-text transition group-hover:text-gold">{h === 0 ? "0" : h}</span>
            <span className="mt-1 block text-[10px] uppercase tracking-[0.14em] text-dim">{h === 0 ? "I don't" : "h / week"}</span>
          </button>
        ))}
      </div>
      <form
        className="mt-3 flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const n = extractNumber(typed);
          if (n !== null) onAnswer(Math.max(0, Math.min(60, Math.round(n))));
        }}
      >
        <input value={typed} onChange={(e) => setTyped(e.target.value)} inputMode="numeric" aria-label="Another number of hours" placeholder="another number (0–60)" className="num min-w-0 flex-1 rounded-full border border-line-2 bg-transparent px-4 py-2 text-sm outline-none placeholder:text-dim focus:border-gold/60" />
        <button type="submit" disabled={extractNumber(typed) === null} className="rounded-full border border-line-2 px-4 py-2 text-sm text-muted transition hover:border-gold/50 hover:text-text disabled:opacity-40">
          Use it
        </button>
        {canListen && !agentConnected && (
          <button type="button" onClick={say} aria-pressed={listening} className={`rounded-full px-4 py-2 text-sm font-medium transition ${listening ? "bg-hot text-bg" : "bg-gold text-bg hover:bg-gold-hi"}`}>
            {listening ? "Listening…" : "Say it"}
          </button>
        )}
      </form>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted">
        {listening ? <span className="text-ice">{heard || "listening…"}</span> : (note ?? (agentConnected ? "Or just tell the voice agent: “I work twenty hours.”" : ""))}
      </p>
    </Veil>
  );
}

/** A failed run stays inside the theatre, with the reason and a way out. */
export function RunErrorPanel({ message, onBack }: { message: string; onBack: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  return (
    <Veil label="Something went wrong">
      <div className="label !text-hot">the run stopped</div>
      <h2 className="display mt-2 text-[2rem] font-extrabold leading-none text-cream">Something went wrong</h2>
      <p role="alert" className="mt-3 text-[15px] leading-relaxed text-muted">
        {message}
      </p>
      <p className="mt-2 text-xs text-dim">Nothing was stored. The samples work without the AI reader.</p>
      <button ref={btn} type="button" onClick={onBack} className="mt-6 rounded-full bg-gold px-5 py-2.5 text-sm font-medium text-bg transition hover:bg-gold-hi">
        Back to the start
      </button>
    </Veil>
  );
}
