"use client";

import { useEffect, useMemo, useState } from "react";
import { Bars, ChartCard } from "@/components/viz";
import s from "./viz.module.css";

export interface FallCourse {
  course_id: string;
  title: string;
  credits: number;
  difficulty: number;
  prerequisites: string[];
  offered: string[];
  schedule_time: string;
}

export interface FallSchedulePayload {
  campus_id: string;
  major: string;
  term: string;
  courses: FallCourse[];
  total_credits: number;
  average_difficulty: number;
  work_hours: number;
  recommended_study_hours: number;
  total_weekly_commitment: number;
  load_intensity: "Balanced" | "High" | "Light";
}

export interface FallScheduleCardProps {
  campusId?: string;
  initialPayload?: FallSchedulePayload;
  className?: string;
}

export function FallScheduleCard({ campusId = "CID-116490", initialPayload, className }: FallScheduleCardProps) {
  const [payload, setPayload] = useState<FallSchedulePayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState<boolean>(!initialPayload);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialPayload) return;
    let ignore = false;

    fetch(`/backend/students/${campusId}/fall-schedule`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch Fall schedule timing data");
        return res.json();
      })
      .then((json) => {
        if (!ignore && json?.data) {
          setPayload(json.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || "Could not load Fall schedule balance analysis");
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [campusId, initialPayload]);

  const courses = payload?.courses ?? [
    { course_id: "CMSC 341", title: "Data Structures", credits: 3, difficulty: 3.8, prerequisites: ["CMSC 202", "MATH 151"], offered: ["Fall", "Spring"], schedule_time: "MWF 10:00 - 11:15 AM" },
    { course_id: "CMSC 313", title: "Assembly & Comp Org", credits: 3, difficulty: 3.9, prerequisites: ["CMSC 202"], offered: ["Fall", "Spring"], schedule_time: "TuTh 1:00 - 2:15 PM" },
    { course_id: "MATH 221", title: "Linear Algebra", credits: 3, difficulty: 3.2, prerequisites: ["MATH 151"], offered: ["Fall", "Spring"], schedule_time: "MWF 1:00 - 2:15 PM" },
    { course_id: "STAT 355", title: "Probability & Stats", credits: 3, difficulty: 3.4, prerequisites: ["MATH 152"], offered: ["Fall", "Spring"], schedule_time: "TuTh 9:30 - 10:45 AM" },
  ];

  const totalCredits = payload?.total_credits ?? 12;
  const avgDiff = payload?.average_difficulty ?? 3.58;
  const workHours = payload?.work_hours ?? 15;
  const studyHours = payload?.recommended_study_hours ?? 37.5;
  const totalCommitment = payload?.total_weekly_commitment ?? 52.5;
  const loadIntensity = payload?.load_intensity ?? "Balanced";

  // Course difficulty chart data
  const courseBars = useMemo(() => {
    return courses.map((c) => ({
      key: c.course_id,
      label: c.course_id,
      value: c.difficulty,
      color: c.difficulty >= 3.7 ? "var(--hot)" : c.difficulty >= 3.2 ? "var(--gold)" : "var(--cool)",
    }));
  }, [courses]);

  // Weekly commitment breakdown
  const commitmentBars = [
    { key: "study", label: "Recommended Study Hours", value: studyHours, color: "var(--gold)" },
    { key: "work", label: "Weekly Work Hours", value: workHours, color: "var(--violet)" },
    { key: "class", label: "Class Lecture Hours", value: totalCredits, color: "var(--cool)" },
  ];

  return (
    <ChartCard
      title="Fall Schedule & Timing Balance"
      eyebrow="SEMESTER LOAD · PREREQUISITES & TIME INVESTMENT"
      takeaway={`Upcoming Fall load: ${totalCredits} credits across ${courses.length} core courses (${avgDiff.toFixed(1)}/5.0 avg difficulty). Recommended ${studyHours}h/week study investment.`}
      n={`${totalCredits} Credits · ${workHours}h Work`}
      source="UMBC Course Catalog & Transcripts Engine"
      disclaimer="Study hours calculated at 2.5h per credit adjusted by course difficulty index. High weekly commitments (>55h) correlate with increased risk."
      state={loading ? "loading" : error ? "error" : "ready"}
      stateMessage={error ?? undefined}
      className={className}
    >
      {/* Header Summary Cards */}
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
          <div className="text-xs text-muted">Term Credit Load</div>
          <div className="num mt-1 text-2xl font-black text-gold">{totalCredits} cr</div>
          <div className="text-[10px] text-dim">{courses.length} courses</div>
        </div>

        <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
          <div className="text-xs text-muted">Avg Difficulty</div>
          <div className="num mt-1 text-2xl font-black text-cream">{avgDiff.toFixed(2)} / 5.0</div>
          <div className="text-[10px] text-dim">catalog index</div>
        </div>

        <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
          <div className="text-xs text-muted">Recommended Study</div>
          <div className="num mt-1 text-2xl font-black text-cool">{studyHours} h/wk</div>
          <div className="text-[10px] text-dim">study investment</div>
        </div>

        <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
          <div className="text-xs text-muted">Total Weekly Load</div>
          <div className={`num mt-1 text-2xl font-black ${totalCommitment > 55 ? "text-hot" : "text-cream"}`}>
            {totalCommitment} h/wk
          </div>
          <div className="text-[10px] text-dim">{loadIntensity} Intensity</div>
        </div>
      </div>

      {/* Courses Grid */}
      <div className="mb-5 flex flex-col gap-3">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">Upcoming Fall Course Schedule</h4>
        <div className="grid gap-3 sm:grid-cols-2">
          {courses.map((c) => (
            <div key={c.course_id} className="flex flex-col justify-between rounded-xl border border-line bg-panel-2/60 p-3.5">
              <div>
                <div className="flex items-start justify-between">
                  <div>
                    <div className="display text-lg font-bold text-cream">{c.course_id}</div>
                    <div className="text-xs text-muted">{c.title}</div>
                  </div>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                      c.difficulty >= 3.7
                        ? "bg-hot/10 text-hot border border-hot/20"
                        : c.difficulty >= 3.2
                        ? "bg-gold/10 text-gold border border-gold/20"
                        : "bg-cool/10 text-cool border border-cool/20"
                    }`}
                  >
                    Diff {c.difficulty.toFixed(1)}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-dim">
                  <span>Schedule: <strong className="text-text">{c.schedule_time}</strong></span>
                  <span>{c.credits} Credits</span>
                </div>
              </div>

              {c.prerequisites && c.prerequisites.length > 0 && (
                <div className="mt-3 flex items-center gap-1.5 border-t border-line/40 pt-2 text-[11px] text-muted">
                  <span className="font-medium text-dim">Prereqs:</span>
                  {c.prerequisites.map((p) => (
                    <span key={p} className="rounded bg-panel px-1.5 py-0.5 text-[10px] text-cream border border-line/40">
                      {p}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Course Difficulty & Weekly Commitment Charts */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-xl border border-line/60 bg-panel/40 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Course Difficulty Comparison</h4>
          <Bars
            data={courseBars}
            orientation="horizontal"
            format={(v) => `${v.toFixed(1)} / 5.0`}
            domain={[0, 5.0]}
            unit="difficulty score"
            height={160}
          />
        </div>

        <div className="rounded-xl border border-line/60 bg-panel/40 p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Weekly Time Commitment (Hours/Week)</h4>
          <Bars
            data={commitmentBars}
            orientation="horizontal"
            format={(v) => `${v} h/wk`}
            domain={[0, 50]}
            unit="hours per week"
            height={160}
          />
        </div>
      </div>
    </ChartCard>
  );
}

export const ScheduleTiming = FallScheduleCard;
