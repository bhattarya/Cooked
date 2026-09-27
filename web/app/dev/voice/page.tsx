import { notFound } from "next/navigation";
import { VoiceHarness } from "@/components/voice/VoiceHarness";

// Dev-only: exercises the voice command bus and dock with FAKE data. Not reachable in production.
export const metadata = { title: "Voice harness (dev)" };

export default function VoiceDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <VoiceHarness />;
}
