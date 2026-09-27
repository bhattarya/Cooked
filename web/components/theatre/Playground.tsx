"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Step, StepStatus } from "@/components/agent/Pipeline";
import type { SponsorKey } from "@/components/agent/Sponsors";
import { GoldOrb, ModelPulse, ProcessingTheatre, ThinkingChip, type OrbState } from "./index";

// DEV ONLY. Every step, result and number below is FAKE, written to exercise the choreography.

interface Spec {
  key: string;
  agent: string;
  task: string;
  sponsor: SponsorKey;
  live: boolean;
  start: number;
  dur: number;
  result: string;
  tr?: string;
  outcome?: StepStatus;
}

const AUDIT: Spec[] = [
  { key: "read", agent: "Reader", task: "reading your audit", sponsor: "gemini", live: true, start: 200, dur: 1150, result: "FAKE · parsed the audit into course rows, one unmatched code flagged", tr: "tr_fake_read01" },
  { key: "match", agent: "Matcher", task: "finding alumni like you", sponsor: "tiger", live: true, start: 1500, dur: 1000, result: "FAKE · twins found in the synthetic cohort", tr: "tr_fake_match02" },
  { key: "risk", agent: "Watchtower", task: "scoring your trajectory", sponsor: "model", live: true, start: 2650, dur: 950, result: "FAKE · risk score computed by the model", tr: "tr_fake_risk03" },
  { key: "drill", agent: "Fire drill", task: "simulating what could go wrong", sponsor: "tiger", live: false, start: 3750, dur: 1300, result: "FAKE · cached drill used, live simulation unavailable", tr: "tr_fake_drill04", outcome: "warn" },
  { key: "fix", agent: "Repair", task: "finding the smallest fix", sponsor: "model", live: false, start: 5200, dur: 1150, result: "FAKE · smallest fix found by the browser engine", tr: "tr_fake_fix05" },
  { key: "voice", agent: "Narrator", task: "writing it up", sponsor: "elevenlabs", live: true, start: 6500, dur: 1000, result: "FAKE · script written, every number traced to a tool result", tr: "tr_fake_voice06" },
  { key: "memory", agent: "Memory", task: "remembering this session", sponsor: "backboard", live: false, start: 6800, dur: 900, result: "FAKE · saved to the local memory table" },
];

const EXPLORE: Spec[] = [
  { key: "route", agent: "Orchestrator", task: "understanding the question", sponsor: "gemini", live: true, start: 200, dur: 1100, result: "FAKE · gemini chose the cohort comparison" },
  { key: "query", agent: "Evidence", task: "checking the synthetic cohort", sponsor: "tiger", live: true, start: 1400, dur: 1500, result: "FAKE · groups compared from the synthetic dataset", tr: "tr_fake_q01" },
  { key: "chart", agent: "Visualizer", task: "building the comparison", sponsor: "model", live: true, start: 3000, dur: 900, result: "FAKE · outcome by hours worked" },
];

const LAB: Spec[] = ["Logistic", "Forest", "Boosted trees", "Baseline"].map((name, i) => ({
  key: `m${i}`,
  agent: name,
  task: "scoring the held-out alumni",
  sponsor: "model" as const,
  live: true,
  start: 200 + i * 900,
  dur: 1100,
  result: `FAKE · ${name} finished its held-out pass`,
  tr: `tr_fake_lab0${i + 1}`,
  outcome: i === 3 ? ("error" as const) : undefined,
}));

const NINE: Spec[] = Array.from({ length: 9 }, (_, i) => ({
  key: `s${i}`,
  agent: ["Reader", "Matcher", "Watchtower", "Fire drill", "Repair", "Planner", "Narrator", "Memory", "Auditor"][i],
  task: ["reading", "matching", "scoring", "simulating", "repairing", "planning", "narrating", "remembering", "checking"][i] + " (FAKE)",
  sponsor: (["gemini", "tiger", "model", "tiger", "model", "gemini", "elevenlabs", "backboard", "model"] as SponsorKey[])[i],
  live: i % 3 !== 2,
  start: 150 + i * 820,
  dur: 900,
  result: `FAKE · nine-step layout check, step ${i + 1}`,
  tr: i % 2 ? undefined : `tr_fake_n${i + 1}`,
}));

