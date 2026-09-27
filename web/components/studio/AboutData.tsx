"use client";

import { useEffect, useRef, useState } from "react";

/** The one place the data provenance is stated in the chrome (replaces the old permanent strip). */
export function AboutData() {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        type="button"
        aria-label="About this data"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="flex h-7 w-7 items-center justify-center rounded-full border border-line-2 font-serif text-sm italic text-muted transition hover:border-gold/40 hover:text-text"
      >
        i
      </button>
      {open && (
        <div role="dialog" aria-label="About this data" className="glass absolute right-0 top-9 z-50 w-72 rounded-xl border border-line-2 p-4 text-xs leading-relaxed text-muted shadow-2xl">
          <p className="label mb-1.5 text-gold">About this data</p>
          <p>
            Every alumnus, outcome and salary here is <span className="text-text">synthetic</span>: the CC0 HackUMBC 2026 Career Pathways &amp; Degree ROI dataset. It is not UMBC student records, and money is nominal.
          </p>
          <p className="mt-2">Predictions are exploratory and associational, not promises. Full provenance is in docs/DATASET.md in the repository.</p>
        </div>
      )}
    </div>
  );
}
