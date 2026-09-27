"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { finishRedirect, signInWithGoogle } from "@/lib/auth";
import type { SignInMethod } from "@/lib/session";
import { Emblem, Wordmark } from "./brand";
import { SignIn } from "./landing/SignIn";
import { Stats } from "./landing/Stats";
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
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(error ? ERRORS[error] ?? null : null);
  useEffect(() => {
    if (method !== "firebase") return;
    finishRedirect().then((result) => {
      if (result?.ok) router.push("/app");
      else if (result) setProblem(result.error);
    });
  }, [method, router]);

  const google = async () => {
    if (method === "google") { router.push("/auth/google"); return; }
    setBusy(true);
    setProblem(null);
    const result = await signInWithGoogle();
    if (result.ok) { router.push("/app"); return; }
    setBusy(false);
    setProblem(result.error);
  };
  const guest = () => {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = "/auth/guest";
    document.body.appendChild(form);
    form.submit();
  };

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Wordmark size={16} />
        <span className={styles.headerNote}>Degree clarity, before the deadline.</span>
      </header>
      <div className={styles.main}>
        <section className={styles.intro} aria-labelledby="landing-title">
          <div className={styles.eyebrow}><span className={styles.rule} /> AN EARLY WARNING SYSTEM FOR STUDENTS</div>
          <h1 id="landing-title">Know where<br />you <em>stand.</em></h1>
          <p className={styles.lede}>Your degree audit tells you what you have done. COOKED helps you see what comes next, what could go wrong, and what you can change.</p>
          <div className={styles.steps} aria-label="How COOKED works">
            <div><span>01</span><strong>Bring your audit</strong><p>Upload a PDF or start with a sample student.</p></div>
            <div><span>02</span><strong>See the evidence</strong><p>Follow the analysis from source to conclusion.</p></div>
            <div><span>03</span><strong>Make a plan</strong><p>Stress test scenarios and find a way forward.</p></div>
          </div>
        </section>
        <aside className={styles.side} aria-label="Start using COOKED">
          <div className={styles.emblem}><Emblem width={240} priority /></div>
          <div className={styles.signin}>
            <p className={styles.sideLabel}>YOUR STARTING POINT</p>
            <h2>Let&apos;s look at the full picture.</h2>
            <p>Explore with a sample, or bring your own audit once you&apos;re in.</p>
            <SignIn method={method} signedIn={signedIn} busy={busy} problem={problem} onGoogle={google} onGuest={guest} onContinue={() => router.push("/app")} />
          </div>
        </aside>
      </div>
      <footer className={styles.footer}>
        <Stats reduced />
        <span className={styles.footerMark}>COOKED / HACKUMBC 2026</span>
      </footer>
    </main>
  );
}
