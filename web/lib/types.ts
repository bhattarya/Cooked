// [credits attempted, credits earned, withdrawals, fails, repeats] for one regular term.
export type Term = [number, number, number, number, number];

export type PatternName = "smooth" | "part-time grind" | "rough patch" | "withdrawal spiral" | "stop-out";

export interface Alum {
  id: string;
  major: string;
  track: string;
  entry: "F" | "T";
  res: "I" | "O";
  work: number;
  ttd: number;
  gy: number;
  dest: string;
  sal: number | null;
  cost: number | null;
  intern: number;
  gpa: number | null;
  gaps: number;
  cooked: boolean;
  terms: Term[];
  pattern: PatternName;
}

export interface Student {
  id: string;
  major: string;
  track: string;
  entry: "F" | "T";
  res: "I" | "O";
  work: number;
  cls: string;
  intensity: string;
  firstGen: boolean;
  gpa: number | null;
  credEarned: number;
  credReq: number;
  intern: number;
  entryTerm: string;
  firstTerm: string | null;
  expGrad: string;
  gaps: number;
  terms: Term[];
  ip: string[];
  done: string[];
  pattern: PatternName | null;
}

export interface Course {
  id: string;
  subject: string;
  title: string;
  credits: number;
  level: string;
  type: string;
  majors: string[];
  pre: string[][];
  offered: string[];
  difficulty: number;
  gates: number;
}

export interface PatternStat {
  name: PatternName;
  n: number;
  share: number;
  avgCredits: number;
  lowShare: number;
  wPerTerm: number;
  repPerTerm: number;
  ttd: number;
  work: number;
  cookedRate: number;
  salary: number | null;
  stillSeeking: number | null;
}

export interface CliffBin {
  label: string;
  lo: number;
  hi: number;
  n: number;
  cooked: number | null;
}

export interface Meta {
  generatedAt: string;
  counts: { alumni: number; current: number; transcripts: number; catalog: number };
  baseRate: number;
  patterns: PatternStat[];
  shocks: {
    bands: string[];
    withdraw: number[];
    lighterLoad: number[];
    internEndedEarly: number;
    internOfferDeclined: number;
    seekingByIntern: { internships: number; n: number; rate: number }[];
  };
  cliff: { heavy: CliffBin[]; all: CliffBin[]; light: CliffBin[] };
  demo: { grind: string[]; spiral: string[]; smooth: string[] };
}

export interface Dataset {
  alumni: Alum[];
  current: Student[];
  catalog: Course[];
  meta: Meta;
}
