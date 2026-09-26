import { NextResponse, type NextRequest } from "next/server";
import { googleConfigured, publicOrigin } from "@/lib/session";

const b64url = (buf: ArrayBuffer | Uint8Array) => Buffer.from(buf instanceof Uint8Array ? buf : new Uint8Array(buf)).toString("base64url");

// Step 1: send the user to Google with state (CSRF) and a PKCE challenge.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  if (!googleConfigured()) return NextResponse.redirect(`${origin}/?error=google_not_configured`);
  const state = b64url(crypto.getRandomValues(new Uint8Array(24)));
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: process.env.AUTH_GOOGLE_ID!,
    redirect_uri: `${origin}/auth/callback/google`,
    response_type: "code",
    scope: "openid email profile",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
    prompt: "select_account",
  }).toString();
  const res = NextResponse.redirect(url);
  const secure = origin.startsWith("https://");
  const opts = { httpOnly: true, sameSite: "lax" as const, secure, path: "/auth", maxAge: 600 };
  res.cookies.set("g_state", state, opts);
  res.cookies.set("g_verifier", verifier, opts);
  return res;
}
