"use client";

import type { CSSProperties } from "react";
import s from "./viz.module.css";

export interface LegendItem {
  key: string;
  label: string;
  color: string;
  /** Secondary text after the label, e.g. a count or share. */
  value?: string;
  /** Mirrors the mark: box for bars/areas, line for lines, dot for points. */
  swatch?: "box" | "line" | "dot" | "dash";
  hidden?: boolean;
}

export interface LegendProps {
  items: LegendItem[];
  /** Makes items toggle buttons (aria-pressed). */
  onToggle?: (key: string) => void;
  /** Fires on hover/focus of an item with its key, and null on leave (spotlight the series). */
  onHover?: (key: string | null) => void;
  className?: string;
  style?: CSSProperties;
}

/** One legend for every chart. Static when no handlers are given; toggle buttons otherwise. */
export function Legend({ items, onToggle, onHover, className, style }: LegendProps) {
  return (
    <ul className={`${s.legend}${className ? ` ${className}` : ""}`} style={style} aria-label="Legend">
      {items.map((it) => {
        const inner = (
          <>
            <span className={s.legendKey} data-shape={it.swatch ?? "dot"} style={{ ["--k" as string]: it.color }} />
            <span className={s.legendLab}>{it.label}</span>
            {it.value && <span className={s.legendVal}>{it.value}</span>}
          </>
        );
        return (
          <li key={it.key}>
            {onToggle ? (
              <button
                type="button"
                className={s.legendItem}
                aria-pressed={!it.hidden}
                onClick={() => onToggle(it.key)}
                onPointerEnter={() => onHover?.(it.key)}
                onPointerLeave={() => onHover?.(null)}
                onFocus={() => onHover?.(it.key)}
                onBlur={() => onHover?.(null)}
              >
                {inner}
              </button>
            ) : (
              <span className={s.legendItem} onPointerEnter={() => onHover?.(it.key)} onPointerLeave={() => onHover?.(null)}>
                {inner}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
