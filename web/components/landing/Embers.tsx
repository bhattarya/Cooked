"use client";

import { useEffect, useRef, type RefObject } from "react";

interface Ember {
  x: number;
  y: number;
  vx: number;
  vy: number;
  age: number;
  life: number;
  size: number;
  seed: number;
  /** Outward burst when someone signs in; flies fast and drags to a stop. */
  burst: boolean;
  /** Large, faint and slow: reads as depth of field rather than a spark. */
  soft?: boolean;
}

const MAX = 190;
const RATE = 58; // embers per second at full intensity

// Soft round sprites, drawn once. Blitting these is far cheaper than a gradient per ember.
function sprite(rgb: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, `rgba(${rgb},1)`);
  grad.addColorStop(0.16, `rgba(${rgb},0.85)`);
  grad.addColorStop(0.4, `rgba(${rgb},0.22)`);
  grad.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return c;
}

/**
 * Sparks lifting off the skillet: they are born in the emblem's flames and the rim of the pan,
 * turn from white-hot to gold to ember-red as they cool, and fade out. 2D canvas, additive blend.
 * `anchor` is the emblem's layout box, so the sparks follow it when the window resizes.
 */
export function Embers({ anchor, leaving }: { anchor: RefObject<HTMLElement | null>; leaving: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const leavingRef = useRef(leaving);
  useEffect(() => {
    leavingRef.current = leaving;
  }, [leaving]);

  useEffect(() => {
    const cv = canvas.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const sprites = [sprite("255,238,180"), sprite("246,180,26"), sprite("255,104,22")];
    const ems: Ember[] = [];
    let box = { x: 0, y: 0, w: 1, h: 1 };
    let raf = 0;
    let last = 0;
    let acc = 0;
    let t = 0;
    let onscreen = true;
    let burstDone = false;
    let sinceMeasure = 0;
    let dpr = 1;
    const born = performance.now();

    const measure = () => {
      const r = cv.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (cv.width !== Math.round(r.width * dpr) || cv.height !== Math.round(r.height * dpr)) {
        cv.width = Math.round(r.width * dpr);
        cv.height = Math.round(r.height * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const a = anchor.current?.getBoundingClientRect();
      if (a) box = { x: a.left - r.left, y: a.top - r.top, w: a.width, h: a.height };
    };

    const spawn = () => {
      const roll = Math.random();
      let x: number;
      let y: number;
      if (roll < 0.4) {
        // the two flames licking up either side of the banner
        const left = Math.random() < 0.5;
        x = box.x + box.w * (left ? 0.09 : 0.9) + (Math.random() - 0.5) * box.w * 0.07;
        y = box.y + box.h * (left ? 0.66 : 0.64) + (Math.random() - 0.5) * box.h * 0.06;
      } else if (roll < 0.62) {
        // the fire glowing behind the dog
        const a = Math.random() * Math.PI * 2;
        const r = Math.sqrt(Math.random()) * box.w * 0.17;
        x = box.x + box.w * 0.5 + Math.cos(a) * r;
        y = box.y + box.h * 0.52 + Math.sin(a) * r * 0.9;
      } else {
        // the rim of the pan, so sparks also drift up past the top of the badge
        const a = Math.PI * (1.0 + Math.random() * 1.0);
        x = box.x + box.w * 0.5 + Math.cos(a) * box.w * 0.45;
        y = box.y + box.h * 0.5 + Math.sin(a) * box.w * 0.45;
      }
      const big = Math.random() < 0.22; // a few slow, soft ones for depth
      ems.push({
        x,
        y,
        vx: (Math.random() - 0.35) * box.h * 0.024,
        vy: -box.h * (big ? 0.04 + Math.random() * 0.06 : 0.07 + Math.random() * 0.16),
        age: 0,
        life: big ? 4.5 + Math.random() * 3 : 2.8 + Math.random() * 3.4,
        size: big ? 3 + Math.random() * 3 : 0.9 + Math.random() * 1.6,
        seed: Math.random() * 10,
        burst: false,
        soft: big,
      });
    };

    const burst = () => {
      const cx = box.x + box.w * 0.5;
      const cy = box.y + box.h * 0.5;
      for (let i = 0; i < 130; i++) {
        const a = Math.random() * Math.PI * 2;
        const sp = box.h * (0.5 + Math.random() * 1.7);
        ems.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, age: 0, life: 0.5 + Math.random() * 0.5, size: 1.6 + Math.random() * 3, seed: Math.random() * 10, burst: true });
      }
    };

    const frame = (now: number) => {
      raf = 0;
      if (!onscreen || document.hidden) {
        last = 0;
        return;
      }
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0.016;
      last = now;
      t += dt;
      sinceMeasure += dt;
      if (sinceMeasure > 0.6) {
        sinceMeasure = 0;
        measure();
      }
      if (leavingRef.current && !burstDone) {
        burstDone = true;
        burst();
      }

      // ease the fire in behind the emblem's materialise, and out when leaving
      const intensity = leavingRef.current ? 0 : Math.min(1, Math.max(0, (now - born - 900) / 2200));
      acc += RATE * intensity * dt;
      while (acc >= 1) {
        acc -= 1;
        if (ems.length < MAX) spawn();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.globalCompositeOperation = "lighter";
      for (let i = ems.length - 1; i >= 0; i--) {
        const e = ems[i];
        e.age += dt;
        const k = e.age / e.life;
        if (k >= 1) {
          ems.splice(i, 1);
          continue;
        }
        if (e.burst) {
          const drag = Math.pow(0.035, dt);
          e.vx *= drag;
          e.vy *= drag;
        } else {
          e.vx += Math.sin(t * 1.7 + e.seed) * box.h * 0.02 * dt; // the heat pushes them side to side
          e.vy -= box.h * 0.006 * dt;
        }
        e.x += e.vx * dt;
        e.y += e.vy * dt;
        const fade = Math.min(1, k * 9) * Math.pow(1 - k, e.burst ? 1.1 : 0.85);
        const flick = e.burst ? 1 : 0.72 + 0.28 * Math.sin(t * 11 + e.seed * 5);
        ctx.globalAlpha = Math.max(0, fade * flick) * (e.soft ? 0.3 : 1);
        const s = sprites[k < 0.28 ? 0 : k < 0.66 ? 1 : 2];
        const r = e.size * (e.burst ? 5 : 3.6) * (1 - k * 0.4);
        ctx.drawImage(s, e.x - r, e.y - r, r * 2, r * 2);
        if (!e.soft) ctx.drawImage(sprites[0], e.x - r * 0.4, e.y - r * 0.4, r * 0.8, r * 0.8); // white-hot core
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
      raf = requestAnimationFrame(frame);
    };

    const run = () => {
      if (!raf && onscreen && !document.hidden) raf = requestAnimationFrame(frame);
    };
    measure();
    run();
    const io = new IntersectionObserver(([entry]) => {
      onscreen = entry.isIntersecting;
      run();
    });
    io.observe(cv);
    const ro = new ResizeObserver(measure);
    ro.observe(cv);
    document.addEventListener("visibilitychange", run);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", run);
    };
  }, [anchor]);

  return <canvas ref={canvas} aria-hidden className="pointer-events-none absolute inset-0 z-20 h-full w-full" />;
}
