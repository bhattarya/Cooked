"use client";

import Link from "next/link";
import { motion } from "motion/react";
import type { CSSProperties, ReactNode } from "react";
import { signOutOfGoogle } from "@/lib/auth";
import type { SessionUser } from "@/lib/session";
import { Wordmark } from "../brand";

export type AppSection = "home" | "explore" | "lab" | "advisor";
const NAV: { key: AppSection; href: string; label: string }[] = [
  { key: "home", href: "/app", label: "Your plan" },
  { key: "explore", href: "/app/explore", label: "Explore" },
  { key: "lab", href: "/app/lab", label: "What-if" },
  { key: "advisor", href: "/app/advisor", label: "Advisor" },
];

/** Bottom space kept free for the floating voice dock (web/components/voice). */
export const DOCK_CLEARANCE = "pb-28";

/** The one frame for every /app screen: fixed to the viewport, warm-black haze, slim header, no page scroll. */
export function AppChrome({ user, active, right, heat = 0, children }: { user: SessionUser; active: AppSection; right?: ReactNode; heat?: number; children: ReactNode }) {
  return (
    <div className="app-shell relative flex h-dvh flex-col overflow-hidden" style={{ ["--heat-level" as string]: heat } as CSSProperties}>

      <header className="relative z-40 flex h-14 shrink-0 items-center gap-2 border-b border-line bg-bg/60 px-4 backdrop-blur-xl sm:gap-4 sm:px-6">
        <Link href="/app" aria-label="COOKED home" className="shrink-0">
          <Wordmark size={15} />
        </Link>
        <nav aria-label="Advisor workspace" className="ml-1 flex min-w-0 gap-0.5 overflow-x-auto sm:ml-4">
          {NAV.map((n) => (
            <Link key={n.key} href={n.href} aria-current={n.key === active ? "page" : undefined} className={`relative shrink-0 rounded-full px-3 py-1.5 text-xs transition ${n.key === active ? "text-gold" : "text-muted hover:text-text"}`}>
              {n.key === active && <motion.span layoutId="chrome-nav" className="absolute inset-0 rounded-full border border-gold/40 bg-gold/10" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
              <span className="relative">{n.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center gap-3">
          {right}
          {user.picture ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={user.picture} alt="" className="h-7 w-7 rounded-full ring-1 ring-line-2" referrerPolicy="no-referrer" />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gold/15 text-xs text-gold">{user.name[0]}</span>
          )}
          <form
            action="/auth/logout"
            method="POST"
            onSubmit={(e) => {
              e.preventDefault();
              const form = e.currentTarget;
              void signOutOfGoogle().finally(() => form.submit());
            }}
          >
            <button className="text-xs text-muted hover:text-text max-sm:sr-only">Sign out</button>
          </form>
        </div>
      </header>
      <main className={`relative z-10 flex min-h-0 flex-1 flex-col ${DOCK_CLEARANCE}`}>{children}</main>
    </div>
  );
}
