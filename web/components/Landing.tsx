"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useInView } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { auditLines, auditPdf, readAudit } from "@/lib/audit";
import { useDataset } from "@/lib/data";
import { avgLoad, findTwins, outcomesOf, stateFrom, statusOf, type Status } from "@/lib/engine";
import type { Dataset, Student } from "@/lib/types";
import { CrowdSection } from "./CrowdSection";
import { TrajectoryField } from "./TrajectoryField";
import { Counter, Nav, PatternChip, StatusBadge, riskColor } from "./ui";

interface Pick {
  kind: string;
  blurb: string;
  s: Student;
  risk: number;
  n: number;
  status: Status;
}

function pickDemos(ds: Dataset): Pick[] {
  const want: [keyof Dataset["meta"]["demo"], Status[], string][] = [
    ["grind", ["cooked"], "Works 20+ hours, carries a light load. Looks fine on paper."],
    ["spiral", ["watch", "cooked"], "Early withdrawals. The kind of start that can go either way."],
    ["smooth", ["fine"], "Full loads, light job. What on-track looks like."],
  ];
  const out: Pick[] = [];
  for (const [kind, statuses, blurb] of want) {
    for (const id of ds.meta.demo[kind]) {
      const s = ds.current.find((x) => x.id === id);
      if (!s) continue;
      const tw = findTwins(ds, stateFrom(s)).data;
      if (tw.refused) continue;
      const o = outcomesOf(tw.twins);
      const status = statusOf(o.risk);
      if (!statuses.includes(status)) continue;
      out.push({ kind, blurb, s, risk: o.risk, n: tw.n, status });
      break;
    }
  }
  return out;
}

