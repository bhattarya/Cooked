"use client";

import { AnimatePresence, MotionConfig, motion, useMotionValue, useSpring } from "motion/react";
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { finishRedirect, signInWithGoogle } from "@/lib/auth";
import type { SignInMethod } from "@/lib/session";
import { Flame } from "./brand";
import { AskLine } from "./landing/AskLine";
import { Embers } from "./landing/Embers";
import { EmblemStage } from "./landing/EmblemStage";
import { line, rise, stagger, fade } from "./landing/motion";
import { usePrefersReducedMotion } from "./landing/prefs";
import { SignIn } from "./landing/SignIn";
import { SponsorStrip } from "./landing/SponsorStrip";
import { Stats } from "./landing/Stats";
import styles from "./landing/landing.module.css";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet. Continue as a guest.",
  google_denied: "Google sign-in was cancelled.",
  bad_state: "That sign-in link expired. Try again.",
  token_exchange: "Google didn't accept the sign-in. Try again.",
  no_id_token: "Google didn't return an identity. Try again.",
  bad_id_token: "Couldn't verify the Google sign-in. Try again.",
};

// The emblem burns through the screen; the app opens once it has.
const LEAVE_MS = 620;

const HEADLINE = ["Know before", "it's too late."];

// Page gutters, and a cap so the composition hugs the centre on ultra-wide screens.
const FRAME = "mx-auto w-full max-w-[1800px] px-5 sm:px-8 xl:px-12";

