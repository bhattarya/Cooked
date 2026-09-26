import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Workspace } from "@/components/agent/Workspace";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export default async function AppPage() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  return <Workspace user={user} liveAgentConfigured={Boolean(process.env.ELEVENLABS_AGENT_ID && process.env.ELEVENLABS_API_KEY)} />;
}
