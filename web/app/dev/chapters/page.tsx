import { notFound } from "next/navigation";
import { ChaptersHarness } from "@/components/chapters/Harness";

// Dev-only: mounts the Cohort / Models / Advisor chapters inside a StudioProvider, with buttons that drive every intent.
export const metadata = { title: "Chapters harness (dev)" };

export default function Page() {
  if (process.env.NODE_ENV === "production") notFound();
  return <ChaptersHarness />;
}
