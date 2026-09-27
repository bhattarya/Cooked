// Sessions: a signed JWT in an HttpOnly cookie. Google identity (via Firebase or plain OAuth) or a
// guest; nothing else is stored.
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "cooked_auth";
const MAX_AGE = 60 * 60 * 24 * 7;

export interface SessionUser {
  name: string;
  firstName: string;
  email?: string;
  picture?: string;
  /** Firebase user id, when signed in through Firebase. */
  uid?: string;
  guest: boolean;
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET missing or shorter than 32 characters (run: make env, or set it in .env)");
  return new TextEncoder().encode(s);
}

export const googleConfigured = () => Boolean(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET && process.env.AUTH_SECRET);

export const firebaseProjectId = () => process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || null;

export const firebaseConfigured = () =>
  Boolean(process.env.NEXT_PUBLIC_FIREBASE_API_KEY && process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN && process.env.NEXT_PUBLIC_FIREBASE_APP_ID && firebaseProjectId() && process.env.AUTH_SECRET);

/** Firebase wins when both are set up; guests are always allowed. */
export type SignInMethod = "firebase" | "google" | null;
export const signInMethod = (): SignInMethod => (firebaseConfigured() ? "firebase" : googleConfigured() ? "google" : null);

export async function signSession(user: SessionUser): Promise<string> {
  return new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(secret());
}

export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return { name: String(payload.name), firstName: String(payload.firstName), email: payload.email as string | undefined, picture: payload.picture as string | undefined, uid: payload.uid as string | undefined, guest: Boolean(payload.guest) };
  } catch {
    return null;
  }
}

export const cookieOptions = (secure: boolean) => ({ httpOnly: true, sameSite: "lax" as const, secure, path: "/", maxAge: MAX_AGE });

export function publicOrigin(req: Request): string {
  // The dev server binds 0.0.0.0, so req.url can name the bind address rather than what the
  // browser used; the Host header is what the browser sent. AUTH_URL pins it when deployed.
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, "");
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  return host ? `${proto}://${host}` : new URL(req.url).origin;
}
