"use client";

import type { Health } from "@/lib/live";

// Which sponsor powers each agent, and whether it's live right now (honest fallbacks).
export type SponsorKey = "gemini" | "elevenlabs" | "backboard" | "tiger" | "digitalocean" | "model";

export const SPONSORS: Record<SponsorKey, { label: string; color: string; role: string }> = {
  gemini: { label: "Gemini", color: "#8ab4f8", role: "reads audits, routes questions" },
  // Key kept for the theatre; the label is neutral on purpose (no third-party voice branding in the UI).
  elevenlabs: { label: "Voice", color: "#f4f1ea", role: "speaks every answer" },
  backboard: { label: "Backboard", color: "#c4b5fd", role: "remembers your decisions" },
  tiger: { label: "Tiger Data", color: "#fbbf24", role: "3,200 alumni + drill simulations" },
  digitalocean: { label: "DigitalOcean", color: "#3b82f6", role: "hosts the agents" },
  model: { label: "COOKED model", color: "#f6b41a", role: "trained risk + time-to-degree" },
};

export interface SponsorLive {
  gemini: boolean;
  elevenlabs: boolean;
  backboard: boolean;
  tiger: boolean;
  digitalocean: boolean;
  model: boolean;
}

export function sponsorLive(h: Health & { database_kind?: string } | null): SponsorLive {
  return {
    gemini: !!h?.providers?.gemini,
    elevenlabs: !!h?.providers?.elevenlabs,
    backboard: !!h?.providers?.backboard,
    tiger: h?.database_kind === "tiger-cloud",
    digitalocean: typeof window !== "undefined" && window.location.hostname.endsWith("ondigitalocean.app"),
    model: !!h?.live,
  };
}

export const FALLBACK: Record<SponsorKey, string> = {
  gemini: "local parser + router",
  elevenlabs: "browser voice",
  backboard: "stored in Postgres",
  tiger: "TimescaleDB (local)",
  digitalocean: "running locally",
  model: "browser engine",
};

export function SponsorChip({ k, live, compact = false }: { k: SponsorKey; live: boolean; compact?: boolean }) {
  const s = SPONSORS[k];
  return (
    <span
      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[10.5px]"
      style={{ borderColor: live ? `${s.color}66` : "rgba(255,255,255,0.1)", color: live ? s.color : "var(--muted)" }}
      title={live ? `${s.label}: ${s.role}` : `${s.label} not configured: ${FALLBACK[k]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: live ? s.color : "var(--dim)" }} />
      {s.label}
      {!compact && !live && <span className="text-dim">· {FALLBACK[k]}</span>}
    </span>
  );
}

const ORDER: SponsorKey[] = ["gemini", "backboard", "tiger", "model", "digitalocean"];

/** Five quiet dots for the header: lit when that service is live, dim when its fallback is running. Hover for which. */
export function SponsorDots({ live }: { live: SponsorLive }) {
  return (
    <span role="group" aria-label="Which sponsor services are live" className="hidden items-center gap-1.5 xl:flex">
      {ORDER.map((k) => {
        const s = SPONSORS[k];
        return (
          <span
            key={k}
            tabIndex={0}
            role="img"
            aria-label={live[k] ? `${s.label} live` : `${s.label} not configured, using ${FALLBACK[k]}`}
            title={live[k] ? `${s.label}: ${s.role}` : `${s.label} not configured: ${FALLBACK[k]}`}
            className="h-2 w-2 rounded-full transition"
            style={{ background: live[k] ? s.color : "var(--line-2)", boxShadow: live[k] ? `0 0 8px ${s.color}` : undefined }}
          />
        );
      })}
    </span>
  );
}
