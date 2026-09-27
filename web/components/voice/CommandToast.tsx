"use client";

import { AnimatePresence, motion } from "motion/react";
import { ThinkingOrb } from "thinking-orbs";
import { useEffect, useState } from "react";
import { subscribeCommandEvents, type CommandEvent, type CommandSource } from "@/lib/commands";

const PREFIX: Partial<Record<CommandSource, string>> = { voice: "Voice", typed: "Typed", dev: "Dev" };

/** "Voice → set work hours = 30": the app showing what the microphone just made it do. */
export function CommandToast() {
  const [event, setEvent] = useState<CommandEvent | null>(null);

  useEffect(() => {
    let hide: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeCommandEvents((e) => {
      if (!PREFIX[e.source]) return;
      clearTimeout(hide);
      setEvent(e);
      if (e.status !== "running") hide = setTimeout(() => setEvent(null), e.status === "ok" ? 4200 : 6500);
    });
    return () => {
      off();
      clearTimeout(hide);
    };
  }, []);

  const running = event?.status === "running";
  const failed = event && (event.status === "error" || event.status === "unavailable");

  return (
    <div className="pointer-events-none flex min-h-9 w-full justify-center" aria-live="polite" role="status">
      <AnimatePresence mode="wait">
        {event && (
          <motion.div
            key={event.id}
            initial={{ opacity: 0, y: 10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 420, damping: 32 }}
            className="glass flex max-w-full items-center gap-2.5 rounded-full py-1.5 pl-2.5 pr-4 text-[13px] shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
            style={{ borderColor: failed ? "rgba(255,74,61,0.45)" : "rgba(246,180,26,0.35)", background: "linear-gradient(180deg, rgba(27,22,13,0.94), rgba(13,10,6,0.96))" }}
          >
            <span className="grid size-5 shrink-0 place-items-center">
              {running ? (
                <ThinkingOrb state="working" size={20} theme="dark" color="#f6b41a" aria-label="Running" />
              ) : failed ? (
                <span aria-hidden className="text-hot">!</span>
              ) : (
                <svg aria-hidden viewBox="0 0 20 20" className="size-4 text-gold" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m4.5 10.5 3.6 3.6 7.4-8" /></svg>
              )}
            </span>
            <span className="label !text-gold">{PREFIX[event.source]}</span>
            <span aria-hidden className="text-dim">→</span>
            <span className="min-w-0 truncate text-text">{event.label}</span>
            {failed && event.result && <span className="hidden min-w-0 truncate text-muted sm:inline">· {event.result.message}</span>}
            {event.result?.applied?.clamped && <span className="num shrink-0 text-[11px] text-gold-hi">clamped</span>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
