"use client";

// Google sign-in through Firebase Auth. After Google says yes, the Firebase ID token goes to
// /auth/firebase once, which verifies it and issues the same session cookie as every other
// sign-in, so proxy.ts and the pages never care how someone signed in. API calls then carry a
// fresh ID token as a bearer (api/auth.py verifies it).
import { FirebaseError } from "firebase/app";
import { GoogleAuthProvider, getRedirectResult, signInWithPopup, signInWithRedirect, signOut, type UserCredential } from "firebase/auth";
import { firebaseAuth, firebaseEnabled, startAnalytics } from "./firebase";

export type SignIn = { ok: true } | { ok: false; error: string | null };

function explain(err: unknown): string | null {
  const code = err instanceof FirebaseError ? err.code : "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return null; // they changed their mind; not an error
    case "auth/unauthorized-domain":
      return `This domain (${window.location.hostname}) isn't authorized. Add it in Firebase console → Authentication → Settings → Authorized domains.`;
    case "auth/configuration-not-found":
    case "auth/operation-not-allowed":
      return "Google sign-in isn't enabled for this Firebase project (Authentication → Sign-in method → Google).";
    case "auth/network-request-failed":
      return "Couldn't reach Google. Check your connection and try again.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return "Google sign-in failed. Try again, or continue as a guest.";
  }
}

async function startSession(cred: UserCredential): Promise<SignIn> {
  const r = await fetch("/auth/firebase", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await cred.user.getIdToken() }),
  });
  if (r.ok) return { ok: true };
  await signOut(firebaseAuth());
  const j = await r.json().catch(() => null);
  return { ok: false, error: j?.message ?? "Couldn't verify the Google sign-in. Try again." };
}

/** Popup sign-in; falls back to a full-page redirect when the popup is blocked. */
export async function signInWithGoogle(): Promise<SignIn> {
  if (!firebaseEnabled) return { ok: false, error: "Google sign-in isn't set up on this server yet." };
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  try {
    return await startSession(await signInWithPopup(firebaseAuth(), provider));
  } catch (e) {
    if (e instanceof FirebaseError && e.code === "auth/popup-blocked") {
      try {
        await signInWithRedirect(firebaseAuth(), provider); // navigates away; finishRedirect() picks it up
        return { ok: false, error: null };
      } catch (redirectErr) {
        return { ok: false, error: explain(redirectErr) };
      }
    }
    return { ok: false, error: explain(e) };
  }
}

/** On the landing page: complete a redirect sign-in, if one is in flight. Null when there was none. */
export async function finishRedirect(): Promise<SignIn | null> {
  if (!firebaseEnabled) return null;
  startAnalytics();
  try {
    const cred = await getRedirectResult(firebaseAuth());
    return cred ? await startSession(cred) : null;
  } catch (e) {
    return { ok: false, error: explain(e) };
  }
}

export async function signOutOfGoogle(): Promise<void> {
  if (firebaseEnabled) await signOut(firebaseAuth()).catch(() => undefined);
}

/** Authorization header for API calls; empty for guests or when Firebase is off. Tokens refresh automatically. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!firebaseEnabled) return {};
  const auth = firebaseAuth();
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdToken().catch(() => null);
  return token ? { Authorization: `Bearer ${token}` } : {};
}
