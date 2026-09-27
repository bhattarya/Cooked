"""Regression tests for audit-derived features; no providers or database required."""
import io
from unittest.mock import Mock

import pandas as pd
import pytest
from fastapi.testclient import TestClient
from helpers import make_people
from pydantic import ValidationError

from api import agent, profiles
from api.main import app
from api.routes import product


def test_only_finished_graded_courses_earn_credit():
    p = profiles.AuditProfile(terms=[profiles.AuditTerm(label="Fall 2025", courses=[
        profiles.AuditCourse(course_id=f"CMSC{201+i}", credits=3, grade=g)
        for i, g in enumerate(["A", "F", "W", "IP", "", "I", "AU", "P", "NP"])
    ])])
    rows, passed = profiles.term_rows(p)
    assert rows.tolist() == [[15, 6, 1, 2, 0]]
    assert passed == {"CMSC201", "CMSC208"}


def test_all_in_progress_term_is_not_a_completed_term():
    p = profiles.AuditProfile(terms=[profiles.AuditTerm(label="Fall 2026", courses=[
        profiles.AuditCourse(course_id="CMSC201", grade="IP")])])
    rows, passed = profiles.term_rows(p)
    assert rows.shape == (0, 5)
    assert not passed


def test_transfer_and_fractional_credits_come_from_audit_total():
    people = make_people(2)
    people.current_extra = pd.DataFrame(columns=["credits_earned", "credits_required", "internship_count", "class_level", "entry_term", "expected_graduation_term"])
    p = profiles.AuditProfile(credits_earned=62.5, credits_required=120,
        entry_type="Transfer", completed_courses=["MATH 151"], terms=[
            profiles.AuditTerm(label="Fall 2025", credits_attempted=12.5, credits_earned=9.5),
            profiles.AuditTerm(label="Fall 2024", credits_attempted=15, credits_earned=12),
        ])
    profiles.register(people, "USR-test", p)
    assert people.current_extra.loc["USR-test", "credits_earned"] == 62.5
    assert people.terms["USR-test"][:, 1].tolist() == [12, 9.5]
    assert people.gaps["USR-test"] == 1
    assert "MATH151" in people.courses_done["USR-test"]


def test_inconsistent_or_missing_term_totals_are_rejected():
    with pytest.raises(ValidationError):
        profiles.AuditTerm(label="Fall 2025", credits_attempted=12, credits_earned=15)
    with pytest.raises(ValidationError):
        profiles.AuditTerm(label="Fall 2025", credits_attempted=12)


def test_common_degree_audit_major_labels_normalize_to_model_majors():
    assert profiles.AuditProfile(major="B.S. Computer Science").major == "Computer Science"
    assert profiles.AuditProfile(major="Information Systems, B.S.").major == "Information Systems"
    assert profiles.AuditProfile(major="Mechanical Engineering").major == "Computer Science"


def test_common_entry_and_residency_labels_normalize():
    profile = profiles.AuditProfile(
        major="Computer Science B.S.",
        entry_type="First-year student",
        residency="Maryland resident",
    )
    assert profile.entry_type == "First-Time Freshman"
    assert profile.residency == "In-State"
    assert profiles.AuditProfile(
        major="Information Systems", entry_type="Transfer student", residency="Non-resident"
    ).entry_type == "Transfer"


def test_repeats_sort_chronologically_and_summer_does_not_change_stage():
    p = profiles.AuditProfile(terms=[
        profiles.AuditTerm(label="Spring 2025", courses=[profiles.AuditCourse(course_id="CMSC201", grade="B")]),
        profiles.AuditTerm(label="Summer 2024", courses=[profiles.AuditCourse(course_id="MATH151", grade="A")]),
        profiles.AuditTerm(label="Fall 2024", courses=[profiles.AuditCourse(course_id="CMSC201", grade="F")]),
    ])
    rows, _ = profiles.term_rows(p)
    assert rows.tolist() == [[3, 0, 0, 1, 0], [3, 3, 0, 0, 1]]


