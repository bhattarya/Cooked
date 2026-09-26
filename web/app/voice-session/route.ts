import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";

/** Short-lived URL for a private ElevenLabs voice agent. Secrets stay on the server. */
export async function GET() {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (process.env.DEMO_MODE === "1") return NextResponse.json({ error: "Live voice is disabled in demo mode." }, { status: 503 });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !key) return NextResponse.json({ error: "ElevenLabs live agent is not configured." }, { status: 503 });
  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  url.searchParams.set("agent_id", agentId);
  try {
    const response = await fetch(url, { headers: { "xi-api-key": key }, cache: "no-store" });
    if (!response.ok) return NextResponse.json({ error: "ElevenLabs could not start a conversation." }, { status: 502 });
    const data = await response.json() as { signed_url?: string };
    if (!data.signed_url?.startsWith("wss://")) return NextResponse.json({ error: "ElevenLabs returned no signed URL." }, { status: 502 });
    return NextResponse.json({ signedUrl: data.signed_url }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "ElevenLabs is unavailable." }, { status: 502 });
  }
}
