"use client";

import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useChartSize, useInView, useIsoLayoutEffect, usePrefersReducedMotion } from "./hooks";
import s from "./viz.module.css";

/* --------------------------------- tooltip --------------------------------- */

export interface TipRow {
  label: string;
  /** The exact value. It leads the row: the reader already has the series and wants the number. */
  value: string;
  /** Series colour, drawn as a short key beside the value (never used to colour text). */
  color?: string;
  swatch?: "line" | "dot" | "box";
  strong?: boolean;
}
export interface TipContent {
  title?: string;
  rows: TipRow[];
  /** Small dim line, typically `n=1,234` or a caveat. */
  note?: string;
}
interface TipState {
  x: number;
  y: number;
  content: TipContent;
}

function createTipStore() {
  let state: TipState | null = null;
  let announce = "";
  const subs = new Set<() => void>();
  const emit = () => subs.forEach((f) => f());
  return {
    getTip: () => state,
    getAnnounce: () => announce,
    subscribe: (cb: () => void) => {
      subs.add(cb);
      return () => {
        subs.delete(cb);
      };
    },
    show(x: number, y: number, content: TipContent, say?: boolean) {
      state = { x, y, content };
      if (say) announce = describeTip(content);
      emit();
    },
    hide() {
      if (state === null) return;
      state = null;
      emit();
    },
  };
}
type TipStore = ReturnType<typeof createTipStore>;

export const describeTip = (c: TipContent): string => [c.title, c.rows.map((r) => `${r.label} ${r.value}`).join(", "), c.note].filter(Boolean).join(". ");

function TooltipLayer({ store }: { store: TipStore }) {
  const st = useSyncExternalStore(store.subscribe, store.getTip, () => null);
  const ref = useRef<HTMLDivElement>(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || !st) return;
    const fresh = !el.dataset.placed;
    if (fresh) el.style.transition = "none";
    const parent = el.offsetParent as HTMLElement | null;
    const W = parent?.clientWidth ?? 1e4;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    let x = st.x + 14;
    if (x + w > W - 2) x = st.x - w - 14;
    x = Math.max(2, Math.min(x, W - w - 2));
    let y = st.y - h - 12;
    if (y < -h * 0.4) y = st.y + 18;
    el.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
    if (fresh) {
      el.dataset.placed = "1";
      requestAnimationFrame(() => {
        el.style.transition = "";
      });
    }
  }, [st]);
  if (!st) return null;
  const { content: c } = st;
  return (
    <div ref={ref} className={s.tip} aria-hidden="true">
      {c.title && <div className={s.tipTitle}>{c.title}</div>}
      {c.rows.map((r, i) => (
        <div key={i} className={s.tipRow}>
          <span className={s.tipKey} data-shape={r.color ? (r.swatch ?? "line") : "none"} style={{ ["--k" as string]: r.color ?? "var(--muted)" }} />
          <span className={s.tipVal} style={r.strong ? { color: "var(--cream)" } : undefined}>
            {r.value}
          </span>
          <span className={s.tipLab}>{r.label}</span>
        </div>
      ))}
      {c.note && <div className={s.tipNote}>{c.note}</div>}
    </div>
  );
}

function LiveRegion({ store }: { store: TipStore }) {
  const text = useSyncExternalStore(store.subscribe, store.getAnnounce, () => "");
  return (
    <div className={s.sr} aria-live="polite" aria-atomic="true">
      {text}
    </div>
  );
}

/* ---------------------------------- shell ---------------------------------- */

export interface KeyHandlers {
  /** Return true when the key was handled (the default action is then prevented). */
  onKey: (e: KeyboardEvent<HTMLElement>) => boolean | void;
  onFocus?: () => void;
  onBlur?: () => void;
}

export interface ChartCtx {
  width: number;
  height: number;
  inView: boolean;
  reduced: boolean;
  /** Unique id, safe inside `url(#…)`. */
  uid: string;
  show: (x: number, y: number, content: TipContent, opts?: { announce?: boolean }) => void;
  hide: () => void;
  setKeys: (h: KeyHandlers | null) => void;
}
const Ctx = createContext<ChartCtx | null>(null);

export function useChart(): ChartCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error("useChart must be used inside <ChartShell>");
  return c;
}

/** Register keyboard handlers for the chart root (which is the single tab stop). */
export function useChartKeys(h: KeyHandlers): void {
  const { setKeys } = useChart();
  useEffect(() => {
    setKeys(h);
    return () => setKeys(null);
  });
}

