"use client";

import { useState } from "react";
import { VoiceRoot } from "@/components/voice/VoiceRoot";
import { StudioProvider, useStudio, type ChapterId } from "../studio/context";
import { AdvisorChapter } from "./AdvisorChapter";
import { CohortChapter } from "./CohortChapter";
import { ModelsChapter } from "./ModelsChapter";

const user = { name: "Dev", email: "dev@example.test", provider: "guest" } as never;

function Bench({ rows }: { rows: boolean }) {
  const s = useStudio();
  const [log, setLog] = useState("");
  const [q, setQ] = useState("");
  const [ch, setCh] = useState<ChapterId>("cohort");
  const send = async (i: Parameters<typeof s.dispatch>[0]) => setLog(await s.dispatch(i));
  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-text">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-line-2 p-2 text-xs" data-testid="bench">
        {(["cohort", "models", "advisor"] as const).map((c) => (
          <button key={c} onClick={() => s.goChapter(c)}>{c}</button>
        ))}
        <select value={ch} onChange={(e) => setCh(e.target.value as ChapterId)} data-testid="ch">
          {["cohort", "models", "advisor"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <input value={q} onChange={(e) => setQ(e.target.value)} data-testid="q" className="w-80 border border-line-2 bg-panel px-1" />
        <button data-testid="ask" onClick={() => void send({ chapter: ch, kind: "ask", question: q })}>ask</button>
        <button data-testid="scene" onClick={() => void send({ chapter: ch, kind: "scene", scene: q })}>scene</button>
        <button data-testid="next" onClick={() => void send({ chapter: ch, kind: "next" })}>next</button>
        <button data-testid="prev" onClick={() => void send({ chapter: ch, kind: "previous" })}>prev</button>
        <button data-testid="describe" onClick={() => void send({ chapter: ch, kind: "describe" })}>describe</button>
        <button data-testid="scenario" onClick={() => { const [f, v] = q.split("="); void send({ chapter: ch, kind: "scenario", field: f, value: Number.isNaN(Number(v)) ? v : Number(v) }); }}>scenario f=v</button>
        <button data-testid="student" onClick={() => s.setStudent({ id: q, name: "Test", source: "sample" })}>set student=q</button>
        <button data-testid="nostudent" onClick={() => s.setStudent(null)}>clear student</button>
      </div>
      <pre data-testid="log" className="max-h-28 shrink-0 overflow-auto whitespace-pre-wrap border-b border-line-2 p-2 text-[11px] text-gold">{log}</pre>
      <main className="relative flex min-h-0 flex-1 flex-col">
        {s.chapter === "cohort" && <CohortChapter user={user} />}
        {s.chapter === "models" && <ModelsChapter user={user} />}
        {s.chapter === "advisor" && <AdvisorChapter user={user} canSeeRows={rows} />}
      </main>
    </div>
  );
}

export function ChaptersHarness() {
  const rows = typeof window !== "undefined" && new URLSearchParams(window.location.search).get("rows") === "1";
  return (
    <VoiceRoot><StudioProvider initialChapter="cohort">
      <Bench rows={rows} />
    </StudioProvider></VoiceRoot>
  );
}
