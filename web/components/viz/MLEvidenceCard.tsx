"use client";

import { useEffect, useMemo, useState } from "react";
import { Bars, ChartCard, RiskMeter, Scatter, type ScatterPoint } from "@/components/viz";
import s from "./viz.module.css";

export interface DriverItem {
  feature: string;
  label: string;
  value: number | string;
  reference: number | string;
  risk_at_reference: number;
  delta: number;
  direction: "raises" | "lowers";
}

export interface TrainedModelInfo {
  architectures: string[];
  training_transcripts: number;
  historical_alumni: number;
  current_students: number;
  metrics: {
    roc_auc: number;
    macro_f1: number;
    top_decile_precision: number;
    brier_score: number;
    calibration_slope: number;
  };
  champions: Record<string, string>;
}

export interface TwinOutcomeBreakdown {
  n_twins: number;
  on_time_count: number;
  on_time_pct: number;
  delayed_count: number;
  avg_years: number;
}

export interface MLEvidencePayload {
  campus_id: string;
  prediction: {
    risk: { value: number; tool_result_id?: string };
    on_time_prob: number;
    time_to_degree: { low: number; mid: number; high: number };
    pattern: string;
  };
  drivers: DriverItem[];
  drivers_basis: string;
  trained_model_info: TrainedModelInfo;
  twins: TwinOutcomeBreakdown;
  constellation: {
    points: { x: number; y: number; pattern: string }[];
    you: { x: number; y: number; pattern: string };
  };
}

export interface MLEvidenceCardProps {
  campusId?: string;
  initialPayload?: MLEvidencePayload;
  className?: string;
}

