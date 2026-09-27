"use client";

import { useEffect, useRef } from "react";
import { onFrame } from "./clock";

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  a: number;
  tw: number;
}

// Slow gold star-dust: cheap ambient life so the stage never looks frozen, even while idle.
function Dust({ w, h, reduced }: { w: number; h: number; reduced: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv || !w || !h) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(h * dpr);
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const count = Math.round(Math.min(170, Math.max(50, (w * h) / 9000)));
    const motes: Mote[] = Array.from({ length: count }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      vx: 2 + Math.random() * 5,
      vy: -(2 + Math.random() * 7),
      r: 0.4 + Math.random() * 1.2,
      a: 0.16 + Math.random() * 0.5,
      tw: Math.random() * 6.28,
    }));
    const draw = (t: number, dt: number) => {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);
      for (const m of motes) {
        m.x = (m.x + m.vx * dt + w) % w;
        m.y = (m.y + m.vy * dt + h) % h;
        ctx.globalAlpha = m.a * (0.55 + 0.45 * Math.sin(t * 0.9 + m.tw));
        ctx.fillStyle = m.r > 1 ? "#ffd15c" : "#f6b41a";
        ctx.beginPath();
        ctx.arc(m.x, m.y, m.r, 0, 6.2832);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    if (reduced) {
      draw(0, 0);
      return;
    }
    let last = 0;
    return onFrame((now) => {
      const dt = last ? Math.min(0.05, now - last) : 0;
      last = now;
      draw(now, dt);
    });
  }, [w, h, reduced]);
  return <canvas ref={ref} aria-hidden className="absolute inset-0 h-full w-full" />;
}

// `heat` (0..1) warms the halo as the run progresses.
export function Backdrop({ w, h, cx, cy, heat, reduced }: { w: number; h: number; cx: number; cy: number; heat: number; reduced: boolean }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 60% 55% at ${cx}px ${cy}px, rgba(246,180,26,${0.05 + heat * 0.09}), transparent 70%), radial-gradient(ellipse 120% 90% at 50% 50%, transparent 55%, rgba(0,0,0,0.55) 100%)`,
          transition: "background 1.2s ease",
        }}
      />
      <div className="grid-bg absolute inset-0 opacity-70" />
      {/* the chef dog, ghosted; a CSS background so this decoration is never preloaded as if it were content */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-[46%] opacity-[0.03] mix-blend-screen"
        style={{ width: Math.round(Math.min(1100, Math.max(w, 600) * 0.9)), aspectRatio: "900 / 598", backgroundImage: "url(/brand/cooked-mark.webp)", backgroundSize: "contain", backgroundRepeat: "no-repeat" }}
      />
      {w > 0 && <Dust w={w} h={h} reduced={reduced} />}
    </div>
  );
}
