"""Profiles from uploaded degree audits.

A parsed audit becomes the same stage-aligned shape as a dataset student: regular terms with
credits attempted/earned, withdrawals, fails and repeats, plus completed and in-progress
courses. It is registered in the engine under a random USR- id, so every tool (twins, risk,
drill, repair, course planning) works on it unchanged. Only parsed courses are stored.
"""

from __future__ import annotations

import json
import re
import secrets
from typing import Annotated, Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, field_validator

COURSE = re.compile(r"^([A-Z]{2,4})\s?(\d{3}[A-Z]?)$")


def norm_course(raw: str) -> str:
    m = COURSE.match(raw.strip().upper())
    return f"{m.group(1)}{m.group(2)}" if m else raw.strip().upper().replace(" ", "")


class AuditCourse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    course_id: Annotated[str, Field(min_length=3, max_length=12)]
    credits: Annotated[float, Field(ge=0, le=8)] = 3
    grade: Annotated[str, Field(max_length=3)] = ""

    @field_validator("course_id")
    @classmethod
    def _norm(cls, v: str) -> str:
        return norm_course(v)


class AuditTerm(BaseModel):
    """A term either lists its courses or, on some audits, only credit totals."""

    model_config = ConfigDict(extra="ignore")
    label: Annotated[str, Field(max_length=30)]
    courses: Annotated[list[AuditCourse], Field(max_length=16)] = Field(default_factory=list)
    credits_attempted: Annotated[float, Field(ge=0, le=30)] | None = None
    credits_earned: Annotated[float, Field(ge=0, le=30)] | None = None
    withdrawals: Annotated[int, Field(ge=0, le=8)] | None = None


