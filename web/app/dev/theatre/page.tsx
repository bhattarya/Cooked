import { notFound } from "next/navigation";
import { Playground } from "@/components/theatre/Playground";

// ?rm=1 pretends the OS asked for reduced motion, so that path can be exercised without changing system settings.
const FORCE_REDUCED = `const mm = window.matchMedia.bind(window); window.matchMedia = (q) => { const r = mm(q); return /reduce/.test(q) ? new Proxy(r, { get: (t, k) => (k === 'matches' ? true : typeof t[k] === 'function' ? t[k].bind(t) : t[k]) }) : r; };`;

// Dev-only playground for the processing theatre: fake timelines, every layout.
// ?scenario=audit|explore|lab|nine|three|two  ?autoplay=1  ?view=kit  ?ui=0  ?rm=1
export default async function TheatreDevPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const q = await searchParams;
  const one = (k: string) => (Array.isArray(q[k]) ? q[k][0] : q[k]);
  return (
    <>
      {one("rm") === "1" && <script dangerouslySetInnerHTML={{ __html: FORCE_REDUCED }} />}
      <Playground scenario={one("scenario")} autoplay={one("autoplay") === "1"} view={one("view")} ui={one("ui") !== "0"} />
    </>
  );
}
