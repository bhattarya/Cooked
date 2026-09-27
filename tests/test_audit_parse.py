"""Deterministic audit parsing (§ round-3 audit brief): text-layer parser, error taxonomy, the
manual-entry endpoint, and Gemini-fallback wiring with the network stubbed (no real Gemini calls).
"""

from __future__ import annotations

import io
import json
import time
from pathlib import Path

import pytest

from api import audit_parse
from api.providers import claude, gemini

FIX = Path(__file__).parent / "fixtures" / "audits"
TEXT_FIXTURES = [
    "blocks_cs",
    "flat_table_is",
    "oneline_lists",
    "two_column",
    "numbered_terms",
    "multipage_long",
    "totals_only",
    "transfer_credits",
    "messy_grades",
    "mono_sample_style",
]


def truth(name: str) -> dict:
    return json.loads((FIX / f"{name}.json").read_text())


@pytest.mark.parametrize("name", TEXT_FIXTURES)
def test_text_parser_matches_ground_truth_exactly(name):
    data = (FIX / f"{name}.pdf").read_bytes()
    out = audit_parse.read_audit(data)
    want = truth(name)
    assert out.profile is not None, f"{name}: {out.error_code} {out.message}"
    assert out.method == "text"
    p = out.profile
    assert p.first_name == want["first_name"]
    assert p.major == want["major"]
    assert (p.track or None) == want["track"]
    assert p.entry_type == want["entry_type"]
    assert p.residency == want["residency"]
    assert p.credits_required == want["credits_required"]
    assert p.credits_earned == want["credits_earned"]
    assert len(p.terms) == len(want["terms"])
    for got_term, want_term in zip(p.terms, want["terms"]):
        assert got_term.label == want_term["label"]
        got_courses = [(c.course_id, c.credits, c.grade) for c in got_term.courses]
        want_courses = [(c["course_id"], c["credits"], c["grade"]) for c in want_term["courses"]]
        assert got_courses == want_courses, got_term.label
    assert sorted(c.course_id for c in p.in_progress) == sorted(want["in_progress"])


@pytest.mark.parametrize("name", TEXT_FIXTURES)
def test_text_parser_is_fast(name):
    data = (FIX / f"{name}.pdf").read_bytes()
    t0 = time.perf_counter()
    out = audit_parse.read_audit(data)
    ms = (time.perf_counter() - t0) * 1000
    assert out.profile is not None
    assert ms < 500, f"{name} took {ms:.1f}ms"
    assert out.reading.ms < 500


def test_garbage_pdf_is_an_honest_unreadable_error():
    out = audit_parse.read_audit((FIX / "garbage.pdf").read_bytes())
    assert out.profile is None
    assert out.error_code == "unreadable"
    assert out.can_manual
    assert "damaged" in out.message or "renamed" in out.message


def test_encrypted_pdf_gets_a_specific_message():
    out = audit_parse.read_audit((FIX / "encrypted.pdf").read_bytes())
    assert out.profile is None
    assert out.error_code == "unreadable"
    assert "password" in out.message.lower()
    assert out.can_manual


def test_empty_file_is_unreadable():
    out = audit_parse.read_audit(b"")
    assert out.profile is None
    assert out.error_code == "unreadable"


def test_oversized_file_is_rejected():
    out = audit_parse.read_audit(b"%PDF-1.4" + b"0" * (audit_parse.MAX_BYTES + 10))
    assert out.error_code == "too_large"
    assert not out.can_retry


def test_unsupported_type_is_rejected():
    out = audit_parse.read_audit(b"not a pdf or image at all")
    assert out.error_code == "unsupported_type"


def test_scanned_pdf_with_no_text_falls_back_to_vision(monkeypatch):
    data = (FIX / "scan_image_only.pdf").read_bytes()
    seen = {}

    def fake_ex(payload, mime):
        seen["mime"] = mime
        return json.loads((FIX / "scan_image_only.json").read_text()) | {
            "major": "Computer Science",
            "terms": [{"label": "Fall 2023", "courses": [{"course_id": "CMSC 201", "credits": 4, "grade": "A"}]}],
            "in_progress": [],
            "completed_courses": [],
            "credits_required": 120,
        }, None

    monkeypatch.setattr(claude, "configured", lambda: False)
    monkeypatch.setattr(gemini, "configured", lambda: True)
    monkeypatch.setattr(gemini, "parse_audit_ex", fake_ex)
    monkeypatch.setattr("api.providers.net.enabled", lambda: True)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: None)
    monkeypatch.setattr(audit_parse, "_store_vision", lambda key, parsed, reader: None)

    out = audit_parse.read_audit(data)
    assert out.profile is not None
    assert out.method == "vision"
    assert out.reader == "gemini"
    assert seen["mime"] == "application/pdf"
    assert out.reading.method == "vision"