export interface TableSpec {
  caption: string;
  head: string[];
  rows: (string | number)[][];
}

export interface ChartShellProps {
  /** Pixel height, "fill" (parent height), or a function of the measured width. */
  height?: number | "fill" | ((width: number) => number);
  /** One-sentence takeaway for assistive tech: what the chart says, not what it is. */
  label: string;
  /** Visually-hidden data table: the WCAG-clean twin of the chart. */
  table?: TableSpec;
  /** Rendered outside the plot. A function receives the measured plot width (to adapt to narrow layouts). */
  legend?: ReactNode | ((width: number) => ReactNode);
  legendPosition?: "top" | "bottom";
  /** Whether the chart root is a keyboard stop with arrow-key inspection. */
  interactive?: boolean;
  /** True when there is nothing to plot: shows a quiet "No data" note instead of the chart. */
  empty?: boolean;
  hint?: string;
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}

const MAX_TABLE_ROWS = 200;

export function ChartShell({ height = 240, label, table, legend, legendPosition = "bottom", interactive = true, empty = false, hint = "Use the arrow keys to inspect values, Escape to dismiss.", className, style, children }: ChartShellProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [plotRef, size] = useChartSize<HTMLDivElement>(height);
  const inView = useInView(rootRef);
  const live = useInView(rootRef, { once: false, margin: "0px" });
  const reduced = usePrefersReducedMotion();
  const [store] = useState(createTipStore);
  const keys = useRef<KeyHandlers | null>(null);
  const hintId = useId();
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  // a tooltip opened by touch has no pointer-leave: dismiss it when the next tap lands outside the plot
  useEffect(() => {
    const away = (e: PointerEvent) => {
      if (!plotRef.current?.contains(e.target as Node)) store.hide();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [plotRef, store]);

  const show = useCallback<ChartCtx["show"]>((x, y, c, o) => store.show(x, y, c, o?.announce), [store]);
  const hide = useCallback(() => store.hide(), [store]);
  const setKeys = useCallback((h: KeyHandlers | null) => {
    keys.current = h;
  }, []);

  const ctx = useMemo<ChartCtx>(
    () => ({ width: size.width, height: size.height, inView, reduced, uid, show, hide, setKeys }),
    [size.width, size.height, inView, reduced, uid, show, hide, setKeys],
  );

  const legendNode = typeof legend === "function" ? legend(size.width) : legend;
  const plotStyle: CSSProperties = height === "fill" ? { height: "100%" } : { height: size.height };

  return (
    <div
      ref={rootRef}
      className={`${s.root}${className ? ` ${className}` : ""}`}
      style={style}
      role="group"
      aria-label={label}
      aria-roledescription="chart"
      aria-describedby={interactive ? hintId : undefined}
      tabIndex={interactive ? 0 : undefined}
      data-live={live ? "1" : "0"}
      onKeyDown={(e) => {
        if (e.target !== e.currentTarget) return;
        if (e.key === "Escape") hide();
        if (keys.current?.onKey(e)) e.preventDefault();
      }}
      onFocus={(e) => {
        if (e.target === e.currentTarget && e.currentTarget.matches(":focus-visible")) keys.current?.onFocus?.();
      }}
      onBlur={(e) => {
        if (e.target !== e.currentTarget) return;
        hide();
        keys.current?.onBlur?.();
      }}
    >
      {legendPosition === "top" && legendNode}
      <div ref={plotRef} className={s.plot} style={plotStyle}>
        {empty ? <div className={s.emptyNote}>No data to plot.</div> : size.width > 0 && <Ctx.Provider value={ctx}>{children}</Ctx.Provider>}
        <TooltipLayer store={store} />
      </div>
      {legendPosition === "bottom" && legendNode}
      {table && (
        // the wrapper clips the table: a table ignores a 1px width and would otherwise widen the page
        <div className={s.sr}>
          <table>
            <caption>{table.caption}</caption>
            <thead>
              <tr>
                {table.head.map((h, i) => (
                  <th key={i} scope="col">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.slice(0, MAX_TABLE_ROWS).map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) =>
                    j === 0 ? (
                      <th key={j} scope="row">
                        {c}
                      </th>
                    ) : (
                      <td key={j}>{c}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {interactive && (
        <span id={hintId} className={s.sr}>
          {hint}
        </span>
      )}
      <LiveRegion store={store} />
    </div>
  );
}
