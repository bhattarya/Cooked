"use client";

import type { Course, Student } from "./types";

// Sample degree audits built from synthetic students, so the upload flow can be demoed
// without anyone's real records. The PDF is written uncompressed so the local fallback
// can read the campus ID straight out of the bytes; the backend parser (Gemini) reads
// the whole document.

export function auditLines(s: Student, catalog: Course[]): string[] {
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const req = catalog.filter((c) => c.majors.includes(s.major));
  const done = new Set(s.done);
  const ip = new Set(s.ip);
  const pad = (x: string, n: number) => (x.length > n ? x.slice(0, n - 1) + "~" : x.padEnd(n));
  const lines = [
    "UNIVERSITY DEGREE AUDIT  (SYNTHETIC - HackUMBC 2026 dataset)",
    "================================================================",
    `Student ID: ${s.id}          Class: ${s.cls}`,
    `Program:    ${s.major} - ${s.track}`,
    `Entry:      ${s.entryTerm} (${s.entry === "T" ? "Transfer" : "First-Time Freshman"})`,
    `Credits:    ${s.credEarned} earned of ${s.credReq} required`,
    `GPA:        ${s.gpa ?? "n/a"}          Expected grad: ${s.expGrad}`,
    "",
    "TERM HISTORY (regular terms)",
    "  term   attempted  earned  W",
    ...s.terms.map((t, i) => `  ${String(i + 1).padStart(4)}   ${String(t[0]).padStart(9)}  ${String(t[1]).padStart(6)}  ${t[2]}`),
    "",
    "MAJOR REQUIREMENTS",
    ...req.map((c) => `  [${done.has(c.id) ? "X" : ip.has(c.id) ? "~" : " "}] ${pad(c.id, 9)} ${pad(c.title, 40)} ${c.credits} cr`),
    "",
    "IN PROGRESS (Fall 2026)",
    ...s.ip.map((id) => `  ${pad(id, 9)} ${byId.get(id)?.title ?? ""}`),
    "",
    "Legend: [X] complete  [~] in progress  [ ] not started",
    "This document is synthetic. It describes no real student.",
  ];
  return lines;
}

export function auditPdf(lines: string[]): Blob {
  const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
  const perPage = 58;
  const pages: string[][] = [];
  for (let i = 0; i < lines.length; i += perPage) pages.push(lines.slice(i, i + perPage));
  const objs: string[] = [];
  const pageIds: number[] = [];
  // 1 catalog, 2 pages, 3 font, then (page, content) pairs
  pages.forEach((pl, i) => {
    const pageId = 4 + i * 2;
    const contentId = pageId + 1;
    pageIds.push(pageId);
    const body = ["BT", "/F1 9 Tf", "11 TL", "40 800 Td", ...pl.map((l) => `(${esc(l)}) '`), "ET"].join("\n");
    objs[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    objs[contentId] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
  });
  objs[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objs[2] = `<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;
  objs[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>";
  let out = "%PDF-1.4\n";
  const xref: number[] = [];
  for (let i = 1; i < objs.length; i++) {
    xref[i] = out.length;
    out += `${i} 0 obj\n${objs[i]}\nendobj\n`;
  }
  const xrefAt = out.length;
  out += `xref\n0 ${objs.length}\n0000000000 65535 f \n`;
  for (let i = 1; i < objs.length; i++) out += `${String(xref[i]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xrefAt}\n%%EOF`;
  return new Blob([out], { type: "application/pdf" });
}

const API = process.env.NEXT_PUBLIC_API_URL;

// Returns the campus ID the audit belongs to. Backend: Gemini reads the document.
// Offline: look for a campus ID in the raw bytes (works for the sample audits).
export async function readAudit(file: File): Promise<{ id: string | null; via: "gemini" | "local" }> {
  if (API) {
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch(`${API}/audit/parse`, { method: "POST", body: fd });
      if (r.ok) {
        const j = (await r.json()) as { data?: { campus_id?: string | null; source?: string } };
        if (j.data?.campus_id) return { id: j.data.campus_id, via: j.data.source === "gemini" ? "gemini" : "local" };
      }
    } catch {
      /* fall through to local */
    }
  }
  const text = new TextDecoder("latin1").decode(await file.arrayBuffer());
  const m = text.match(/CID-\d{6}/);
  return { id: m ? m[0] : null, via: "local" };
}
