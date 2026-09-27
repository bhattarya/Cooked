import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { readSession, SESSION_COOKIE } from "@/lib/session";

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Short-lived URL for the private ElevenLabs voice agent. Secrets stay on the server.
 *
 * `?probe=1` answers "could a live session start?" (signed in, not demo mode, agent configured)
 * without contacting ElevenLabs, so the voice dock can pick live agent vs. push-to-talk on load.
 */
export async function GET(request: Request) {
  const user = await readSession((await cookies()).get(SESSION_COOKIE)?.value);
  if (!user) return NextResponse.json({ error: "Sign in first." }, { status: 401, headers: NO_STORE });
  if (process.env.DEMO_MODE === "1") return NextResponse.json({ error: "Live voice is disabled in demo mode." }, { status: 503, headers: NO_STORE });
  const agentId = process.env.ELEVENLABS_AGENT_ID;
  const key = process.env.ELEVENLABS_API_KEY;
  if (!agentId || !key) return NextResponse.json({ error: "ElevenLabs live agent is not configured." }, { status: 503, headers: NO_STORE });
  if (new URL(request.url).searchParams.has("probe")) return NextResponse.json({ configured: true }, { headers: NO_STORE });

  const url = new URL("https://api.elevenlabs.io/v1/convai/conversation/get-signed-url");
  url.searchParams.set("agent_id", agentId);
  try {
    const response = await fetch(url, { headers: { "xi-api-key": key }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!response.ok) return NextResponse.json({ error: "ElevenLabs could not start a conversation." }, { status: 502, headers: NO_STORE });
    const data = await response.json() as { signed_url?: string };
    if (!data.signed_url?.startsWith("wss://")) return NextResponse.json({ error: "ElevenLabs returned no signed URL." }, { status: 502, headers: NO_STORE });
    return NextResponse.json({ signedUrl: data.signed_url }, { headers: NO_STORE });
  } catch {
    return NextResponse.json({ error: "ElevenLabs is unavailable." }, { status: 502, headers: NO_STORE });
  }
}