export function Landing() {
  const ds = useDataset();
  const demos = useMemo(() => (ds ? pickDemos(ds) : []), [ds]);
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      <Nav />
      {/* hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="grid-bg absolute inset-0 opacity-60" />
          {ds && (
            <div className="absolute inset-x-0 bottom-0 top-10 opacity-90">
              <TrajectoryField alumni={ds.alumni} height={620} showAxes={false} interactive={false} />
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-b from-bg/30 via-bg/40 to-bg" />
          <div className="absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_30%,rgba(255,90,31,0.14),transparent_70%)]" />
        </div>
        <div className="relative mx-auto max-w-[1400px] px-4 pb-16 pt-20 sm:px-6 sm:pt-28">
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.7 }} className="max-w-4xl">
            <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-line-2 bg-bg/60 px-3 py-1 text-xs text-muted backdrop-blur">
              <span className="relative flex h-1.5 w-1.5">
                <span className="pulse-ring absolute h-full w-full rounded-full bg-heat" />
                <span className="relative h-1.5 w-1.5 rounded-full bg-heat" />
              </span>
              Watchtower is monitoring {ds ? <Counter value={ds.meta.counts.current} /> : "1,800"} students
            </div>
            <h1 className="display text-5xl font-semibold leading-[0.95] sm:text-7xl lg:text-[88px]">
              Know you&apos;re <span className="bg-gradient-to-r from-heat via-hot to-amber bg-clip-text text-transparent">cooked</span>
              <br />
              before it&apos;s too late.
            </h1>
            <p className="mt-6 max-w-2xl text-lg text-muted">
              COOKED learned how degrees actually go sideways from 3,200 alumni, term by term. It watches your trajectory, speaks up early, stress-tests your plan, and finds the smallest fix that worked for students like you.
            </p>
          </motion.div>

          <div className="mt-12 grid gap-4 lg:grid-cols-[1fr_1fr_1fr_1.1fr]">
            {demos.length
              ? demos.map((d, i) => <DemoCard key={d.s.id} d={d} i={i} />)
              : [0, 1, 2].map((i) => <div key={i} className="panel h-[228px] animate-pulse bg-panel/60" />)}
            <AuditDrop ds={ds} sample={demos[0]?.s} />
          </div>
        </div>
      </section>

      {ds && <Evidence ds={ds} />}
      {ds && <CrowdSection ds={ds} />}
      <HowItWorks />
      <footer className="border-t border-line py-10 text-center text-xs text-dim">
        Built on the synthetic HackUMBC 2026 Career Pathways dataset. Nothing here is true of real UMBC students. Browser voice is used when ElevenLabs is not connected.
      </footer>
    </div>
  );
}

function DemoCard({ d, i }: { d: Pick; i: number }) {
  const c = riskColor(d.risk);
  const max = 18;
  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 + i * 0.1 }}>
      <Link href={`/s/${d.s.id}`} className="panel group relative block h-full overflow-hidden p-5 transition hover:border-line-2">
        <div className="absolute -right-16 -top-16 h-40 w-40 rounded-full opacity-0 blur-3xl transition duration-500 group-hover:opacity-40" style={{ background: c }} />
        <div className="relative flex items-center justify-between">
          <span className="num text-xs text-muted">{d.s.id}</span>
          <StatusBadge status={d.status} />
        </div>
        <div className="relative mt-3 text-[15px] font-medium">
          {d.s.major} <span className="text-muted">· {d.s.track}</span>
        </div>
        <p className="relative mt-1.5 text-[13px] leading-snug text-muted">{d.blurb}</p>
        <div className="relative mt-4 flex items-end justify-between">
          <div className="flex h-10 items-end gap-1">
            {d.s.terms.map((t, j) => (
              <motion.span
                key={j}
                className="w-3 rounded-sm"
                initial={{ height: 0 }}
                animate={{ height: `${(t[0] / max) * 40}px` }}
                transition={{ delay: 0.6 + j * 0.08 }}
                style={{ background: t[0] < 12 ? "var(--heat)" : "rgba(255,255,255,0.25)" }}
              />
            ))}
          </div>
          <div className="text-right">
            <div className="num text-2xl font-semibold" style={{ color: c }}>
              {Math.round(d.risk * 100)}%
            </div>
            <div className="num text-[10px] text-dim">
              {d.s.work} h/wk · {avgLoad(d.s.terms).toFixed(1)} cr · n={d.n}
            </div>
          </div>
        </div>
        <div className="relative mt-4 flex items-center justify-between border-t border-line pt-3 text-xs">
          <PatternChip pattern={d.s.pattern} />
          <span className="text-muted transition group-hover:translate-x-0.5 group-hover:text-text">Open →</span>
        </div>
      </Link>
    </motion.div>
  );
}

function AuditDrop({ ds, sample }: { ds: Dataset | null; sample?: Student }) {
  const router = useRouter();
  const [over, setOver] = useState(false);
  const [scan, setScan] = useState<{ name: string; msg: string; err?: boolean } | null>(null);
  const [id, setId] = useState("");
  const input = useRef<HTMLInputElement>(null);

  const handle = async (f: File) => {
    setScan({ name: f.name, msg: "Reading audit…" });
    const [res] = await Promise.all([readAudit(f), new Promise((r) => setTimeout(r, 1600))]);
    if (!res.id || !ds?.current.find((s) => s.id === res.id)) {
      setScan({ name: f.name, msg: res.via === "local" ? "Couldn't find a campus ID offline. Full parsing needs the Gemini backend." : "No matching student found.", err: true });
      return;
    }
    setScan({ name: f.name, msg: `Found ${res.id} · matching against 3,200 alumni…` });
    setTimeout(() => router.push(`/s/${res.id}`), 900);
  };

  const download = () => {
    if (!ds || !sample) return;
    const blob = auditPdf(auditLines(sample, ds.catalog));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `sample-audit-${sample.id}.pdf`;
    a.click();
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }} className="flex flex-col gap-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          const f = e.dataTransfer.files[0];
          if (f) handle(f);
        }}
        onClick={() => input.current?.click()}
        className={`relative flex flex-1 cursor-pointer flex-col items-center justify-center overflow-hidden rounded-2xl border border-dashed p-5 text-center transition ${
          over ? "border-heat bg-heat/[0.07]" : "border-line-2 bg-panel/60 hover:border-heat/50"
        }`}
      >
        <input ref={input} type="file" accept=".pdf,.txt" hidden onChange={(e) => e.target.files?.[0] && handle(e.target.files[0])} />
        <AnimatePresence mode="wait">
          {scan ? (
            <motion.div key="scan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="w-full">
              <div className="relative mx-auto h-24 w-20 overflow-hidden rounded-md border border-line-2 bg-bg">
                {Array.from({ length: 9 }, (_, i) => (
                  <div key={i} className="mx-2 mt-2 h-1 rounded bg-white/10" style={{ width: `${50 + ((i * 37) % 40)}%` }} />
                ))}
                {!scan.err && <div className="scanline absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-heat/40 to-transparent" />}
              </div>
              <div className="num mt-3 truncate text-xs text-muted">{scan.name}</div>
              <div className={`mt-1 text-sm ${scan.err ? "text-hot" : "text-text"}`}>{scan.msg}</div>
              {scan.err && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setScan(null);
                  }}
                  className="mt-2 text-xs text-muted underline"
                >
                  Try again
                </button>
              )}
            </motion.div>
          ) : (
            <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div animate={{ y: over ? -4 : 0 }} className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-heat/10 text-heat">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M12 16V4m0 0-4 4m4-4 4 4M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
                </svg>
              </motion.div>
              <div className="mt-3 text-[15px] font-medium">Drop your degree audit</div>
              <div className="mt-1 text-xs text-muted">PDF · read by the agent, matched to alumni</div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <div className="flex gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (id.trim()) router.push(`/s/${id.trim().toUpperCase()}`);
          }}
          className="flex flex-1 items-center gap-2 rounded-xl border border-line bg-panel/60 px-3 py-2"
        >
          <input value={id} onChange={(e) => setId(e.target.value)} placeholder="CID-137153" className="num w-full bg-transparent text-xs outline-none placeholder:text-dim" />
          <button className="text-xs text-heat">Go</button>
        </form>
        <button onClick={download} disabled={!sample} className="rounded-xl border border-line px-3 text-[11px] text-muted transition hover:text-text disabled:opacity-40" title="A synthetic audit to try the upload with">
          Sample audit ↓
        </button>
      </div>
    </motion.div>
  );
}

function Evidence({ ds }: { ds: Dataset }) {
  const heavy = ds.meta.cliff.heavy;
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-100px" });
  const stats = [
    { v: ds.meta.counts.alumni, l: "alumni histories learned from" },
    { v: ds.meta.counts.transcripts, l: "transcript rows" },
    { v: ds.meta.counts.current, l: "current students watched" },
    { v: ds.meta.baseRate * 100, l: "% of alumni got cooked", d: 1 },
  ];
  return (
    <section ref={ref} className="relative border-y border-line bg-panel/40">
      <div className="mx-auto grid max-w-[1400px] grid-cols-2 gap-px px-4 sm:px-6 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.l} className="py-8">
            <div className="display text-4xl font-semibold">{inView ? <Counter value={s.v} digits={s.d ?? 0} /> : "0"}</div>
            <div className="mt-1 text-sm text-muted">{s.l}</div>
          </div>
        ))}
      </div>
      <div className="mx-auto grid max-w-[1400px] items-center gap-10 px-4 pb-16 pt-6 sm:px-6 lg:grid-cols-2">
        <div>
          <div className="label !text-heat">The finding COOKED is built on</div>
          <h2 className="display mt-3 text-4xl font-semibold leading-tight sm:text-5xl">It&apos;s a cliff, not a slope.</h2>
          <p className="mt-4 max-w-lg text-muted">
            Among alumni working 20+ hours a week, carrying 7 credits or fewer meant <span className="text-hot">{Math.round((heavy[0].cooked ?? 0) * 100)}%</span> got cooked. At 11–13 credits it was{" "}
            <span className="text-cool">{Math.round((heavy[3].cooked ?? 0) * 100)}%</span>. Delay shows up in credits per term long before it shows up on a transcript, and that is cheap to watch.
          </p>
          <p className="mt-3 text-xs text-dim">Association, not cause. Small n in the 9–11 bin (n={heavy[2].n}).</p>
        </div>
        <div className="flex h-64 items-end gap-3">
          {heavy.map((b, i) => (
            <div key={b.label} className="flex flex-1 flex-col items-center gap-2">
              <span className="num text-sm">{Math.round((b.cooked ?? 0) * 100)}%</span>
              <motion.div
                className="w-full rounded-t-xl"
                initial={{ height: 0 }}
                animate={inView ? { height: `${Math.max(2, (b.cooked ?? 0) * 190)}px` } : {}}
                transition={{ delay: 0.2 + i * 0.12, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
                style={{ background: (b.cooked ?? 0) >= 0.5 ? "linear-gradient(180deg,#ff2e4d,#ff5a1f)" : (b.cooked ?? 0) >= 0.2 ? "#ffb020" : "#2dd4bf" }}
              />
              <span className="num text-xs text-muted">{b.label} cr</span>
              <span className="num text-[10px] text-dim">n={b.n}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    ["Autopsy", "Clusters 3,200 alumni histories into failure trajectories and measures how early each one shows.", "#a78bfa"],
    ["Watchtower", "Re-scores every current student each term and raises an alarm when they drift into a pattern.", "#ffb020"],
    ["Fire drill", "Throws shocks at your plan at the rates they really happen and counts how many it takes to break.", "#ff2e4d"],
    ["Repair", "Finds what matched students who escaped did differently, then checks it against the catalog.", "#2dd4bf"],
    ["Voice + memory", "Speaks first, remembers what you chose, and checks next term whether the alarm was right.", "#7cc4ff"],
  ];
  return (
    <section className="mx-auto max-w-[1400px] px-4 py-20 sm:px-6">
      <div className="label">How it works</div>
      <h2 className="display mt-3 max-w-2xl text-4xl font-semibold">Not a chatbot. A system that watches and speaks first.</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-5">
        {steps.map(([t, d, c], i) => (
          <motion.div
            key={t}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="panel relative overflow-hidden p-5"
          >
            <div className="num text-xs" style={{ color: c }}>
              0{i + 1}
            </div>
            <div className="mt-3 text-lg font-medium">{t}</div>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            <div className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: c, opacity: 0.6 }} />
          </motion.div>
        ))}
      </div>
      <p className="mt-8 text-sm text-muted">
        Every number comes from a tool result; the language model never writes one.{" "}
        <Link href="/myths" className="text-heat hover:underline">
          See the ideas the data killed →
        </Link>
      </p>
    </section>
  );
}
