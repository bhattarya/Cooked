import { createRemoteJWKSet, jwtVerify } from "jose";
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, cookieOptions, firebaseProjectId, publicOrigin, signSession } from "@/lib/session";

// Firebase ID tokens are signed by securetoken@system.gserviceaccount.com; only the project ID is needed to verify them.
const FIREBASE_JWKS = createRemoteJWKSet(new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"));

const deny = (status: number, error: string, message: string) => NextResponse.json({ error, message }, { status });

// The browser signed in with Google through Firebase; trade its ID token for a COOKED session.
export async function POST(req: NextRequest) {
  const origin = publicOrigin(req);
  const pid = firebaseProjectId();
  if (!pid) return deny(503, "firebase_not_configured", "Google sign-in isn't set up on this server yet.");
  // Only our own pages may start a session (a cross-site form can't send JSON with this Origin).
  if (req.headers.get("origin") !== origin) return deny(403, "bad_origin", "Sign-in must start from this site.");
  const body = (await req.json().catch(() => null)) as { idToken?: unknown } | null;
  if (typeof body?.idToken !== "string" || body.idToken.length > 4096) return deny(400, "no_id_token", "No Google identity was sent.");
  try {
    const { payload } = await jwtVerify(body.idToken, FIREBASE_JWKS, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${pid}`,
      audience: pid,
      requiredClaims: ["sub", "iat", "exp"],
      clockTolerance: 30,
    });
    if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new Error("bad sub");
    if (Number(payload.auth_time ?? 0) > Date.now() / 1000 + 30) throw new Error("auth_time in the future");
    const name = String(payload.name ?? payload.email ?? "Student");
    const session = await signSession({
      name,
      firstName: name.split(" ")[0],
      email: payload.email as string | undefined,
      picture: payload.picture as string | undefined,
      uid: payload.sub,
      guest: false,
    });
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE, session, cookieOptions(origin.startsWith("https://")));
    return res;
  } catch {
    return deny(401, "bad_id_token", "Couldn't verify the Google sign-in. Try again.");
  }
}
