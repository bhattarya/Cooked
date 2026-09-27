"use client";

import type { OrbState } from "thinking-orbs";
import { GoldOrb } from "./GoldOrb";
import styles from "./theatre.module.css";

// A small inline status pill for answer-loading moments ("Agent listening…"), built on the 20px orb.
export function ThinkingChip({ state, label, className = "" }: { state: OrbState; label: string; className?: string }) {
  return (
    <span role="status" className={`inline-flex items-center gap-2 rounded-full border border-gold/25 bg-panel/70 py-1 pl-1.5 pr-3.5 text-[12.5px] ${className}`} style={{ boxShadow: "0 0 26px rgba(246,180,26,0.1)" }}>
      <span aria-hidden className="flex">
        <GoldOrb state={state} size={20} glow={false} />
      </span>
      <span className={styles.shimmer}>{label}</span>
    </span>
  );
}
