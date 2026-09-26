"use client";

import { motion } from "motion/react";
import { useMemo, useState } from "react";
import { majorSubject, NEXT_TERM } from "@/lib/engine";
import type { Course } from "@/lib/types";

type NodeState = "done" | "inferred" | "ip" | "open" | "blocked";
const COLORS: Record<NodeState, string> = { done: "#2dd4bf", inferred: "#2dd4bf", ip: "#ffb020", open: "#eef0f5", blocked: "#555a68" };

// Layered prerequisite graph for one major, lit up by what the student has done.
export function PrereqMap({ catalog, major, done, ip, picks = [] }: { catalog: Course[]; major: string; done: string[]; ip: string[]; picks?: string[] }) {
  const [hover, setHover] = useState<string | null>(null);
  const { nodes, edges, W, H } = useMemo(() => {
    const byId = new Map(catalog.map((c) => [c.id, c]));
    const subj = majorSubject(major);
    const keep = new Set<string>();
    const add = (id: string) => {
      if (keep.has(id) || !byId.has(id)) return;
      keep.add(id);
      byId.get(id)!.pre.flat().forEach(add);
    };
    catalog.filter((c) => (c.majors.includes(major) && c.type !== "General Education") || (c.type === "Elective" && c.subject === subj)).forEach((c) => add(c.id));
    const depth = new Map<string, number>();
    const d = (id: string): number => {
      if (depth.has(id)) return depth.get(id)!;
      const c = byId.get(id)!;
      const v = c.pre.length ? 1 + Math.max(...c.pre.flat().filter((p) => keep.has(p)).map(d), -1) : 0;
      depth.set(id, v);
      return v;
    };
    const list = [...keep].map((id) => byId.get(id)!);
    list.forEach((c) => d(c.id));
    const cols = new Map<number, Course[]>();
    list.forEach((c) => {
      const k = depth.get(c.id)!;
      if (!cols.has(k)) cols.set(k, []);
      cols.get(k)!.push(c);
    });
    const nCols = Math.max(...cols.keys()) + 1;
    const maxRows = Math.max(...[...cols.values()].map((v) => v.length));
    const colW = 150;
    const rowH = 34;
    const W = nCols * colW + 40;
    const H = maxRows * rowH + 30;
    const pos = new Map<string, { x: number; y: number }>();
    [...cols.entries()].forEach(([k, cs]) => {
      cs.sort((a, b) => a.subject.localeCompare(b.subject) || a.id.localeCompare(b.id));
      const off = ((maxRows - cs.length) * rowH) / 2;
      cs.forEach((c, i) => pos.set(c.id, { x: 20 + k * colW, y: 20 + off + i * rowH }));
    });
    const have = new Set([...done, ...ip]);
    // transfer credit is missing from transcripts: a course taken implies its single prerequisites
    const inferred = new Set<string>();
    const stack = [...have];
    while (stack.length) {
      for (const g of byId.get(stack.pop()!)?.pre ?? []) {
        if (g.length === 1 && !have.has(g[0]) && byId.has(g[0])) {
          have.add(g[0]);
          inferred.add(g[0]);
          stack.push(g[0]);
        }
      }
    }
    const nodes = list.map((c) => {
      const st: NodeState = done.includes(c.id)
        ? "done"
        : inferred.has(c.id)
          ? "inferred"
          : ip.includes(c.id)
            ? "ip"
            : c.pre.every((g) => g.some((p) => have.has(p))) && c.offered.includes(NEXT_TERM.season)
              ? "open"
              : "blocked";
      return { c, st, ...pos.get(c.id)! };
    });
    const edges = list.flatMap((c) => c.pre.flat().filter((p) => keep.has(p)).map((p) => ({ from: p, to: c.id, a: pos.get(p)!, b: pos.get(c.id)! })));
    return { nodes, edges, W, H };
  }, [catalog, major, done, ip]);

  const related = useMemo(() => {
    if (!hover) return null;
    const up = new Set<string>([hover]);
    const down = new Set<string>([hover]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of edges) {
        if (up.has(e.to) && !up.has(e.from)) {
          up.add(e.from);
          grew = true;
        }
        if (down.has(e.from) && !down.has(e.to)) {
          down.add(e.to);
          grew = true;
        }
      }
    }
    return new Set([...up, ...down]);
  }, [hover, edges]);

  const nodeW = 116;
  return (
    <div className="overflow-x-auto">
      <svg width={W} height={H} className="min-w-full">
        {edges.map((e, i) => {
          const x1 = e.a.x + nodeW;
          const y1 = e.a.y + 11;
          const x2 = e.b.x;
          const y2 = e.b.y + 11;
          const mx = (x1 + x2) / 2;
          const on = related ? related.has(e.from) && related.has(e.to) : false;
          const src = nodes.find((n) => n.c.id === e.from)!;
          return (
            <motion.path
              key={i}
              d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`}
              fill="none"
              stroke={on ? "#ff5a1f" : src.st === "done" || src.st === "inferred" ? "rgba(45,212,191,0.35)" : "rgba(255,255,255,0.08)"}
              strokeWidth={on ? 1.8 : 1}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: 1, opacity: related && !on ? 0.15 : 1 }}
              transition={{ duration: 0.8, delay: 0.2 + (e.a.x / W) * 0.8 }}
            />
          );
        })}
        {nodes.map((n, i) => {
          const col = COLORS[n.st];
          const dim = related && !related.has(n.c.id);
          const picked = picks.includes(n.c.id);
          return (
            <motion.g
              key={n.c.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: dim ? 0.2 : 1, x: 0 }}
              transition={{ delay: 0.1 + (n.x / W) * 0.8 + i * 0.004 }}
              onMouseEnter={() => setHover(n.c.id)}
              onMouseLeave={() => setHover(null)}
              style={{ cursor: "pointer" }}
            >
              <rect
                x={n.x}
                y={n.y}
                width={nodeW}
                height={22}
                rx={11}
                fill={n.st === "done" ? "rgba(45,212,191,0.12)" : n.st === "inferred" ? "rgba(45,212,191,0.05)" : n.st === "ip" ? "rgba(255,176,32,0.12)" : "rgba(255,255,255,0.02)"}
                stroke={picked ? "#ff5a1f" : col}
                strokeOpacity={n.st === "blocked" && !picked ? 0.4 : 0.9}
                strokeWidth={picked ? 1.8 : 1}
                strokeDasharray={(n.st === "open" || n.st === "inferred") && !picked ? "3 3" : undefined}
              />
              {n.st === "ip" && (
                <rect x={n.x} y={n.y} width={nodeW} height={22} rx={11} fill="none" stroke="#ffb020">
                  <animate attributeName="stroke-opacity" values="0.9;0.1;0.9" dur="1.8s" repeatCount="indefinite" />
                </rect>
              )}
              <text x={n.x + 10} y={n.y + 15} fontSize={10.5} fill={n.st === "blocked" ? "#8b90a0" : "#eef0f5"} className="num">
                {n.c.id}
              </text>
              {n.c.gates > 0 && (
                <text x={n.x + nodeW - 10} y={n.y + 15} fontSize={9} fill="var(--dim)" textAnchor="end" className="num">
                  ▸{n.c.gates}
                </text>
              )}
              {hover === n.c.id && (
                <g>
                  <rect x={n.x} y={n.y - 30} width={Math.max(nodeW, n.c.title.length * 6 + 20)} height={24} rx={6} fill="#11141b" stroke="rgba(255,255,255,0.13)" />
                  <text x={n.x + 8} y={n.y - 14} fontSize={10.5} fill="#eef0f5">
                    {n.c.title} · {n.c.credits}cr · {n.c.offered.join("/")}
                  </text>
                </g>
              )}
            </motion.g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap gap-4 px-1 text-[11px] text-muted">
        {(
          [
            ["done", "completed"],
            ["inferred", "inferred (transfer credit)"],
            ["ip", "in progress"],
            ["open", `open for ${NEXT_TERM.label}`],
            ["blocked", "blocked by prerequisites"],
          ] as [NodeState, string][]
        ).map(([k, l]) => (
          <span key={k} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full" style={{ background: COLORS[k] }} />
            {l}
          </span>
        ))}
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full ring-2 ring-heat" />
          in the repair plan
        </span>
        <span className="num">▸n = courses it gates downstream</span>
      </div>
    </div>
  );
}