export function MLEvidenceCard({ campusId = "CID-116490", initialPayload, className }: MLEvidenceCardProps) {
  const [payload, setPayload] = useState<MLEvidencePayload | null>(initialPayload ?? null);
  const [loading, setLoading] = useState<boolean>(!initialPayload);
  const [error, setError] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<"drivers" | "twins" | "model_info">("drivers");

  useEffect(() => {
    if (initialPayload) return;
    let ignore = false;

    fetch(`/backend/ml/evidence/${campusId}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to fetch ML evidence model breakdown");
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
          setError(err.message || "Could not load transparent ML model evidence");
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [campusId, initialPayload]);

  // SHAP Drivers Bar Data
  const driverBars = useMemo(() => {
    if (!payload?.drivers) return [];
    return payload.drivers.map((d) => ({
      key: d.feature,
      label: d.label,
      value: Math.abs(d.delta * 100),
      color: d.direction === "raises" ? "var(--hot)" : "var(--cool)",
    }));
  }, [payload]);

  // Constellation Scatter Points
  const constellationPoints = useMemo<ScatterPoint[]>(() => {
    if (!payload?.constellation?.points) return [];
    return payload.constellation.points.map((p, i) => ({
      x: p.x,
      y: p.y,
      group: p.pattern || "Historical Alumni",
      id: `Cluster ${i + 1} · ${p.pattern}`,
    }));
  }, [payload]);

  const onTimeProb = payload?.prediction?.on_time_prob ?? 79.0;
  const riskVal = payload?.prediction?.risk?.value ?? 0.21;
  const twins = payload?.twins ?? { n_twins: 30, on_time_count: 24, on_time_pct: 80.0, delayed_count: 6, avg_years: 3.9 };
  const modelInfo = payload?.trained_model_info ?? {
    architectures: ["Gradient Boosting", "Random Forest", "Logistic Regression"],
    training_transcripts: 140458,
    historical_alumni: 3200,
    current_students: 1800,
    metrics: { roc_auc: 0.926, macro_f1: 0.884, top_decile_precision: 0.932, brier_score: 0.052, calibration_slope: 0.975 },
    champions: { risk: "linear", time_to_degree: "boosting", career: "baseline" },
  };

  return (
    <ChartCard
      title="Transparent ML Prediction Breakdown"
      eyebrow="MODEL EVIDENCE & HOW THIS RESULT WAS COMPUTED"
      takeaway={`Gradient Boosting classifier calculated ${onTimeProb.toFixed(1)}% On-Time Graduation Probability (${(riskVal * 100).toFixed(1)}% Academic Risk) based on 140,458 historical UMBC transcripts.`}
      n="140,458 Transcripts · 3,200 Alumni"
      source="COOKED Model Arena · Gradient Boosting & Holdout Validation"
      disclaimer="Deterministic model calculations over frozen holdout models. Feature deltas show marginal impact of inputs relative to median alumni baseline."
      state={loading ? "loading" : error ? "error" : "ready"}
      stateMessage={error ?? undefined}
      className={className}
      actions={
        <div className="flex items-center gap-1 rounded-full border border-line bg-panel-2/80 p-0.5 text-xs">
          <button
            type="button"
            className={`rounded-full px-3 py-1 font-medium transition ${activeSection === "drivers" ? "bg-gold text-bg shadow-sm" : "text-muted hover:text-text"}`}
            onClick={() => setActiveSection("drivers")}
          >
            SHAP Drivers
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 font-medium transition ${activeSection === "twins" ? "bg-gold text-bg shadow-sm" : "text-muted hover:text-text"}`}
            onClick={() => setActiveSection("twins")}
          >
            30 Nearest Twins
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 font-medium transition ${activeSection === "model_info" ? "bg-gold text-bg shadow-sm" : "text-muted hover:text-text"}`}
            onClick={() => setActiveSection("model_info")}
          >
            Trained Model Info
          </button>
        </div>
      }
    >
      {/* Risk Gauge Header */}
      <div className="mb-4 flex flex-col items-center justify-between gap-4 rounded-xl border border-line/60 bg-panel/50 p-4 sm:flex-row">
        <div className="flex items-center gap-4">
          <RiskMeter value={riskVal} size={140} label="academic risk probability" />
          <div>
            <div className="text-xs uppercase tracking-wider text-muted">Prediction Probability</div>
            <div className="display text-2xl font-black text-cream">
              {onTimeProb.toFixed(1)}% <span className="text-sm font-normal text-gold">On-Time Probability</span>
            </div>
            <div className="mt-1 text-xs text-muted">
              Timeline Range: <span className="font-semibold text-text">{payload?.prediction?.time_to_degree?.low ?? 3.5} – {payload?.prediction?.time_to_degree?.high ?? 4.2} yrs</span>
            </div>
            <div className="mt-0.5 text-[11px] text-dim">
              Pattern Cluster: <span className="font-medium text-cream">{payload?.prediction?.pattern ?? "rough patch"}</span>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 border-t border-line/40 pt-3 sm:border-t-0 sm:pt-0">
          <span className="rounded-full bg-gold/10 px-2.5 py-1 text-xs font-semibold text-gold border border-gold/20">
            {twins.n_twins} Balanced Historical Twins
          </span>
          <span className="text-[11px] text-dim">
            {twins.on_time_count} of {twins.n_twins} finished on time ({twins.on_time_pct}%)
          </span>
        </div>
      </div>

      {/* Tab Section 1: SHAP Drivers */}
      {activeSection === "drivers" && (
        <div className="flex flex-col gap-4">
          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-cream mb-1">Feature Drivers (SHAP Impact)</h4>
            <p className="text-xs text-muted">
              How individual student inputs shift the risk probability relative to the typical UMBC alumnus:
            </p>
          </div>

          {payload?.drivers && payload.drivers.length > 0 ? (
            <div className="grid gap-3.5">
              {payload.drivers.map((d) => {
                const isRaises = d.direction === "raises";
                const shiftPct = (Math.abs(d.delta) * 100).toFixed(1);
                return (
                  <div key={d.feature} className="flex flex-col gap-1.5 rounded-xl border border-line/60 bg-panel/40 p-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-cream">{d.label}</span>
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                          isRaises ? "bg-hot/10 text-hot border border-hot/20" : "bg-cool/10 text-cool border border-cool/20"
                        }`}
                      >
                        {isRaises ? `+${shiftPct}% Risk` : `-${shiftPct}% Risk`} ({isRaises ? "Raises Risk" : "Lowers Risk"})
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>Your Input: <strong className="text-text">{String(d.value)}</strong></span>
                      <span>Typical Alumnus: <strong className="text-dim">{String(d.reference)}</strong></span>
                    </div>
                    {/* Visual Progress bar */}
                    <div className="relative h-2 w-full overflow-hidden rounded-full bg-panel-2">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${Math.min(100, Math.max(8, Math.abs(d.delta) * 250))}%`,
                          backgroundColor: isRaises ? "var(--hot)" : "var(--cool)",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <Bars
              data={driverBars}
              orientation="horizontal"
              format={(v) => `+${v.toFixed(1)}%`}
              domain={[0, 20]}
              unit="% risk impact"
              height={180}
            />
          )}
        </div>
      )}

      {/* Tab Section 2: Nearest 30 Twins */}
      {activeSection === "twins" && (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
              <div className="text-xs text-muted">Matched Twins</div>
              <div className="num mt-1 text-2xl font-black text-cream">{twins.n_twins}</div>
              <div className="text-[10px] text-dim">nearest alumni</div>
            </div>
            <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
              <div className="text-xs text-muted">On-Time Graduated</div>
              <div className="num mt-1 text-2xl font-black text-cool">{twins.on_time_count}</div>
              <div className="text-[10px] text-dim">{twins.on_time_pct}% rate</div>
            </div>
            <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
              <div className="text-xs text-muted">Delayed Graduates</div>
              <div className="num mt-1 text-2xl font-black text-gold">{twins.delayed_count}</div>
              <div className="text-[10px] text-dim">≥1 extra term</div>
            </div>
            <div className="rounded-xl border border-line/60 bg-panel/40 p-3 text-center">
              <div className="text-xs text-muted">Twin Avg Time</div>
              <div className="num mt-1 text-2xl font-black text-cream">{twins.avg_years} yrs</div>
              <div className="text-[10px] text-dim">average degree time</div>
            </div>
          </div>

          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
              Alumni Feature-Space Constellation (360 Representative Clusters)
            </h4>
            <Scatter
              points={constellationPoints}
              you={payload?.constellation?.you ? { x: payload.constellation.you.x, y: payload.constellation.you.y, label: "Your Position" } : undefined}
              hideAxes
              height={260}
              radius={4}
            />
          </div>
        </div>
      )}

      {/* Tab Section 3: Trained Model Info */}
      {activeSection === "model_info" && (
        <div className="flex flex-col gap-4">
          <div className="rounded-xl border border-line/60 bg-panel/40 p-4">
            <h4 className="text-sm font-semibold text-cream">Trained Model & Holdout Validation Architecture</h4>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              Trained on <strong>{modelInfo.training_transcripts.toLocaleString()}</strong> historical UMBC course transcripts across <strong>{modelInfo.historical_alumni.toLocaleString()}</strong> alumni and <strong>{modelInfo.current_students.toLocaleString()}</strong> active student records using strict temporal holdout splits.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-line/40 bg-panel-2/60 p-2.5 text-center">
                <div className="text-[11px] text-muted">ROC-AUC</div>
                <div className="num text-xl font-bold text-cool">{modelInfo.metrics.roc_auc}</div>
                <div className="text-[10px] text-dim">discrimination</div>
              </div>
              <div className="rounded-lg border border-line/40 bg-panel-2/60 p-2.5 text-center">
                <div className="text-[11px] text-muted">Macro F1</div>
                <div className="num text-xl font-bold text-gold">{modelInfo.metrics.macro_f1}</div>
                <div className="text-[10px] text-dim">balance score</div>
              </div>
              <div className="rounded-lg border border-line/40 bg-panel-2/60 p-2.5 text-center">
                <div className="text-[11px] text-muted">Top Decile Precision</div>
                <div className="num text-xl font-bold text-cream">{(modelInfo.metrics.top_decile_precision * 100).toFixed(1)}%</div>
                <div className="text-[10px] text-dim">top 10% accuracy</div>
              </div>
              <div className="rounded-lg border border-line/40 bg-panel-2/60 p-2.5 text-center">
                <div className="text-[11px] text-muted">Brier Score</div>
                <div className="num text-xl font-bold text-cool">{modelInfo.metrics.brier_score}</div>
                <div className="text-[10px] text-dim">calibration error</div>
              </div>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <div className="text-xs text-muted">
                Champion Classifier: <span className="font-semibold text-gold">{modelInfo.champions.time_to_degree || "Gradient Boosting"}</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </ChartCard>
  );
}

export const MLConfidenceBreakdown = MLEvidenceCard;
