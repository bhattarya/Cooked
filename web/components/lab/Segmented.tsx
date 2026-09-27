"use client";

import { motion } from "motion/react";
import { useId } from "react";
import s from "./lab.module.css";

/** Radio-group segmented control with a gold pill that glides between options. */
export function Segmented<T extends string>({ label, value, options, onChange, className }: { label: string; value: T; options: { value: T; label: string; title?: string }[]; onChange: (v: T) => void; className?: string }) {
  const id = useId();
  return (
    <div role="radiogroup" aria-label={label} className={`${s.seg} ${className ?? ""}`} onPointerDown={(e) => e.stopPropagation()}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            title={o.title ?? o.value}
            className={s.segBtn}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              // arrows move between options like a native radio group, without also changing the scene
              const i = options.findIndex((x) => x.value === value);
              const n = e.key === "ArrowRight" || e.key === "ArrowDown" ? i + 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? i - 1 : null;
              if (n === null) return;
              e.preventDefault();
              e.stopPropagation();
              const next = options[(n + options.length) % options.length];
              onChange(next.value);
              (e.currentTarget.parentElement?.querySelectorAll("button")[(n + options.length) % options.length] as HTMLElement | undefined)?.focus();
            }}
          >
            {on && <motion.span layoutId={id} className={s.segPill} transition={{ type: "spring", stiffness: 520, damping: 38 }} />}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
