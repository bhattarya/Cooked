"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [health, setHealth] = useState(null);
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(true);

  async function checkHealth() {
    setChecking(true);
    setError("");
    try {
      const base = process.env.NEXT_PUBLIC_API_URL;
      if (!base) throw new Error("Connection is not configured yet.");
      const response = await fetch(`${base.replace(/\/$/, "")}/healthz`, {
        cache: "no-store", signal: AbortSignal.timeout(8000),
      });
      const result = await response.json();
      setHealth(result);
      if (!response.ok) setError("The service is still getting ready.");
    } catch {
      setHealth(null);
      setError("We couldn’t reach the service. Try again in a moment.");
    } finally {
      setChecking(false);
    }
  }

  useEffect(() => { checkHealth(); }, []);

  return (
    <main>
      <p className="eyebrow">HACKUMBC 2026 · CAREER PATHWAYS & DEGREE ROI</p>
      <h1>COOKED<span>.</span></h1>
      <p className="tagline">Know early. Find a way forward.</p>
      <section aria-labelledby="status-title">
        <p className="label">PROJECT PREVIEW</p>
        <h2 id="status-title">The foundation is taking shape.</h2>
        <p>The student experience is coming next.</p>
        <p role="status" data-testid="connection-status">
          {checking ? "Checking connection…" : error || "Connected. Ready for the next step."}
        </p>
        {health && <p className="muted">{health.mode === "scaffold" ? "Preview environment" : "Demo environment"}</p>}
        <button onClick={checkHealth} disabled={checking}>Check connection</button>
      </section>
      <footer>Synthetic data only. No real student records. This demo is not academic or financial advice.</footer>
    </main>
  );
}
