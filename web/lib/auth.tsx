"use client";

// Google sign-in via Firebase Auth. The provider keeps the signed-in user in context and
// hands out fresh ID tokens for API calls (the API verifies them in api/auth.py).
import {
  GoogleAuthProvider,
  getRedirectResult,
  onIdTokenChanged,
  signInWithPopup,
  signInWithRedirect,
  signOut as fbSignOut,
  type User,
} from "firebase/auth";
import { FirebaseError } from "firebase/app";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { firebaseAuth, firebaseEnabled, startAnalytics } from "./firebase";

export interface AuthUser {
  uid: string;
  name: string | null;
  email: string | null;
  photo: string | null;
}

interface AuthState {
  /** Sign-in is available (Firebase env configured). */
  enabled: boolean;
  /** Still restoring the session from the last visit. */
  loading: boolean;
  user: AuthUser | null;
  error: string | null;
  signInWithGoogle: () => Promise<boolean>;
  signOut: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

const toUser = (u: User): AuthUser => ({ uid: u.uid, name: u.displayName, email: u.email, photo: u.photoURL });

function explain(err: unknown): string | null {
  const code = err instanceof FirebaseError ? err.code : "";
  switch (code) {
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
    case "auth/user-cancelled":
      return null; // the person changed their mind; not an error
    case "auth/unauthorized-domain":
      return `This domain (${window.location.hostname}) isn't authorized. Add it in Firebase console → Authentication → Settings → Authorized domains.`;
    case "auth/configuration-not-found":
      return "Firebase Authentication isn't set up for this project yet. In Firebase console → Authentication, click Get started, then enable Google under Sign-in method.";
    case "auth/operation-not-allowed":
      return "Google sign-in is turned off for this project. Enable it in Firebase console → Authentication → Sign-in method.";
    case "auth/network-request-failed":
      return "Couldn't reach Google. Check your connection and try again.";
    case "auth/account-exists-with-different-credential":
      return "This email already uses a different sign-in method.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a minute and try again.";
    default:
      return "Sign-in failed. Please try again.";
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(firebaseEnabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!firebaseEnabled) return;
    const auth = firebaseAuth();
    // Finish a redirect sign-in (the fallback when a popup was blocked).
    getRedirectResult(auth).catch((e) => setError(explain(e)));
    startAnalytics();
    return onIdTokenChanged(auth, (u) => {
      setUser(u ? toUser(u) : null);
      setLoading(false);
    });
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (!firebaseEnabled) return false;
    setError(null);
    const auth = firebaseAuth();
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try {
      await signInWithPopup(auth, provider);
      return true;
    } catch (e) {
      if (e instanceof FirebaseError && e.code === "auth/popup-blocked") {
        try {
          await signInWithRedirect(auth, provider); // navigates away; result handled on return
        } catch (redirectErr) {
          setError(explain(redirectErr));
        }
        return false;
      }
      setError(explain(e));
      return false;
    }
  }, []);

  const signOut = useCallback(async () => {
    if (firebaseEnabled) await fbSignOut(firebaseAuth());
  }, []);

  const value = useMemo<AuthState>(
    () => ({ enabled: firebaseEnabled, loading, user, error, signInWithGoogle, signOut, clearError: () => setError(null) }),
    [loading, user, error, signInWithGoogle, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

/** Authorization header for API calls; empty when signed out. Tokens refresh automatically. */
export async function authHeaders(): Promise<Record<string, string>> {
  if (!firebaseEnabled) return {};
  const current = firebaseAuth().currentUser;
  if (!current) return {};
  return { Authorization: `Bearer ${await current.getIdToken()}` };
}
