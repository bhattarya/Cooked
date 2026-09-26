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

TERM = re.compile(r"^(Spring|Fall)\s+(\d{4})$")
COURSE = re.compile(r"^([A-Z]{2,4})\s?(\d{3}[A-Z]?)$")
FAIL, WITHDRAW = {"F"}, {"W"}


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
    model_config = ConfigDict(extra="ignore")
    label: Annotated[str, Field(max_length=20)]
    courses: Annotated[list[AuditCourse], Field(max_length=12)]


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
    terms: Annotated[list[AuditTerm], Field(max_length=16)] = Field(default_factory=list)
    in_progress: Annotated[list[AuditCourse], Field(max_length=12)] = Field(default_factory=list)

    @field_validator("first_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if not v:
            return None
        clean = re.sub(r"[^A-Za-z\- ']", "", v).strip()
        return clean.split(" ")[0][:30] or None


def term_rows(p: AuditProfile) -> tuple[np.ndarray, set[str]]:
    """Regular terms in time order -> [attempted, earned, W, F, repeats]; plus passed courses."""
    dated = []
    for t in p.terms:
        m = TERM.match(t.label.strip().title())
        if m:  # Summer/Winter sessions are excluded, like feat.person_term
            dated.append((int(m.group(2)) * 2 + (m.group(1) == "Fall"), t))
    seen: set[str] = set()
    passed: set[str] = set()
    rows = []
    for _, t in sorted(dated, key=lambda x: x[0]):
        att = earned = w = f = rep = 0.0
        for c in t.courses:
            g = c.grade.upper()
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
        rows.append([att, earned, w, f, rep])
    return (np.array(rows, dtype=float) if rows else np.zeros((0, 5))), passed


def register(people, pid: str, p: AuditProfile) -> None:
    """Add (or replace) a profile in the loaded People so every tool can use it."""
    terms, passed = term_rows(p)
    earned = p.credits_earned if p.credits_earned is not None else int(terms[:, 1].sum()) if len(terms) else 0
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
    people.gaps[pid] = 0
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

