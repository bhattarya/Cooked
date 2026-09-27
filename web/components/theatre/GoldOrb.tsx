"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { OrbState } from "thinking-orbs";
import { onFrame } from "./clock";
import { makePainter, type OrbCfg } from "./orbPainter";
import type { OrbTone } from "./palette";
import styles from "./theatre.module.css";

export type { OrbState } from "thinking-orbs";
export type { OrbTone } from "./palette";

const LABELS: Record<OrbState, string> = {
  working: "Working",
  searching: "Searching",
  solving: "Solving",
  listening: "Listening",
  connecting: "Connecting",
  weaving: "Weaving",
  composing: "Composing",
  breathing: "Thinking",
  shaping: "Shaping",
};

export interface GoldOrbProps {
  state: OrbState;
  /** On-screen diameter in px. Crisp at any size: the canvas is drawn at real resolution. */
  size?: number;
  paused?: boolean;
  /** Multiplier on the preset's own speed. */
  speed?: number;
  /** 0..1 loudness, e.g. of the voice: the orb swells, spins faster and glows harder. */
  level?: number;
  /** Ink: gold by default; ember for a warning, hot for an error, cool for a success. */
  tone?: OrbTone;
  /** Soft golden halo behind the dots. Default: on from 40px up. */
  glow?: boolean;
  className?: string;
  "aria-label"?: string;
}

// The thinking-orbs dot-sphere, inked in the logo's gold. Every orb in the product uses this.
export function GoldOrb({ state, size = 64, paused = false, speed = 1, level = 0, tone = "gold", glow, className = "", "aria-label": ariaLabel }: GoldOrbProps) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLSpanElement>(null);
  const cfg = useRef<OrbCfg>({ state, tone, speed, level });
  const gate = useRef({ paused, visible: true });
  const reduced = useReducedMotion();
  const halo = glow ?? size >= 40;

  useEffect(() => {
    cfg.current = { state, tone, speed, level };
    gate.current.paused = paused;
  });

  // animated path: one shared clock, paused when offscreen or when `paused`
  useEffect(() => {
    const el = canvas.current;
    const box = host.current;
    if (!el || !box || reduced) return;
    const painter = makePainter(el, size, size >= 120);
    let last = 0;
    const io = new IntersectionObserver(([e]) => {
      gate.current.visible = e.isIntersecting;
    });
    io.observe(box);
    painter.step(cfg.current, 0);
    const off = onFrame((now) => {
      const dt = last ? Math.min(0.05, now - last) : 0;
      last = now;
      if (gate.current.paused || !gate.current.visible) return;
      painter.step(cfg.current, dt);
    });
    return () => {
      off();
      io.disconnect();
    };
  }, [size, reduced]);

  // reduced motion: a single representative frame, repainted only when the state changes
  useEffect(() => {
    const el = canvas.current;
    if (!el || !reduced) return;
    makePainter(el, size, size >= 120).still({ state, tone, speed, level: 0 });
  }, [size, reduced, state, tone, speed]);

  const strength = halo ? (size >= 120 ? 1 : 0.7) : 0;
  return (
    <span ref={host} role="img" aria-label={ariaLabel ?? `${LABELS[state]}…`} className={`relative inline-block shrink-0 align-middle ${className}`} style={{ width: size, height: size }}>
      {halo && (
        <span
          aria-hidden
          className={reduced ? styles.glowStill : styles.glow}
          style={{ opacity: strength * (0.8 + level * 0.2), background: `radial-gradient(circle, rgba(246,180,26,${0.2 + level * 0.2}) 0%, rgba(246,150,20,0.07) 40%, transparent 66%)` }}
        />
      )}
      <canvas ref={canvas} aria-hidden className="relative block" style={{ width: size, height: size }} />
    </span>
  );
}
