import type { ReactNode } from "react";

/**
 * One idea per screen. Left: a kicker, a huge Big-Shoulders headline, one serif takeaway line and optional meta/actions.
 * Right: the stage, where the hero chart lives. Stacks on phones; only there may the scene scroll inside itself.
 */
export function SceneFrame({
  kicker,
  title,
  accent,
  takeaway,
  meta,
  actions,
  children,
  wide = false,
}: {
  kicker: string;
  title: string;
  /** Second headline line in molten gold. */
  accent?: string;
  takeaway?: ReactNode;
  /** Provenance chips, sample size, evidence ids. */
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  /** Give the stage more room (a wide chart) and shrink the text column. */
  wide?: boolean;
}) {
  return (
    <section
      className={`grid h-full min-h-0 grid-cols-1 content-start gap-6 overflow-y-auto px-5 pb-6 pt-4 sm:px-8 lg:content-center lg:items-center lg:gap-10 lg:overflow-hidden lg:px-10 xl:gap-14 xl:px-14 ${
        wide ? "lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]" : "lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]"
      }`}
    >
      <header className="min-w-0">
        <div className="label !text-gold">{kicker}</div>
        <h2 className="display mt-3 text-[3.25rem] font-extrabold leading-[0.9] sm:text-6xl xl:text-[5.25rem]">
          {title}
          {accent && (
            <>
              <br />
              <span className="text-gold-grad">{accent}</span>
            </>
          )}
        </h2>
        {takeaway && <p className="serif mt-4 max-w-md text-xl leading-snug text-muted sm:text-2xl">{takeaway}</p>}
        {meta && <div className="mt-5 flex flex-wrap gap-1.5">{meta}</div>}
        {actions && <div className="mt-6 flex flex-wrap gap-2">{actions}</div>}
      </header>
      <div className="relative min-h-[280px] min-w-0 lg:h-full lg:max-h-[min(620px,100%)] lg:min-h-0">{children}</div>
    </section>
  );
}
