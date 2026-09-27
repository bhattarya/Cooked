"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import type { SceneDef } from "@/components/scenes";

/**
 * The conversation as a film strip: one frame per scene, labelled with the question. Clicking a frame (or ←/→)
 * scrubs to it. The scene deck's own rail is hidden here because question-length labels would spill over the scene.
 */
export function Filmstrip({ scenes, index, onGo }: { scenes: SceneDef[]; index: number; onGo: (i: number) => void }) {
  const reduced = useReducedMotion();
  const on = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    on.current?.scrollIntoView({ inline: "center", block: "nearest", behavior: reduced ? "auto" : "smooth" });
  }, [index, reduced]);

  return (
    <nav aria-label="Your questions" className="relative z-20 flex shrink-0 items-center gap-1.5 overflow-x-auto px-4 pb-1 pt-3 [scrollbar-width:none] sm:px-8 lg:px-10">
      {scenes.map((s, i) => {
        const active = i === index;
        return (
          <button
            key={s.id}
            ref={active ? on : undefined}
            onClick={() => onGo(i)}
            aria-current={active ? "step" : undefined}
            title={i === 0 ? "Ask a new question" : s.label}
            className={`group flex shrink-0 items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left transition ${active ? "border-gold/60 bg-gold/10 text-gold" : "border-line text-muted hover:border-line-2 hover:text-text"}`}
          >
            <span className={`num text-[10px] ${active ? "text-gold/80" : "text-dim group-hover:text-muted"}`}>{i === 0 ? "+" : String(i).padStart(2, "0")}</span>
            <span className="max-w-[15rem] truncate text-[12px]">{i === 0 ? "Ask" : s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
