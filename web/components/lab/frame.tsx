import type { ReactNode } from "react";

/**
 * SceneDeck's scene wrapper is `absolute inset-0`, so its own `lg:pl-28` gutter does not apply and scenes
 * would slide under the left rail. Every lab scene keeps clear of the rail's numbers and ticks itself
 * (one place to delete if the shell starts honouring its padding).
 */
export const RAIL_GUTTER = "lg:pl-[104px]";

/** The rail's active-scene label would sit on top of dense controls; the header tabs name the scenes instead. */
export const DECK_CLASS = "lg:[&>nav:nth-of-type(2)_button>span:last-child]:hidden";

/** Kicker and a Big Shoulders headline sized by viewport height, so the same scene fits 720p and 1080p. */
export function SceneTitle({ kicker, title, accent, className = "" }: { kicker: string; title: string; accent?: string; className?: string }) {
  return (
    <div className={className}>
      <div className="label !text-gold">{kicker}</div>
      <h2 className="display mt-2 text-[clamp(2.6rem,8.4vh,5rem)] font-extrabold leading-[0.88]">
        {title}
        {accent && (
          <>
            <br />
            <span className="text-gold-grad">{accent}</span>
          </>
        )}
      </h2>
    </div>
  );
}

/** A quiet mono chip for receipts. */
export function Tag({ children, tone = "dim", title }: { children: ReactNode; tone?: "dim" | "gold" | "cool" | "hot" | "ember"; title?: string }) {
  const c = { dim: "border-line-2 text-dim", gold: "border-gold/40 text-gold", cool: "border-cool/40 text-cool", hot: "border-hot/40 text-hot", ember: "border-ember/40 text-ember" }[tone];
  return (
    <span title={title} className={`num inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-none ${c}`}>
      {children}
    </span>
  );
}
