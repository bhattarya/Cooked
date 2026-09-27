"use client";

import { AnimatePresence, motion } from "motion/react";
import { ThinkingOrb, type OrbState } from "thinking-orbs";
import { useEffect, useState } from "react";
import styles from "./landing.module.css";

// What people can say to COOKED once they are in. These are questions, not claims: every answer
// is computed by the model and the data behind it.
const PROMPTS: { text: string; orb: OrbState }[] = [
  { text: "Am I cooked?", orb: "searching" },
  { text: "What if I work 30 hours a week?", orb: "solving" },
  { text: "Run a stress test on my plan.", orb: "working" },
  { text: "Which course is my bottleneck?", orb: "connecting" },
  { text: "Does an internship change my odds?", orb: "weaving" },
  { text: "Who else looks like me?", orb: "composing" },
];

type Phase = "typing" | "holding" | "deleting";

/**
 * The gold thinking orb beside a prompt that types itself out, waits, and wipes, over and over.
 * It is decoration for a product hint, so it is hidden from assistive tech; the full list is
 * offered once as plain text instead. Reduced motion swaps the typing for a slow cross-fade.
 */
export function AskLine({ reduced }: { reduced: boolean }) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [phase, setPhase] = useState<Phase>("typing");
  const prompt = PROMPTS[i];

  useEffect(() => {
    if (reduced) {
      const id = setInterval(() => setI((v) => (v + 1) % PROMPTS.length), 3600);
      return () => clearInterval(id);
    }
    const len = prompt.text.length;
    let id: ReturnType<typeof setTimeout>;
    if (phase === "typing") {
      if (n < len) id = setTimeout(() => setN(n + 1), 46 + Math.random() * 46);
      else id = setTimeout(() => setPhase("holding"), 0);
    } else if (phase === "holding") {
      id = setTimeout(() => setPhase("deleting"), 2100);
    } else if (n > 0) {
      id = setTimeout(() => setN(n - 1), 16);
    } else {
      id = setTimeout(() => {
        setI((v) => (v + 1) % PROMPTS.length);
        setPhase("typing");
      }, 260);
    }
    return () => clearTimeout(id);
  }, [reduced, phase, n, prompt.text.length]);

  return (
    <div className="flex items-center gap-3.5 sm:gap-4">
      {/* the 64 preset, enlarged with CSS: its dots are tuned for that size, so scale rather than switch presets */}
      <div className="relative flex h-[68px] w-[68px] shrink-0 items-center justify-center sm:h-[84px] sm:w-[84px] [&_canvas]:!size-[68px] sm:[&_canvas]:!size-[84px]" aria-hidden>
        <span className="absolute inset-[-18px] rounded-full bg-[radial-gradient(closest-side,rgba(246,180,26,0.34),transparent)]" />
        <ThinkingOrb state={prompt.orb} size={64} theme="dark" color="#ffcf4a" dots={1.25} dotSize={1.2} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="label !text-[10.5px] !tracking-[0.18em] text-gold-lo" aria-hidden>Try asking</p>
        <div className="mt-1.5 flex min-h-[2.7em] items-start text-[19px] font-medium leading-[1.3] text-cream sm:text-[21px]" aria-hidden>
          {reduced ? (
            <AnimatePresence mode="wait">
              <motion.span key={i} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.4 }}>
                {prompt.text}
              </motion.span>
            </AnimatePresence>
          ) : (
            <span>
              {prompt.text.slice(0, n)}
              <span className={styles.caret} />
            </span>
          )}
        </div>
      </div>
      <p className="sr-only">Once you are in, you can ask COOKED things like: {PROMPTS.map((p) => p.text).join(" ")}</p>
    </div>
  );
}