def test_invalid_extraction_is_a_readable_error(monkeypatch):
    monkeypatch.setattr(agent.net, "enabled", lambda: True)
    monkeypatch.setattr(agent.gemini, "configured", lambda: True)
    monkeypatch.setattr(agent.claude, "parse_audit", lambda *_: {"credits_earned": "invalid_number"})
    result = agent.intake(Mock(), b"%PDF-test", "application/pdf")
    assert result["id"] is None
    assert "verify" in result["error"]


@pytest.mark.parametrize("payload,mime,status", [(b"", "application/pdf", 422), (b"hello", "application/pdf", 415), (b"x" * 8_000_001, "application/pdf", 413)])
def test_upload_validation(payload, mime, status):
    with TestClient(app) as client:
        response = client.post("/audit/parse", files={"file": ("audit.pdf", io.BytesIO(payload), mime)})
    assert response.status_code == status
    assert response.json()["message"] != "The requested resource is unavailable."


def test_pdf_signature_overrides_empty_browser_mime(monkeypatch):
    monkeypatch.setattr(product, "get_engine", lambda: object())
    monkeypatch.setattr(product, "wrap", lambda d: {"data": d, "model_version": "test"})
    seen = []
    def intake(engine, data, mime):
        seen.append(mime)
        return {"id": None, "error": "test"}
    monkeypatch.setattr(agent, "intake", intake)
    with TestClient(app) as client:
        response = client.post("/audit/parse", files={"file": ("audit.pdf", b"%PDF-1.4 test", "application/octet-stream")})
    assert response.status_code == 200
    assert seen == ["application/pdf"]


def test_credit_question_reads_audit_facts():
    assert agent.local_route("How many credits do I have left?") == ("audit_summary", {})
    engine = Mock()
    engine.state.return_value = {"credits_earned": 62.5, "credits_required": 120,
        "terms_done": {"tool_result_id": "test"}, "courses_done": ["CMSC201"], "courses_in_progress": ["CMSC202"]}
    segments, visual = agent._audit_summary(engine, "USR-test", {}, None, None)
    values = [s["value"] for s in segments if "value" in s]
    assert values == ["62.5", "120", "57.5", "CMSC201", "CMSC202"]
    assert visual["state"] == engine.state.return_value


@pytest.mark.db
def test_uploaded_profile_is_used_by_models(db, engine_client, monkeypatch):
    monkeypatch.setattr(agent.net, "enabled", lambda: True)
    monkeypatch.setattr(agent.gemini, "configured", lambda: True)
    monkeypatch.setattr(agent.claude, "parse_audit", lambda *_: {
        "major": "Computer Science", "entry_type": "Transfer",
        "credits_earned": 62.5, "credits_required": 120,
        "terms": [{"label": "Fall 2025", "courses": [
            {"course_id": "CMSC201", "credits": 4, "grade": "A"},
            {"course_id": "MATH151", "credits": 4, "grade": "B"},
            {"course_id": "ENGL100", "credits": 3, "grade": "P"},
            {"course_id": "STAT355", "credits": 3, "grade": "IP"},
        ]}],
        "in_progress": [{"course_id": "STAT355", "credits": 3}],
    })
    response = engine_client.post("/audit/parse", files={"file": ("audit.pdf", b"%PDF-1.4 test", "application/pdf")})
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"].startswith("USR-")
    pid = data["id"]
    try:
        state = engine_client.get(f"/students/{pid}/state").json()["data"]
        assert state["credits_earned"] == 62.5
        assert state["terms"][0]["earned"] == 11
        assert state["courses_in_progress"] == ["STAT355"]
        assert "STAT355" not in state["courses_done"]
        assert 0 <= state["risk"]["value"] <= 1
    finally:
        db.execute("DELETE FROM app.user_profile WHERE id=%s", (pid,))
        db.commit()
