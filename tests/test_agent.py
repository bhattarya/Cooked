import io

import pytest
from helpers import make_people

from api import provenance
from api.agent import local_route
from ml.snapshots import stage_features
from ml.twins import SMD_MAX, TwinIndex


@pytest.mark.parametrize(
    ("question", "tool", "args"),
    [
        ("what if I take CMSC 341 instead of CMSC 313?", "course_plan", {"take": "CMSC341", "instead_of": "CMSC313"}),
        ("planning to take is 300 instead of cmsc 304", "course_plan", {"take": "IS300", "instead_of": "CMSC304"}),
        ("can I take CMSC331 next spring", "course_plan", {"take": "CMSC331"}),
        ("what if I work 10 hours a week", "what_if", {"work_hours": 10}),
        ("what if I take 15 credits", "what_if", {"credits_per_term": 15}),
        ("stress test my plan at 15 credits", "stress_test", {"credits_per_term": 15}),
        ("what if I take 3 more credits a term?", "what_if", {"credits_delta": 3}),
        ("what if I work 5 fewer hours", "what_if", {"work_delta": -5}),
        ("how do I get un-cooked", "find_fix", {}),
        ("am I cooked?", "explain_risk", {}),
    ],
)
def test_local_router(question, tool, args):
    assert local_route(question) == (tool, args)


def test_edge_profiles_are_trimmed_to_balance_not_refused():
    people = make_people(120, work=10)
    # skew the cohort: most alumni work more than the student, a few work less
    for i, cid in enumerate([c for c in people.static.index if c.startswith("CID-9")]):
        people.static.loc[cid, "work_hours"] = 12 if i % 4 else 8
    s = people.static.loc["CID-000001"]
    t = people.terms_of("CID-000001")
    result = TwinIndex(people).find(stage_features(s, t, len(t)), len(t))
    assert not result.refused and result.n >= 30
    assert all(v < SMD_MAX for v in result.smd.values())


@pytest.mark.db
def test_sample_audit_and_questions_end_to_end(db, engine_client):
    pdf = b"%PDF-1.4 (UNIVERSITY DEGREE AUDIT  (SYNTHETIC - HackUMBC 2026 dataset)) (Student ID: CID-510094)"
    intake = engine_client.post("/audit/parse", files={"file": ("a.pdf", io.BytesIO(pdf), "application/pdf")})
    data = intake.json()["data"]
    assert data["id"] == "CID-510094" and data["source"] == "sample"
    for q in ("CMSC 341 instead of CMSC 313?", "what if I work 5 hours", "stress test", "how do I fix it", "why?"):
        body = engine_client.post("/students/CID-510094/ask", json={"question": q}).json()["data"]
        assert body["provenance"]["ok"], q
        assert provenance.check(body["segments"])["ok"]
        assert body["visual"]["type"] in {"course", "whatif", "drill", "repair", "explain"}


@pytest.mark.db
def test_real_audit_without_gemini_is_an_honest_error(db, engine_client):
    body = engine_client.post("/audit/parse", files={"file": ("x.pdf", io.BytesIO(b"%PDF real"), "application/pdf")})
    data = body.json()["data"]
    assert data["id"] is None and "Gemini" in data["error"]
