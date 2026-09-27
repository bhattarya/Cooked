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
from itertools import pairwise
from typing import Annotated, Literal

import numpy as np
import pandas as pd
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

TERM = re.compile(r"^(Spring|Fall)\s+(\d{4})$")
COURSE = re.compile(r"^([A-Z]{2,4})\s?(\d{3}[A-Z]?)$")
FAIL, WITHDRAW = {"F", "FF", "NP", "NC", "U"}, {"W", "WP", "WF"}
PASS = {"A", "A+", "A-", "B", "B+", "B-", "C", "C+", "C-", "D", "D+", "D-", "P", "S", "CR", "T"}


def norm_major(raw: str) -> str:
    """Map common audit labels onto the two majors represented by the frozen models."""
    value = re.sub(r"[^a-z]+", " ", str(raw).lower()).strip()
    if "computer science" in value or re.search(r"\bcs\b", value):
        return "Computer Science"
    if "information systems" in value or "infosys" in value or re.search(r"\bis\b", value):
        return "Information Systems"
    return "Computer Science"


def norm_entry_type(raw: str | None) -> str:
    """Normalize labels used by different audit templates."""
    value = re.sub(r"[^a-z]+", " ", str(raw or "").lower()).strip()
    if "transfer" in value:
        return "Transfer"
    if not value or any(term in value for term in ("freshman", "first year", "first time", "new student")):
        return "First-Time Freshman"
    raise ValueError("Unsupported entry type")


def norm_residency(raw: str | None) -> str:
    """Normalize residency labels while defaulting when an audit omits the field."""
    value = re.sub(r"[^a-z]+", " ", str(raw or "").lower()).strip()
    if "out" in value or "non resident" in value or "nonresident" in value:
        return "Out-of-State"
    if not value or "in" in value or "resident" in value:
        return "In-State"
    raise ValueError("Unsupported residency")


def norm_course(raw: str) -> str:
    m = COURSE.match(raw.strip().upper())
    return f"{m.group(1)}{m.group(2)}" if m else raw.strip().upper().replace(" ", "")


class AuditCourse(BaseModel):
    model_config = ConfigDict(extra="ignore")
    course_id: Annotated[str, Field(min_length=3, max_length=12)]
    credits: Annotated[float, Field(ge=0, le=8)] = 3
    grade: Annotated[str, Field(max_length=3)] = ""

    @field_validator("grade")
    @classmethod
    def _grade(cls, v: str) -> str:
        return v.strip().upper()

    @field_validator("course_id")
    @classmethod
    def _norm(cls, v: str) -> str:
        return norm_course(v)


class AuditTerm(BaseModel):
    """A term either lists its courses or, on some audits, only credit totals."""

    model_config = ConfigDict(extra="ignore")
    label: Annotated[str, Field(max_length=30)]
    courses: Annotated[list[AuditCourse], Field(max_length=12)] = Field(default_factory=list)
    credits_attempted: Annotated[float, Field(ge=0, le=30)] | None = None
    credits_earned: Annotated[float, Field(ge=0, le=30)] | None = None
    withdrawals: Annotated[int, Field(ge=0, le=8)] | None = None

    @model_validator(mode="after")
    def consistent_totals(self):
        if self.credits_earned is not None and self.credits_attempted is not None and self.credits_earned > self.credits_attempted:
            raise ValueError("Term earned credits exceed attempted credits")
        if not self.courses and (self.credits_attempted is None or self.credits_earned is None):
            raise ValueError("A completed term needs courses or both credit totals")
        return self


