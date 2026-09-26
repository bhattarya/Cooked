"use client";

import { useEffect, useRef } from "react";

export type OrbMode = "idle" | "listening" | "thinking" | "speaking";

const PALETTE: Record<OrbMode, [string, string]> = {
  idle: ["#7cc4ff", "#2dd4bf"],
  listening: ["#a5f3fc", "#38bdf8"],
  thinking: ["#c4b5fd", "#7c3aed"],
  speaking: ["#ffd166", "#ff5a1f"],
};

type RGB = [number, number, number];
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as RGB;
const mix = (a: RGB, b: RGB, t: number): RGB => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as RGB;
const css = (c: RGB, alpha = 1) => `rgba(${c[0]},${c[1]},${c[2]},${alpha})`;
const HOT = hex("#ff2e4d");

// A living blob: breathes when idle, ripples when listening, orbits when thinking,
// and pulses with the voice's loudness when speaking. Heat (0..1) pushes it toward red.
export function Orb({ mode, level = 0, size = 220, heat = 0, onClick }: { mode: OrbMode; level?: number; size?: number; heat?: number; onClick?: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const state = useRef({ mode, level, heat });
  useEffect(() => {
    state.current = { mode, level, heat };
  }, [mode, level, heat]);

  useEffect(() => {
    const cv = canvas.current;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const S = size * 1.6;
    cv.width = S * dpr;
    cv.height = S * dpr;
    const ctx = cv.getContext("2d")!;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    let raf = 0;
    let lvl = 0;
    let colA = hex(PALETTE.idle[0]);
    let colB = hex(PALETTE.idle[1]);
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const t0 = performance.now();

    const draw = (now: number) => {
      const { mode: m, level: target, heat: h } = state.current;
      const t = reduce ? 0 : (now - t0) / 1000;
      lvl += (target - lvl) * 0.18;
      // ease colours between modes instead of snapping
      colA = mix(colA, hex(PALETTE[m][0]), 0.08);
      colB = mix(colB, hex(PALETTE[m][1]), 0.08);
      const hot = Math.max(0, Math.min(1, h));
      const edge = hot > 0.2 && m !== "thinking" ? mix(colB, HOT, hot * 0.8) : colB;
      const cx = S / 2;
      const cy = S / 2;
      const base = size * 0.36;
      const amp = m === "idle" ? 0.035 : m === "listening" ? 0.05 + lvl * 0.25 : m === "thinking" ? 0.07 : 0.04 + lvl * 0.4;
      ctx.clearRect(0, 0, S, S);

      // halo
      const halo = ctx.createRadialGradient(cx, cy, base * 0.4, cx, cy, base * 2.1);
      halo.addColorStop(0, css(edge, 0.35));
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(cx, cy, base * 2.1, 0, Math.PI * 2);
      ctx.fill();

      // listening ripples
      if (m === "listening") {
        for (let i = 0; i < 3; i++) {
          const p = ((t * 0.7 + i / 3) % 1);
          ctx.strokeStyle = `rgba(165,243,252,${0.5 * (1 - p)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(cx, cy, base * (1.05 + p * 0.8), 0, Math.PI * 2);
          ctx.stroke();
        }
      }

      // blob
      const N = 96;
      ctx.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * Math.PI * 2;
        const wob =
          Math.sin(3 * a + t * 1.3) * 0.5 + Math.sin(5 * a - t * 0.9) * 0.3 + Math.sin(2 * a + t * 0.45) * 0.2;
        const r = base * (1 + amp * wob + (m === "idle" ? Math.sin(t * 1.2) * 0.015 : 0));
        const x = cx + Math.cos(a) * r;
        const y = cy + Math.sin(a) * r;
        if (i) ctx.lineTo(x, y);
        else ctx.moveTo(x, y);
      }
      const fill = ctx.createRadialGradient(cx - base * 0.35, cy - base * 0.4, base * 0.1, cx, cy, base * 1.15);
      fill.addColorStop(0, "#ffffff");
      fill.addColorStop(0.35, css(colA));
      fill.addColorStop(1, css(edge));
      ctx.fillStyle = fill;
      ctx.shadowColor = css(edge);
      ctx.shadowBlur = 40 + lvl * 60;
      ctx.fill();
      ctx.shadowBlur = 0;

      // thinking: orbiting particles
      if (m === "thinking") {
        for (let ring = 0; ring < 3; ring++) {
          for (let j = 0; j < 5; j++) {
            const a = t * (1.2 + ring * 0.5) * (ring % 2 ? -1 : 1) + (j / 5) * Math.PI * 2;
            const rr = base * (1.25 + ring * 0.18);
            ctx.fillStyle = `rgba(196,181,253,${0.85 - ring * 0.2})`;
            ctx.beginPath();
            ctx.arc(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * 0.92, 2.2 - ring * 0.4, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size]);

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={mode === "listening" ? "Stop listening" : "Talk to COOKED"}
      className="relative block rounded-full outline-none focus-visible:ring-2 focus-visible:ring-heat/60"
      style={{ width: size * 1.6, height: size * 1.6, margin: -size * 0.3 }}
    >
      <canvas ref={canvas} style={{ width: size * 1.6, height: size * 1.6 }} />
    </button>
  );
}