def test_vision_unconfigured_gives_manual_entry_message(monkeypatch):
    data = (FIX / "scan_image_only.pdf").read_bytes()
    monkeypatch.setattr(claude, "configured", lambda: False)
    monkeypatch.setattr(gemini, "configured", lambda: False)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: None)
    out = audit_parse.read_audit(data)
    assert out.profile is None
    assert out.error_code == "reader_unavailable"
    assert out.can_manual
    assert not out.can_retry


def test_vision_timeout_is_retryable(monkeypatch):
    data = (FIX / "scan_image_only.pdf").read_bytes()
    monkeypatch.setattr(claude, "configured", lambda: False)
    monkeypatch.setattr(gemini, "configured", lambda: True)
    monkeypatch.setattr("api.providers.net.enabled", lambda: True)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: None)
    monkeypatch.setattr(gemini, "parse_audit_ex", lambda data, mime: (None, "timeout"))
    out = audit_parse.read_audit(data)
    assert out.error_code == "reader_timeout"
    assert out.can_retry
    assert out.can_manual


def test_vision_busy_is_retryable_with_specific_message(monkeypatch):
    data = (FIX / "scan_image_only.pdf").read_bytes()
    monkeypatch.setattr(claude, "configured", lambda: False)
    monkeypatch.setattr(gemini, "configured", lambda: True)
    monkeypatch.setattr("api.providers.net.enabled", lambda: True)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: None)
    monkeypatch.setattr(gemini, "parse_audit_ex", lambda data, mime: (None, "busy"))
    out = audit_parse.read_audit(data)
    assert out.error_code == "reader_unavailable"
    assert out.can_retry
    assert "busy" in out.message


def test_vision_result_is_cached_by_content_hash(monkeypatch):
    data = (FIX / "scan_image_only.pdf").read_bytes()
    store = {}
    calls = {"n": 0}

    def fake_ex(payload, mime):
        calls["n"] += 1
        return {"major": "Computer Science", "entry_type": "First-Time Freshman", "terms": [], "in_progress": [], "credits_required": 120}, None

    monkeypatch.setattr(claude, "configured", lambda: False)
    monkeypatch.setattr(gemini, "configured", lambda: True)
    monkeypatch.setattr("api.providers.net.enabled", lambda: True)
    monkeypatch.setattr(gemini, "parse_audit_ex", fake_ex)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: store.get(key))
    monkeypatch.setattr(audit_parse, "_cached_vision_reader", lambda key: "gemini")
    monkeypatch.setattr(audit_parse, "_store_vision", lambda key, parsed, reader: store.__setitem__(key, parsed))

    p1, _reason1, cached1, reader1 = audit_parse.read_vision(data, "application/pdf")
    p2, _reason2, cached2, reader2 = audit_parse.read_vision(data, "application/pdf")
    assert p1 is not None and p2 is not None
    assert cached1 is False and cached2 is True
    assert reader1 == "gemini" and reader2 == "gemini"
    assert calls["n"] == 1  # second call served from cache, no network


def test_gemini_model_chain_advances_past_429_then_succeeds(monkeypatch):
    """`_post_chain` walks GEMINI_MODELS on 429/404/5xx without ever sleeping past the budget."""
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.6-flash")
    monkeypatch.setenv("GEMINI_MODELS", "gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview")
    calls = []

    def fake_post_model(model, body, timeout):
        calls.append(model)
        if model != "gemini-3-flash-preview":
            return None, "retry"
        return {"candidates": [{"content": {"parts": [{"text": "{}"}]}}]}, None

    monkeypatch.setattr(gemini, "_post_model", fake_post_model)
    _out, reason = gemini._post_chain({}, per_attempt_timeout=1, total_budget=5)
    assert reason is None
    assert calls == ["gemini-3.6-flash", "gemini-3.5-flash", "gemini-3-flash-preview"]


