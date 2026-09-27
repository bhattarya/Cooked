import { scaleCounts, type OrbState } from "thinking-orbs";
import { MODE_FRAMES, resolvePreset, type ModeFrame, type ModeOpts, type OrbFrame } from "thinking-orbs/engine";
import { buildLut, lutIndex, rgb, type OrbTone } from "./palette";

// Draws thinking-orbs geometry with our own gold ink, straight into a canvas sized for the
// real on-screen pixels (no CSS upscaling, so a 300px orb stays crisp).

export interface OrbCfg {
  state: OrbState;
  tone: OrbTone;
  speed: number;
  level: number;
}

interface Layer {
  state: OrbState;
  frame: ModeFrame;
  opts: ModeOpts;
  baseSpeed: number;
  phase: number;
}

type Lut = ReturnType<typeof buildLut>;

// The library ships 20 and 64 as tuned designs (32 is interpolated). Beyond 64 we keep the
// 64 design but add dots so density holds; dot radii already scale inside the engine.
function makeLayer(state: OrbState, size: number, phase: number): Layer {
  const preset = size <= 28 ? 20 : size <= 48 ? 32 : 64;
  const resolved = resolvePreset(state, preset);
  // the sash/ring already pack lanes x segments, and the outline's dots grow linearly with size,
  // so those modes get a gentler boost than the sphere modes
  const cap = state === "shaping" ? 1.5 : state === "composing" || state === "breathing" ? 2.2 : 3.4;
  const density = size > 80 ? Math.min(cap, (size / 64) ** 0.72) : 1;
  return {
    state,
    frame: MODE_FRAMES[resolved.mode],
    opts: density > 1 ? scaleCounts(resolved.opts, density) : resolved.opts,
    baseSpeed: resolved.speed,
    phase,
  };
}

function paint(ctx: CanvasRenderingContext2D, frame: OrbFrame, ink: string[], alpha: number) {
  ctx.lineCap = "round";
  for (const l of frame.lines) {
    ctx.globalAlpha = (l.a ?? 1) * alpha;
    ctx.strokeStyle = ink[lutIndex(l.white)];
    ctx.lineWidth = l.w;
    ctx.beginPath();
    ctx.moveTo(l.x1, l.y1);
    ctx.lineTo(l.x2, l.y2);
    ctx.stroke();
  }
  for (const d of frame.dots) {
    ctx.globalAlpha = (d.a ?? 1) * alpha;
    ctx.fillStyle = ink[lutIndex(d.white)];
    ctx.beginPath();
    ctx.arc(d.x, d.y, d.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

const mixLut = (a: Lut, b: Lut, k: number): Lut => a.map((c, i) => c.map((v, j) => Math.round(v + (b[i][j] - v) * k)) as Lut[number]);

export function makePainter(canvas: HTMLCanvasElement, size: number, bloom: boolean) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const px = Math.round(size * dpr);
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext("2d");

  // two small scratch canvases: successive 4x downscales give a cheap, stable blur for the bloom
  const scratch = bloom
    ? [1, 2].map((i) => {
        const s = Math.max(8, Math.round(px / 4 ** i));
        return Object.assign(document.createElement("canvas"), { width: s, height: s });
      })
    : [];

  let cur: Layer | null = null;
  let prev: Layer | null = null;
  let fade = 1;
  let tone: OrbTone | null = null;
  let toneFrom: Lut = buildLut("gold");
  let toneTo: Lut = toneFrom;
  let toneK = 1;
  let ink: string[] = toneFrom.map(rgb);
  let inkStale = false;
  let lvl = 0;

  function syncTone(next: OrbTone, dt: number) {
    if (tone !== next) {
      // blend from whatever is on screen now, so a change mid-blend never jumps
      toneFrom = mixLut(toneFrom, toneTo, toneK);
      toneTo = buildLut(next);
      toneK = tone === null ? 1 : 0;
      tone = next;
      inkStale = true;
    }
    if (toneK < 1 || inkStale) {
      toneK = Math.min(1, toneK + dt / 0.7);
      ink = mixLut(toneFrom, toneTo, toneK).map(rgb);
      inkStale = false;
    }
  }

  function syncState(next: OrbState) {
    if (!cur) {
      cur = makeLayer(next, size, 0.6);
    } else if (cur.state !== next) {
      prev = cur;
      cur = makeLayer(next, size, cur.phase);
      fade = 0;
    }
  }

  function render() {
    if (!ctx || !cur) return;
    const scale = 1 + lvl * 0.09;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    ctx.translate(size / 2, size / 2);
    ctx.scale(scale, scale);
    ctx.translate(-size / 2, -size / 2);
    const crossing = prev !== null && fade < 1;
    if (prev && crossing) paint(ctx, prev.frame(size, prev.phase, prev.opts), ink, 1 - fade);
    paint(ctx, cur.frame(size, cur.phase, cur.opts), ink, crossing ? fade : 1);
    if (scratch.length === 2) {
      const [a, b] = scratch;
      const actx = a.getContext("2d");
      const bctx = b.getContext("2d");
      if (!actx || !bctx) return;
      actx.clearRect(0, 0, a.width, a.height);
      actx.drawImage(canvas, 0, 0, a.width, a.height);
      bctx.clearRect(0, 0, b.width, b.height);
      bctx.drawImage(a, 0, 0, b.width, b.height);
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      // painted behind the dots (destination-over), so dense modes glow instead of whitening
      ctx.globalCompositeOperation = "destination-over";
      ctx.globalAlpha = 0.7 + lvl * 0.3;
      ctx.drawImage(b, 0, 0, px, px);
      ctx.globalAlpha = 0.45;
      ctx.drawImage(a, 0, 0, px, px);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = "source-over";
    }
  }

  return {
    // advance the animation by `dt` seconds and repaint
    step(cfg: OrbCfg, dt: number) {
      syncTone(cfg.tone, dt);
      syncState(cfg.state);
      lvl += (cfg.level - lvl) * Math.min(1, dt * 9);
      if (fade < 1) fade = Math.min(1, fade + dt / 0.55);
      if (fade >= 1) prev = null;
      for (const layer of [cur, prev]) {
        if (layer) layer.phase += dt * layer.baseSpeed * cfg.speed * (1 + lvl * 1.4);
      }
      render();
    },
    // one representative frame, for reduced motion
    still(cfg: OrbCfg) {
      tone = null;
      syncTone(cfg.tone, 0);
      cur = null;
      prev = null;
      lvl = 0;
      syncState(cfg.state);
      render();
    },
  };
}
