"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { institutionQueue } from "@/lib/engine";
import type { Dataset } from "@/lib/types";
import { CrowdCanvas } from "./ui/skiper39";
import { Counter } from "./ui";

// Open Peeps sprite sheet (15 × 7) used by Skiper UI's crowd canvas.
const PEEPS = "https://cdn.21st.dev/assets/localized/abdb8990a7bef8c2f5af3e45f0a3c969c4b0603fba8be92e81347de4ea4e1ed7.png";

// "Behind every line is a student": the crowd walks by, and the share the Watchtower
// currently flags is drawn in heat orange.
export function CrowdSection({ ds }: { ds: Dataset }) {
  const [stats, setStats] = useState<{ scored: number; flagged: number } | null>(null);

  useEffect(() => {
    // scoring 1,800 students takes ~200 ms; do it after first paint
    const id = setTimeout(() => {
      const q = institutionQueue(ds);
      setStats({ scored: q.length, flagged: q.filter((r) => r.status !== "fine").length });
    }, 400);
    return () => clearTimeout(id);
  }, [ds]);

  const share = stats ? stats.flagged / stats.scored : 0;

  return (
    <section className="relative h-[92vh] min-h-[640px] overflow-hidden border-b border-line bg-[#f4f1ea] text-[#07080b]">
      <div className="relative z-10 mx-auto max-w-[1400px] px-4 pt-20 sm:px-6">
        <motion.div initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.7 }} className="max-w-3xl">
          <div className="text-[11px] uppercase tracking-[0.14em] text-black/45">Behind every line</div>
          <h2 className="display mt-3 text-5xl font-semibold leading-[0.98] sm:text-6xl">
            Every trajectory
            <br />
            is a person.
          </h2>
          <p className="mt-5 max-w-xl text-lg text-black/60">
            Of{" "}
            <span className="num font-medium text-black">{stats ? <Counter value={stats.scored} /> : "…"}</span> current students with two or more terms, the Watchtower flags{" "}
            <span className="num font-medium text-[#e0481a]">{stats ? <Counter value={stats.flagged} /> : "…"}</span> as drifting toward cooked this term. They&apos;re the orange ones.
          </p>
          <Link href="/queue" className="mt-6 inline-flex items-center gap-2 rounded-full bg-[#07080b] px-5 py-2.5 text-sm font-medium text-[#f4f1ea] transition hover:scale-[1.02]">
            See who needs a conversation <span aria-hidden>→</span>
          </Link>
        </motion.div>
      </div>
      <div className="absolute inset-x-0 bottom-0 h-full">
        {stats && <CrowdCanvas src={PEEPS} rows={15} cols={7} highlight={share} highlightColor="#ff7a45" className="absolute bottom-0 h-[70vh] min-h-[460px] w-full" />}
      </div>
      <div className="absolute right-4 top-4 z-10 max-w-[60%] text-right text-[10px] text-black/35">
        Crowd animation: Skiper UI · illustrations: Open Peeps · people are illustrative, counts are from the synthetic dataset
      </div>
    </section>
  );
}
