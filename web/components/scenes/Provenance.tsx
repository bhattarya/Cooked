import type { ReactNode } from "react";

type Tone = "dim" | "gold" | "cool" | "hot";
const TONE: Record<Tone, string> = {
  dim: "border-line text-dim",
  gold: "border-gold/40 text-gold",
  cool: "border-cool/40 text-cool",
  hot: "border-hot/40 text-hot",
};

/** A small mono chip for the receipts under a headline: sample size, evidence id, source, caveat. */
export function Chip({ children, tone = "dim", title }: { children: ReactNode; tone?: Tone; title?: string }) {
  return (
    <span title={title} className={`num inline-flex items-center gap-1.5 rounded-sm border px-2.5 py-1 text-[11px] ${TONE[tone]}`}>
      {children}
    </span>
  );
}

/** Evidence chips for one result. Every number on a scene should be traceable to one of these. */
export function Provenance({ n, tr, source, synthetic = true }: { n?: number; tr?: string; source?: string; synthetic?: boolean }) {
  return (
    <>
      {n !== undefined && <Chip title="sample size behind this result">n={n.toLocaleString()}</Chip>}
      {tr && <Chip tone="gold" title="tool result id: the stored evidence for this number">↳ {tr}</Chip>}
      {source && <Chip>{source}</Chip>}
      {synthetic && <Chip title="HackUMBC 2026 dataset: synthetic, not real students">synthetic data</Chip>}
    </>
  );
}
