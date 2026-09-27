"use client";

// DEV-ONLY (served at /dev/watchtower, 404 in production). Every student and number below is FAKE, generated from a
// seeded PRNG, to exercise the signed-in view (per-student rows) that a guest session can't reach against the live API.
import { useMemo, useState } from "react";
import { AppChrome } from "@/components/scenes";
import { Watchtower } from "./Watchtower";
import type { PatternStat, Snapshot, Student } from "./model";

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

const SPEC: { name: string; n: number; mean: number; spread: number }[] = [
  { name: "smooth", n: 520, mean: 0.05, spread: 0.06 },
  { name: "rough patch", n: 90, mean: 0.16, spread: 0.12 },
  { name: "withdrawal spiral", n: 40, mean: 0.4, spread: 0.2 },
  { name: "part-time grind", n: 80, mean: 0.74, spread: 0.16 },
];
const MAJORS = ["Computer Science", "Information Systems"];
const CLS = ["Freshman", "Sophomore", "Junior", "Senior"];

function fake(withRows: boolean, source: "model" | "local"): Snapshot {
  const r = rng(7);
  const students: Student[] = [];
  let id = 100000;
  for (const p of SPEC) {
    for (let i = 0; i < p.n; i++) {
      const risk = Math.min(0.99, Math.max(0.005, p.mean + (r() + r() + r() - 1.5) * p.spread * 1.6));
      students.push({ id: `CID-${id++}`, major: MAJORS[Math.floor(r() * 2)], cls: CLS[Math.floor(r() * 4)], pattern: p.name, risk, avgCredits: 8 + r() * 8, work: Math.round(r() * 32), lead: Math.floor(r() * 6) });
    }
  }
  const line = source === "model" ? 0.35 : 0.2;
  const patterns: PatternStat[] = SPEC.map((p) => {
    const g = students.filter((s) => s.pattern === p.name);
    const over = g.filter((s) => s.risk >= line);
    return { name: p.name, scored: g.length, atRisk: over.length, avgRisk: g.reduce((a, s) => a + s.risk, 0) / g.length, open: source === "model" ? over.length : null, openAvgRisk: source === "model" && over.length ? over.reduce((a, s) => a + s.risk, 0) / over.length : null };
  }).sort((a, b) => b.atRisk - a.atRisk);
  const atRisk = students.filter((s) => s.risk >= line).length;
  return { source, version: source === "model" ? "fake-v0" : undefined, tr: "tr_fake000000", scored: students.length, atRisk, threshold: line, openAlarms: source === "model" ? atRisk : null, latestAlarmDay: source === "model" ? "2026-09-26T00:00:00+00:00" : null, patterns, students: withRows ? students : null };
}

export function WatchtowerPlayground() {
  const [source, setSource] = useState<"model" | "local">("model");
  const [signedIn, setSignedIn] = useState(true);
  const [staff, setStaff] = useState(false);
  const snap = useMemo(() => fake(signedIn, source), [signedIn, source]);
  return (
    <AppChrome
      user={{ name: "Dev", firstName: "Dev", guest: !signedIn }}
      active="advisor"
      heat={0.3}
      right={
        <div className="flex items-center gap-2 text-[11px]">
          <span className="num rounded-full border border-hot/40 px-2 py-0.5 text-[10px] text-hot">FAKE DATA · dev playground</span>
          <button className="text-muted hover:text-text" onClick={() => setSource(source === "model" ? "local" : "model")}>
            source: {source}
          </button>
          <button className="text-muted hover:text-text" onClick={() => setSignedIn(!signedIn)}>
            {signedIn ? "signed in" : "guest"}
          </button>
        </div>
      }
    >
      <Watchtower snap={snap} canSeeRows={signedIn} staff={staff && signedIn} onStaff={setStaff} />
    </AppChrome>
  );
}
