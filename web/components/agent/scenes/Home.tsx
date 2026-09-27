"use client";

import { useEffect, useRef, useState, type DragEvent } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { Dataset } from "@/lib/types";
import type { SponsorLive } from "../Sponsors";

export interface AuditPreset {
  id: string;
  key: string;
  label: string;
  degree: string;
  level: string;
  workHours: number;
  description: string;
  badge: string;
  courses: string[];
}

const PRESETS: AuditPreset[] = [
  {
    id: "CID-510094",
    key: "cs_senior",
    label: "UMBC CS Senior",
    degree: "Computer Science BS",
    level: "Senior (8th Term)",
    workHours: 22,
    description: "CMSC 341, 411, 421 complete. Working 22 hrs/wk while taking 400-level core electives.",
    badge: "CS Senior",
    courses: ["CMSC 341", "CMSC 411", "CMSC 421", "MATH 221"],
  },
  {
    id: "CID-137153",
    key: "is_junior",
    label: "UMBC IS Junior",
    degree: "Information Systems BS",
    level: "Junior (5th Term)",
    workHours: 30,
    description: "IS 300, 310, 410 complete. Light 12-credit load paired with a heavy 30 hr/wk job.",
    badge: "IS Junior",
    courses: ["IS 300", "IS 310", "IS 410", "MGMT 210"],
  },
  {
    id: "CID-104853",
    key: "ds_major",
    label: "UMBC Data Science Major",
    degree: "Data Science Track",
    level: "Junior (6th Term)",
    workHours: 10,
    description: "CMSC 201, MATH 221, STAT 355 complete. Full 15-credit schedule on track for on-time graduation.",
    badge: "Data Science",
    courses: ["CMSC 201", "STAT 355", "MATH 221", "DATA 401"],
  },
  {
    id: "CID-510094",
    key: "bio_premed",
    label: "UMBC Bio / Pre-Med",
    degree: "Biological Sciences BS",
    level: "Senior (7th Term)",
    workHours: 15,
    description: "BIOL 302, CHEM 351, 352 labs complete. Heavy lab sequence paired with clinical volunteering.",
    badge: "Bio Pre-Med",
    courses: ["BIOL 302", "CHEM 351", "PHYS 122", "MATH 151"],
  },
];

const SAMPLE_AUDIT_TEXT = `UMBC DEGREE AUDIT REPORT - CONFIDENTIAL
Student ID: 510094
Major: Computer Science (BS) | Catalog Year: 2023-2024
Degree Status: In Progress | Cumulative GPA: 3.42

--- COMPLETED COURSES ---
CMSC 201 - Computer Science I (4.0 cr) - Grade: A
CMSC 202 - Computer Science II (4.0 cr) - Grade: A
CMSC 203 - Discrete Structures (3.0 cr) - Grade: B
CMSC 313 - Assembly Lang & Comp Org (3.0 cr) - Grade: B
CMSC 331 - Principles of Programming Languages (3.0 cr) - Grade: A
CMSC 341 - Data Structures (3.0 cr) - Grade: B
MATH 151 - Calculus and Analytic Geometry I (4.0 cr) - Grade: A
MATH 152 - Calculus and Analytic Geometry II (4.0 cr) - Grade: B
MATH 221 - Introduction to Linear Algebra (3.0 cr) - Grade: A
STAT 355 - Applied Statistics for Scientists (3.0 cr) - Grade: B

--- IN PROGRESS (FALL 2026) ---
CMSC 411 - Computer Architecture (3.0 cr)
CMSC 421 - Operating Systems (3.0 cr)
CMSC 441 - Design and Analysis of Algorithms (3.0 cr)

Attempted Credits: 88 | Earned Credits: 79 | Required Credits: 120
Work Hours per Week: 22`;

