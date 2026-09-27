"use client";

import { motion, useReducedMotion, useSpring, useTransform } from "motion/react";
import { useEffect, useId, type CSSProperties } from "react";
import s from "./lab.module.css";

export interface LabSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  format?: (v: number) => string;
  onChange: (v: number) => void;
  /** Inputs the models never saw beyond this value: drawn as a hatched zone and named in a note. */
  edge?: number;
  /** The models ignore this input in the current scenario (e.g. history at zero completed terms). */
  dim?: boolean;
  note?: string;
  /** Tooltip with the long name and what the input feeds. */
  hint?: string;
  className?: string;
}

const T = "var(--thumb)";
const at = (f: number) => `calc(${T} / 2 + (100% - ${T}) * ${f})`;

/**
 * A native range input (keyboard, touch and screen readers for free) wearing a physical skin: the fill,
 * the notches and the thumb are springs chasing the value, so a voice command or a drag both feel like a real dial.
 */
export function LabSlider({ label, value, min, max, step = 1, format = String, onChange, edge, dim = false, note, hint, className }: LabSliderProps) {
  const id = useId();
  const reduced = useReducedMotion();
  const span = max - min || 1;
  const f = (value - min) / span;
  const spring = useSpring(f, { stiffness: 520, damping: 38, mass: 0.7 });
  useEffect(() => {
    if (reduced) spring.jump(f);
    else spring.set(f);
  }, [f, reduced, spring]);

  const left = useTransform(spring, (p) => at(p));
  const width = useTransform(spring, (p) => `calc(4px + (100% - ${T}) * ${p})`);
  const held = edge !== undefined && value > edge;
  const fe = edge === undefined ? 0 : (edge - min) / span;
  const steps = Math.round(span / step);
  const ticks = steps <= 24 ? Array.from({ length: steps + 1 }, (_, i) => i) : [];

  return (
    <div title={hint} className={`${s.slider} ${className ?? ""}`} data-dim={dim ? "1" : "0"} data-held={held ? "1" : "0"} style={{ ["--p" as string]: f } as CSSProperties} onPointerDown={(e) => e.stopPropagation()}>
      <div className={s.head}>
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id} className={s.value}>
          {format(value)}
        </output>
      </div>
      <div className={s.track}>
        <input
          id={id}
          className={s.input}
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-valuetext={format(value)}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        <div className={s.rail} />
        {ticks.map((i) => (
          <span key={i} className={s.tick} data-on={i <= (value - min) / step ? "1" : "0"} style={{ left: at(i / steps) }} />
        ))}
        {edge !== undefined && (
          <>
            <div className={s.beyond} style={{ left: at(fe), right: "calc(var(--thumb) / 2 - 4px)" }} />
            <div className={s.edge} style={{ left: at(fe) }} />
            <span className={s.edgeTag} style={{ left: at(fe) }}>
              training edge
            </span>
          </>
        )}
        <motion.div className={s.fill} style={{ width }} />
        <motion.div className={s.thumb} style={{ left }} />
      </div>
      {note && (
        <p className={s.note} data-tone={held ? "held" : "quiet"}>
          {note}
        </p>
      )}
    </div>
  );
}