const THREE: Spec[] = AUDIT.slice(0, 3).map((s, i) => ({ ...s, start: 200 + i * 1400 }));
const TWO: Spec[] = AUDIT.slice(0, 2).map((s, i) => ({ ...s, start: 200 + i * 1500 }));

const SCENARIOS = {
  audit: { label: "Audit · 7", title: "Reading your audit", subtitle: "FAKE data: dev playground", specs: AUDIT },
  explore: { label: "Explore · 3", title: "Checking the cohort", subtitle: "FAKE data: dev playground", specs: EXPLORE },
  lab: { label: "Lab · 4", title: "Racing four models", subtitle: "FAKE data: dev playground", specs: LAB },
  nine: { label: "Nine steps", title: "Nine-step stress test", subtitle: "FAKE data: dev playground", specs: NINE },
  three: { label: "Three steps", title: "Three-step run", subtitle: "FAKE data: dev playground", specs: THREE },
  two: { label: "Two steps", title: "Two-step run", subtitle: "FAKE data: dev playground", specs: TWO },
} as const;
type ScenarioKey = keyof typeof SCENARIOS;

const pending = (specs: Spec[]): Step[] => specs.map((s) => ({ key: s.key, agent: s.agent, task: s.task, sponsor: s.sponsor, live: s.live, status: "pending" }));

const STATES: OrbState[] = ["working", "searching", "solving", "listening", "connecting", "weaving", "composing", "breathing", "shaping"];

export interface PlaygroundProps {
  scenario?: string;
  autoplay?: boolean;
  view?: string;
  ui?: boolean;
}

