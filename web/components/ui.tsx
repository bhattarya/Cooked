"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useState, type ReactNode } from "react";
import type { Status } from "@/lib/engine";
import type { PatternName } from "@/lib/types";

export const PATTERN_COLOR: Record<PatternName, string> = {
  smooth: "#5b6b8c",
  "part-time grind": "#ff5a1f",
  "rough patch": "#ffb020",
  "withdrawal spiral": "#ff2e4d",
  "stop-out": "#a78bfa",
};

export const STATUS: Record<Status, { label: string; color: string; bg: string }> = {
  fine: { label: "Fine", color: "#2dd4bf", bg: "rgba(45,212,191,0.1)" },
  watch: { label: "Watch", color: "#ffb020", bg: "rgba(255,176,32,0.1)" },
  cooked: { label: "Cooked", color: "#ff2e4d", bg: "rgba(255,46,77,0.12)" },
  unknown: { label: "Not enough evidence", color: "#8b90a0", bg: "rgba(139,144,160,0.1)" },
};

export const riskColor = (r: number) => (r >= 0.5 ? "#ff2e4d" : r >= 0.2 ? "#ffb020" : "#2dd4bf");

export function Logo({ size = 18 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden>
        <path
          d="M12 2c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 .8-3.3 2-4.5.2 1.6 1 2.6 2 3 0-3.2-.6-5.6 1-8.5Z"
          fill="var(--heat)"
        />
        <path d="M12 14.5c.6 1.3 2 2 2 3.5a2 2 0 0 1-4 0c0-1 .6-1.7 1.2-2.3.2.6.5 1 .8 1.1 0-.8-.3-1.5 0-2.3Z" fill="#ffd166" />
      </svg>
      <span className="display font-semibold tracking-[0.18em]" style={{ fontSize: size * 0.8 }}>
        COOKED
      </span>
    </span>
  );
}

export function Nav() {
  const path = usePathname();
  const items = [
    { href: "/", label: "Students" },
    { href: "/lab", label: "Plan lab" },
    { href: "/queue", label: "Queue" },
    { href: "/myths", label: "Myths" },
  ];
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between px-4 sm:px-6">
        <Link href="/">
          <Logo />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {items.map((it) => {
            const on = it.href === "/" ? path === "/" || path.startsWith("/s/") : path.startsWith(it.href);
            return (
              <Link key={it.href} href={it.href} className="relative rounded-full px-3 py-1.5 text-muted transition hover:text-text">
                {on && (
                  <motion.span
                    layoutId="nav-pill"
                    className="absolute inset-0 rounded-full bg-white/[0.06] ring-1 ring-line-2"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                <span className={`relative ${on ? "text-text" : ""}`}>{it.label}</span>
              </Link>
            );
          })}
        </nav>
        <span className="hidden items-center gap-2 rounded-full border border-line px-2.5 py-1 text-[11px] text-muted sm:inline-flex">
          <ApiStatus />
          Synthetic data · not real students
        </span>
      </div>
    </header>
  );
}

type Api = "checking" | "ok" | "degraded" | "offline";
const API_LABEL: Record<Api, string> = {
  checking: "Checking API…",
  ok: "API connected (DB + cache OK)",
  degraded: "API up, but the DB or cache isn't ready",
  offline: "API unreachable: running on the local engine",
};

// Pings the FastAPI /healthz (the check the Phase 1 placeholder page did). A 200 only means
// the DB and voice cache are reachable, not that models are ready.
function ApiStatus() {
  const [s, setS] = useState<Api>("checking");
  useEffect(() => {
    const base = process.env.NEXT_PUBLIC_API_URL;
    if (!base) {
      const id = setTimeout(() => setS("offline"), 0);
      return () => clearTimeout(id);
    }
    let live = true;
    fetch(`${base.replace(/\/$/, "")}/healthz`, { cache: "no-store", signal: AbortSignal.timeout(8000) })
      .then((r) => live && setS(r.ok ? "ok" : "degraded"))
      .catch(() => live && setS("offline"));
    return () => {
      live = false;
    };
  }, []);
  const color = s === "ok" ? "bg-cool" : s === "degraded" ? "bg-amber" : s === "offline" ? "bg-dim" : "bg-muted animate-pulse";
  return <span className={`h-1.5 w-1.5 rounded-full ${color}`} title={API_LABEL[s]} aria-label={API_LABEL[s]} />;
}

// Animated number that rolls to its new value.
export function Counter({ value, digits = 0, suffix = "", className = "" }: { value: number; digits?: number; suffix?: string; className?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })}${suffix}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.9, ease: [0.16, 1, 0.3, 1] });
    return () => c.stop();
  }, [value, mv]);
  return <motion.span className={`num ${className}`}>{text}</motion.span>;
}

export function StatusBadge({ status, size = "md" }: { status: Status; size?: "md" | "lg" }) {
  const s = STATUS[status];
  return (
    <motion.span
      key={status}
      initial={{ scale: 0.85, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: "spring", stiffness: 500, damping: 25 }}
      className={`inline-flex items-center gap-2 rounded-full font-medium ${size === "lg" ? "px-4 py-1.5 text-sm" : "px-2.5 py-1 text-xs"}`}
      style={{ color: s.color, background: s.bg, boxShadow: `inset 0 0 0 1px ${s.color}40` }}
    >
      <span className="relative flex h-2 w-2">
        {status !== "fine" && status !== "unknown" && (
          <span className="pulse-ring absolute inline-flex h-full w-full rounded-full" style={{ background: s.color }} />
        )}
        <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: s.color }} />
      </span>
      {s.label}
    </motion.span>
  );
}

export function PatternChip({ pattern }: { pattern: PatternName | null }) {
  if (!pattern) return null;
  const c = PATTERN_COLOR[pattern];
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ color: c, background: `${c}14`, boxShadow: `inset 0 0 0 1px ${c}35` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: c }} />
      {pattern}
    </span>
  );
}

export function Evidence({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <span className="num inline-flex items-center gap-1 rounded-md border border-line bg-white/[0.02] px-1.5 py-0.5 text-[10.5px] text-muted" title="Tool result behind this number">
      <span className="h-1 w-1 rounded-full bg-cool" />
      {id}
      {children}
    </span>
  );
}

export function Panel({ children, className = "", title, right }: { children: ReactNode; className?: string; title?: string; right?: ReactNode }) {
  return (
    <section className={`panel relative ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <h3 className="label">{title}</h3>
          {right}
        </div>
      )}
      {children}
    </section>
  );
}

export const pct = (x: number) => `${Math.round(x * 100)}%`;
export const yrs = (x: number) => `${x.toFixed(1)}y`;

export function Loading({ label = "Loading 3,200 alumni histories" }: { label?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-muted">
      <div className="relative h-10 w-10">
        <span className="pulse-ring absolute inset-0 rounded-full bg-heat/40" />
        <span className="absolute inset-2 rounded-full bg-heat" />
      </div>
      <p className="num text-xs">{label}…</p>
    </div>
  );
}
