"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { finishRedirect, signInWithGoogle } from "@/lib/auth";
import type { SignInMethod } from "@/lib/session";
import { GoogleG } from "./landing/SignIn";
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

  const primary = signedIn ? () => router.push("/app") : method ? google : guest;
  const primaryLabel = signedIn ? (signedIn.guest ? "Continue as guest" : `Continue as ${signedIn.firstName}`) : method ? (busy ? "Connecting…" : "Get started with Google") : "Get started";

  return (
    <main className={styles.page}>
      <div className={styles.topline}><span>COOKED / DEGREE PLANNING</span><span>BUILT FOR HACKUMBC 2026</span></div>
      <section className={styles.hero} aria-labelledby="landing-title">
        <div className={styles.figure}>
          <Image src="/brand/cooked-emblem-cutout.png" alt="COOKED chef dog emblem" width={530} height={562} priority unoptimized className={styles.logo} />
        </div>
        <div className={styles.copy}>
          <p className={styles.eyebrow}><span aria-hidden /> YOUR DEGREE, IN FOCUS</p>
          <h1 id="landing-title">COOKED<span className={styles.dot}>.</span></h1>
          <div className={styles.rule} />
          <p className={styles.lede}>See where your degree plan gets stuck.<br /><strong>Find a better way forward.</strong></p>
          <div className={styles.actions}>
            <button type="button" onClick={primary} disabled={busy} className={styles.primary}>{!signedIn && method && <GoogleG />}{primaryLabel}<span aria-hidden>↗</span></button>
            {!signedIn && method && <button type="button" onClick={guest} className={styles.guest}>Or explore as a guest <span aria-hidden>→</span></button>}
          </div>
          {problem && <p role="alert" className={styles.error}>{problem}</p>}
          <p className={styles.summary}>Bring your audit or try a sample. See the evidence, test a change, and make your next move with more clarity.</p>
        </div>
      </section>
      <footer className={styles.footer}><span>UPLOAD → UNDERSTAND → ADJUST</span><span>Synthetic HackUMBC 2026 data · Demo, not a prediction about real students.</span></footer>
    </main>
  );
}
