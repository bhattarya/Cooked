"use client";

import { gsap } from "gsap";
import React, { useEffect, useRef } from "react";

interface CrowdCanvasProps {
  src: string;
  rows?: number;
  cols?: number;
  /** Share of the crowd (0..1) drawn tinted with highlightColor. */
  highlight?: number;
  highlightColor?: string;
  className?: string;
}

type Stage = { width: number; height: number };

type Peep = {
  image: CanvasImageSource;
  rect: number[];
  width: number;
  height: number;
  x: number;
  y: number;
  anchorY: number;
  scaleX: number;
  walk: gsap.core.Timeline | null;
  setRect: (rect: number[]) => void;
  render: (ctx: CanvasRenderingContext2D) => void;
};

type WalkProps = { startX: number; startY: number; endX: number };

// Multiplies a colour into the sheet's white fills while keeping the black line work.
function tintSheet(img: HTMLImageElement, color: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = img.naturalWidth;
  c.height = img.naturalHeight;
  const t = c.getContext("2d")!;
  t.drawImage(img, 0, 0);
  t.globalCompositeOperation = "multiply";
  t.fillStyle = color;
  t.fillRect(0, 0, c.width, c.height);
  t.globalCompositeOperation = "destination-in";
  t.drawImage(img, 0, 0);
  return c;
}

const CrowdCanvas = ({ src, rows = 15, cols = 7, highlight = 0, highlightColor = "#ff5a1f", className = "absolute bottom-0 h-[90vh] w-full" }: CrowdCanvasProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let alive = true;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // UTILS
    const randomRange = (min: number, max: number) => min + Math.random() * (max - min);
    const randomIndex = <T,>(array: T[]) => randomRange(0, array.length) | 0;
    const removeFromArray = <T,>(array: T[], i: number) => array.splice(i, 1)[0];
    const removeItemFromArray = <T,>(array: T[], item: T) => removeFromArray(array, array.indexOf(item));
    const removeRandomFromArray = <T,>(array: T[]) => removeFromArray(array, randomIndex(array));
    const getRandomFromArray = <T,>(array: T[]) => array[randomIndex(array) | 0];

    // TWEEN FACTORIES
    const resetPeep = ({ stage, peep }: { stage: Stage; peep: Peep }): WalkProps => {
      const direction = Math.random() > 0.5 ? 1 : -1;
      const offsetY = 100 - 250 * gsap.parseEase("power2.in")(Math.random());
      const startY = stage.height - peep.height + offsetY;
      let startX: number;
      let endX: number;

      if (direction === 1) {
        startX = -peep.width;
        endX = stage.width;
        peep.scaleX = 1;
      } else {
        startX = stage.width + peep.width;
        endX = 0;
        peep.scaleX = -1;
      }

      peep.x = startX;
      peep.y = startY;
      peep.anchorY = startY;

      return { startX, startY, endX };
    };

    const normalWalk = ({ peep, props }: { peep: Peep; props: WalkProps }) => {
      const { startY, endX } = props;
      const xDuration = 10;
      const yDuration = 0.25;

      const tl = gsap.timeline();
      tl.timeScale(randomRange(0.5, 1.5));
      tl.to(peep, { duration: xDuration, x: endX, ease: "none" }, 0);
      tl.to(peep, { duration: yDuration, repeat: xDuration / yDuration, yoyo: true, y: startY - 10 }, 0);

      return tl;
    };

    const walks = [normalWalk];

    // FACTORY FUNCTIONS
    const createPeep = ({ image, rect }: { image: CanvasImageSource; rect: number[] }): Peep => {
      const peep: Peep = {
        image,
        rect: [],
        width: 0,
        height: 0,
        x: 0,
        y: 0,
        anchorY: 0,
        scaleX: 1,
        walk: null,
        setRect: (r: number[]) => {
          peep.rect = r;
          peep.width = r[2];
          peep.height = r[3];
        },
        render: (c: CanvasRenderingContext2D) => {
          c.save();
          c.translate(peep.x, peep.y);
          c.scale(peep.scaleX, 1);
          c.drawImage(peep.image, peep.rect[0], peep.rect[1], peep.rect[2], peep.rect[3], 0, 0, peep.width, peep.height);
          c.restore();
        },
      };

      peep.setRect(rect);
      return peep;
    };

    // MAIN
    const img = document.createElement("img");
    const stage: Stage = { width: 0, height: 0 };

    const allPeeps: Peep[] = [];
    const availablePeeps: Peep[] = [];
    const crowd: Peep[] = [];

    const createPeeps = () => {
      const { naturalWidth: width, naturalHeight: height } = img;
      const total = rows * cols;
      const rectWidth = width / rows;
      const rectHeight = height / cols;
      let tinted: HTMLCanvasElement | null = null;
      if (highlight > 0) {
        try {
          tinted = tintSheet(img, highlightColor);
        } catch {
          tinted = null;
        }
      }

      for (let i = 0; i < total; i++) {
        // deterministic spread so the highlighted share is stable across renders
        const lit = tinted && ((i * 37) % 100) / 100 < highlight;
        allPeeps.push(
          createPeep({
            image: lit ? tinted! : img,
            rect: [(i % rows) * rectWidth, ((i / rows) | 0) * rectHeight, rectWidth, rectHeight],
          }),
        );
      }
    };

    const initCrowd = () => {
      while (availablePeeps.length) {
        addPeepToCrowd().walk!.progress(Math.random());
      }
      if (reduceMotion) crowd.forEach((p) => p.walk?.pause());
    };

    const addPeepToCrowd = () => {
      const peep = removeRandomFromArray(availablePeeps);
      const walk = getRandomFromArray(walks)({
        peep,
        props: resetPeep({ peep, stage }),
      }).eventCallback("onComplete", () => {
        removePeepFromCrowd(peep);
        addPeepToCrowd();
      });

      peep.walk = walk;

      crowd.push(peep);
      crowd.sort((a, b) => a.anchorY - b.anchorY);

      return peep;
    };

    const removePeepFromCrowd = (peep: Peep) => {
      removeItemFromArray(crowd, peep);
      availablePeeps.push(peep);
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.save();
      ctx.scale(devicePixelRatio, devicePixelRatio);
      crowd.forEach((peep) => peep.render(ctx));
      ctx.restore();
    };

    const resize = () => {
      stage.width = canvas.clientWidth;
      stage.height = canvas.clientHeight;
      canvas.width = stage.width * devicePixelRatio;
      canvas.height = stage.height * devicePixelRatio;
      // shrink the crowd on narrow screens so it doesn't swallow the layout
      const s = Math.max(0.45, Math.min(1, stage.width / 1300));
      allPeeps.forEach((p) => {
        p.width = p.rect[2] * s;
        p.height = p.rect[3] * s;
      });

      crowd.forEach((peep) => peep.walk?.kill());

      crowd.length = 0;
      availablePeeps.length = 0;
      availablePeeps.push(...allPeeps);

      initCrowd();
      render();
    };

    let ro: ResizeObserver | null = null;
    const init = () => {
      if (!alive) return;
      createPeeps();
      resize();
      gsap.ticker.add(render);
      ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
    };

    img.onload = init;
    img.src = src;

    return () => {
      alive = false;
      img.onload = null;
      ro?.disconnect();
      gsap.ticker.remove(render);
      crowd.forEach((peep) => peep.walk?.kill());
    };
  }, [src, rows, cols, highlight, highlightColor]);

  return <canvas ref={canvasRef} className={className} />;
};

