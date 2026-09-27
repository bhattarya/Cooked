"""Claude vision, used as the primary image reader for scanned/photographed degree audits.

Same contract as `gemini.parse_audit_ex`: returns (AuditProfile-shaped dict, None) on success, or
(None, reason) with reason in {"unconfigured", "timeout", "busy", "unreadable"}. Extraction only:
no chain-of-thought, temperature 0, and the model is told to return JSON matching our schema and
nothing else (Claude has no native structured-output mode, so the schema is spelled out in the
prompt and the reply is parsed defensively).
"""

from __future__ import annotations

import json
import os
import re

from api.providers import net

DEFAULT_MODELS = "claude-haiku-4-5,claude-sonnet-5"

SCHEMA_TEXT = """{
  "first_name": string or null,
  "major": "Computer Science" | "Information Systems",
  "track": string or null,
  "entry_type": "First-Time Freshman" | "Transfer",
  "residency": "In-State" | "Out-of-State",
  "credits_earned": integer or null,
  "credits_required": integer,
  "terms": [ { "label": string (e.g. "Fall 2024", or "Term 1" if unnamed),
               "courses": [ { "course_id": string (e.g. "CMSC 201"), "credits": number,
                              "grade": string (letter grade, W, F, or "" if in progress) } ],
               "credits_attempted": number or null, "credits_earned": number or null,
               "withdrawals": integer or null } ],
  "in_progress": [ { "course_id": string, "credits": number, "grade": "" } ],
  "completed_courses": [ string ]
}"""

AUDIT_PROMPT = (
    "Extract this university degree audit into JSON matching exactly this shape (no extra keys, "
    "no prose, no markdown fences):\n" + SCHEMA_TEXT + "\n\n"
    "Give only the student's first name (no id numbers, emails or addresses), major, track or "
    "concentration, whether they entered as a transfer student, residency if stated, total credits "
    "earned and required, and courses in progress. List every completed term in order: with its "
    "courses (course id, credits, grade) when shown, otherwise with the term's credits attempted, "
    "credits earned and withdrawals. Keep numbered terms as 'Term 1', 'Term 2'. Also list every "
    "course the audit marks complete anywhere (for example a checked requirement). Reply with the "
    "JSON object only."
)

_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def configured() -> bool:
    return bool(net.key("ANTHROPIC_API_KEY"))


def model_chain() -> list[str]:
    return [m.strip() for m in os.getenv("ANTHROPIC_MODELS", DEFAULT_MODELS).split(",") if m.strip()]


def _extract_json(text: str) -> dict | None:
    text = _FENCE.sub("", text.strip())
    try:
        return json.loads(text)
    except ValueError:
        pass
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1 or end <= start:
        return None
    try:
        return json.loads(text[start : end + 1])
    except ValueError:
        return None


def parse_audit_ex(data: bytes, mime: str) -> tuple[dict | None, str | None]:
    """Degree audit (PDF or image) -> (AuditProfile-shaped dict, None) or (None, reason)."""
    if not configured():
        return None, "unconfigured"
    import base64

    b64 = base64.b64encode(data).decode()
    doc_type = "document" if mime == "application/pdf" else "image"
    block = {"type": doc_type, "source": {"type": "base64", "media_type": mime, "data": b64}}
    body_base = {
        "max_tokens": 4096,
        "temperature": 0,
        "messages": [{"role": "user", "content": [block, {"type": "text", "text": AUDIT_PROMPT}]}],
    }
    reason = "unreadable"
    for model in model_chain():
        try:
            r = net.request(
                "POST",
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": net.key("ANTHROPIC_API_KEY"),
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={**body_base, "model": model},
                timeout=25,
            )
        except Exception:  # noqa: BLE001 -- network hiccup: try the next model
            reason = "timeout"
            continue
        if r.status_code == 429:
            reason = "busy"
            continue
        if r.status_code in (404, 400) or r.status_code >= 500:
            reason = "busy" if r.status_code >= 500 else "unreadable"
            continue
        if not r.is_success:
            reason = "unreadable"
            continue
        try:
            text = "".join(p.get("text", "") for p in r.json()["content"] if p.get("type") == "text")
        except Exception:  # noqa: BLE001
            reason = "unreadable"
            continue
        parsed = _extract_json(text)
        if parsed is None:
            reason = "unreadable"
            continue
        return parsed, None
    return None, reason