class AuditProfile(BaseModel):
    """What we keep from an audit. No file, no student id number, no address."""

    model_config = ConfigDict(extra="ignore")
    first_name: Annotated[str, Field(max_length=30)] | None = None
    major: Literal["Computer Science", "Information Systems"] = "Computer Science"
    track: Annotated[str, Field(max_length=40)] | None = None
    entry_type: Literal["First-Time Freshman", "Transfer"] = "First-Time Freshman"
    residency: Literal["In-State", "Out-of-State"] = "In-State"
    work_hours: Annotated[int, Field(ge=0, le=60)] | None = None
    credits_earned: Annotated[float, Field(ge=0, le=200)] | None = None
    credits_required: Annotated[float, Field(ge=60, le=200)] = 120
    internships: Annotated[int, Field(ge=0, le=10)] = 0
    terms: Annotated[list[AuditTerm], Field(max_length=16)] = Field(default_factory=list)
    in_progress: Annotated[list[AuditCourse], Field(max_length=12)] = Field(default_factory=list)
    completed_courses: Annotated[list[str], Field(max_length=80)] = Field(default_factory=list)

    @field_validator("completed_courses")
    @classmethod
    def _norm_done(cls, v: list[str]) -> list[str]:
        return [norm_course(c) for c in v if c]

    @field_validator("major", mode="before")
    @classmethod
    def _major(cls, v: str) -> str:
        return norm_major(v)

    @field_validator("entry_type", mode="before")
    @classmethod
    def _entry_type(cls, v: str | None) -> str:
        return norm_entry_type(v)

    @field_validator("residency", mode="before")
    @classmethod
    def _residency(cls, v: str | None) -> str:
        return norm_residency(v)

    @field_validator("first_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if not v:
            return None
        clean = re.sub(r"[^A-Za-z\- ']", "", v).strip()
        return clean.split(" ")[0][:30] or None


def term_rows(p: AuditProfile) -> tuple[np.ndarray, set[str]]:
    """Regular terms in time order -> [attempted, earned, W, F, repeats]; plus passed courses.
    Named Fall/Spring terms are sorted by date; unnamed ones ("Term 1") keep the audit's order;
    Summer and Winter sessions are excluded, like feat.person_term."""
    regular = [t for t in p.terms if not re.search(r"summer|winter", t.label, re.IGNORECASE)]
    dated = [(TERM.match(t.label.strip().title()), i, t) for i, t in enumerate(regular)]
    if all(m for m, _, _ in dated):
        ordered = [t for _, _, t in sorted(dated, key=lambda x: int(x[0].group(2)) * 2 + (x[0].group(1) == "Fall"))]
    else:
        ordered = regular
    seen: set[str] = set()
    passed: set[str] = set(p.completed_courses)
    # Summer/Winter do not affect the regular-term model, but still satisfy course prerequisites.
    passed.update(c.course_id for t in p.terms for c in t.courses if c.grade in PASS)
    rows = []
    for t in ordered:
        if not t.courses:  # totals-only term
            att = float(t.credits_attempted)
            rows.append([att, float(t.credits_earned), float(t.withdrawals or 0), 0.0, 0.0])
            continue
        att = earned = w = f = rep = 0.0
        for c in t.courses:
            g = c.grade.upper()
            if g not in PASS | FAIL | WITHDRAW:
                continue  # IP, incomplete, audit and missing grades never count as completed work.
            att += c.credits
            if g in WITHDRAW:
                w += 1
            elif g in FAIL:
                f += 1
            else:
                earned += c.credits
                passed.add(c.course_id)
            rep += c.course_id in seen
            seen.add(c.course_id)
        if att:
            rows.append([att, earned, w, f, rep])
    return (np.array(rows, dtype=float) if rows else np.zeros((0, 5))), passed


def register(people, pid: str, p: AuditProfile) -> None:
    """Add (or replace) a profile in the loaded People so every tool can use it."""
    terms, passed = term_rows(p)
    earned = p.credits_earned if p.credits_earned is not None else float(terms[:, 1].sum()) if len(terms) else 0
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
    dates = sorted({int(m.group(2)) * 2 + (m.group(1) == "Fall") for t in p.terms if (m := TERM.match(t.label.strip().title()))})
    people.gaps[pid] = sum(max(0, b - a - 1) for a, b in pairwise(dates))
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
    conn.execute(
        "INSERT INTO app.user_profile(id, display_name, source, profile) VALUES (%s,%s,%s,%s)",
        (pid, p.first_name, source, json.dumps(p.model_dump())),
    )
    register(people, pid, p)
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