const Skiper39 = () => {
  return (
    <div className="relative h-full w-full bg-white text-black">
      <div className="top-22 absolute left-1/2 grid -translate-x-1/2 content-start justify-items-center gap-6 text-center text-black">
        <span className="relative max-w-[12ch] text-xs uppercase leading-tight opacity-40 after:absolute after:left-1/2 after:top-full after:h-16 after:w-px after:bg-gradient-to-b after:from-white after:to-black after:content-['']">
          Croud Canvas
        </span>
      </div>
      <div className="absolute bottom-0 h-full w-screen">
        <CrowdCanvas src="https://cdn.21st.dev/assets/localized/abdb8990a7bef8c2f5af3e45f0a3c969c4b0603fba8be92e81347de4ea4e1ed7.png" rows={15} cols={7} />
      </div>
    </div>
  );
};

export { CrowdCanvas, Skiper39 };
export default Skiper39;

/**
 * Skiper 39 Canvas_Landing_004 — React + Canvas
 * Inspired by and adapted from https://codepen.io/zadvorsky/pen/xxwbBQV
 * illustration by https://www.openpeeps.com/
 * We respect the original creators. This is an inspired rebuild with our own taste and does not claim any ownership.
 * These animations aren’t associated with the codepen.io . They’re independent recreations meant to study interaction design
 *
 * License & Usage:
 * - Free to use and modify in both personal and commercial projects.
 * - Attribution to Skiper UI is required when using the free version.
 * - No attribution required with Skiper UI Pro.
 *
 * Feedback and contributions are welcome.
 *
 * Author: @gurvinder-singh02
 * Website: https://gxuri.me
 * Twitter: https://x.com/Gur__vi
 *
 * COOKED changes: typed props, strict-mode-safe cleanup, ResizeObserver, reduced-motion pause,
 * and optional `highlight` tinting for a share of the crowd.
 */
