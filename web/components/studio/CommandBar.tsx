"use client";

import { useEffect, useRef, useState } from "react";
import { SUGGESTIONS } from "@/lib/studioRoute";
import { ThinkingChip } from "../theatre";
import { CHAPTERS, type ChapterId } from "./context";

/** Global Ask: any question, the router picks the chapter, the chapter answers. Esc closes. */
export function CommandBar({ open, onClose, chapter, ask }: { open: boolean; onClose: () => void; chapter: ChapterId; ask: (q: string) => Promise<{ answer: string; chapter: ChapterId }> }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [reply, setReply] = useState<{ q: string; a: string; chapter: ChapterId } | null>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) input.current?.focus();
  }, [open]);

  if (!open) return null;

  const run = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setBusy(true);
    setReply(null);
    try {
      const r = await ask(question);
      setReply({ q: question, a: r.answer, chapter: r.chapter });
      setText("");
    } catch (e) {
      setReply({ q: question, a: e instanceof Error ? e.message : "That did not work.", chapter });
    } finally {
      setBusy(false);
    }
  };

  // Suggestions from the current chapter first, then a taste of the others.
  const chips = [...SUGGESTIONS[chapter].slice(0, 3), ...CHAPTERS.filter((c) => c.id !== chapter).map((c) => SUGGESTIONS[c.id][0])];

  return (
    <div role="dialog" aria-label="Ask anything" className="pointer-events-none fixed inset-x-0 top-16 z-50 flex justify-center px-4 pt-3 sm:pt-4" onKeyDown={(e) => e.key === "Escape" && onClose()}>
      <div className="glass pointer-events-auto w-full max-w-2xl rounded-2xl border border-gold/25 p-3 shadow-2xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void run(text);
          }}
          className="flex items-center gap-2"
        >
          <input
            ref={input}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Ask anything: am I cooked, do internships help, who is over the line"
            aria-label="Ask anything"
            className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm text-text outline-none placeholder:text-dim"
          />
          <button type="submit" disabled={busy || !text.trim()} className="rounded-full bg-gold px-4 py-1.5 text-xs font-semibold text-bg disabled:opacity-40">
            Ask
          </button>
          <button type="button" onClick={onClose} aria-label="Close (Esc)" className="px-2 text-xs text-muted hover:text-text">
            Esc
          </button>
        </form>
        {busy && (
          <div className="mt-2 px-1">
            <ThinkingChip state="searching" label="Finding the right screen" />
          </div>
        )}
        {reply && !busy && (
          <div aria-live="polite" className="mt-2 rounded-xl border border-line-2 bg-bg/60 p-3 text-[13px] leading-relaxed">
            <p className="label mb-1 text-gold">{CHAPTERS.find((c) => c.id === reply.chapter)?.label}</p>
            <p className="text-text">{reply.a}</p>
          </div>
        )}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((c) => (
            <button key={c} type="button" onClick={() => void run(c)} className="rounded-full border border-line-2 px-2.5 py-1 text-[11px] text-muted transition hover:border-gold/40 hover:text-text">
              {c}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
