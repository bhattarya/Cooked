"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { useDataset } from "@/lib/data";
import { institutionQueue, statusOf, type QueueRow } from "@/lib/engine";
import { api, useApiHealth } from "@/lib/live";
import type { PatternName } from "@/lib/types";
import { Counter, Loading, Nav, PATTERN_COLOR, PatternChip, StatusBadge, riskColor } from "./ui";

const PATTERNS: PatternName[] = ["part-time grind", "withdrawal spiral", "rough patch", "stop-out", "smooth"];

// Advisor view: every current student with 2+ completed terms, ranked by risk.
export function Queue() {
  const ds = useDataset();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [staff, setStaff] = useState(false);
  const [cls, setCls] = useState("All");
  const [pat, setPat] = useState<PatternName | "All">("All");
  const [show, setShow] = useState(40);

  const health = useApiHealth();
  const live = !!health?.live;

  useEffect(() => {
    if (!ds || health === null) return;
    if (!live) {
      const id = setTimeout(() => setRows(institutionQueue(ds)), 50);
      return () => clearTimeout(id);
    }
    // live: every current student scored by the trained model (the Watchtower's view)
    let on = true;
    type Item = { campus_id: string; risk: number; k: number; avg_credits: number; lead_time_terms: number; pattern: string | null };
    api<{ items: Item[] }>("/institution/queue?staff=true&limit=2000")
      .then((c) => {
        if (!on) return;
        const byId = new Map(ds.current.map((x) => [x.id, x]));
        setRows(
          c.data.items
            .filter((i) => byId.has(i.campus_id))
            .map((i) => ({
              student: { ...byId.get(i.campus_id)!, pattern: (i.pattern ?? byId.get(i.campus_id)!.pattern) as PatternName | null },
              risk: i.risk,
              n: 0,
              status: statusOf(i.risk),
              avgCredits: i.avg_credits,
              lead: i.lead_time_terms,
            })),
        );
      })
      .catch(() => on && setRows(institutionQueue(ds)));
    return () => {
      on = false;
    };
  }, [ds, health, live]);

  const filtered = useMemo(
    () => (rows ?? []).filter((r) => (cls === "All" || r.student.cls === cls) && (pat === "All" || r.student.pattern === pat) && r.status !== "fine"),
    [rows, cls, pat],
  );

  if (!ds || !rows)
    return (
      <div className="min-h-screen">
        <Nav />
        <Loading label="Watchtower scoring every current student" />
      </div>
    );

  const counts = { cooked: rows.filter((r) => r.status === "cooked").length, watch: rows.filter((r) => r.status === "watch").length, fine: rows.filter((r) => r.status === "fine").length };
  const byPattern = PATTERNS.map((p) => ({ p, n: rows.filter((r) => r.student.pattern === p && r.status !== "fine").length }));
  const maxP = Math.max(...byPattern.map((x) => x.n), 1);

  return (
    <div className="relative min-h-screen">
      <Nav />
      <main className="mx-auto max-w-[1400px] px-4 pb-24 pt-10 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="label !text-amber">Institution queue · Fall 2026</div>
            <h1 className="display mt-2 text-4xl font-semibold sm:text-5xl">Who needs a conversation this term</h1>
            <p className="mt-3 max-w-2xl text-muted">
              {rows.length.toLocaleString()} current students with 2+ completed terms, {live ? `scored by the trained model (${health?.version})` : "scored against matched alumni"}. It prompts advisors; it never acts on its own.
            </p>
          </div>
          <button onClick={() => setStaff((s) => !s)} className={`rounded-full border px-4 py-2 text-sm transition ${staff ? "border-heat/60 bg-heat/10 text-text" : "border-line text-muted"}`}>
            {staff ? "Staff view · per-student rows" : "Public view · counts only"}
          </button>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.6fr)]">
          {(["cooked", "watch", "fine"] as const).map((k, i) => (
            <motion.div key={k} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} className="panel p-5">
              <StatusBadge status={k} />
              <div className="display mt-3 text-4xl font-semibold" style={{ color: k === "fine" ? "var(--text)" : riskColor(k === "cooked" ? 0.9 : 0.3) }}>
                <Counter value={counts[k]} />
              </div>
              <div className="mt-1 text-xs text-muted">{((counts[k] / rows.length) * 100).toFixed(1)}% of scored students</div>
            </motion.div>
          ))}
          <div className="panel p-5">
            <div className="label">Flagged, by pattern</div>
            <div className="mt-3 space-y-2">
              {byPattern.map((b, i) => (
                <button key={b.p} onClick={() => setPat(pat === b.p ? "All" : b.p)} className="flex w-full items-center gap-3 text-left">
                  <span className={`w-32 shrink-0 text-xs ${pat === b.p ? "text-text" : "text-muted"}`}>{b.p}</span>
                  <div className="h-2 flex-1 rounded-full bg-white/[0.04]">
                    <motion.div className="h-full rounded-full" style={{ background: PATTERN_COLOR[b.p] }} initial={{ width: 0 }} animate={{ width: `${(b.n / maxP) * 100}%` }} transition={{ delay: 0.2 + i * 0.08, duration: 0.8 }} />
                  </div>
                  <span className="num w-8 text-right text-xs">{b.n}</span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <AnimatePresence>
          {staff && (
            <motion.section initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 16 }} className="panel mt-6 overflow-hidden">
              <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
                <span className="label mr-2">Filter</span>
                {["All", "Freshman", "Sophomore", "Junior", "Senior"].map((c) => (
                  <button key={c} onClick={() => setCls(c)} className={`rounded-full px-3 py-1 text-xs ${cls === c ? "bg-white/10 text-text" : "text-muted hover:text-text"}`}>
                    {c}
                  </button>
                ))}
                <span className="num ml-auto text-xs text-dim">{filtered.length} flagged</span>
              </div>
              <div className="num grid grid-cols-[110px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_70px_70px_70px_90px] gap-3 border-b border-line px-5 py-2.5 text-[10.5px] uppercase tracking-wider text-dim">
                <span>Student</span>
                <span>Program</span>
                <span>Pattern</span>
                <span>Risk</span>
                <span className="text-right">cr/term</span>
                <span className="text-right">h/week</span>
                <span className="text-right">lead</span>
                <span />
              </div>
              {filtered.slice(0, show).map((r, i) => (
                <motion.div
                  key={r.student.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i, 20) * 0.025 }}
                  className="grid grid-cols-[110px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.3fr)_70px_70px_70px_90px] items-center gap-3 border-b border-line px-5 py-3 text-sm transition hover:bg-white/[0.02]"
                >
                  <span className="num text-xs text-muted">{r.student.id}</span>
                  <span className="truncate">
                    {r.student.major} <span className="text-muted">· {r.student.cls}</span>
                  </span>
                  <span>
                    <PatternChip pattern={r.student.pattern} />
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="h-1.5 flex-1 rounded-full bg-white/[0.05]">
                      <span className="block h-full rounded-full" style={{ width: `${r.risk * 100}%`, background: riskColor(r.risk) }} />
                    </span>
                    <span className="num w-10 text-right text-xs" style={{ color: riskColor(r.risk) }}>
                      {Math.round(r.risk * 100)}%
                    </span>
                  </span>
                  <span className={`num text-right text-xs ${r.avgCredits < 12 ? "text-heat" : ""}`}>{r.avgCredits.toFixed(1)}</span>
                  <span className={`num text-right text-xs ${r.student.work >= 20 ? "text-heat" : ""}`}>{r.student.work}</span>
                  <span className="num text-right text-xs text-muted">{r.lead}t</span>
                  <Link href={`/s/${r.student.id}`} className="text-right text-xs text-heat hover:underline">
                    Open →
                  </Link>
                </motion.div>
              ))}
              {show < filtered.length && (
                <button onClick={() => setShow((s) => s + 40)} className="w-full py-3 text-xs text-muted hover:text-text">
                  Show more ({filtered.length - show} left)
                </button>
              )}
            </motion.section>
          )}
        </AnimatePresence>
        {!staff && <p className="mt-6 text-center text-xs text-dim">Per-student rows sit behind the staff toggle. The public view shows counts only.</p>}
      </main>
    </div>
  );
}
