"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { routeToScene } from "@/components/agent/explore/sceneRoutes";
import { AppChrome } from "@/components/scenes";
import { GoldOrb } from "@/components/theatre";
import { fromApi, fromLocal, levelOf, type AlarmsPayload, type QueuePayload, type Snapshot } from "@/components/queue/model";
import { Watchtower } from "@/components/queue/Watchtower";
import { loadDataset } from "@/lib/data";
import { institutionQueue } from "@/lib/engine";
import { api, useApiHealth } from "@/lib/live";
import type { SessionUser } from "@/lib/session";
import { useVoiceCommands, useVoiceScreen } from "@/lib/voiceAgent";
import { int, pct } from "@/components/viz";

/**
 * Advisor view: every current student with a completed term, scored by the trained model (Watchtower).
 * `canSeeRows` is the same gate the API enforces: per-student rows only for people signed in with Google once Firebase is on.
 */
export function Queue({ user, canSeeRows }: { user: SessionUser; canSeeRows: boolean }) {
  const router = useRouter();
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
  useVoiceCommands({
    describeScreen: () => ({ message: summary, data: { scene: "advisor", ...facts } }),
    showScene: ({ scene }) => routeToScene(scene, router.push),
  });

  return (
    <AppChrome user={user} active="advisor" heat={snap && snap.atRisk > 0 ? 0.3 : 0}>
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
    </AppChrome>
  );
}