export function Landing({ method, signedIn, error }: { method: SignInMethod; signedIn: { firstName: string; guest: boolean } | null; error?: string }) {
  const [leaving, setLeaving] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(error ? (ERRORS[error] ?? null) : null);
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);
  const reduced = usePrefersReducedMotion();
  const emblemBox = useRef<HTMLDivElement>(null);

  // Pointer position (-1..1) drives the emblem's tilt; springs smooth it. With no pointer
  // activity (touch, or a mouse at rest) it drifts on a slow figure-eight so it never sits dead.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 55, damping: 16, mass: 0.7 });
  const sy = useSpring(py, { stiffness: 55, damping: 16, mass: 0.7 });
  useEffect(() => {
    if (reduced) return;
    let lastMove = -1e9;
    let raf = 0;
    const move = (e: PointerEvent) => {
      lastMove = performance.now();
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    const drift = (now: number) => {
      if (now - lastMove > 2400 && !document.hidden) {
        px.set(Math.sin(now / 4200) * 0.42);
        py.set(Math.cos(now / 5300) * 0.3);
      }
      raf = requestAnimationFrame(drift);
    };
    window.addEventListener("pointermove", move, { passive: true });
    raf = requestAnimationFrame(drift);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, [reduced, px, py]);

  const go = (href: string, post = false) => {
    const r = emblemBox.current?.getBoundingClientRect();
    if (r) setOrigin({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    setLeaving(true);
    setTimeout(() => {
      if (post) {
        const f = document.createElement("form");
        f.method = "POST";
        f.action = href;
        document.body.appendChild(f);
        f.submit();
      } else window.location.href = href;
    }, LEAVE_MS);
  };

  // Coming back from a redirect sign-in (used when the popup was blocked).
  useEffect(() => {
    if (method !== "firebase") return;
    finishRedirect().then((r) => {
      if (r?.ok) go("/app");
      else if (r) setProblem(r.error);
    });
  }, [method]);

  const google = async () => {
    if (method === "google") return go("/auth/google");
    setBusy(true);
    setProblem(null);
    const r = await signInWithGoogle();
    if (r.ok) return go("/app");
    setBusy(false);
    setProblem(r.error);
  };

  // The glass card catches a soft light where the pointer is; CSS reads these two variables.
  const spotlight = (e: ReactPointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
    e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
  };

  const at = origin ? `${origin.x}px ${origin.y}px` : "50% 46%";

  return (
    <MotionConfig reducedMotion="user">
      <motion.main variants={stagger(0)} initial="hidden" animate={leaving ? "leave" : "show"} className="relative flex min-h-dvh w-full flex-col overflow-hidden bg-bg text-text xl:h-dvh">
        {/* atmosphere: warm heat rising from below, cool dark at the edges, film grain */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0" style={{ background: "radial-gradient(64% 58% at 50% 46%, rgba(246,180,26,0.11), transparent 72%), radial-gradient(90% 46% at 50% 118%, rgba(255,122,26,0.2), transparent 72%)" }} />
          <div className="grid-bg absolute inset-0 opacity-[0.55]" />
          <div className="absolute inset-0 opacity-[0.07] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='180' height='180'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.85' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")" }} />
          <div className="absolute inset-0" style={{ background: "radial-gradient(120% 90% at 50% 45%, transparent 52%, rgba(0,0,0,0.62) 100%)" }} />
        </div>

        {!reduced && <Embers anchor={emblemBox} leaving={leaving} />}

        <motion.header variants={stagger(0.9)} className={`${FRAME} relative z-30 flex items-center justify-between pt-4 xl:pt-7`}>
          <motion.span variants={fade} className="flex items-center gap-2.5 text-[11px] uppercase tracking-[0.22em] text-muted">
            <Flame size={22} />
            <span className="hidden sm:inline">HackUMBC 2026</span>
          </motion.span>
          <motion.span variants={fade} className="glass inline-flex items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-[10.5px] text-muted sm:px-3.5 sm:text-[11px]">
            <span className={`${styles.live} h-1.5 w-1.5 rounded-full bg-gold`} aria-hidden />
            Synthetic dataset · not real students
          </motion.span>
        </motion.header>

        <div className={`${FRAME} relative z-10 grid flex-1 grid-cols-1 items-center gap-y-5 pb-6 pt-2 xl:min-h-0 xl:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] xl:gap-x-3 xl:py-0 sm:gap-y-7`}>
          <div className="relative z-10 flex justify-center xl:order-2">
            <EmblemStage sx={sx} sy={sy} leaving={leaving} reduced={reduced} boxRef={emblemBox} className="aspect-[1100/1167] w-[min(62vw,31dvh)] min-w-[200px] sm:w-[min(74vw,42dvh)] xl:h-[min(calc(100dvh-236px),860px)] xl:w-auto" />
          </div>

          <motion.div variants={stagger(0.75, 0.1)} className="relative z-30 flex flex-col items-center text-center xl:order-1 xl:items-start xl:justify-self-end xl:text-left">
            <div className="w-full xl:max-w-[470px]">
              <motion.p variants={rise} className="label hidden !tracking-[0.2em] text-gold-lo sm:block">
                Early warning · stress test
              </motion.p>
              <h1 className="display mt-1 text-[clamp(44px,min(12.5vw,9.5dvh),96px)] sm:mt-4 font-black leading-[0.9] xl:text-[clamp(52px,min(6.1vw,10.6dvh),104px)]">
                {HEADLINE.map((t, i) => (
                  <span key={t} className="-mb-[0.06em] block overflow-hidden pb-[0.06em]">
                    <motion.span variants={line} className={`block ${i === 1 ? styles.sheen : "text-cream"}`}>
                      {t}
                    </motion.span>
                  </span>
                ))}
              </h1>
              <motion.p variants={rise} className="serif mt-2 text-[clamp(26px,5.6vw,34px)] sm:mt-4 leading-tight text-gold-hi xl:text-[clamp(28px,2.7vw,40px)]">
                Then get un-cooked.
              </motion.p>
              <motion.p variants={rise} className="mx-auto mt-4 hidden max-w-[36ch] text-[14.5px] leading-relaxed text-muted sm:block xl:mx-0 xl:text-[15.5px]">
                An early-warning and stress test for degree trajectories. Ask it anything, out loud or typed.
              </motion.p>
            </div>
          </motion.div>

          <motion.div variants={stagger(1.15, 0.1)} className="relative z-30 w-full xl:order-3 xl:max-w-[400px] xl:justify-self-start">
            <motion.div variants={rise} onPointerMove={spotlight} className={`${styles.door} mx-auto w-full max-w-[420px] p-4 sm:p-6 xl:mx-0 xl:max-w-none`}>
              <AskLine reduced={reduced} />
              <div className="my-4 h-px bg-gradient-to-r sm:my-5 from-transparent via-line-2 to-transparent" />
              <SignIn method={method} signedIn={signedIn} busy={busy} problem={problem} onGoogle={google} onGuest={() => go("/auth/guest", true)} onContinue={() => go("/app")} />
            </motion.div>
          </motion.div>
        </div>

        <motion.footer variants={stagger(1.5, 0.1)} className={`${FRAME} relative z-30 flex flex-col items-center gap-6 pb-6 xl:flex-row xl:items-end xl:justify-between xl:pb-7`}>
          <motion.div variants={rise} className="flex flex-col items-center text-center xl:items-start xl:text-left">
            <Stats reduced={reduced} />
          </motion.div>
          <motion.div variants={rise}>
            <SponsorStrip />
          </motion.div>
        </motion.footer>

        <AnimatePresence>
          {leaving && (
            <>
              {!reduced && (
                <motion.div
                  key="flash"
                  aria-hidden
                  className="pointer-events-none fixed inset-0 z-40 mix-blend-screen"
                  style={{ background: `radial-gradient(circle at ${at}, rgba(255,232,150,0.95), rgba(246,180,26,0.6) 14%, rgba(255,122,26,0.22) 34%, transparent 60%)` }}
                  initial={{ opacity: 0, scale: 0.5 }}
                  animate={{ opacity: [0, 1, 0.9], scale: [0.5, 1.3, 2.4] }}
                  transition={{ duration: LEAVE_MS / 1000, times: [0, 0.45, 1], ease: "easeOut" }}
                />
              )}
              <motion.div
                key="veil"
                aria-hidden
                className="fixed inset-0 z-50 bg-bg"
                initial={reduced ? { opacity: 0 } : { clipPath: `circle(0px at ${at})` }}
                animate={reduced ? { opacity: 1 } : { clipPath: `circle(160vmax at ${at})` }}
                transition={reduced ? { duration: 0.3 } : { duration: 0.52, delay: 0.14, ease: [0.7, 0, 0.3, 1] }}
              />
            </>
          )}
        </AnimatePresence>
      </motion.main>
    </MotionConfig>
  );
}
