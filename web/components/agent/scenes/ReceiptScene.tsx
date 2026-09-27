"use client";

import { Chip, SceneFrame } from "@/components/scenes";
import type { Receipt } from "@/lib/agentApi";
import { Action, Stage } from "./kit";
import type { Journey } from "./model";
import { READ_HOW, type ReceiptState } from "./useJourney";

const dash = (v: number | null | undefined) => (v === null || v === undefined ? "n/a" : String(v));
const fmt = (v: number | string | null) => (v === null ? "n/a" : typeof v === "number" ? (Number.isInteger(v) ? String(v) : String(Math.round(v * 1000) / 1000)) : v);

/** The scene that lets a student check the maths: every number the models were given, in the audit's own terms. */
export function ReceiptScene({ j, receipt, onFix, onNext }: { j: Journey; receipt: ReceiptState; onFix: () => void; onNext: () => void }) {
  const r: Receipt | null = receipt.status === "ready" ? receipt.data : null;
  const derived = receipt.status === "ready" && receipt.derived;
  const t = r?.totals;
  const method = j.reading?.method ?? (j.source === "sample" ? "sample" : j.source === "manual" ? "manual" : "text");

  return (
    <SceneFrame
      wide
      kicker="check the maths"
      title="What we read"
      accent="from your audit"
      takeaway={j.warnings.length ? "The reader noted a few things. Check them below: a wrong number here is a wrong prediction." : "These are the numbers the models were given. If any row is wrong, fix it and the whole analysis re-runs."}
      meta={
        <>
          <Chip title="how this audit was turned into numbers">{READ_HOW[method]}</Chip>
          {j.reading?.terms != null && <Chip>{j.reading.terms} terms{j.reading.courses != null ? ` · ${j.reading.courses} courses` : ""}</Chip>}
          {r?.tool_result_id && <Chip title="the evidence id of this receipt">{r.tool_result_id}</Chip>}
        </>
      }
      actions={
        <>
          <Action onClick={onFix}>Something&apos;s off? Fix my terms</Action>
          <Action primary onClick={onNext}>
            Timeline →
          </Action>
        </>
      }
    >
      <Stage>
        {() =>
          !r ? (
            <div className="flex h-full min-h-[240px] items-center justify-center text-sm text-dim">{receipt.status === "loading" ? "Reading the receipt…" : "No receipt yet."}</div>
          ) : (
            <div className="flex h-full min-h-0 flex-col gap-4">
              {j.warnings.length > 0 && (
                <div role="note" className="rounded-xl border border-gold/40 bg-gold/[0.07] p-3.5">
                  <div className="label !text-gold">check what we read</div>
                  <ul className="mt-1.5 space-y-1 text-[13px] leading-snug text-text">
                    {j.warnings.map((w) => (
                      <li key={w}>· {w}</li>
                    ))}
                  </ul>
                </div>
              )}
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 border-b border-line pb-4 sm:grid-cols-4">
                {[
                  ["credits earned", t?.credits_earned],
                  ["in progress", t?.credits_in_progress],
                  ["required", t?.credits_required],
                  ["terms completed", t?.terms_completed],
                ].map(([k, v]) => (
                  <div key={k as string}>
                    <dt className="label !text-[10px]">{k as string}</dt>
                    <dd className="num text-[1.9rem] font-medium leading-none text-cream">{dash(v as number | null | undefined)}</dd>
                  </div>
                ))}
              </dl>
              <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
                <div className="min-h-0 overflow-y-auto rounded-xl border border-line">
                  <table className="w-full text-left text-[13px]">
                    <caption className="sr-only">Credits per term as read from the audit</caption>
                    <thead className="sticky top-0 bg-panel">
                      <tr className="label !text-[10px]">
                        {["term", "attempted", "earned", "withdrawn", "failed"].map((h) => (
                          <th key={h} scope="col" className={`px-3 py-2 font-normal ${h === "term" ? "" : "text-right"}`}>
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="num">
                      {r.terms.map((row, i) => (
                        <tr key={`${row.label}-${i}`} className="border-t border-line">
                          <th scope="row" className="px-3 py-1.5 font-normal text-muted">
                            {row.label}
                          </th>
                          <td className="px-3 py-1.5 text-right">{row.attempted}</td>
                          <td className="px-3 py-1.5 text-right">{row.earned}</td>
                          <td className={`px-3 py-1.5 text-right ${row.withdrawals > 0 ? "text-ember" : ""}`}>{row.withdrawals}</td>
                          <td className={`px-3 py-1.5 text-right ${row.failures ? "text-hot" : ""}`} title={row.failures == null ? "not reported by this server version" : undefined}>
                            {dash(row.failures)}
                          </td>
                        </tr>
                      ))}
                      {!r.terms.length && (
                        <tr>
                          <td colSpan={5} className="px-3 py-4 text-dim">
                            No completed terms were read.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                <div className="min-h-0 overflow-y-auto rounded-xl border border-line p-3.5">
                  <div className="label !text-[10px]">what the models are given</div>
                  {r.features.length ? (
                    <ul className="mt-2 divide-y divide-line">
                      {r.features.map((f) => (
                        <li key={f.name} className="py-1.5" title={f.name}>
                          <div className="flex items-baseline justify-between gap-3 text-[13px]">
                            <span className="text-muted">{f.label}</span>
                            <span className="num text-cream">
                              {fmt(f.value)}
                              {f.unit ? <span className="ml-1 text-[11px] text-dim">{f.unit}</span> : null}
                            </span>
                          </div>
                          {f.note && <div className="text-[11px] leading-snug text-dim">{f.note}</div>}
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-2 text-[13px] leading-relaxed text-dim">{derived ? "This server version doesn't report the model's individual inputs yet, so none are shown. The term table and totals are exactly what it holds." : "No model inputs were reported."}</p>
                  )}
                </div>
              </div>
            </div>
          )
        }
      </Stage>
    </SceneFrame>
  );
}
