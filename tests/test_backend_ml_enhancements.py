"""Tests for backend API and ML data integration enhancements."""

from __future__ import annotations

from api.agent import _build_ml_evidence
from api.audit_parse import read_audit


def test_preset_sample_students_return_rich_profiles():
    cs_res = read_audit(b"UMBC Computer Science Senior audit")
    assert cs_res.profile is not None
    assert cs_res.profile.first_name == "Alex"
    assert cs_res.profile.major == "Computer Science"
    assert cs_res.profile.track == "Software Engineering"
    assert len(cs_res.profile.terms) == 6
    assert len(cs_res.profile.in_progress) == 3

    is_res = read_audit(b"UMBC Information Systems Junior degree audit")
    assert is_res.profile is not None
    assert is_res.profile.first_name == "Jordan"
    assert is_res.profile.major == "Information Systems"
    assert is_res.profile.track == "Business Analysis"
    assert len(is_res.profile.terms) == 4

    ds_res = read_audit(b"UMBC Data Science Major degree audit")
    assert ds_res.profile is not None
    assert ds_res.profile.first_name == "Taylor"
    assert ds_res.profile.track == "Data Science"

    bio_res = read_audit(b"UMBC Pre-Med / Bio Major degree audit")
    assert bio_res.profile is not None
    assert bio_res.profile.first_name == "Morgan"
    assert bio_res.profile.track == "Pre-Med / Bio"


def test_plain_text_and_markdown_audit_parsing():
    text_audit = (
        b"Student: Sam Smith\n"
        b"Major: Computer Science\n"
        b"Fall 2022\n"
        b"CMSC 201 4.0 A\n"
        b"MATH 151 4.0 B\n"
        b"Spring 2023\n"
        b"CMSC 202 4.0 A\n"
        b"In Progress:\n"
        b"CMSC 203 3.0 IP\n"
    )

    res = read_audit(text_audit)
    assert res.profile is not None
    assert res.profile.first_name == "Sam"
    assert res.profile.major == "Computer Science"
    assert len(res.profile.terms) == 2
    assert len(res.profile.in_progress) == 1


def test_non_standard_fallback_regex_matching():
    non_standard = (
        b"Major: Information Systems\n"
        b"Course IS-147 Grade A 3.0 credits\n"
        b"Course MGMT-210 Grade B 3.0 hrs\n"
        b"Currently Registered: IS-300 3.0\n"
    )

    res = read_audit(non_standard)
    assert res.profile is not None
    assert res.profile.major == "Information Systems"
    assert len(res.profile.terms) >= 1
    assert len(res.profile.completed_courses) >= 2


def test_ml_evidence_structure(monkeypatch):
    class MockEngine:
        models = type("M", (), {
            "manifest": {
                "gates": {"risk_discrimination": {"auc_after_one_term": 0.9254}},
                "metrics": {"1": {"brier": 0.0524}},
            },
            "calibrated_ok": True,
        })()
        people = type("P", (), {"alumni_ids": list(range(14000))})()

    eng = MockEngine()
    ev = _build_ml_evidence(eng)
    assert "Gradient Boosting" in ev["model_type"]
    assert "data/raw/alumni.csv" in ev["datasets"]
    assert ev["metrics"]["accuracy_auc"] == 0.9254
    assert ev["feature_importances"]["work_hours"] == 0.35
    assert ev["cohort_statistics"]["median_alumni_salary"] == 75000


def test_voice_and_say_integration(monkeypatch):
    from api.agent import say
    from api.engine import Engine

    class MockPeople:
        static = type("S", (), {"at": lambda *a: 0})()
        current_ids = ("CID-123456",)

    class MockEngine(Engine):
        def __init__(self):
            self._queue = None
            self._narrated = {}
            self._survival = {}
            self.people = MockPeople()
            self.models = type("M", (), {"version": "test-v1"})()

    eng = MockEngine()
    say_res = say(eng, "ready", name="Alex")
    assert say_res["kind"] == "say"
    text = say_res["text"]
    assert "Alex" in text

    v_res = eng.voice(text, "narrator")
    assert v_res["available"] is True
    assert "hash" in v_res

