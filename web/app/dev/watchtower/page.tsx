import { notFound } from "next/navigation";
import { WatchtowerPlayground } from "@/components/queue/Playground";

// Dev-only: the Watchtower with FAKE students, so the signed-in view can be checked without a Google session.
export const metadata = { title: "Watchtower playground (dev)" };

export default function WatchtowerDevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <WatchtowerPlayground />;
}
