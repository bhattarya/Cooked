"use client";

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { int } from "./format";
import s from "./viz.module.css";

export interface ChartCardProps {
  title: string;
  /** Small gold label above the title ("Model 02", "Scene 4"). */
  eyebrow?: string;
  /** The one-line "so what": the takeaway, not a description of the chart. */
  takeaway?: ReactNode;
  /** Legend slot, rendered under the chart. */
  legend?: ReactNode;
  /** Controls in the header's right corner (a sort toggle, a chip). */
  actions?: ReactNode;
  /** Content of the "how to read this" popover. Omit for no help button. */
  howToRead?: ReactNode;
  /** Sample size, printed in the footer as `n=…`. */
  n?: number | string;
  /** Where the numbers come from ("Synthetic hackumbc-2026 dataset"). */
  source?: string;
  /** Standing caveat, e.g. "Associational, not causal. Nominal dollars." */
  disclaimer?: string;
  /** "loading" shows a shimmer, "empty" and "error" show an honest message instead of the chart. */
  state?: "ready" | "loading" | "empty" | "error";
  /** Message for the empty/error state. */
  stateMessage?: string;
  /** Keep the previous chart on screen at reduced opacity while data refetches (no skeleton flash). */
  refetching?: boolean;
  /** Extra footer content (evidence ids, links). */
  footer?: ReactNode;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const DEFAULT_MESSAGE = { empty: "Not enough data to draw this yet.", error: "The data for this chart could not be loaded." } as const;

/** Frame for a chart: title, takeaway, legend slot, "how to read" popover and an honest footer. */
export function ChartCard({ title, eyebrow, takeaway, legend, actions, howToRead, n, source, disclaimer, state = "ready", stateMessage, refetching = false, footer, className, style, children }: ChartCardProps) {
  const titleId = useId();
  const helpId = useId();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      const t = e.target as Node;
      if (!pop.current?.contains(t) && !btn.current?.contains(t)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        btn.current?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const hasFoot = n !== undefined || source || disclaimer || footer;
  return (
    <section className={`${s.card}${className ? ` ${className}` : ""}`} style={style} aria-labelledby={titleId}>
      <header className={s.cardHead}>
        <div style={{ minWidth: 0 }}>
          {eyebrow && <div className={s.eyebrow}>{eyebrow}</div>}
          <h3 id={titleId} className={s.cardTitle}>
            {title}
          </h3>
          {takeaway && <p className={s.takeaway}>{takeaway}</p>}
        </div>
        {(actions || howToRead) && (
          <div className={s.cardActions} style={{ position: "relative" }}>
            {actions}
            {howToRead && (
              <>
                <button ref={btn} type="button" className={s.helpBtn} aria-expanded={open} aria-controls={helpId} aria-label={`How to read: ${title}`} onClick={() => setOpen((o) => !o)}>
                  ?
                </button>
                {open && (
                  <div ref={pop} id={helpId} role="note" className={s.pop2}>
                    <h4>How to read this</h4>
                    {howToRead}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </header>
      <div className={s.cardBody} data-dim={refetching ? "1" : "0"} aria-busy={state === "loading" || refetching}>
        {state === "ready" && children}
        {state === "loading" && <div className={s.skeleton} role="status" aria-label="Loading chart" />}
        {(state === "empty" || state === "error") && (
          <div className={s.state} data-kind={state} role={state === "error" ? "alert" : "status"}>
            {stateMessage ?? DEFAULT_MESSAGE[state]}
          </div>
        )}
      </div>
      {legend && <div className={s.cardLegend}>{legend}</div>}
      {hasFoot && (
        <footer className={s.cardFoot}>
          {n !== undefined && <span className={s.nChip}>n={typeof n === "number" ? int(n) : n}</span>}
          {source && <span>{source}</span>}
          {disclaimer && <span className={s.footNote}>{disclaimer}</span>}
          {footer}
        </footer>
      )}
    </section>
  );
}
