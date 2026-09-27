"use client";

import { useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import type { Dataset } from "@/lib/types";
import { SAMPLES } from "./model";
import { useNarrator } from "./narrator";
import styles from "./home.module.css";

export function Home({ ds, name, hasJourney, onFile, onSample, onGreet, onResume, onManual, onChapter }: { ds: Dataset | null; name: string | null; hasJourney: boolean; onFile: (f: File) => void; onSample: (id: string) => void; onGreet: () => void; onResume: () => void; onManual: () => void; onChapter: (c: "cohort" | "models") => void }) {
  const { caption } = useNarrator();
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const drop = (e: DragEvent) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files[0]; if (f) onFile(f); };
  const key = (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); input.current?.click(); } };

  return (
    <section className={styles.page} aria-labelledby="start-title">
      <div className={styles.image} aria-hidden /><div className={styles.shade} aria-hidden />
      <div className={styles.intro}>
        <div className={styles.kicker}><span>COOKED / 01</span><span>YOUR DEGREE, IN CONTEXT</span></div>
        <h1 id="start-title">Let&apos;s see your<br /><em>next move.</em></h1>
        <p>{caption || (name ? `${name}, bring your degree audit and see where the plan bends.` : "Bring your degree audit and see where the plan bends.")}</p>
        <button type="button" onClick={onGreet} className={styles.hear}>Hear the introduction <span aria-hidden>↗</span></button>
      </div>
      <div className={styles.actions}>
        <div className={styles.uploadGroup}>
        <div role="button" tabIndex={0} aria-label="Drop your degree audit, or press Enter to choose a file" onClick={() => input.current?.click()} onKeyDown={key} onDragOver={(e) => {e.preventDefault(); setOver(true);}} onDragLeave={() => setOver(false)} onDrop={drop} className={`${styles.upload} ${over ? styles.over : ""}`}>
          <input ref={input} type="file" accept="application/pdf,image/*" hidden onChange={(e) => {const f=e.target.files?.[0];if(f)onFile(f);e.target.value="";}} />
          <span>01 / BRING YOUR AUDIT</span><strong>{over ? "Release to read" : "Read my audit"}</strong><p>PDF or photo, up to 8 MB. The file is never stored.</p><b aria-hidden>↗</b>
        </div>
        <button type="button" onClick={onManual} className={styles.manual}>Or enter your terms by hand <span aria-hidden>→</span></button>
        </div>
        <div className={styles.samples}>
          <div className={styles.sampleHead}><span>02 / WALK THROUGH A SAMPLE</span><span>SYNTHETIC STUDENTS</span></div>
          <div className={styles.sampleList}>{SAMPLES.map((s,i)=><button key={s.id} type="button" disabled={!ds} onClick={()=>onSample(s.id)}><span>{String(i+1).padStart(2,"0")}</span><strong>{s.label}</strong><small>{s.hint}</small><span aria-hidden>↗</span></button>)}</div>
          {!ds && <p className={styles.loading}>Loading sample data…</p>}
        </div>
      </div>
      <div className={styles.foot}>
        <span>SIMULATED OUTCOMES / NOT A PREDICTION</span>
        <nav aria-label="Other ways to explore">{hasJourney && <button type="button" onClick={onResume}>Return to results</button>}<button type="button" onClick={() => onChapter("cohort")}>Explore the cohort</button><button type="button" onClick={() => onChapter("models")}>Build a scenario</button></nav>
      </div>
    </section>
  );
}
