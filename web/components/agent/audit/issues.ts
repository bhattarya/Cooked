import type { AuditErrorCode, Intake } from "@/lib/agentApi";

/** Why an audit could not be used, and which ways forward make sense for that reason. */
export interface AuditIssue {
  code: AuditErrorCode;
  title: string;
  body: string;
  /** The server's own message when it gave one: shown small, so the specific detail is never lost. */
  detail?: string | null;
  canRetry: boolean;
  canManual: boolean;
}

const COPY: Record<AuditErrorCode, { title: string; body: string }> = {
  unreadable: { title: "That file didn't read as an audit", body: "The text in it couldn't be made out. A scan or photo that is blurry or cropped does this. Re-export the audit as a PDF from your student portal, or enter your terms by hand. It takes about two minutes." },
  no_courses_found: { title: "No courses found in that file", body: "It opened fine, but no terms or courses were found. It may be the wrong document (a transcript summary or an unofficial letter) instead of the degree audit." },
  too_large: { title: "That file is too large", body: "Audits are small. Print only the audit pages to a new PDF, or enter your terms by hand." },
  unsupported_type: { title: "That isn't a PDF or a photo", body: "COOKED reads PDF audits and photos of them." },
  reader_unavailable: { title: "The reader is offline right now", body: "This isn't a problem with your file. The service that reads scans isn't reachable. PDFs with selectable text still work, or you can enter your terms by hand." },
  reader_timeout: { title: "Reading took too long", body: "The reader didn't answer in time. Your file is fine: try again, or enter your terms by hand." },
  network: { title: "Couldn't reach the COOKED server", body: "Check your connection and try again. Nothing was sent or stored." },
  server: { title: "The server hit a problem", body: "Nothing was stored. Try again, or enter your terms by hand." },
};

export function issueOf(code: AuditErrorCode, opts: { detail?: string | null; canRetry?: boolean; canManual?: boolean; body?: string } = {}): AuditIssue {
  const c = COPY[code];
  return { code, title: c.title, body: opts.body ?? c.body, detail: opts.detail ?? null, canRetry: opts.canRetry ?? !["too_large", "unsupported_type", "no_courses_found"].includes(code), canManual: opts.canManual ?? true };
}

/** An Intake that came back without a profile id. Old servers send only `error`: it is classified by what it says, never shown as a generic line. */
export function issueFromIntake(d: Intake): AuditIssue {
  let code = d.error_code ?? null;
  if (!code) {
    const e = (d.error ?? "").toLowerCase();
    code = /large|size/.test(e) ? "too_large" : /type|format|pdf or/.test(e) ? "unsupported_type" : /no course|no term/.test(e) ? "no_courses_found" : /timed out|timeout/.test(e) ? "reader_timeout" : /gemini|unavailable|quota|configured/.test(e) ? "reader_unavailable" : "unreadable";
  }
  return issueOf(code, { detail: d.error && d.error_code ? d.error : null, canRetry: d.can_retry, canManual: d.can_enter_manually });
}
