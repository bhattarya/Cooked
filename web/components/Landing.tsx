"use client";

import { useEffect, useState } from "react";
import { finishRedirect, signInWithGoogle } from "@/lib/auth";
import type { SignInMethod } from "@/lib/session";
import { Wordmark } from "./brand";
import { SignIn } from "./landing/SignIn";
import { VoiceInvite } from "./landing/VoiceInvite";
import styles from "./landing/landing.module.css";

const ERRORS: Record<string, string> = {
  google_not_configured: "Google sign-in isn't set up on this server yet. Continue as a guest.",
  google_denied: "Google sign-in was cancelled.",
  bad_state: "That sign-in link expired. Try again.",
  token_exchange: "Google didn't accept the sign-in. Try again.",
  no_id_token: "Google didn't return an identity. Try again.",
  bad_id_token: "Couldn't verify the Google sign-in. Try again.",
};

export function Landing({ method, signedIn, error }: { method: SignInMethod; signedIn: { firstName: string; guest: boolean } | null; error?: string }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(error ? (ERRORS[error] ?? null) : null);

  useEffect(() => {
    if (method !== "firebase") return;
    finishRedirect().then((result) => {
      if (result?.ok) window.location.href = "/app";
      else if (result) setProblem(result.error);
    });
  }, [method]);

  const google = async () => {
    if (method === "google") {
      window.location.href = "/auth/google";
      return;
    }
    setBusy(true);
    setProblem(null);
    const result = await signInWithGoogle();
    if (result.ok) window.location.href = "/app";
    else {
      setBusy(false);
      setProblem(result.error);
    }
  };

  const guest = () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/guest";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <main className="flex min-h-dvh flex-col bg-bg text-text">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-10">
        <Wordmark size={16} />
        <span className="text-[11px] text-muted">HackUMBC 2026 · synthetic student data</span>
      </header>

      <div className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-6 py-12 sm:px-10 lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-20">
        <section>
          <p className="label !text-gold">A student guide grounded in data</p>
          <h1 className="display mt-5 max-w-[16ch] text-5xl font-bold leading-[1.05] text-cream sm:text-7xl">
            Know you are cooked before it&rsquo;s too late — and get uncooked.
          </h1>
          <p className="mt-7 max-w-[55ch] text-base leading-relaxed text-muted sm:text-lg">
            Ask whether your fall schedule fits your degree plan. COOKED reads the courses and credits in your audit, then explains what trained models and comparable records can actually tell you.
          </p>
          <div className="mt-9 grid max-w-xl gap-4 border-t border-line pt-7 sm:grid-cols-3">
            <div><span className="num text-sm text-gold">01</span><p className="mt-2 text-sm text-text">Add a degree audit or try a sample student.</p></div>
            <div><span className="num text-sm text-gold">02</span><p className="mt-2 text-sm text-text">Ask COOKED by voice or text.</p></div>
            <div><span className="num text-sm text-gold">03</span><p className="mt-2 text-sm text-text">See the evidence and its limits.</p></div>
          </div>
        </section>

        <section className={`${styles.door} w-full p-6 sm:p-8`} aria-label="Start COOKED">
          <VoiceInvite />
          <div className="my-7 border-t border-line" />
          <SignIn method={method} signedIn={signedIn} busy={busy} problem={problem} onGoogle={google} onGuest={guest} onContinue={() => { window.location.href = "/app"; }} />
        </section>
      </div>

      <footer className="mx-auto w-full max-w-6xl border-t border-line px-6 py-5 text-xs leading-relaxed text-muted sm:px-10">
        This prototype uses the synthetic HackUMBC dataset. Its model estimates and cohort comparisons describe patterns in that data, not promises about a student&rsquo;s future.
      </footer>
    </main>
  );
}
