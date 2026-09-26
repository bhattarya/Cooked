import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieOptions, googleConfigured, publicOrigin, signSession } from "@/lib/session";

const GOOGLE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/oauth2/v3/certs"));

// Step 2: check state, exchange the code (with the PKCE verifier), verify Google's signed ID token.
export async function GET(req: NextRequest) {
  const origin = publicOrigin(req);
  const fail = (why: string) => {
    const res = NextResponse.redirect(`${origin}/?error=${why}`);
    res.cookies.delete({ name: "g_state", path: "/api/auth" });
    res.cookies.delete({ name: "g_verifier", path: "/api/auth" });
    return res;
  };
  if (!googleConfigured()) return fail("google_not_configured");
  const q = req.nextUrl.searchParams;
  const state = req.cookies.get("g_state")?.value;
  const verifier = req.cookies.get("g_verifier")?.value;
  if (q.get("error")) return fail("google_denied");
  if (!state || !verifier || q.get("state") !== state || !q.get("code")) return fail("bad_state");

  const token = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: q.get("code")!,
      client_id: process.env.AUTH_GOOGLE_ID!,
      client_secret: process.env.AUTH_GOOGLE_SECRET!,
      redirect_uri: `${origin}/api/auth/callback/google`,
      grant_type: "authorization_code",
      code_verifier: verifier,
    }),
  });
  if (!token.ok) return fail("token_exchange");
  const { id_token } = (await token.json()) as { id_token?: string };
  if (!id_token) return fail("no_id_token");
  try {
    const { payload } = await jwtVerify(id_token, GOOGLE_JWKS, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: process.env.AUTH_GOOGLE_ID!,
    });
    const name = String(payload.name ?? payload.email ?? "Student");
    const session = await signSession({
      name,
      firstName: String(payload.given_name ?? name.split(" ")[0]),
      email: payload.email as string | undefined,
      picture: payload.picture as string | undefined,
      guest: false,
    });
    const res = NextResponse.redirect(`${origin}/app`);
    res.cookies.set(SESSION_COOKIE, session, cookieOptions(origin.startsWith("https://")));
    res.cookies.delete({ name: "g_state", path: "/api/auth" });
    res.cookies.delete({ name: "g_verifier", path: "/api/auth" });
    return res;
  } catch {
    return fail("bad_id_token");
  }
}
