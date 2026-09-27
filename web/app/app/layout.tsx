import type { ReactNode } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { VoiceRoot } from "@/components/voice/VoiceRoot";
import { AdvisorSession } from "@/components/agent/AdvisorSession";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  return <VoiceRoot><AdvisorSession user={user}>{children}</AdvisorSession></VoiceRoot>;
}