class AuditProfile(BaseModel):
    """What we keep from an audit. No file, no student id number, no address."""

    model_config = ConfigDict(extra="ignore")
    first_name: Annotated[str, Field(max_length=30)] | None = None
    major: Literal["Computer Science", "Information Systems"] = "Computer Science"
    track: Annotated[str, Field(max_length=40)] | None = None
    entry_type: Literal["First-Time Freshman", "Transfer"] = "First-Time Freshman"
    residency: Literal["In-State", "Out-of-State"] = "In-State"
    work_hours: Annotated[int, Field(ge=0, le=60)] | None = None
    credits_earned: Annotated[int, Field(ge=0, le=200)] | None = None
    credits_required: Annotated[int, Field(ge=60, le=200)] = 120
    internships: Annotated[int, Field(ge=0, le=10)] = 0
    terms: Annotated[list[AuditTerm], Field(max_length=32)] = Field(default_factory=list)
    in_progress: Annotated[list[AuditCourse], Field(max_length=12)] = Field(default_factory=list)
    completed_courses: Annotated[list[str], Field(max_length=250)] = Field(default_factory=list)

    @field_validator("completed_courses")
    @classmethod
    def _norm_done(cls, v: list[str]) -> list[str]:
        return [norm_course(c) for c in v if c]

    @field_validator("first_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if not v:
            return None
        clean = re.sub(r"[^A-Za-z\- ']", "", v).strip()
        return clean.split(" ")[0][:30] or None


SEASON = re.compile(
    r"(spring|summer|fall|winter)\D{0,12}?(\d{4})|(\d{4})\D{0,4}(spring|summer|fall|winter)", re.IGNORECASE
)
NOT_A_TERM = re.compile(r"transfer|advanced placement|\bAP\b|exam|test.?out|credit by|prior|exempt|waiv", re.IGNORECASE)
# Grades that carry no outcome yet: in progress or not yet graded. They never enter a feature.
PENDING = {"IP", "", "NG", "I", "INC"}
WITHDRAW = {"W", "WD", "WX"}
FAIL = {"F", "WF", "U", "NC", "FN"}
SEASON_ORDER = {"winter": 0, "spring": 1, "summer": 2, "fall": 3}


def clean_grade(g: str) -> str:
    return re.sub(r"[+\-\s]", "", g.upper())


def parse_label(label: str) -> tuple[int, str] | None:
    """(year, season) for labels like 'Fall 2023' or '2023 Fall', else None."""
    m = SEASON.search(label)
    if not m:
        return None
    season, year = (m.group(1), m.group(2)) if m.group(1) else (m.group(4), m.group(3))
    return int(year), season.lower()


def term_rows(p: AuditProfile) -> tuple[np.ndarray, set[str], int]:
    """Regular terms in time order -> [attempted, earned, W, F, repeats]; passed courses; gaps.

    Same definitions as feat.person_term: only completed Fall/Spring terms are rows (Summer,
    Winter, transfer/AP blocks and in-progress or ungraded courses never are); a W or F row still
    counts its attempted credits but earns none; a repeat is any course already taken in an
    earlier term of ANY season. Terms are ordered chronologically; if a label has no
    recognisable date the audit's own order is kept and gaps cannot be measured."""
    listed = [(parse_label(t.label), t) for t in p.terms if not NOT_A_TERM.search(t.label)]
    dated = all(k for k, _ in listed)
    if dated:
        listed = sorted(listed, key=lambda x: (x[0][0], SEASON_ORDER[x[0][1]]))  # stable
    seen: set[str] = set()
    passed: set[str] = set(p.completed_courses)
    rows: list[list[float]] = []
    idx: list[int] = []
    for key, t in listed:
        regular = key is None or key[1] in ("spring", "fall")
        graded = [c for c in t.courses if clean_grade(c.grade) not in PENDING]
        row = None
        if not t.courses:  # totals-only term
            if regular:
                att = float(t.credits_attempted or t.credits_earned or 0)
                row = [att, float(t.credits_earned if t.credits_earned is not None else att), float(t.withdrawals or 0), 0.0, 0.0]
        else:
            att = earned = w = f = 0.0
            rep = float(sum(c.course_id in seen for c in graded))
            for c in graded:
                g = clean_grade(c.grade)
                att += c.credits
                if g in WITHDRAW:
                    w += 1
                elif g in FAIL:
                    f += 1
                else:
                    earned += c.credits
                    passed.add(c.course_id)
            if regular and graded:
                row = [att, earned, w, f, rep]
        seen.update(c.course_id for c in t.courses)
        if row is not None:
            rows.append(row)
            idx.append(2 * key[0] + (key[1] == "fall") if key else len(idx))
    gaps = int(max(idx) - min(idx) + 1 - len(idx)) if idx and dated else 0
    return (np.array(rows, dtype=float) if rows else np.zeros((0, 5))), passed, gaps


def credits_earned_total(p: AuditProfile) -> int:
    """Everything passed, Summer and Winter included (what the degree counts), unlike the model rows."""
    total = 0.0
    for t in p.terms:
        if NOT_A_TERM.search(t.label):
            continue
        if t.courses:
            total += sum(c.credits for c in t.courses if clean_grade(c.grade) not in PENDING | WITHDRAW | FAIL)
        else:
            total += t.credits_earned or 0
    return round(total)


def credits_in_progress(p: AuditProfile) -> int:
    """Credits of courses not yet graded: explicit in_progress plus pending term courses, deduped."""
    seen: dict[str, float] = {}
    for c in p.in_progress:
        seen[c.course_id] = c.credits
    for t in p.terms:
        for c in t.courses:
            if clean_grade(c.grade) in PENDING:
                seen.setdefault(c.course_id, c.credits)
    return round(sum(seen.values()))


def register(people, pid: str, p: AuditProfile) -> None:
    """Add (or replace) a profile in the loaded People so every tool can use it."""
    terms, passed, gaps = term_rows(p)
    earned = p.credits_earned if p.credits_earned is not None else credits_earned_total(p)
    people.static.loc[pid] = {
        "population": "current",
        "major": p.major,
        "track": p.track or "General",
        "entry_type": p.entry_type,
        "residency": p.residency,
        "work_hours": p.work_hours if p.work_hours is not None else 0,
        "graduation_year": None,
        "ttd": None,
        "cooked": None,
    }
    people.terms[pid] = terms
    people.gaps[pid] = gaps
    people.courses_done[pid] = passed
    people.courses_ip[pid] = [c.course_id for c in p.in_progress]
    people.current_extra.loc[pid] = pd.Series(
        {
            "credits_earned": earned,
            "credits_required": p.credits_required,
            "internship_count": p.internships,
            "class_level": "Uploaded audit",
            "entry_term": None,
            "expected_graduation_term": None,
        }
    )


def create(people, conn, p: AuditProfile, source: str) -> str:
    pid = "USR-" + secrets.token_hex(5)
    register(people, pid, p)
    conn.execute(
        "INSERT INTO app.user_profile(id, display_name, source, profile) VALUES (%s,%s,%s,%s)",
        (pid, p.first_name, source, json.dumps(p.model_dump())),
    )
    return pid


def update_work(people, conn, pid: str, hours: int) -> None:
    people.static.loc[pid, "work_hours"] = hours
    conn.execute(
        "UPDATE app.user_profile SET profile = jsonb_set(profile, '{work_hours}', to_jsonb(%s::int)) WHERE id=%s",
        (hours, pid),
    )


def restore(people, conn, pid: str) -> bool:
    row = conn.execute("SELECT profile FROM app.user_profile WHERE id=%s", (pid,)).fetchone()
    if not row:
        return False
    register(people, pid, AuditProfile(**row[0]))
    return True



# ---------- receipt: what the models actually read ----------
GRADE_POINTS = {"A": 4.0, "B": 3.0, "C": 2.0, "D": 1.0, "F": 0.0}
FEATURE_UNITS = {
    "entry_transfer": ("flag", "1 = transfer, 0 = first-time freshman"),
    "out_of_state": ("flag", "1 = out-of-state"),
    "work_hours": ("hours/week", "asked, not on the audit"),
    "major_cs": ("flag", "1 = Computer Science"),
    "k": ("terms", "completed Fall/Spring terms (Summer, Winter and in-progress excluded), max 6 used"),
    "att_mean": ("credits", "mean credits attempted over the terms used"),
    "earned_mean": ("credits", "mean credits earned over the terms used"),
    "att_min": ("credits", "smallest attempted load among the terms used"),
    "att_last": ("credits", "attempted load of the most recent term used"),
    "low_share": ("share", "terms under 12 attempted credits / terms used"),
    "w_sum": ("courses", "grades of W in the terms used"),
    "f_sum": ("courses", "grades of F in the terms used"),
    "rep_sum": ("courses", "courses already taken in an earlier term (any season)"),
    "earned_ratio": ("share", "credits earned / credits attempted over the terms used"),
}


def load_profile(conn, people, cid: str) -> AuditProfile | None:
    """The audit behind an id: the stored profile for USR- ids, or the dataset transcript
    (rebuilt in the same shape) for sample students. None if unknown."""
    if cid.startswith("USR-"):
        row = conn.execute("SELECT profile FROM app.user_profile WHERE id=%s", (cid,)).fetchone()
        return AuditProfile(**row[0]) if row else None
    if cid not in people.static.index:
        return None
    rows = conn.execute(
        "SELECT term, course_id, credits_attempted, grade FROM feat.transcripts WHERE campus_id=%s", (cid,)
    ).fetchall()
    by_term: dict[str, list[AuditCourse]] = {}
    for term, course, credits, grade in rows:
        by_term.setdefault(term, []).append(AuditCourse(course_id=course, credits=credits, grade=grade))
    s = people.static.loc[cid]
    extra = people.current_extra.loc[cid] if cid in people.current_extra.index else None
    return AuditProfile(
        major=s["major"], track=s["track"], entry_type=s["entry_type"], residency=s["residency"],
        work_hours=int(s["work_hours"] or 0),
        credits_earned=int(extra["credits_earned"]) if extra is not None else None,
        credits_required=int(extra["credits_required"]) if extra is not None else 120,
        terms=[AuditTerm(label=t, courses=cs) for t, cs in by_term.items()],
    )


def receipt_terms(p: AuditProfile) -> list[dict]:
    """One line per audit term, in time order, saying whether the models count it."""
    listed = [(parse_label(t.label), t) for t in p.terms if not NOT_A_TERM.search(t.label)]
    if all(k for k, _ in listed):
        listed.sort(key=lambda x: (x[0][0], SEASON_ORDER[x[0][1]]))
    out = []
    for key, t in listed:
        regular = key is None or key[1] in ("spring", "fall")
        graded = [c for c in t.courses if clean_grade(c.grade) not in PENDING]
        pending = len(t.courses) - len(graded)
        if not t.courses:
            att = float(t.credits_attempted or t.credits_earned or 0)
            earned = float(t.credits_earned if t.credits_earned is not None else att)
            w, f, gpa = int(t.withdrawals or 0), 0, None
        else:
            gs = [(clean_grade(c.grade), c.credits) for c in graded]
            att = sum(cr for _, cr in gs)
            earned = sum(cr for g, cr in gs if g not in WITHDRAW | FAIL)
            w = sum(g in WITHDRAW for g, _ in gs)
            f = sum(g in FAIL for g, _ in gs)
            pts = [(GRADE_POINTS[g[0]], cr) for g, cr in gs if g[:1] in GRADE_POINTS and g not in WITHDRAW]
            gpa = round(sum(a * cr for a, cr in pts) / sum(cr for _, cr in pts), 2) if pts else None
        if not regular:
            note = f"{key[1].title()} session: shown for credits, not used by the models"
        elif t.courses and not graded:
            note = "In progress: not used by the models until graded"
        elif pending:
            note = f"{pending} ungraded course(s) left out"
        else:
            note = None
        out.append({
            "label": t.label, "attempted": att, "earned": earned, "withdrawals": w, "failures": f,
            "gpa": gpa, "counted": regular and (bool(graded) or not t.courses), "note": note,
        })
    return out
