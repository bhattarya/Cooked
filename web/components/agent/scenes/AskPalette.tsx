"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { listen, useCanListen } from "@/lib/listen";
import { ThinkingChip } from "@/components/theatre";

/** The Ask overlay: a command palette for questions about your own plan. Type, tap a suggestion, or hold the mic. */
export function AskPalette({ open, onClose, onSubmit, busy, suggestions, agentConnected }: { open: boolean; onClose: () => void; onSubmit: (text: string) => Promise<string | void>; busy: string | null; suggestions: string[]; agentConnected: boolean }) {
  const canListen = useCanListen();
  const [text, setText] = useState("");
  const [listening, setListening] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const stop = useRef<(() => void) | null>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const t = setTimeout(() => input.current?.focus(), 60);
    return () => {
      clearTimeout(t);
      stop.current?.();
      setListening(false);
      setNote(null);
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open]);

  const submit = async (q: string) => {
    const clean = q.trim();
    if (!clean || busy) return;
    setText("");
    setNote(null);
    const problem = await onSubmit(clean);
    if (problem) {
      setNote(problem);
      setText(clean);
    }
  };

  const mic = () => {
    if (listening) {
      stop.current?.();
      return;
    }
    setNote(null);
    setText("");
    setListening(true);
    const h = listen(
      (t, final) => {
        setText(t);
        if (final) void submit(t);
      },
      (err) => {
        setListening(false);
        if (err && err !== "no-speech" && err !== "aborted") setNote(err === "unsupported" ? "Voice input needs Chrome, Edge or Safari. Type instead." : `Microphone: ${err}`);
      },
    );
    stop.current = h.stop;
  };

  return (
    <AnimatePresence>
      {open && (
        <motion.div role="dialog" aria-modal="true" aria-label="Ask a question about your plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }} className="fixed inset-0 z-[62] flex items-start justify-center bg-bg/60 px-3 pt-[10vh] backdrop-blur-md sm:pt-[14vh]" onMouseDown={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => {
          e.stopPropagation(); // the deck's arrow keys must not fire behind the palette
          if (e.key === "Escape") onClose();
        }}>
          <motion.div initial={{ opacity: 0, y: -18, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.98 }} transition={{ type: "spring", stiffness: 300, damping: 28 }} className="glass w-full max-w-2xl rounded-[28px] p-3 shadow-[0_30px_90px_rgba(0,0,0,0.65)] sm:p-4">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void submit(text);
              }}
              className="flex items-center gap-2"
            >
              <input ref={input} value={text} onChange={(e) => setText(e.target.value)} disabled={!!busy} aria-label="Your question" placeholder={listening ? "listening…" : "Ask: what if I take CMSC 341 instead?"} className="min-w-0 flex-1 bg-transparent px-3 py-3 text-[18px] text-cream outline-none placeholder:text-dim sm:text-[20px]" />
              {canListen && !agentConnected && (
                <button type="button" onClick={mic} aria-pressed={listening} aria-label={listening ? "Stop listening" : "Ask by voice"} className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition ${listening ? "border-hot bg-hot/20 text-hot" : "border-line-2 text-muted hover:border-gold/60 hover:text-gold"}`}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <rect x="9" y="3" width="6" height="11" rx="3" />
                    <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  </svg>
                </button>
              )}
              <button type="submit" disabled={!text.trim() || !!busy} className="h-11 shrink-0 rounded-full bg-gold px-5 text-sm font-medium text-bg transition hover:bg-gold-hi disabled:opacity-30">
                Ask
              </button>
            </form>
            <div className="mt-2 flex min-h-9 items-center px-2">
              {busy ? <ThinkingChip state="connecting" label={busy} /> : <span className="text-xs text-dim">{note ?? (agentConnected ? "The voice agent is listening: just say it. You can also type here." : "Enter to ask · Esc to close · / opens this from any scene")}</span>}
            </div>
            <div className="mt-1 flex flex-wrap gap-1.5 px-1 pb-1">
              {suggestions.map((s) => (
                <button key={s} type="button" onClick={() => void submit(s)} disabled={!!busy} className="rounded-full border border-line px-3 py-1.5 text-[12.5px] text-muted transition hover:border-gold/50 hover:bg-gold/[0.06] hover:text-text disabled:opacity-40">
                  {s}
                </button>
              ))}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
