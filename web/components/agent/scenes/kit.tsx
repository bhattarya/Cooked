"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { Answer } from "@/lib/agentApi";
import { SponsorChip, type SponsorKey, type SponsorLive } from "../Sponsors";

const useIso = typeof window !== "undefined" ? useLayoutEffect : useEffect;

export interface Box {
  w: number;
  h: number;
  /** The scene has its two-column desktop layout (>= 1024px): the stage is a fixed box. Below that it stacks and scrolls. */
  desk: boolean;
}

/** Measure an element. The hero charts size themselves from the box their stage is given. */
export function useBox<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [box, setBox] = useState<Box>({ w: 0, h: 0, desk: false });
  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const read = () => setBox({ w: el.clientWidth, h: el.clientHeight, desk: window.innerWidth >= 1024 });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, box] as const;
}

/** The stage of a scene: a column that hands its measured box to the charts, so nothing ever scrolls on desktop. */
export function Stage({ children, className = "" }: { children: (box: Box) => ReactNode; className?: string }) {
  const [ref, box] = useBox<HTMLDivElement>();
  return (
    <div ref={ref} className={`flex min-h-0 w-full flex-col lg:h-full ${className}`}>
      {box.w > 0 && children(box)}
    </div>
  );
}

/** Staggered entrance for the pieces of a scene: they arrive one after another, not all at once. */
export const rise = (i: number) => ({ initial: { opacity: 0, y: 16 }, animate: { opacity: 1, y: 0 }, transition: { delay: 0.12 + i * 0.075, duration: 0.65, ease: [0.16, 1, 0.3, 1] as const } });

/** Height for a chart: a share of the stage on desktop, a fixed comfortable height on phones. */
export const fit = (box: Box, share: number, min: number, max: number, phone: number) => (box.desk ? Math.round(Math.min(max, Math.max(min, box.h * share))) : phone);

/** The narrated answer with every number it carries marked and traceable to its tool result. */
export function AnswerText({ segments }: { segments: Answer["segments"] }) {
  return (
    <>
      {segments.map((s, i) =>
        "text" in s ? (
          <span key={i}>{s.text}</span>
        ) : (
          <span key={i} title={s.tool_result_id} className="num mx-0.5 rounded-md bg-gold/15 px-1.5 not-italic text-gold ring-1 ring-gold/25">
            {s.value}
          </span>
        ),
      )}
    </>
  );
}

export function Sponsors({ live, keys }: { live: SponsorLive; keys: SponsorKey[] }) {
  return (
    <>
      {keys.map((k) => (
        <SponsorChip key={k} k={k} live={live[k]} compact />
      ))}
    </>
  );
}

/** An honest empty state in the stage: says what is missing and why, in place of a chart. */
export function Honest({ title, children, tone = "gold" }: { title: string; children: ReactNode; tone?: "gold" | "hot" | "cool" }) {
  const color = tone === "hot" ? "var(--hot)" : tone === "cool" ? "var(--cool)" : "var(--gold)";
  return (
    <div className="flex h-full min-h-[240px] flex-col justify-center rounded-3xl border border-dashed p-7 lg:p-10" style={{ borderColor: `color-mix(in srgb, ${color} 40%, transparent)`, background: `color-mix(in srgb, ${color} 5%, transparent)` }}>
      <div className="label" style={{ color }}>{title}</div>
      <div className="mt-3 max-w-md text-[15px] leading-relaxed text-muted">{children}</div>
    </div>
  );
}

/** Pill button used for scene actions. */
export function Action({ children, onClick, primary = false, disabled = false, label }: { children: ReactNode; onClick?: () => void; primary?: boolean; disabled?: boolean; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition-all duration-200 disabled:opacity-40 cursor-pointer ${
        primary
          ? "bg-gold text-black hover:bg-gold-hi shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:scale-[1.02]"
          : "border border-line-2 bg-panel text-muted hover:border-gold/50 hover:text-white hover:bg-gold/10"
      }`}
    >
      {children}
    </button>
  );
}
