"""The voice agent: audit intake, spoken lines, and question routing.

Every answer is a list of segments (plain text + tokens that carry a tool_result_id) plus a
`visual` spec the dashboard renders. Gemini only routes the question to a tool; tools compute
every number, and templates place them, so the provenance rule (§8.4) always holds.
"""

from __future__ import annotations

import re

from api import profiles
from api.engine import Engine, NotFound, db
from api.providers import gemini, net
from ml.repair import course_status
from ml.snapshots import stage_features

CID = re.compile(r"CID-\d{6}")
COURSE_RX = re.compile(r"\b(CMSC|IS|MATH|STAT|ENGL|PHYS|ECON|MGMT|ACCT|PSYC|SOCY|HIST|PHIL|ARTH|MUSC|SPAN|BIOL|CHEM)\s?(\d{3}[A-Z]?)\b", re.IGNORECASE)

TOOLS = [
    {
        "name": "what_if",
        "description": "Change weekly work hours and/or credits per term from now on; see how risk and finish time move.",
        "parameters": {
            "type": "OBJECT",
            "properties": {"work_hours": {"type": "INTEGER"}, "credits_per_term": {"type": "INTEGER"}},
        },
    },
    {
        "name": "course_plan",
        "description": "Check a course for next term, or compare taking one course instead of another: "
        "prerequisites, when it is offered, what it unlocks.",
        "parameters": {
            "type": "OBJECT",
            "properties": {
                "take": {"type": "STRING", "description": "Course id, e.g. CMSC341"},
                "instead_of": {"type": "STRING", "description": "Course id being replaced, if any"},
            },
            "required": ["take"],
        },
    },
    {
        "name": "stress_test",
        "description": "Stress-test the plan with realistic shocks (withdrawals, forced lighter terms).",
        "parameters": {"type": "OBJECT", "properties": {"credits_per_term": {"type": "INTEGER"}}},
    },
    {
        "name": "find_fix",
        "description": "Find the smallest change that worked for similar students.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
    {
        "name": "explain_risk",
        "description": "Explain why the student's risk is what it is, or answer 'am I cooked'.",
        "parameters": {"type": "OBJECT", "properties": {}},
    },
]

LINES = {
    "greeting": "Hey {name}. I'm COOKED. Drop your degree audit and I'll show you where you're headed.",
    "thanks": "Alright, thanks {name} for uploading. Give me a second while the agents take a look.",
    "ask_work": "One thing an audit can't tell me: about how many hours a week do you work?",
    "ready": "Okay {name}, here's what I found.",
    "listening": "I'm listening.",
}


def _name(name: str | None) -> str:
    clean = re.sub(r"[^A-Za-z\- ']", "", name or "").strip().split(" ")[0][:30]
    return clean or "there"


def say(engine: Engine, line: str, name: str | None) -> dict:
    if line not in LINES:
        raise NotFound(line)
    return engine._finish([{"text": LINES[line].format(name=_name(name))}], "template", "say")


# ---------- intake ----------
def intake(engine: Engine, data: bytes, mime: str) -> dict:
    text = data.decode("latin-1")
    m = CID.search(text)
    if m and "SYNTHETIC" in text and m.group(0) in engine.people.current_ids:
        cid = m.group(0)
        st = engine.state(cid)
        return {
            "id": cid,
            "source": "sample",
            "first_name": None,
            "needs_work_hours": False,
            "summary": _summary(engine, cid, st),
        }
    if not (net.enabled() and gemini.configured()):
        return {
            "id": None,
            "source": "unavailable",
            "error": "Reading a real audit needs Gemini (set GEMINI_API_KEY and GEMINI_MODEL). "
            "Try a sample audit meanwhile.",
        }
    parsed = gemini.parse_audit(data, mime or "application/pdf")
    if not parsed:
        return {"id": None, "source": "gemini", "error": "Couldn't read that audit. Try a clearer PDF."}
    profile = profiles.AuditProfile(**parsed)
    with db() as conn:
        pid = profiles.create(engine.people, conn, profile, "gemini")
    st = engine.state(pid)
    return {
        "id": pid,
        "source": "gemini",
        "first_name": profile.first_name,
        "needs_work_hours": True,
        "summary": _summary(engine, pid, st),
    }


def _summary(engine: Engine, sid: str, st: dict) -> dict:
    return {
        "major": st["major"],
        "track": st["track"],
        "entry_type": st["entry_type"],
        "terms": st["terms_done"]["value"],
        "courses_done": len(st["courses_done"]),
        "in_progress": len(st["courses_in_progress"]),
        "credits_earned": st["credits_earned"],
        "credits_required": st["credits_required"],
        "tool_result_id": st["terms_done"]["tool_result_id"],
    }


def set_work(engine: Engine, sid: str, hours: int) -> dict:
    engine.current(sid)
    if sid.startswith("USR-"):
        with db() as conn:
            profiles.update_work(engine.people, conn, sid, hours)
    return {"id": sid, "work_hours": hours}


# ---------- question routing ----------
def local_route(q: str) -> tuple[str, dict]:
    s = q.lower()
    courses = [f"{a.upper()}{b.upper()}" for a, b in COURSE_RX.findall(q)]
    if courses:
        args = {"take": courses[0]}
        if len(courses) > 1:
            # "take X instead of Y" / "Y or X": the course after "instead of" is the one replaced
            if re.search(r"instead of|rather than|replace|swap", s):
                idx = s.find("instead of") if "instead of" in s else s.find("rather than")
                after = [f"{a.upper()}{b.upper()}" for a, b in COURSE_RX.findall(q[idx:])] if idx >= 0 else []
                replaced = after[0] if after else courses[1]
                args = {"take": next(c for c in courses if c != replaced), "instead_of": replaced}
            else:
                args["instead_of"] = courses[1]
        return "course_plan", args
    n = re.search(r"(\d+(?:\.\d+)?)", s)
    if re.search(r"stress|drill|shock|break|what could go wrong", s):
        return "stress_test", ({"credits_per_term": int(float(n.group(1)))} if n else {})
    if n and re.search(r"hour|hrs|\bh\b|work|job", s):
        return "what_if", {"work_hours": int(float(n.group(1)))}
    if n and re.search(r"credit|cr\b|load|class|course", s):
        return "what_if", {"credits_per_term": int(float(n.group(1)))}
    if re.search(r"fix|repair|un-?cook|what should|how do i|improve|help", s):
        return "find_fix", {}
    return "explain_risk", {}


def ask(engine: Engine, sid: str, question: str, work: float | None, plan: float | None) -> dict:
    engine.current(sid)
    routed = gemini.route(question, "Tools compute every number.", TOOLS) if net.enabled() else None
    tool, args = routed if routed else local_route(question)
    source = "gemini" if routed else "local"
    handler = {
        "what_if": _what_if,
        "course_plan": _course_plan,
        "stress_test": _stress_test,
        "find_fix": _find_fix,
        "explain_risk": _explain,
    }[tool]
    segs, visual = handler(engine, sid, args, work, plan)
    out = engine._finish(segs, "template", "ask")
    return {**out, "tool": tool, "args": args, "router": source, "visual": visual, "question": question}


def _tok(value, tr: str) -> dict:
    return {"value": str(value), "tool_result_id": tr}


def _current_load(engine: Engine, sid: str) -> int:
    t = engine.people.terms_of(sid)
    return round(float(t[:, 0].mean())) if len(t) else 15


def _what_if(engine, sid, args, work, plan):
    w0 = work if work is not None else float(engine.people.static.at[sid, "work_hours"] or 0)
    l0 = plan if plan is not None else _current_load(engine, sid)
    w1 = float(args.get("work_hours", w0))
    l1 = float(args.get("credits_per_term", l0))
    before = engine.state(sid, w0, l0)
    after = engine.state(sid, w1, l1)
    r0, r1 = before["plan"]["risk"]["value"], after["plan"]["risk"]["value"]
    tr = after["plan"]["risk"]["tool_result_id"]
    direction = "lower than" if r1 < r0 - 0.005 else "higher than" if r1 > r0 + 0.005 else "about the same as"
    segs = [
        {"text": "At "},
        _tok(int(w1), tr),
        {"text": " hours of work and "},
        _tok(int(l1), tr),
        {"text": " credits a term, the model puts your risk at "},
        _tok(round(r1 * 100), tr),
        {"text": f" percent, {direction} your current plan. You'd finish in about "},
        _tok(after["plan"]["projected_years"]["value"], after["plan"]["projected_years"]["tool_result_id"]),
        {"text": " years."},
    ]
    visual = {
        "type": "whatif",
        "before": {"work": w0, "load": l0, "risk": r0, "years": before["plan"]["projected_years"]["value"]},
        "after": {"work": w1, "load": l1, "risk": r1, "years": after["plan"]["projected_years"]["value"]},
        "tool_result_id": tr,
    }
    return segs, visual


def _course_plan(engine, sid, args, work, plan):
    major = engine.people.static.at[sid, "major"]
    take = profiles.norm_course(str(args.get("take", "")))
    instead = profiles.norm_course(str(args["instead_of"])) if args.get("instead_of") else None
    a = course_status(engine.people, sid, major, take)
    b = course_status(engine.people, sid, major, instead) if instead else None
    tr = engine.rec("course_plan", {"id": sid, "take": take, "instead_of": instead})
    if not a["known"]:
        return [{"text": "I can't find "}, _tok(take, tr), {"text": " in the catalog, so I can't check it."}], {
            "type": "course", "courses": [a], "tool_result_id": tr,
        }
    segs: list[dict] = []
    if a["already_have"]:
        segs += [{"text": "You already have "}, _tok(take, tr), {"text": ". "}]
    elif a["missing_prereqs"]:
        segs += [{"text": "You can't take "}, _tok(take, tr), {"text": " yet: you still need "}]
        for i, m in enumerate(a["missing_prereqs"]):
            segs += ([{"text": " and "}] if i else []) + [_tok(m, tr)]
        segs += [{"text": ". "}]
    elif not a["offered_next_term"]:
        segs += [_tok(take, tr), {"text": " usually isn't offered in "}, _tok(a["term"], tr), {"text": ", so plan it for a later term. "}]
    else:
        segs += [{"text": "You can take "}, _tok(take, tr), {"text": " in "}, _tok(a["term"], tr), {"text": ". "}]
    if a["gates"]:
        segs += [{"text": "It unlocks "}, _tok(a["gates"], tr), {"text": " later courses"}]
        if a["gates_required"]:
            segs += [{"text": ", including "}, _tok(len(a["gates_required"]), tr), {"text": " required for your major"}]
        segs += [{"text": ". "}]
    if b and b["known"]:
        if a["missing_prereqs"] and not b["missing_prereqs"]:
            segs += [{"text": "Keep "}, _tok(instead, tr), {"text": " for now: it's open to you and "},
                     _tok(take, tr), {"text": " isn't yet. "}]
        elif b["required_for_major"] and not a["required_for_major"]:
            segs += [_tok(instead, tr), {"text": " counts toward your major and "}, _tok(take, tr),
                     {"text": " doesn't, so swapping could cost you a term. "}]
        elif b["gates"] > a["gates"]:
            segs += [{"text": "But "}, _tok(instead, tr), {"text": " unlocks more ("}, _tok(b["gates"], tr),
                     {"text": "), so dropping it could stall your path. "}]
        elif b["missing_prereqs"] and not a["missing_prereqs"]:
            segs += [{"text": "That swap makes sense: "}, _tok(instead, tr), {"text": " is still blocked for you. "}]
        else:
            segs += [{"text": "Compared with "}, _tok(instead, tr), {"text": ", it keeps as many doors open or more. "}]
    segs += [{"text": "Swapping courses doesn't move your risk model; your credit load does."}]
    highlight = sorted({take, *( [instead] if instead else [] ), *a.get("gates_required", [])})
    return segs, {"type": "course", "courses": [a] + ([b] if b else []), "highlight": highlight, "tool_result_id": tr}


def _stress_test(engine, sid, args, work, plan):
    load = args.get("credits_per_term") or plan
    d = engine.drill(sid, load, work)
    tr = d["tool_result_id"]
    segs: list[dict] = [{"text": "At "}, _tok(int(d["plan_load"]), tr), {"text": " credits a term, "}]
    stc = d["shocks_to_cooked"]
    if stc is None:
        segs += [{"text": "your plan survived "}, _tok(len(d["path"]), tr), {"text": " plausible shocks in a row. It's resilient."}]
    elif stc["value"] == 0:
        segs += [{"text": "the plan is already past the line before any shock. The fix matters more than the drill."}]
    else:
        segs += [_tok(stc["value"], tr), {"text": " shock breaks it" if stc["value"] == 1 else " shocks break it"},
                 {"text": f". The weakest point: {(d['single_point_of_failure'] or '').lower()}."}]
    return segs, {"type": "drill", "drill": d}


def _find_fix(engine, sid, args, work, plan):
    r = engine.repair(sid, work)
    p = r["primary"]
    if not p:
        return [{"text": r["refusal"] or "Nothing needs fixing. Keep this pace."}], {"type": "repair", "repair": r}
    tr = p["tool_result_id"]
    segs = [
        {"text": "Students like you who held "}, _tok(p["target"], tr), {"text": " or more credits a term finished a median "},
        _tok(f"{p['diff_years']:.1f}", tr), {"text": " years sooner, and "}, _tok(p["support"], tr),
        {"text": " of them back that up. That's what happened to them, not a promise."},
    ]
    return segs, {"type": "repair", "repair": r}


def _explain(engine, sid, args, work, plan):
    st = engine.state(sid, work)
    if st["twins"]["refused"]:
        return [{"text": f"Not enough matched students to explain this reliably ({st['twins']['reason']})."}], {
            "type": "explain", "state": st,
        }
    k = st["terms_done"]["value"]
    twins = [t for t in st["twins"]["ids"] if not engine.people.static.at[t, "cooked"]]
    on_time = [float(engine.people.terms_of(t)[: max(k, 1), 0].mean()) for t in twins if len(engine.people.terms_of(t))]
    ref = round(sum(on_time) / len(on_time), 1) if on_time else None
    tr = engine.rec("explain_risk", {"id": sid, "k": k})
    risk = st["risk"]["value"]
    segs: list[dict] = [{"text": "Your risk is "}, _tok(round(risk * 100), st["risk"]["tool_result_id"]), {"text": " percent. "}]
    if ref is not None:
        segs += [{"text": "You're averaging "}, _tok(st["avg_credits"]["value"], st["avg_credits"]["tool_result_id"]),
                 {"text": " credits a term; matched students who finished on time averaged "}, _tok(ref, tr),
                 {"text": " at this point. "}]
    segs += [{"text": "That's based on "}, _tok(st["twins"]["n"], st["twins"]["tool_result_id"]),
             {"text": " alumni who looked like you. Load and work hours move it most; individual courses barely do."}]
    return segs, {"type": "explain", "state": st, "reference_load": ref, "tool_result_id": tr}


__all__ = ["TOOLS", "ask", "intake", "local_route", "say", "set_work", "stage_features"]
