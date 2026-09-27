"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, type ReactNode } from "react";
import type { SceneDeckState } from "./useSceneDeck";

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
};

/**
 * The stage: exactly one scene on screen at a time, never a page scroll.
 * ← / → (or PageUp/PageDown, 1–9) move between scenes, touch swipes work, and the rail on the left shows where you are.
 * Space is deliberately not bound: the voice dock owns it.
 */
export function SceneDeck({ deck, render, className = "" }: { deck: SceneDeckState; render: (id: string) => ReactNode; className?: string }) {
  const { scenes, index, id, dir, go, next, prev } = deck;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e.target)) return;
      if (e.key === "ArrowRight" || e.key === "PageDown") next();
      else if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
      else if (/^[1-9]$/.test(e.key)) go(Number(e.key) - 1);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, next, prev]);

  // touch/pen swipe only: mouse drags belong to the charts (brushing, panning)
  const start = useRef<{ x: number; y: number } | null>(null);
  const onDown = (e: React.PointerEvent) => {
    start.current = e.pointerType === "mouse" ? null : { x: e.clientX, y: e.clientY };
  };
  const onUp = (e: React.PointerEvent) => {
    const s = start.current;
    start.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.6) (dx < 0 ? next : prev)();
  };

  const current = scenes[index];
  return (
    <div className={`relative flex min-h-0 flex-1 flex-col ${className}`}>
      {/* progress hairline */}
      <div className="absolute inset-x-0 top-0 z-20 h-px bg-line">
        <motion.div className="h-full bg-gold" animate={{ width: `${((index + 1) / Math.max(1, scenes.length)) * 100}%` }} transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }} />
      </div>

      {/* phones and tablets: pill strip */}
      <nav aria-label="Scenes" className="z-20 flex shrink-0 gap-1.5 overflow-x-auto px-4 pt-3 lg:hidden">
        {scenes.map((s, i) => (
          <button
            key={s.id}
            disabled={s.disabled}
            onClick={() => go(i)}
            aria-current={i === index ? "step" : undefined}
            className={`num shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-wider transition disabled:opacity-25 ${i === index ? "border-gold/60 bg-gold/10 text-gold" : "border-line text-dim hover:text-muted"}`}
          >
            {s.label}
          </button>
        ))}
      </nav>

      {/* desktop: vertical rail */}
      <nav aria-label="Scenes" className="absolute left-5 top-1/2 z-20 hidden -translate-y-1/2 flex-col gap-1 lg:flex">
        {scenes.map((s, i) => {
          const on = i === index;
          return (
            <button key={s.id} disabled={s.disabled} onClick={() => go(i)} aria-current={on ? "step" : undefined} aria-label={s.label} className="group flex items-center gap-3 py-1.5 disabled:opacity-25">
              <span className="num w-5 text-[10px] text-dim transition group-hover:text-muted" style={on ? { color: "var(--gold)" } : undefined}>{String(i + 1).padStart(2, "0")}</span>
              <span className={`h-px transition-all duration-500 ${on ? "w-9 bg-gold" : "w-4 bg-line-2 group-hover:w-6 group-hover:bg-muted"}`} />
              <span className={`text-[11px] uppercase tracking-[0.14em] transition-all duration-300 ${on ? "translate-x-0 text-gold opacity-100" : "-translate-x-1 text-muted opacity-0 group-hover:translate-x-0 group-hover:opacity-100"}`}>{s.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="relative min-h-0 flex-1 lg:pl-28" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => (start.current = null)}>
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          {id && (
            <motion.div
              key={id}
              custom={dir}
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * 56, scale: 0.985, filter: "blur(10px)" }),
                center: { opacity: 1, x: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.55, ease: [0.16, 1, 0.3, 1] } },
                exit: (d: number) => ({ opacity: 0, x: d * -40, scale: 0.99, filter: "blur(8px)", transition: { duration: 0.22, ease: [0.4, 0, 1, 1] } }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              className="absolute inset-0"
            >
              {render(id)}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <span className="sr-only" aria-live="polite">{current ? `Scene ${index + 1} of ${scenes.length}: ${current.label}` : ""}</span>
    </div>
  );
}
