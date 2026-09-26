import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ExploreWorkspace } from "@/components/agent/ExploreWorkspace";
import { SESSION_COOKIE, readSession } from "@/lib/session";

export default async function ExplorePage() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) redirect("/");
  return <ExploreWorkspace name={user.firstName || "friend"} liveAgentConfigured={Boolean(process.env.ELEVENLABS_AGENT_ID && process.env.ELEVENLABS_API_KEY)} />;
}