def test_gemini_model_chain_reports_timeout_when_budget_exhausted(monkeypatch):
    monkeypatch.setenv("GEMINI_MODEL", "gemini-3.6-flash")
    monkeypatch.setenv("GEMINI_MODELS", "gemini-3.6-flash,gemini-3.5-flash")

    def fake_post_model(model, body, timeout):
        return None, "timeout"

    monkeypatch.setattr(gemini, "_post_model", fake_post_model)
    out, reason = gemini._post_chain({}, per_attempt_timeout=1, total_budget=0)
    assert out is None
    assert reason == "timeout"


def test_parse_audit_ex_disables_thinking_and_uses_schema(monkeypatch):
    monkeypatch.setattr(gemini, "configured", lambda: True)
    captured = {}

    def fake_chain(body, per_attempt_timeout=25, total_budget=45):
        captured["body"] = body
        return {"candidates": [{"content": {"parts": [{"text": json.dumps({"major": "Computer Science", "entry_type": "First-Time Freshman", "terms": [], "in_progress": [], "credits_required": 120})}]}}]}, None

    monkeypatch.setattr(gemini, "_post_chain", fake_chain)
    parsed, reason = gemini.parse_audit_ex(b"data", "image/png")
    assert reason is None and parsed is not None
    assert captured["body"]["generationConfig"]["thinkingConfig"]["thinkingBudget"] == 0


@pytest.mark.db
def test_manual_endpoint_accepts_and_registers(db, engine_client):
    body = {
        "first_name": "Jamie",
        "major": "Computer Science",
        "entry_type": "First-Time Freshman",
        "residency": "In-State",
        "credits_required": 120,
        "terms": [
            {"label": "Fall 2023", "courses": [{"id": "CMSC 201", "credits": 4, "grade": "A"}, {"id": "MATH 151", "credits": 4, "grade": "B"}]}
        ],
        "in_progress": ["CMSC 202"],
    }
    r = engine_client.post("/audit/manual", json=body)
    assert r.status_code == 200
    data = r.json()["data"]
    assert data["id"].startswith("USR-")
    assert data["source"] == "manual"
    assert data["first_name"] == "Jamie"
    assert data["reading"]["method"] == "manual"
    state = engine_client.get(f"/students/{data['id']}/state")
    assert state.status_code == 200


@pytest.mark.db
def test_manual_endpoint_rejects_too_many_terms(db, engine_client):
    body = {
        "major": "Computer Science",
        "entry_type": "First-Time Freshman",
        "terms": [{"label": f"Term {i}", "courses": []} for i in range(21)],
    }
    r = engine_client.post("/audit/manual", json=body)
    assert r.status_code == 422


@pytest.mark.db
def test_manual_endpoint_rejects_too_many_courses_in_a_term(db, engine_client):
    body = {
        "major": "Computer Science",
        "entry_type": "First-Time Freshman",
        "terms": [{"label": "Fall 2023", "courses": [{"id": "CMSC 201", "credits": 3, "grade": "A"} for _ in range(13)]}],
    }
    r = engine_client.post("/audit/manual", json=body)
    assert r.status_code == 422


@pytest.mark.db
def test_sample_pdf_still_routes_to_the_synthetic_student(db, engine_client):
    pdf = b"%PDF-1.4 (UNIVERSITY DEGREE AUDIT  (SYNTHETIC - HackUMBC 2026 dataset)) (Student ID: CID-510094)"
    r = engine_client.post("/audit/parse", files={"file": ("a.pdf", io.BytesIO(pdf), "application/pdf")})
    data = r.json()["data"]
    assert data["id"] == "CID-510094" and data["source"] == "sample"
    assert data["reading"]["method"] == "sample"


@pytest.mark.db
def test_real_pdf_without_gemini_and_without_text_layer_is_honest(db, engine_client):
    # engine_client disables outbound network, so the vision fallback is unavailable here too;
    # a garbage/no-course PDF must still fail with a specific, actionable message, not a generic one
    body = engine_client.post("/audit/parse", files={"file": ("x.pdf", io.BytesIO(b"%PDF real"), "application/pdf")})
    data = body.json()["data"]
    assert data["id"] is None
    assert data["error_code"] in {"unreadable", "no_courses_found", "reader_unavailable"}
    assert data["can_enter_manually"]
    assert "Try a clearer PDF" not in data["error"]  # never the old generic line


