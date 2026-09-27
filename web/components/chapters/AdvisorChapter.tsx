"use client";

import { useEffect, useState } from "react";
import { GoldOrb } from "@/components/theatre";
import { fromApi, fromLocal, levelOf, type AlarmsPayload, type QueuePayload, type Snapshot } from "@/components/queue/model";
import { Watchtower } from "@/components/queue/Watchtower";
import { loadDataset } from "@/lib/data";
import { institutionQueue } from "@/lib/engine";
import { api, useApiHealth } from "@/lib/live";
import type { SessionUser } from "@/lib/session";
import { useVoiceScreen } from "@/lib/voiceAgent";
import { useStudioIntent } from "../studio/context";
import { int, pct } from "@/components/viz";

/**
 * Advisor view: every current student with a completed term, scored by the trained model (Watchtower).
 * `canSeeRows` is the same gate the API enforces: per-student rows only for people signed in with Google once Firebase is on.
 */
export function AdvisorChapter({ canSeeRows }: { user: SessionUser; canSeeRows: boolean }) {
  const health = useApiHealth();
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [staffWanted, setStaffWanted] = useState(false);
  const staff = staffWanted && canSeeRows;

  useEffect(() => {
    if (health === null) return;
    let on = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const local = () => {
      // the engine scores every student against matched alumni in the browser: give the loading state a paint first
      timer = setTimeout(() => {
        loadDataset()
          .then((ds) => on && setSnap(fromLocal(institutionQueue(ds), canSeeRows)))
          .catch(() => on && setFailed(true));
      }, 50);
    };
    if (!health.live) {
      local();
    } else {
      Promise.all([api<QueuePayload>(canSeeRows ? "/institution/queue?staff=true&limit=2000" : "/institution/queue"), api<AlarmsPayload>("/alarms?status=open").then((a) => a.data, () => null)])
        .then(([q, alarms]) => on && setSnap(fromApi(q.data, alarms, canSeeRows)))
        .catch(local);
    }
    return () => {
      on = false;
      clearTimeout(timer);
    };
  }, [health, canSeeRows]);

  // what the voice agent may say about this screen: only numbers the snapshot carries
  const facts = snap
    ? {
        current_students_scored: snap.scored,
        at_or_over_line: snap.atRisk,
        line: snap.threshold,
        open_alarms: snap.openAlarms,
        model_version: snap.version ?? "local engine",
        view: staff ? "student rows" : "counts only",
        ...Object.fromEntries(snap.patterns.map((p) => [`pattern ${p.name}`, `${p.atRisk} of ${p.scored} over the line, average risk ${pct(p.avgRisk)}`])),
        ...(staff && snap.students ? { students_at_50_percent_or_more: snap.students.filter((s) => levelOf(s.risk) === "cooked").length } : {}),
      }
    : undefined;
  const summary = snap
    ? `The Watchtower${snap.source === "model" ? ` (model ${snap.version})` : " (local engine, the API is offline)"} scored ${int(snap.scored)} current students. ${int(snap.atRisk)} are at or above the ${snap.threshold.toFixed(2)} line${snap.openAlarms !== null ? ` and ${int(snap.openAlarms)} alarms are open` : ""}. ${canSeeRows ? "Student rows are behind the Student rows toggle." : "Student rows need a Google sign-in, so only counts are shown."}`
    : "The Watchtower is still scoring the current students.";
  useVoiceScreen({ scene: null, title: "Watchtower", summary, facts, student: false, scenes: ["explore", "models", "risk", "timeline", "twins", "drill", "repair", "careers"] });
  useStudioIntent("advisor", (i) => {
    if (i.kind === "describe" || i.kind === "scene") return summary;
    if (i.kind !== "ask") return "That does not apply to the advisor screen.";
    if (!snap) return "The Watchtower is still scoring the current students. Ask again in a moment.";
    return answer(snap, i.question, canSeeRows);
  });

  return (
    <div className="relative flex min-h-0 flex-1 flex-col" style={{ ["--heat-level" as string]: snap && snap.atRisk > 0 ? 0.3 : 0 }}>
      {snap ? (
        <Watchtower snap={snap} canSeeRows={canSeeRows} staff={staff} onStaff={setStaffWanted} />
      ) : (
        <div className="grid flex-1 place-items-center px-6 text-center" role="status">
          <div className="flex flex-col items-center gap-4">
            <GoldOrb state={failed ? "breathing" : "searching"} size={110} paused={failed} aria-label="Watchtower scoring" />
            <div className="display text-3xl font-extrabold text-cream">{failed ? "No data to score" : "Scoring every current student"}</div>
            <p className="serif max-w-sm text-lg text-muted">{failed ? "Neither the API nor the local dataset could be read." : "The Watchtower is running the trained model over the current cohort."}</p>
          </div>
        </div>
      )}
    </div>
  );
}

const share = (a: number, b: number) => (b > 0 ? `${((100 * a) / b).toFixed(1)}%` : "0%");

/** Natural-language questions about the queue, answered only from the loaded snapshot (counts, never invented). */
function answer(snap: Snapshot, question: string, canSeeRows: boolean): string {
  const q = question.toLowerCase();
  const line = snap.threshold.toFixed(2);
  const over = `${int(snap.atRisk)} of ${int(snap.scored)} scored students (${share(snap.atRisk, snap.scored)}) are at or above the ${line} line`;
  const byShare = [...snap.patterns].filter((p) => p.scored > 0).sort((a, b) => b.atRisk / b.scored - a.atRisk / a.scored);
  const line1 = (p: (typeof byShare)[number]) => `${p.name}: ${int(p.atRisk)} of ${int(p.scored)} over the line (${share(p.atRisk, p.scored)}), average risk ${pct(p.avgRisk)}${p.open !== null ? `, ${int(p.open)} open alarms` : ""}`;
  const src = snap.source === "model" ? `model ${snap.version}` : "the local engine (the API is offline)";
  if (/student|who\b.*(name|id)|list|which (kid|person|one)/.test(q) && /which|who|list|name|id/.test(q) && !/pattern/.test(q)) {
    if (!canSeeRows) return `Individual student rows need a Google sign-in, so I can only give counts: ${over}.`;
    return `${over}. The individual rows are on screen behind the Student rows toggle; I will not read student ids aloud.`;
  }
  if (/alarm|alert/.test(q)) return snap.openAlarms === null ? `The alarm log is not available right now. ${over}.` : `${int(snap.openAlarms)} alarms are open. ${over}.`;
  if (/pattern|worst|shape|trajector|type/.test(q)) {
    if (!byShare.length) return "No trajectory patterns were returned.";
    const w = byShare[0];
    return `The worst pattern by share over the line is ${line1(w)}. Others: ${byShare.slice(1).map(line1).join("; ") || "none"}. Scored by ${src}.`;
  }
  if (/model|version|how.*scored|score/.test(q)) return `Scored by ${src}: ${int(snap.scored)} current students with a completed term. ${over}.`;
  if (/over|line|risk|cooked|how many|threshold|flag|count|number/.test(q)) return `${over}${snap.openAlarms !== null ? `, and ${int(snap.openAlarms)} alarms are open` : ""}. Scored by ${src}. Synthetic data.`;
  return `${over}${snap.openAlarms !== null ? `; ${int(snap.openAlarms)} alarms open` : ""}. Worst pattern: ${byShare[0] ? line1(byShare[0]) : "none"}. You can ask: who is over the line, how many alarms, which pattern is worst.`;
}
