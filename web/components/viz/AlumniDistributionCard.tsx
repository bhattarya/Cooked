"use client";

import { useEffect, useMemo, useState } from "react";
import { Bars, ChartCard, Ridgeline, Scatter, type ScatterPoint } from "@/components/viz";
import { pct } from "./format";
import s from "./viz.module.css";

export interface CohortDataPayload {
  dataset_summary: {
    alumni_count: number;
    students_current_count: number;
    transcripts_count: number;
    catalog_count: number;
  };
  ttd_vs_gpa: {
    alumni_points: { id: string; x: number; y: number; group: string; credits: number; major: string }[];
    current_points: { id: string; x: number; y: number; group: string; credits: number; major: string }[];
    alumni_median_ttd: number;
    alumni_avg_gpa: number;
    current_avg_gpa: number;
  };
  salary_vs_experience: {
    points: { id: string; x: number; y: number; group: string; work_hours: number; title: string }[];
    internship_salary: { label: string; count: number; median_salary: number; mean_salary: number }[];
    work_hours_ttd: { label: string; count: number; mean_years: number; median_years: number }[];
  };
  difficulty_vs_load: {
    credit_balance: { label: string; count: number; avg_difficulty: number; avg_courses: number }[];
    courses: { course_id: string; title: string; credits: number; difficulty: number; prereqs: string }[];
  };
}

export interface AlumniDistributionCardProps {
  /** Optional initial cohort data payload or endpoint override */
  initialData?: CohortDataPayload;
  /** Highlight point ("You are here") */
  you?: { x: number; y: number; label?: string };
  /** Student's current major filter */
  major?: string;
  height?: number;
  className?: string;
}

