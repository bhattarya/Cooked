"use client";

import { motion } from "motion/react";
import { useState } from "react";
import { Nav } from "./ui";

// Ideas the team tested against the dataset before building (build plan §3.3 and Appendix A).
// Numbers are from the evidence notebook, reproduced from the raw CSVs.
const MYTHS = [
  {
    myth: "Close your skill gaps and you'll get paid more",
    test: "Share of a first job's required skills covered by the transcript vs salary, with controls",
    verdict: "+$1.6k, p = 0.085",
    detail: "Raw quartiles were slightly negative. Coverage doesn't predict pay.",
  },
  {
    myth: "Some courses set you up for better careers",
    test: "70 courses vs first salary; grade-in-course for 65 courses; FDR-corrected",
    verdict: "0 of 65",
    detail: "60 of 70 'significant' courses were just proxies for major. No grade effect survives. Courses leave no fingerprint beyond major and track.",
  },
  {
    myth: "Join clubs, do hackathons: involvement pays off",
    test: "Clubs, hackathons, tutoring, mentoring, teams, campus jobs vs pay, with controls",
    verdict: "≈ $0",
    detail: "All indistinguishable from zero (p > 0.4). Internships are the exception: about +$5k each.",
  },
  {
    myth: "Some course combinations are killers",
    test: "770 same-term course pairs (n ≥ 150), Fisher tests, FDR",
    verdict: "1 of 770",
    detail: "Overall withdraw/fail rate is 2.2% per enrollment. The one significant pair is protective. A '45% spike' does not exist.",
  },
  {
    myth: "Failing a gatekeeper course derails you",
    test: "Withdraw/fail in 8 gatekeeper courses vs time-to-degree",
    verdict: "+0.27 yrs",
    detail: "10.8% of alumni affected; concentrated in CMSC201 (+0.8y, n = 57). The rest are null.",
  },
  {
    myth: "Stop-outs are why students take longer",
    test: "Skipped regular terms across 3,200 alumni",
    verdict: "~1%",
    detail: "Almost nobody skips a term. The mechanism is light course loads. We said otherwise at first, and retracted it.",
  },
  {
    myth: "We can predict your salary",
    test: "Random forest, trained on grads ≤ 2022, tested on 2023–2026",
    verdict: "R² ≈ 0",
    detail: "Between −0.07 and +0.03 out of time. Salaries drift by cohort and forests can't extrapolate. COOKED shows matched ranges instead.",
  },
];

const HELD = [
  ["Credit load predicts delay", "Heavy workers: 86% cooked at ≤7 credits/term, 10% at 11–13."],
  ["Work hours drive time-to-degree", "+0.08 years per weekly work hour, after controls."],
  ["It's visible early", "AUC 0.83 at enrollment alone (temporal split)."],
  ["Internships are the pay lever", "About +$5k per internship, +$6.4k per co-op."],
];

export function Myths() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-12 sm:px-6">
        <div className="label !text-hot">Myths panel</div>
        <h1 className="display mt-3 max-w-3xl text-5xl font-semibold leading-tight">Popular advice we tested. The data said no.</h1>
        <p className="mt-4 max-w-2xl text-muted">
          Before building, we tested the obvious ideas against the dataset. Hover a card to see the test and the number. Synthetic data, associations only.
        </p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {MYTHS.map((m, i) => (
            <MythCard key={m.myth} m={m} i={i} />
          ))}
        </div>
        <div className="mt-16">
          <div className="label !text-cool">What held up</div>
          <div className="mt-4 grid gap-4 md:grid-cols-4">
            {HELD.map(([t, d], i) => (
              <motion.div key={t} initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: i * 0.08 }} className="panel border-cool/20 p-5">
                <div className="font-medium text-cool">{t}</div>
                <p className="mt-2 text-sm text-muted">{d}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

function MythCard({ m, i }: { m: (typeof MYTHS)[number]; i: number }) {
  const [flip, setFlip] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: i * 0.06 }}
      className="h-60 [perspective:1200px]"
      onMouseEnter={() => setFlip(true)}
      onMouseLeave={() => setFlip(false)}
      onClick={() => setFlip((f) => !f)}
    >
      <motion.div animate={{ rotateY: flip ? 180 : 0 }} transition={{ type: "spring", stiffness: 160, damping: 20 }} className="relative h-full w-full [transform-style:preserve-3d]">
        <div className="panel absolute inset-0 flex flex-col justify-between p-6 [backface-visibility:hidden]">
          <div className="num text-xs text-dim">myth {String(i + 1).padStart(2, "0")}</div>
          <div className="display text-2xl font-medium leading-snug">&ldquo;{m.myth}&rdquo;</div>
          <div className="flex items-center justify-between text-xs text-muted">
            <span>tested on the dataset</span>
            <span className="rounded-full bg-hot/10 px-2.5 py-1 text-hot">busted</span>
          </div>
        </div>
        <div className="panel absolute inset-0 flex flex-col justify-between border-hot/30 bg-panel-2 p-6 [backface-visibility:hidden] [transform:rotateY(180deg)]">
          <div className="text-xs text-muted">{m.test}</div>
          <div className="num text-4xl font-semibold text-hot">{m.verdict}</div>
          <div className="text-sm leading-snug text-text/80">{m.detail}</div>
        </div>
      </motion.div>
    </motion.div>
  );
}
