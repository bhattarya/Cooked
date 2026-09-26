"""Gemini (§8.5): writes calm prose around number placeholders. It never sees a number to write.

The model receives slots like {{t1}} with a *description* of each value, not the value itself,
must return JSON matching a schema, and must use only known slots. Anything else is rejected
and the deterministic template is used instead.
"""

from __future__ import annotations

import json
import os
import re
from urllib.parse import quote

from api.providers import net

SLOT = re.compile(r"\{\{(t\d+)\}\}")

SYSTEM = (
    "You write two or three short sentences for a student, in the calm, specific voice of an "
    "incident report: what happened, what it means, what to do next. You never write digits or "
    "number words. Every quantity must be one of the provided slots, written exactly like "
    "{{t1}}. Use each required slot once. No advice beyond the facts given. No blame."
)


def configured() -> bool:
    return bool(net.key("GEMINI_API_KEY") and os.getenv("GEMINI_MODEL"))


def model_name() -> str:
    return os.getenv("GEMINI_MODEL", "")


def write(kind: str, facts: str, slots: dict[str, str]) -> str | None:
    """Returns text containing {{tN}} placeholders, or None on any failure."""
    if not configured():
        return None
    slot_lines = "\n".join(f"{{{{{k}}}}}: {desc}" for k, desc in slots.items())
    prompt = f"{SYSTEM}\n\nMessage type: {kind}\nFacts: {facts}\nSlots:\n{slot_lines}"
    try:
        r = net.request(
            "POST",
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(model_name(), safe='')}:generateContent",
            headers={"x-goog-api-key": net.key("GEMINI_API_KEY")},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "temperature": 0.3 if kind == "alarm" else 0.1,
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {"script": {"type": "STRING"}},
                        "required": ["script"],
                    },
                },
            },
        )
        r.raise_for_status()
        parts = r.json()["candidates"][0]["content"]["parts"]
        body = json.loads("".join(p.get("text", "") for p in parts if not p.get("thought")))
        return str(body["script"])
    except Exception:  # noqa: BLE001 -- provider failures fall back to the template
        return None


def read_audit(pdf: bytes, mime: str) -> str | None:
    """Extract a synthetic campus ID from an uploaded audit. Returns None when unsure."""
    if not configured():
        return None
    import base64

    try:
        r = net.request(
            "POST",
            "https://generativelanguage.googleapis.com/v1beta/models/"
            f"{quote(model_name(), safe='')}:generateContent",
            headers={"x-goog-api-key": net.key("GEMINI_API_KEY")},
            json={
                "contents": [
                    {
                        "parts": [
                            {"inline_data": {"mime_type": mime, "data": base64.b64encode(pdf).decode()}},
                            {"text": "Return the student's campus ID (format CID-000000) from this synthetic degree audit."},
                        ]
                    }
                ],
                "generationConfig": {
                    "temperature": 0,
                    "responseMimeType": "application/json",
                    "responseSchema": {
                        "type": "OBJECT",
                        "properties": {"campus_id": {"type": "STRING"}},
                        "required": ["campus_id"],
                    },
                },
            },
        )
        r.raise_for_status()
        parts = r.json()["candidates"][0]["content"]["parts"]
        cid = json.loads("".join(p.get("text", "") for p in parts))["campus_id"]
        return cid if re.fullmatch(r"CID-\d{6}", cid) else None
    except Exception:  # noqa: BLE001
        return None
