import { notFound } from "next/navigation";
import { ExplorePlayground } from "@/components/agent/explore/Playground";

// Dev-only: renders the answer scene with FAKE data to exercise the refusal, empty and horizontal-bar branches.
export const metadata = { title: "Explore playground (dev)" };

export default function ExploreDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ExplorePlayground />;
}