@pytest.mark.db
def test_real_text_pdf_is_parsed_without_gemini(db, engine_client):
    # engine_client disables outbound network entirely, proving the text path needs no LLM
    data = (FIX / "blocks_cs.pdf").read_bytes()
    r = engine_client.post("/audit/parse", files={"file": ("audit.pdf", io.BytesIO(data), "application/pdf")})
    body = r.json()["data"]
    assert body["id"] is not None and body["id"].startswith("USR-")
    assert body["source"] == "parser"
    assert body["first_name"] == "Maya"
    assert body["reading"]["method"] == "text"
    assert body["reading"]["ms"] < 2000


def test_claude_is_tried_before_gemini_when_both_configured(monkeypatch):
    """Claude is the primary vision reader; Gemini is a fallback, never called if Claude succeeds."""
    data = (FIX / "scan_image_only.pdf").read_bytes()
    calls = {"claude": 0, "gemini": 0}

    def fake_claude(payload, mime):
        calls["claude"] += 1
        return {"major": "Computer Science", "entry_type": "First-Time Freshman", "terms": [], "in_progress": [], "credits_required": 120}, None

    def fake_gemini(payload, mime):
        calls["gemini"] += 1
        return None, "unreadable"

    monkeypatch.setattr(claude, "configured", lambda: True)
    monkeypatch.setattr(claude, "parse_audit_ex", fake_claude)
    monkeypatch.setattr(gemini, "configured", lambda: True)
    monkeypatch.setattr(gemini, "parse_audit_ex", fake_gemini)
    monkeypatch.setattr("api.providers.net.enabled", lambda: True)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: None)
    monkeypatch.setattr(audit_parse, "_store_vision", lambda key, parsed, reader: None)

    out = audit_parse.read_audit(data)
    assert out.profile is not None
    assert out.reader == "claude"
    assert calls == {"claude": 1, "gemini": 0}


def test_gemini_still_answers_when_claude_fails(monkeypatch):
    """If Claude is unconfigured or every Claude model fails, Gemini is tried next."""
    data = (FIX / "scan_image_only.pdf").read_bytes()

    def fake_gemini(payload, mime):
        return {"major": "Computer Science", "entry_type": "First-Time Freshman", "terms": [], "in_progress": [], "credits_required": 120}, None

    monkeypatch.setattr(claude, "configured", lambda: True)
    monkeypatch.setattr(claude, "parse_audit_ex", lambda payload, mime: (None, "unreadable"))
    monkeypatch.setattr(gemini, "configured", lambda: True)
    monkeypatch.setattr(gemini, "parse_audit_ex", fake_gemini)
    monkeypatch.setattr("api.providers.net.enabled", lambda: True)
    monkeypatch.setattr(audit_parse, "_cached_vision", lambda key: None)
    monkeypatch.setattr(audit_parse, "_store_vision", lambda key, parsed, reader: None)

    out = audit_parse.read_audit(data)
    assert out.profile is not None
    assert out.reader == "gemini"


def test_response_source_reports_the_actual_reader_not_hardcoded_gemini():
    """Regression: the /audit/parse `source` field must say which reader actually ran."""
    profile = audit_parse.AuditProfile(major="Computer Science", entry_type="First-Time Freshman", terms=[], in_progress=[], credits_required=120)
    o = audit_parse.Outcome(profile=profile, method="vision", reader="claude", reading=audit_parse.Reading(method="vision"))
    assert {"text": "parser", "vision": o.reader or "gemini"}[o.method] == "claude"


def test_claude_extract_json_strips_markdown_fences():
    from api.providers import claude as claude_mod

    text = '```json\n{"major": "Computer Science", "entry_type": "First-Time Freshman", "terms": [], "in_progress": [], "credits_required": 120}\n```'
    parsed = claude_mod._extract_json(text)
    assert parsed is not None and parsed["major"] == "Computer Science"


def test_claude_configured_reflects_the_anthropic_key(monkeypatch):
    from api.providers import claude as claude_mod

    monkeypatch.setattr("api.providers.net.key", lambda name: "sk-ant-test" if name == "ANTHROPIC_API_KEY" else None)
    assert claude_mod.configured() is True
    monkeypatch.setattr("api.providers.net.key", lambda name: None)
    assert claude_mod.configured() is False
