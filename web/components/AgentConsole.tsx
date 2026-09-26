"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";

export interface LogEntry {
  key: string;
  agent: "watchtower" | "fire-drill" | "repair" | "narrator" | "claim-check" | "memory" | "you";
  call: string;
  result?: string;
  tr?: string;
  ms?: number;
  ok?: boolean;
}

const AGENT_COLOR: Record<LogEntry["agent"], string> = {
  watchtower: "#ffb020",
  "fire-drill": "#ff2e4d",
  repair: "#2dd4bf",
  narrator: "#a78bfa",
  "claim-check": "#7cc4ff",
  memory: "#8b90a0",
  you: "#eef0f5",
};

export type Intent = { kind: "work"; value: number } | { kind: "load"; value: number } | { kind: "drill" } | { kind: "repair" } | { kind: "alarm" } | { kind: "unknown" };

// Local intent parser for the ask box. With the backend up, this routes through Gemini
// with the same tool list; the parser keeps the demo path working offline.
export function parseIntent(q: string): Intent {
  const s = q.toLowerCase();
  const n = s.match(/(\d+(\.\d+)?)/);
  const v = n ? Number(n[1]) : NaN;
  if (!isNaN(v) && /(h|hour|hrs|work|job)/.test(s)) return { kind: "work", value: v };
  if (!isNaN(v) && /(cred|cr\b|load|class|course)/.test(s)) return { kind: "load", value: v };
  if (/drill|stress|shock|break/.test(s)) return { kind: "drill" };
  if (/fix|repair|un-?cook|what should|change/.test(s)) return { kind: "repair" };
  if (/alarm|risk|am i|cooked/.test(s)) return { kind: "alarm" };
  return { kind: "unknown" };
}

function Typed({ text, speed = 8 }: { text: string; speed?: number }) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => (x >= text.length ? (clearInterval(id), x) : x + 2)), speed);
    return () => clearInterval(id);
  }, [text, speed]);
  return <>{text.slice(0, n)}</>;
}

export function AgentConsole({ log, onAsk, busy }: { log: LogEntry[]; onAsk: (q: string) => void; busy: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  useEffect(() => {
    box.current?.scrollTo({ top: box.current.scrollHeight, behavior: "smooth" });
  }, [log.length]);
  const suggestions = ["What if I work 12 hours?", "What if I take 13 credits?", "Stress test my plan", "How do I get un-cooked?"];
  return (
    <div className="flex h-full flex-col">
      <div ref={box} className="num min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4 text-[11.5px] leading-relaxed">
        <AnimatePresence initial={false}>
          {log.map((e) => (
            <motion.div key={e.key} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.25 }}>
              <div className="flex items-start gap-2">
                <span className="mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: AGENT_COLOR[e.agent] }} />
                <div className="min-w-0">
                  <span style={{ color: AGENT_COLOR[e.agent] }}>{e.agent}</span>
                  <span className="text-dim"> ▸ </span>
                  <span className="break-words text-text/85">
                    <Typed key={e.call} text={e.call} />
                  </span>
                  {e.result && (
                    <div className="mt-0.5 break-words text-muted">
                      <span className="text-dim">← </span>
                      <Typed key={e.result} text={e.result} speed={12} />
                      {e.tr && <span className="ml-1.5 text-cool/80">{e.tr}</span>}
                      {e.ms !== undefined && <span className="ml-1.5 text-dim">{e.ms < 1 ? "<1" : e.ms.toFixed(0)}ms</span>}
                      {e.ok === true && <span className="ml-1.5 text-cool">✓</span>}
                      {e.ok === false && <span className="ml-1.5 text-hot">✕</span>}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex items-center gap-2 text-dim">
            <span className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span key={i} className="h-1 w-1 rounded-full bg-heat" animate={{ opacity: [0.2, 1, 0.2] }} transition={{ duration: 0.9, repeat: Infinity, delay: i * 0.15 }} />
              ))}
            </span>
            agents working
          </div>
        )}
      </div>
      <div className="border-t border-line p-3">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} onClick={() => onAsk(s)} className="rounded-full border border-line px-2.5 py-1 text-[11px] text-muted transition hover:border-heat/50 hover:text-text">
              {s}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) onAsk(q.trim());
            setQ("");
          }}
          className="flex items-center gap-2 rounded-xl border border-line-2 bg-bg/60 px-3 py-2 focus-within:border-heat/60"
        >
          <span className="text-heat">›</span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ask the agents: what if I work 15 hours?"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-dim"
          />
          <kbd className="rounded border border-line px-1.5 text-[10px] text-dim">⏎</kbd>
        </form>
      </div>
    </div>
  );
}