export function AlumniDistributionCard({ initialData, you, major, height = 400, className }: AlumniDistributionCardProps) {
  const [activeTab, setActiveTab] = useState<"ttd_gpa" | "salary_internships" | "difficulty_load">("ttd_gpa");
  const [data, setData] = useState<CohortDataPayload | null>(initialData ?? null);
  const [loading, setLoading] = useState<boolean>(!initialData);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initialData) return;
    let ignore = false;

    fetch("/backend/distribution/cohort")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch cohort distribution data");
        return res.json();
      })
      .then((json) => {
        if (!ignore && json?.data) {
          setData(json.data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          setError(err.message || "Failed to load real cohort dataset insights");
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [initialData]);

  const scatterGroups = [
    { key: "Alumni (3,200)", label: "UMBC Alumni (3,200)", color: "var(--gold)" },
    { key: "Current Students (1,800)", label: "Current Students (1,800)", color: "var(--cool)" },
  ];

  // View 1 Scatter points
  const ttdPoints = useMemo<ScatterPoint[]>(() => {
    if (!data?.ttd_vs_gpa) return [];
    const alum = data.ttd_vs_gpa.alumni_points.map((p) => ({
      x: p.x,
      y: p.y,
      group: "Alumni (3,200)",
      id: `${p.id} · ${p.major} · ${p.credits} cr`,
    }));
    const curr = data.ttd_vs_gpa.current_points.map((p) => ({
      x: p.x,
      y: p.y,
      group: "Current Students (1,800)",
      id: `${p.id} · ${p.major} · ${p.credits} cr earned`,
    }));
    return [...alum, ...curr];
  }, [data]);

  // View 2 Salary Bars data
  const salaryBars = useMemo(() => {
    if (!data?.salary_vs_experience?.internship_salary) return [];
    return data.salary_vs_experience.internship_salary.map((item) => ({
      key: item.label,
      label: item.label,
      value: item.median_salary,
      n: item.count,
      color: "var(--gold)",
    }));
  }, [data]);

  // View 3 Difficulty vs Load data
  const difficultyBars = useMemo(() => {
    if (!data?.difficulty_vs_load?.credit_balance) return [];
    return data.difficulty_vs_load.credit_balance.map((item) => ({
      key: item.label,
      label: item.label,
      value: item.avg_difficulty,
      n: item.count,
      color: item.avg_difficulty > 3.2 ? "var(--hot)" : item.avg_difficulty > 2.9 ? "var(--gold)" : "var(--cool)",
    }));
  }, [data]);

  const subtitleMap = {
    ttd_gpa: "Comparing 3,200 UMBC Alumni & 1,800 active student records on Time-to-degree vs GPA.",
    salary_internships: "First-job starting annual salary ($) across internship experience & work hour bands.",
    difficulty_load: "Course difficulty index (2.0 to 4.5) vs regular term credit load intensity.",
  };

  return (
    <ChartCard
      title="Alumni & Cohort Peer Distribution"
      eyebrow="DOIT DATASET INSIGHTS · 3,200 ALUMNI & 1,800 STUDENTS"
      takeaway={subtitleMap[activeTab]}
      n={data ? "3,200 Alumni + 1,800 Students" : undefined}
      source="DOIT Dataset · hackumbc-2026 raw transcripts & alumni records"
      disclaimer="Observational dataset distributions. Group associations do not guarantee individual outcomes."
      state={loading ? "loading" : error ? "error" : "ready"}
      stateMessage={error ?? undefined}
      className={className}
      actions={
        <div className="flex items-center gap-1 rounded-full border border-line bg-panel-2/80 p-0.5 text-xs">
          <button
            type="button"
            className={`rounded-full px-3 py-1 font-medium transition ${activeTab === "ttd_gpa" ? "bg-gold text-bg shadow-sm" : "text-muted hover:text-text"}`}
            onClick={() => setActiveTab("ttd_gpa")}
          >
            Time to Degree
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 font-medium transition ${activeTab === "salary_internships" ? "bg-gold text-bg shadow-sm" : "text-muted hover:text-text"}`}
            onClick={() => setActiveTab("salary_internships")}
          >
            Salary & Internships
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 font-medium transition ${activeTab === "difficulty_load" ? "bg-gold text-bg shadow-sm" : "text-muted hover:text-text"}`}
            onClick={() => setActiveTab("difficulty_load")}
          >
            Course Difficulty
          </button>
        </div>
      }
    >
      {activeTab === "ttd_gpa" && (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-3 gap-2 rounded-xl border border-line/60 bg-panel/40 p-2.5 text-center text-xs">
            <div>
              <div className="text-[11px] text-muted">Alumni Median TTD</div>
              <div className="num text-lg font-semibold text-gold">{data?.ttd_vs_gpa.alumni_median_ttd ?? 3.95} yrs</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Alumni Avg Final GPA</div>
              <div className="num text-lg font-semibold text-cream">{data?.ttd_vs_gpa.alumni_avg_gpa ?? 2.99}</div>
            </div>
            <div>
              <div className="text-[11px] text-muted">Current Student Avg GPA</div>
              <div className="num text-lg font-semibold text-cool">{data?.ttd_vs_gpa.current_avg_gpa ?? 2.99}</div>
            </div>
          </div>
          <Scatter
            points={ttdPoints}
            groups={scatterGroups}
            you={you}
            hulls
            density="groups"
            xLabel="GPA (0.0 to 4.0)"
            yLabel="Years to Degree"
            xDomain={[1.5, 4.0]}
            yDomain={[1.0, 8.0]}
            height={height}
            radius={3}
            zoom
          />
        </div>
      )}

      {activeTab === "salary_internships" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {data?.salary_vs_experience?.internship_salary.map((item) => (
              <div key={item.label} className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
                <div className="text-xs text-muted">{item.label}</div>
                <div className="num mt-1 text-xl font-bold text-gold">${(item.median_salary / 1000).toFixed(1)}k</div>
                <div className="mt-0.5 text-[10px] text-dim">median ({item.count} alumni)</div>
              </div>
            ))}
          </div>
          <div className="mt-2">
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">Median First-Job Annual Salary ($)</h4>
            <Bars
              data={salaryBars}
              orientation="horizontal"
              format={(v) => `$${Math.round(v).toLocaleString()}`}
              domain={[0, 100000]}
              unit="starting salary"
              height={200}
              sort="none"
              highlight="3 Internships"
            />
          </div>
        </div>
      )}

      {activeTab === "difficulty_load" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line/60 bg-panel/40 p-3">
            <h4 className="text-xs font-semibold text-cream">Credit Load vs Course Difficulty Balance</h4>
            <p className="mt-0.5 text-[11px] font-normal text-muted">
              Higher credit terms (16-18+ credits) require balancing course difficulty to prevent repeat attempts or term dropouts.
            </p>
          </div>
          <Bars
            data={difficultyBars}
            orientation="vertical"
            format={(v) => `Diff ${v.toFixed(2)} / 5.0`}
            domain={[0, 4.0]}
            unit="course difficulty index"
            height={220}
            sort="none"
            baseline={{ value: 3.0, label: "Medium Difficulty (3.0)", tone: "gold" }}
          />
        </div>
      )}
    </ChartCard>
  );
}

export const CohortDistribution = AlumniDistributionCard;