export function Playground({ scenario: initial = "audit", autoplay = false, view: initialView = "theatre", ui = true }: PlaygroundProps) {
  const [scenario, setScenario] = useState<ScenarioKey>(initial in SCENARIOS ? (initial as ScenarioKey) : "audit");
  const [steps, setSteps] = useState<Step[]>(() => pending(SCENARIOS[initial in SCENARIOS ? (initial as ScenarioKey) : "audit"].specs));
  const [exiting, setExiting] = useState(false);
  const [exited, setExited] = useState(false);
  const [voice, setVoice] = useState(0);
  const [view, setView] = useState(initialView === "kit" ? "kit" : "theatre");
  const [collapsed, setCollapsed] = useState(!ui);
  const [busy, setBusy] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  };
  useEffect(() => clear, []);

  const patch = useCallback((key: string, p: Partial<Step>) => setSteps((all) => all.map((s) => (s.key === key ? { ...s, ...p } : s))), []);

  const play = useCallback(
    (which: ScenarioKey) => {
      clear();
      const specs = SCENARIOS[which].specs;
      setScenario(which);
      setExiting(false);
      setExited(false);
      setSteps(pending(specs));
      setBusy(true);
      for (const s of specs) {
        let began = 0;
        timers.current.push(
          setTimeout(() => {
            began = performance.now();
            patch(s.key, { status: "running" });
          }, s.start),
          setTimeout(() => patch(s.key, { status: s.outcome ?? "done", result: s.outcome === "error" ? "FAKE · failed on purpose to show the red state" : s.result, tr: s.tr, ms: Math.round(performance.now() - began) }), s.start + s.dur),
        );
      }
      const end = Math.max(...specs.map((s) => s.start + s.dur));
      timers.current.push(setTimeout(() => setBusy(false), end + 100));
    },
    [patch],
  );

  const reset = () => {
    clear();
    setExiting(false);
    setExited(false);
    setBusy(false);
    setSteps(pending(SCENARIOS[scenario].specs));
  };

  useEffect(() => {
    if (!autoplay) return;
    const id = setTimeout(() => play(scenario), 500);
    return () => clearTimeout(id);
    // autoplay is a mount-time switch: later scenario changes must not restart it
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // a fake "speech" level so the orb's voice reaction can be watched
  const [talking, setTalking] = useState(false);
  useEffect(() => {
    if (!talking) return;
    const id = setInterval(() => setVoice(0.25 + Math.abs(Math.sin(performance.now() / 180)) * 0.6 * Math.random()), 70);
    return () => {
      clearInterval(id);
      setVoice(0);
    };
  }, [talking]);

  const btn = "rounded-full border border-line-2 bg-panel/80 px-3 py-1.5 text-[12px] text-text transition hover:border-gold/60 hover:text-gold-hi";
  const sc = SCENARIOS[scenario];

  return (
    <div className="relative bg-bg">
      {view === "theatre" && (
        <>
          {exited ? (
            <div className="grid h-dvh place-items-center text-sm text-muted">onExited fired · scene handed over (this is where the next screen would appear)</div>
          ) : (
            <ProcessingTheatre steps={steps} title={sc.title} subtitle={sc.subtitle} voiceLevel={voice} exiting={exiting} onExited={() => setExited(true)} />
          )}
        </>
      )}
      {view === "kit" && <Kit busy={busy} onToggleBusy={() => setBusy((b) => !b)} />}

      <div className="fixed left-1/2 top-3 z-[60] -translate-x-1/2">
        {collapsed ? (
          <button className={btn} onClick={() => setCollapsed(false)}>
            FAKE controls
          </button>
        ) : (
          <div className="glass flex max-w-[94vw] flex-wrap items-center justify-center gap-2 rounded-2xl px-3 py-2">
            <span className="num rounded bg-hot/15 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-hot">FAKE · dev only</span>
            {(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => (
              <button key={k} className={`${btn} ${k === scenario ? "!border-gold !text-gold-hi" : ""}`} onClick={() => play(k)}>
                {SCENARIOS[k].label}
              </button>
            ))}
            <button className={btn} onClick={reset}>
              Reset
            </button>
            <button className={btn} onClick={() => setExiting((e) => !e)}>
              {exiting ? "Cancel exit" : "Exit"}
            </button>
            <button className={btn} onClick={() => setTalking((t) => !t)}>
              Voice {talking ? "on" : "off"}
            </button>
            <button className={btn} onClick={() => setView(view === "theatre" ? "kit" : "theatre")}>
              {view === "theatre" ? "Kit" : "Theatre"}
            </button>
            <button className={btn} onClick={() => setCollapsed(true)} aria-label="Hide controls">
              ×
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Kit({ busy, onToggleBusy }: { busy: boolean; onToggleBusy: () => void }) {
  return (
    <div className="min-h-dvh space-y-10 p-8 pb-24">
      <section>
        <h3 className="label mb-4">GoldOrb · 9 states at 20 / 32 / 64 / 160</h3>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-6">
          {STATES.map((s) => (
            <div key={s} className="flex flex-col items-center gap-3">
              <GoldOrb state={s} size={160} />
              <div className="flex items-center gap-3">
                <GoldOrb state={s} size={64} glow />
                <GoldOrb state={s} size={32} />
                <GoldOrb state={s} size={20} />
              </div>
              <span className="label">{s}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="space-y-4">
        <h3 className="label">ThinkingChip</h3>
        <div className="flex flex-wrap gap-3">
          <ThinkingChip state="listening" label="Agent listening…" />
          <ThinkingChip state="searching" label="Searching the cohort…" />
          <ThinkingChip state="composing" label="Writing it up…" />
          <ThinkingChip state="weaving" label="Remembering…" />
        </div>
      </section>
      <section className="space-y-4">
        <h3 className="label">ModelPulse (FAKE names)</h3>
        <div className="flex flex-wrap items-center gap-4">
          <ModelPulse busy={busy} models={[{ name: "Logistic", ms: 84, done: !busy }, { name: "Forest", ms: 212, done: !busy }, { name: "Boosted", ms: 640, done: false }, { name: "Baseline", ms: 12, done: !busy }]} />
          <button className="rounded-full border border-line-2 px-3 py-1.5 text-[12px]" onClick={onToggleBusy}>
            busy: {String(busy)}
          </button>
        </div>
      </section>
    </div>
  );
}
