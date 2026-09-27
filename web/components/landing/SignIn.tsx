"use client";

import type { SignInMethod } from "@/lib/session";
import styles from "./landing.module.css";

export function GoogleG() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.6 13.2l7.9 6.2C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.2-.4-4.6H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17z" />
      <path fill="#FBBC05" d="M10.5 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.2C1 16.5 0 20.1 0 24s1 7.5 2.6 10.8l7.9-6.2z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.3 0-11.6-4.1-13.5-9.9l-7.9 6.2C6.6 42.6 14.6 48 24 48z" />
    </svg>
  );
}

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden className="transition-transform duration-300 group-hover/btn:translate-x-0.5">
    <path d="M3 8h10m0 0L9 4m4 4L9 12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

/**
 * The door into the app. Which buttons appear, and what they do, is decided by Landing (it owns
 * the auth calls); this only lays them out.
 */
export function SignIn({
  method,
  signedIn,
  busy,
  problem,
  onGoogle,
  onGuest,
  onContinue,
}: {
  method: SignInMethod;
  signedIn: { firstName: string; guest: boolean } | null;
  busy: boolean;
  problem: string | null;
  onGoogle: () => void;
  onGuest: () => void;
  onContinue: () => void;
}) {
  const google = (
    <button onClick={onGoogle} disabled={busy} className={`${styles.cta} group/btn`}>
      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.35)]">
        {busy ? <span className={styles.spinner} aria-hidden /> : <GoogleG />}
      </span>
      {busy ? "Waiting for Google…" : "Continue with Google"}
    </button>
  );
  const guest = (
    <button onClick={onGuest} className={`${styles.ghost} group/btn`}>
      Continue as guest
      <Arrow />
    </button>
  );

  return (
    <div className="flex flex-col gap-3">
      {signedIn ? (
        <>
          <button onClick={onContinue} className={`${styles.cta} group/btn`}>
            {signedIn.guest ? "Continue as guest" : `Continue as ${signedIn.firstName}`}
            <Arrow />
          </button>
          {signedIn.guest && method && (
            <button onClick={onGoogle} disabled={busy} className={`${styles.ghost} group/btn`}>
              {busy ? "Waiting for Google…" : "or sign in with Google"}
            </button>
          )}
        </>
      ) : method ? (
        <>
          {google}
          <div className="flex items-center gap-3 text-[10.5px] uppercase tracking-[0.2em] text-muted" aria-hidden>
            <span className="h-px flex-1 bg-line-2" />
            or
            <span className="h-px flex-1 bg-line-2" />
          </div>
          {guest}
          <p className="text-center text-[11.5px] text-muted">No account needed to try it.</p>
        </>
      ) : (
        <>
          <button onClick={onGuest} className={`${styles.cta} group/btn`}>
            Continue as guest
            <Arrow />
          </button>
          <span className="flex items-center justify-center gap-2 text-center text-[11.5px] text-muted">
            <GoogleG /> Google sign-in turns on once Firebase (or AUTH_GOOGLE_ID) is set
          </span>
        </>
      )}
      {problem && (
        <p role="alert" className="rounded-xl border border-hot/30 bg-hot/10 px-3.5 py-2.5 text-[13px] leading-snug text-[#ffb4aa]">
          {problem}
        </p>
      )}
    </div>
  );
}
