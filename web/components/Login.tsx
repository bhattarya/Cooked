"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth";
import { Avatar } from "./UserMenu";
import { Logo, Nav } from "./ui";

export function GoogleMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

export function Login({ next }: { next: string }) {
  const router = useRouter();
  const { enabled, loading, user, error, signInWithGoogle, signOut, clearError } = useAuth();
  const [busy, setBusy] = useState(false);

  // Came back from a redirect sign-in, or already signed in via the popup: go on.
  useEffect(() => {
    if (user && busy) router.replace(next);
  }, [user, busy, next, router]);

  const go = async () => {
    setBusy(true);
    const ok = await signInWithGoogle();
    if (!ok) setBusy(false);
  };

  return (
    <>
      <Nav />
      <main className="relative flex min-h-[calc(100vh-56px)] items-center justify-center overflow-hidden px-4 py-16">
        <div
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-1/3 h-[520px] w-[820px] -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl"
          style={{ background: "radial-gradient(closest-side, rgba(255,90,31,0.16), transparent)" }}
        />
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          className="panel relative w-full max-w-[420px] p-8 shadow-[0_30px_80px_-30px_rgba(0,0,0,0.8)]"
        >
          <Logo size={20} />

          {!enabled ? (
            <div className="mt-8">
              <h1 className="display text-2xl font-semibold">Sign-in isn&apos;t set up</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Add the <span className="num text-text">NEXT_PUBLIC_FIREBASE_*</span> values to the root{" "}
                <span className="num text-text">.env</span> and restart the dev server.
              </p>
            </div>
          ) : loading ? (
            <div className="mt-8 space-y-3" aria-label="Checking your session">
              <div className="h-7 w-2/3 animate-pulse rounded-lg bg-white/[0.05]" />
              <div className="h-4 w-full animate-pulse rounded bg-white/[0.04]" />
              <div className="mt-6 h-12 w-full animate-pulse rounded-xl bg-white/[0.05]" />
            </div>
          ) : user && !busy ? (
            <div className="mt-8">
              <div className="label">Signed in</div>
              <div className="mt-4 flex items-center gap-3">
                <Avatar user={user} size={44} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{user.name ?? "Signed in"}</p>
                  <p className="truncate text-sm text-muted">{user.email}</p>
                </div>
              </div>
              <Link
                href={next}
                className="mt-7 flex h-12 w-full items-center justify-center rounded-xl bg-heat font-medium text-white transition hover:brightness-110"
              >
                Continue →
              </Link>
              <button onClick={() => signOut()} className="mt-3 w-full text-sm text-muted transition hover:text-text">
                Use a different account
              </button>
            </div>
          ) : (
            <div className="mt-8">
              <h1 className="display text-[28px] font-semibold leading-tight">Sign in to COOKED</h1>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Advisors sign in to open the per-student queue. You can explore every demo student without an account.
              </p>

              <button
                onClick={go}
                disabled={busy}
                className="group mt-8 flex h-12 w-full items-center justify-center gap-3 rounded-xl bg-white font-medium text-[#1f1f1f] shadow-sm transition hover:bg-[#f2f2f2] active:scale-[0.99] disabled:cursor-wait disabled:opacity-70"
              >
                {busy ? (
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1f1f1f]/20 border-t-[#1f1f1f]" aria-hidden />
                ) : (
                  <GoogleMark />
                )}
                {busy ? "Waiting for Google…" : "Continue with Google"}
              </button>

              <AnimatePresence>
                {error && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    role="alert"
                    className="overflow-hidden"
                  >
                    <div className="mt-4 flex gap-2 rounded-xl border border-hot/30 bg-hot/10 px-3.5 py-3 text-sm text-text">
                      <span className="text-hot">●</span>
                      <span className="flex-1 leading-relaxed">{error}</span>
                      <button onClick={clearError} className="text-muted hover:text-text" aria-label="Dismiss">
                        ✕
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              <p className="mt-8 border-t border-line pt-5 text-xs leading-relaxed text-dim">
                We only receive your name, email and photo from Google. All student data in COOKED is synthetic.
              </p>
            </div>
          )}
        </motion.section>
      </main>
    </>
  );
}