export function Home({
  ds: _ds,
  live: _live,
  name: _name,
  error,
  hasJourney,
  onFile,
  onSample,
  onGreet: _onGreet,
  onResume,
}: {
  ds: Dataset | null;
  live: SponsorLive;
  name: string | null;
  error: string | null;
  hasJourney: boolean;
  onFile: (f: File) => void;
  onSample: (id: string) => void;
  onGreet: () => void;
  onResume: () => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"presets" | "upload" | "paste">("presets");
  const [over, setOver] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [pastedText, setPastedText] = useState("");

  useEffect(() => {
    if (error) setLoadingFile(false);
  }, [error]);

  const choose = (file?: File) => {
    if (!file) return;
    setLoadingFile(true);
    onFile(file);
  };

  const drop = (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    choose(e.dataTransfer.files[0]);
  };

  const handlePasteSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedText.trim()) return;
    setLoadingFile(true);
    const file = new File([pastedText.trim()], "pasted-audit.txt", { type: "text/plain" });
    onFile(file);
  };

  const fillSampleText = () => {
    setPastedText(SAMPLE_AUDIT_TEXT);
  };

  return (
    <section className="flex h-full overflow-y-auto px-4 py-6 sm:px-8 lg:px-12">
      <div className="m-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(380px,480px)] lg:items-center lg:gap-12">
        {/* Left Column: Platform Branding & Voice Shortcuts */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-semibold text-gold">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75"></span>
              <span className="relative inline-flex h-2 w-2 rounded-full bg-gold"></span>
            </span>
            Student Intelligence Platform
          </div>

          <h1 className="display mt-4 text-4xl font-extrabold tracking-tight text-cream sm:text-5xl lg:text-6xl">
            Know where your <span className="text-gold-grad">degree</span> stands.
          </h1>

          <p className="mt-4 max-w-xl text-base leading-relaxed text-muted">
            Drop your audit, pick a sample student, or just ask COOKED. Every answer is read from trained models and real alumni records, not a guess.
          </p>

          {hasJourney && (
            <div className="mt-8 flex items-center gap-4">
              <button
                type="button"
                onClick={onResume}
                className="inline-flex items-center gap-2 rounded-xl bg-gold px-5 py-3 text-sm font-bold text-bg transition hover:bg-gold-hi shadow-lg shadow-gold/10"
              >
                Resume Current Audit Plan →
              </button>
            </div>
          )}
        </div>

        {/* Right Column: Intake Panel with Tabs */}
        <div className="flex flex-col rounded-2xl border border-line-2 bg-panel/90 p-5 backdrop-blur-xl shadow-2xl sm:p-7">
          {/* Intake Tabs */}
          <div className="flex rounded-xl bg-bg-2 p-1 border border-line">
            <button
              type="button"
              onClick={() => setTab("presets")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                tab === "presets" ? "bg-gold text-bg shadow" : "text-muted hover:text-text"
              }`}
            >
              1-Click Presets
            </button>
            <button
              type="button"
              onClick={() => setTab("upload")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                tab === "upload" ? "bg-gold text-bg shadow" : "text-muted hover:text-text"
              }`}
            >
              Upload File
            </button>
            <button
              type="button"
              onClick={() => setTab("paste")}
              className={`flex-1 rounded-lg py-2 text-xs font-semibold transition ${
                tab === "paste" ? "bg-gold text-bg shadow" : "text-muted hover:text-text"
              }`}
            >
              Paste Text
            </button>
          </div>

          <div className="mt-5 min-h-[320px] flex flex-col">
            <AnimatePresence mode="wait">
              {/* Tab 1: 1-Click Degree Audit Presets */}
              {tab === "presets" && (
                <motion.div
                  key="presets"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col gap-3 flex-1"
                >
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-bold text-text">Select a Degree Audit Preset</h2>
                    <span className="text-[11px] text-muted">Synthetic Student Profiles</span>
                  </div>

                  <div className="grid gap-2.5 sm:grid-cols-2 flex-1">
                    {PRESETS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        disabled={loadingFile}
                        onClick={() => {
                          setLoadingFile(true);
                          onSample(p.id);
                        }}
                        className="group relative flex flex-col justify-between rounded-xl border border-line-2 bg-bg-2/80 p-3.5 text-left transition-all hover:border-gold/60 hover:bg-gold/[0.04] focus-visible:ring-2 focus-visible:ring-gold"
                      >
                        <div>
                          <div className="flex items-center justify-between gap-1.5">
                            <span className="font-semibold text-cream text-sm group-hover:text-gold transition">
                              {p.label}
                            </span>
                            <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-medium text-gold shrink-0">
                              {p.badge}
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted line-clamp-2">{p.description}</p>
                        </div>
                        <div className="mt-3 flex items-center justify-between border-t border-line/50 pt-2 text-[10px] text-dim">
                          <span>{p.level}</span>
                          <span className="font-semibold text-gold opacity-0 group-hover:opacity-100 transition">
                            Load Preset →
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )}

              {/* Tab 2: File Drag & Drop */}
              {tab === "upload" && (
                <motion.div
                  key="upload"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col flex-1"
                >
                  <div
                    className={`flex flex-1 flex-col items-center justify-center rounded-xl border-2 border-dashed p-6 text-center transition-all ${
                      over ? "border-gold bg-gold/10" : "border-line-2 bg-bg-2/40 hover:border-gold/40"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setOver(true);
                    }}
                    onDragLeave={() => setOver(false)}
                    onDrop={drop}
                  >
                    <div className="grid size-12 place-items-center rounded-2xl border border-gold/30 bg-gold/10 text-gold mb-3">
                      <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.8">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                      </svg>
                    </div>

                    <h2 className="text-lg font-bold text-text">Drag & Drop Degree Audit</h2>
                    <p className="mt-1.5 max-w-xs text-xs text-muted leading-relaxed">
                      Accepts PDF, TXT, PNG, JPG, or WEBP up to 8 MB. Completed and in-progress courses are parsed automatically.
                    </p>

                    <input
                      ref={input}
                      type="file"
                      accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
                      className="sr-only"
                      aria-label="Upload degree audit file"
                      onChange={(e) => {
                        choose(e.target.files?.[0]);
                        e.target.value = "";
                      }}
                    />

                    <button
                      type="button"
                      disabled={loadingFile}
                      onClick={() => input.current?.click()}
                      className="mt-5 w-full rounded-xl bg-gold px-4 py-3 text-xs font-bold text-bg transition hover:bg-gold-hi disabled:opacity-60 shadow"
                    >
                      {loadingFile ? "Reading Degree Audit…" : over ? "Drop File Here" : "Choose Audit File"}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* Tab 3: Paste Audit Text */}
              {tab === "paste" && (
                <motion.div
                  key="paste"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                  className="flex flex-col flex-1"
                >
                  <form onSubmit={handlePasteSubmit} className="flex flex-col flex-1 gap-3">
                    <div className="flex items-center justify-between">
                      <label htmlFor="audit-text-input" className="text-xs font-bold text-text">
                        Direct Paste Audit Text
                      </label>
                      <button
                        type="button"
                        onClick={fillSampleText}
                        className="text-[11px] font-medium text-gold hover:underline"
                      >
                        Fill Sample Text
                      </button>
                    </div>

                    <textarea
                      id="audit-text-input"
                      value={pastedText}
                      onChange={(e) => setPastedText(e.target.value)}
                      placeholder="Paste your degree audit transcript or text here (e.g. CMSC 201 A, CMSC 341 B, MATH 151)..."
                      className="h-36 w-full resize-none rounded-xl border border-line-2 bg-bg-2 p-3 font-mono text-xs text-text outline-none focus:border-gold/60 placeholder:text-dim"
                    />

                    <button
                      type="submit"
                      disabled={loadingFile || !pastedText.trim()}
                      className="mt-auto w-full rounded-xl bg-gold px-4 py-3 text-xs font-bold text-bg transition hover:bg-gold-hi disabled:opacity-50 shadow"
                    >
                      {loadingFile ? "Analyzing Audit Text…" : "Import & Parse Audit Text →"}
                    </button>
                  </form>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Error Notification */}
            {error && (
              <div role="alert" className="mt-4 rounded-xl border border-hot/30 bg-hot/10 p-3.5 text-xs text-hot">
                <p className="font-semibold">{error}</p>
                <p className="mt-1 text-muted text-[11px]">
                  Try uploading another file, pasting text directly, or selecting one of our 1-click presets above.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
