"use client";

import { animate, motion, useMotionTemplate, useMotionValue, useTransform, type MotionValue } from "motion/react";
import Image from "next/image";
import { useEffect, useState, type RefObject } from "react";
import cutout from "./emblem-cutout.webp";
import { EXPO } from "./motion";
import { Rings } from "./Rings";
import styles from "./landing.module.css";

// Where the flames sit inside the emblem artwork, as a share of its width and height.
const FLAMES = [
  { left: 1, top: 54, w: 15, h: 21, dur: 2.7, delay: 0 },
  { left: 84, top: 52, w: 15, h: 21, dur: 3.1, delay: -0.9 },
  { left: 19, top: 38, w: 16, h: 24, dur: 2.3, delay: -1.4 },
  { left: 65, top: 30, w: 16, h: 24, dur: 3.4, delay: -0.4 },
];

const ALPHA_MASK = `url(${cutout.src})`;

/**
 * The centrepiece. Layers, back to front: hairline rings, a breathing gold bloom, the emblem
 * (cut out of its original backdrop so the bloom shows around it; floating, tilting toward the
 * pointer), flame flicker and a passing glint over the artwork. It ignites outward from the dog's
 * face on load, and `leaving` turns it into a burn-through toward the app.
 */
export function EmblemStage({
  sx,
  sy,
  leaving,
  reduced,
  boxRef,
  className = "",
}: {
  sx: MotionValue<number>;
  sy: MotionValue<number>;
  leaving: boolean;
  reduced: boolean;
  boxRef: RefObject<HTMLDivElement | null>;
  className?: string;
}) {
  const rotY = useTransform(sx, [-1, 1], [-7, 7]);
  const rotX = useTransform(sy, [-1, 1], [5, -5]);
  const x = useTransform(sx, [-1, 1], [-10, 10]);
  const y = useTransform(sy, [-1, 1], [-7, 7]);
  const bloomX = useTransform(sx, [-1, 1], [16, -16]);
  const bloomY = useTransform(sy, [-1, 1], [12, -12]);

  // A soft-edged circle grows out of the dog's face and uncovers the badge. Dropped once it has
  // finished so the emblem is not left inside a mask layer.
  const reveal = useMotionValue(0);
  const inner = useTransform(reveal, [0, 1], [-30, 100]);
  const outer = useTransform(inner, (v) => v + 30);
  const mask = useMotionTemplate`radial-gradient(circle farthest-corner at 50% 50%, #000 ${inner}%, transparent ${outer}%)`;
  const [intro, setIntro] = useState(true);
  useEffect(() => {
    const run = animate(reveal, 1, { duration: 2.1, delay: 0.35, ease: [0.3, 0.6, 0.2, 1], onComplete: () => setIntro(false) });
    return () => run.stop();
  }, [reveal]);

  const burn = reduced ? { opacity: 0, transition: { duration: 0.4 } } : { scale: 5.2, opacity: [1, 1, 0], filter: "brightness(2.4) blur(3px)", transition: { duration: 0.62, ease: [0.7, 0, 0.3, 1] as const } };

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <Rings sx={sx} sy={sy} />

      <motion.div
        aria-hidden
        className="pointer-events-none absolute -inset-[20%]"
        style={{ x: bloomX, y: bloomY }}
        initial={{ opacity: 0 }}
        animate={{ opacity: leaving ? 0 : 1 }}
        transition={{ duration: leaving ? 0.3 : 2.4, delay: leaving ? 0 : 0.2, ease: EXPO }}
      >
        <div className={`${styles.glow} h-full w-full`} style={{ background: "radial-gradient(closest-side, rgba(246,180,26,0.42), rgba(255,138,26,0.16) 46%, transparent 74%)" }} />
      </motion.div>

      <motion.div
        className="relative h-full w-full"
        initial={{ scale: 0.92 }}
        animate={leaving ? burn : { scale: 1 }}
        transition={{ duration: 2.2, delay: 0.2, ease: EXPO }}
      >
        <motion.div className="h-full w-full" style={{ rotateX: rotX, rotateY: rotY, x, y, transformPerspective: 1200 }}>
          <div className={`${styles.float} relative h-full w-full`}>
            <motion.div className="h-full w-full" style={intro ? { WebkitMaskImage: mask, maskImage: mask } : undefined}>
              <Image src={cutout} alt="COOKED — Student Data Bottle Neck Analyzer" priority sizes="(min-width: 1100px) 640px, 74vw" className="h-full w-full select-none object-contain" draggable={false} />
              {FLAMES.map((f, i) => (
                <span key={i} aria-hidden className={styles.flame} style={{ left: `${f.left}%`, top: `${f.top}%`, width: `${f.w}%`, height: `${f.h}%`, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }} />
              ))}
              <span aria-hidden className={styles.glint} style={{ WebkitMaskImage: ALPHA_MASK, maskImage: ALPHA_MASK, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }} />
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
