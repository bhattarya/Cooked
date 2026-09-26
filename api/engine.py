"""Tools (§8.2) over the frozen models and the feat schema.

Every number this module returns is recorded in the provenance registry, and every tool is
deterministic for the same inputs and model version, so golden drills repeat exactly.
"""

from __future__ import annotations

import hashlib
import json
import logging
import math
import os
import re
import threading
import time
import uuid
from pathlib import Path

import numpy as np
import pandas as pd

from api import provenance
from api.providers import backboard, elevenlabs, gemini, net
from ml.fire_drill import monte_carlo, run_drill
from ml.model_interface import ArtifactError, Models
from ml.repair import run_repair
from ml.snapshots import FEATURES, K_MAX, People, load_people, stage_features
from ml.twins import MIN_SUPPORT, TwinIndex
from ml.watchtower import OPEN_AT, hysteresis, score_all
from scripts.common import ROOT, connect

log = logging.getLogger("cooked.api")  # log exception types only: messages can hold DSNs
TEMPLATE_VERSION = "t1"
CID = re.compile(r"CID-\d{6}")


class NotReady(Exception):
    def __init__(self, error: str, message: str, needs: list[str]):
        super().__init__(message)
        self.error, self.message, self.needs = error, message, needs


class NotFound(Exception):
    pass


def model_dir() -> Path:
    d = Path(os.getenv("MODEL_ARTIFACT_DIR", "models/"))
    return d if d.is_absolute() else ROOT / d


def db():
    return connect("DATABASE_URL_APP")


def wilson(k: int, n: int, z: float = 1.645) -> tuple[float, float]:
    if not n:
        return 0.0, 1.0
    p = k / n
    d = 1 + z * z / n
    c = (p + z * z / (2 * n)) / d
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d
    return max(0.0, c - h), min(1.0, c + h)


class Engine:
    def __init__(self, people: People, models: Models):
        self.people = people
        self.models = models
        self.index = TwinIndex(people)
        self._queue: tuple[float, pd.DataFrame] | None = None
        self._narrated: dict[str, float] = {}
        self._survival: dict[str, list[dict]] = {}

    @property
    def version(self) -> str:
        return self.models.version

    def rec(self, tool: str, args: dict, data: dict | None = None) -> str:
        return provenance.record(tool, args, data, self.version)

    # ---------- people ----------
    def current(self, cid: str) -> pd.Series:
        if cid not in self.people.static.index or self.people.static.at[cid, "population"] != "current":
            raise NotFound(cid)
        return self.people.static.loc[cid]

    def _static(self, cid: str, work: float | None) -> pd.Series:
        s = self.current(cid).copy()
        if work is not None:
            s["work_hours"] = work
        return s

    # ---------- get_state + find_twins + outcome tiles ----------
    def state(self, cid: str, work: float | None = None, plan_load: float | None = None) -> dict:
        s = self._static(cid, work)
        terms = self.people.terms_of(cid)
        k = len(terms)
        extra = self.people.current_extra.loc[cid]
        work = float(s["work_hours"] or 0)
        avg = float(terms[:, 0].mean()) if k else 0.0
        X = pd.DataFrame([stage_features(s, terms, min(k, K_MAX))], columns=FEATURES)
        risk = float(self.models.risk(X)[0])
        q = self.models.ttd(X)[0]
        pattern = self.models.pattern(terms, self.people.gaps.get(cid, 0))

        tr_state = self.rec("get_state", {"campus_id": cid}, {"k": k, "avg": avg})
        tr_risk = self.rec("risk_model", {"campus_id": cid, "k": k, "work": work}, {"risk": risk})
        tr_ttd = self.rec("ttd_model", {"campus_id": cid, "k": k, "work": work}, {"q": q.tolist()})
        tw = self.index.find(stage_features(s, terms, k), k)
        tr_twins = self.rec("find_twins", {"campus_id": cid, "k": k, "work": work}, {"n": tw.n})

        out = {
            "campus_id": cid,
            "major": s["major"],
            "track": s["track"],
            "entry_type": s["entry_type"],
            "residency": s["residency"],
            "work_hours": work,
            "class_level": extra["class_level"],
            "credits_earned": int(extra["credits_earned"]),
            "credits_required": int(extra["credits_required"]),
            "terms": [{"attempted": int(t[0]), "earned": int(t[1]), "withdrawals": int(t[2])} for t in terms],
            "courses_done": sorted(self.people.courses_done.get(cid, set())),
            "courses_in_progress": self.people.courses_ip.get(cid, []),
            "terms_done": {"value": k, "tool_result_id": tr_state},
            "avg_credits": {"value": round(avg, 1), "tool_result_id": tr_state},
            "w_total": {"value": int(terms[:, 2].sum()) if k else 0, "tool_result_id": tr_state},
            "pattern": pattern,
            "risk": {"value": round(risk, 4), "tool_result_id": tr_risk},
            "risk_is_probability": self.models.calibrated_ok,
            "time_to_degree": {
                "low": round(float(q[0]), 2), "mid": round(float(q[1]), 2), "high": round(float(q[2]), 2),
                "support": int(self.models.manifest["metrics"][str(min(k, K_MAX))]["n_train"]),
                "tool_result_id": tr_ttd,
            },
            "delay": {
                "low": round(max(0.0, float(q[0]) - 4), 2), "mid": round(max(0.0, float(q[1]) - 4), 2),
                "high": round(max(0.0, float(q[2]) - 4), 2),
                "support": int(self.models.manifest["metrics"][str(min(k, K_MAX))]["n_train"]),
                "tool_result_id": tr_ttd,
            },
            "twins": {
                "n": tw.n, "k": tw.k, "refused": tw.refused, "reason": tw.reason, "ids": tw.ids,
                "max_distance": tw.max_distance, "smd": tw.smd, "tool_result_id": tr_twins,
            },
            "still_seeking_risk": None,
            "degree_burden": None,
            "twin_cooked_share": None,
            "plan": None,
            "model_version": self.version,
        }
        if not tw.refused:
            outs = self.people.alumni_out.loc[tw.ids]
            reported = outs[outs.first_destination != "No Response"]
            seeking = int((reported.first_destination == "Still Seeking").sum())
            lo, hi = wilson(seeking, len(reported))
            out["still_seeking_risk"] = {
                "low": round(lo, 3), "mid": round(seeking / max(len(reported), 1), 3), "high": round(hi, 3),
                "support": len(reported), "tool_result_id": tr_twins,
            }
            b = (outs.net_cost / outs.salary).dropna()
            if len(b) >= 10:
                out["degree_burden"] = {
                    "low": round(float(b.quantile(0.25)), 2), "mid": round(float(b.median()), 2),
                    "high": round(float(b.quantile(0.75)), 2), "support": len(b), "tool_result_id": tr_twins,
                }
            share = float(self.people.static.loc[tw.ids, "cooked"].mean())
            out["twin_cooked_share"] = {"value": round(share, 3), "tool_result_id": tr_twins}
        if plan_load is not None:
            fut = np.array([[plan_load, plan_load, 0, 0, 0]] * 2, dtype=float)
            all_terms = np.vstack([terms, fut]) if k else fut
            Xp = pd.DataFrame([stage_features(s, all_terms, min(len(all_terms), K_MAX))], columns=FEATURES)
            pr = float(self.models.risk(Xp)[0])
            qp = self.models.ttd(Xp)[0]
            tr_plan = self.rec("plan_outcome", {"campus_id": cid, "plan_load": plan_load, "work": work})
            remaining = max(0, out["credits_required"] - out["credits_earned"])
            out["plan"] = {
                "load": plan_load,
                "risk": {"value": round(pr, 4), "tool_result_id": tr_plan},
                "time_to_degree_mid": {"value": round(float(qp[1]), 2), "tool_result_id": tr_plan},
                "projected_years": {
                    "value": round((k + math.ceil(remaining / max(plan_load, 1))) / 2, 1),
                    "tool_result_id": tr_plan,
                },
            }
        return out

    # ---------- alarm_check (Watchtower for one student) ----------
    def alarm_check(self, cid: str) -> dict:
        st = self.state(cid)
        risk = st["risk"]["value"]
        k = st["terms_done"]["value"]
        pattern = st["pattern"] or "none"
        tr = self.rec("alarm_check", {"campus_id": cid, "risk": risk, "k": k})
        evidence = {
            "risk": st["risk"]["tool_result_id"],
            "twins": st["twins"]["tool_result_id"],
            "state": st["terms_done"]["tool_result_id"],
            "model_version": self.version,
        }
        with db() as conn:
            conn.execute(
                "INSERT INTO app.risk_snapshot(ts, campus_id, k_observed, risk, pattern, model_version) "
                "VALUES (now(), %s, %s, %s, %s, %s) ON CONFLICT DO NOTHING",
                (cid, k, risk, pattern, self.version),
            )
            row = conn.execute(
                "SELECT id, ts FROM app.alarm_event WHERE campus_id=%s AND status='open' "
                "ORDER BY ts DESC LIMIT 1",
                (cid,),
            ).fetchone()
            decision = hysteresis(row is not None, risk)
            if decision == "open":
                row = conn.execute(
                    "INSERT INTO app.alarm_event(ts, campus_id, pattern, risk, lead_time_terms, lever, evidence) "
                    "VALUES (now(), %s, %s, %s, %s, %s, %s) RETURNING id, ts",
                    (cid, pattern, risk, max(0, 8 - k), "average credits per term", json.dumps(evidence)),
                ).fetchone()
            elif decision == "resolve":
                conn.execute("UPDATE app.alarm_event SET status='resolved' WHERE id=%s", (row[0],))
            status = "open" if (decision == "open" or (decision == "keep" and row)) else "resolved" if decision == "resolve" else None
        return {
            "id": row[0] if row else None,
            "campus_id": cid,
            "pattern": st["pattern"],
            "risk": st["risk"],
            "status": status,
            "decision": decision,
            "fires": status == "open",
            "lead_time_terms": max(0, 8 - k),
            "lever": "average credits per term",
            "evidence": evidence,
            "tool_result_id": tr,
            "refused": st["twins"]["refused"],
        }

    # ---------- fire drill ----------
    def drill(self, cid: str, plan_load: float | None, work: float | None, sims: int = 200) -> dict:
        s = self._static(cid, work)
        terms = self.people.terms_of(cid)
        work = float(s["work_hours"] or 0)
        load = float(plan_load if plan_load is not None else (round(terms[:, 0].mean()) if len(terms) else 15))
        # work hours are passed explicitly, so what-if drills never touch shared state
        report = run_drill(self.people, self.models, cid, load, work)
        mc = monte_carlo(self.people, self.models, cid, load, work, sims=sims)
        drill_id = str(uuid.UUID(hashlib.sha256(f"{cid}|{load}|{work}|{self.version}".encode()).hexdigest()[:32]))
        tr = self.rec("fire_drill", {"campus_id": cid, "plan_load": load, "work": work}, {"stc": report["shocks_to_cooked"]})
        tr_mc = self.rec("survival", {"drill_id": drill_id, "sims": sims})
        survival = [{**p, "tool_result_id": tr_mc} for p in mc["survival"]]
        self._survival[drill_id] = survival
        stored = False
        try:
            with db() as conn:
                conn.execute("DELETE FROM app.drill_trajectory WHERE drill_id=%s", (drill_id,))
                with conn.cursor().copy(
                    "COPY app.drill_trajectory (drill_id, campus_id, sim, term_k, credits_cum, w_cum, shock, cooked) FROM STDIN"
                ) as cp:
                    for sim, t, cred, w, shock, cooked in mc["rows"]:
                        cp.write_row((drill_id, cid, sim, t, cred, w, shock, cooked))
                conn.execute(
                    "INSERT INTO app.drill_run(drill_id, campus_id, plan_load, work_hours, sims, model_version, report) "
                    "VALUES (%s,%s,%s,%s,%s,%s,%s) ON CONFLICT (drill_id) DO UPDATE SET report=EXCLUDED.report, created_at=now()",
                    (drill_id, cid, load, int(work), sims, self.version, json.dumps(report, default=float)),
                )
            stored = True
        except Exception:  # noqa: BLE001 -- the drill still answers from memory
            stored = False
        return {
            "drill_id": drill_id,
            "campus_id": cid,
            "plan_load": load,
            "work_hours": work,
            **report,
            "shocks_to_cooked": None if report["shocks_to_cooked"] is None else {"value": report["shocks_to_cooked"], "tool_result_id": tr},
            "tool_result_id": tr,
            "survival": survival,
            "sims": sims,
            "rows_stored": len(mc["rows"]) if stored else 0,
            "threshold": self.models.threshold,
        }

    def survival(self, drill_id: str) -> dict:
        try:
            with db() as conn:
                rows = conn.execute(
                    "SELECT term_k, 1 - avg(cooked::int)::float FROM app.drill_trajectory "
                    "WHERE drill_id=%s GROUP BY term_k ORDER BY term_k",
                    (drill_id,),
                ).fetchall()
            if rows:
                tr = self.rec("survival_sql", {"drill_id": drill_id})
                pts = [{"term_k": 0, "survival": 1.0, "tool_result_id": tr}]
                pts += [{"term_k": int(t), "survival": round(v, 4), "tool_result_id": tr} for t, v in rows]
                return {"drill_id": drill_id, "points": pts, "source": "timescale"}
        except Exception as exc:  # noqa: BLE001
            log.warning("survival query failed: %s", type(exc).__name__)
        if drill_id in self._survival:
            return {"drill_id": drill_id, "points": self._survival[drill_id], "source": "memory"}
        raise NotFound(drill_id)

    # ---------- repair ----------
    def repair(self, cid: str, work: float | None = None) -> dict:
        s = self._static(cid, work)
        terms = self.people.terms_of(cid)
        k = len(terms)
        work = float(s["work_hours"] or 0)
        tw = self.index.find(stage_features(s, terms, k), k)
        if tw.refused:
            return {"primary": None, "fallback": None, "refusal": f"Not enough evidence: {tw.reason}.", "tool_result_id": None}
        rep = run_repair(self.people, self.models, self.index, cid, tw.ids, work)
        tr = self.rec("escapee_stats", {"campus_id": cid, "work": work, "twins": tw.n})
        for key in ("primary", "fallback"):
            if rep[key]:
                rep[key]["tool_result_id"] = tr
                if rep[key].get("feasibility"):
                    rep[key]["feasibility"]["tool_result_id"] = self.rec(
                        "catalog_feasibility", {"campus_id": cid, "target": rep[key]["target"]}
                    )
        rep["tool_result_id"] = tr
        rep["twins"] = tw.n
        return rep

    # ---------- institution queue ----------
    def scores(self) -> pd.DataFrame:
        if not self._queue or time.time() - self._queue[0] > 300:
            self._queue = (time.time(), score_all(self.people, self.models, min_terms=2))
        return self._queue[1]

    def queue(self, staff: bool, limit: int = 200) -> dict:
        sc = self.scores()
        tr = self.rec("queue", {"n": len(sc), "at": int(self._queue[0])})
        by = []
        for pattern, g in sc.groupby(sc["pattern"].fillna("none")):
            by.append({
                "pattern": pattern, "scored": len(g), "at_risk": int((g.risk >= OPEN_AT).sum()),
                "avg_risk": round(float(g.risk.mean()), 4), "tool_result_id": tr,
            })
        out = {
            "aggregated": not staff,
            "scored": len(sc),
            "at_risk": int((sc.risk >= OPEN_AT).sum()),
            "threshold": OPEN_AT,
            "by_pattern": sorted(by, key=lambda x: -x["at_risk"]),
            "items": [],
            "model_version": self.version,
            "tool_result_id": tr,
        }
        try:
            with db() as conn:
                out["open_alarms"] = conn.execute(
                    "SELECT count(*) FROM app.alarm_event WHERE status='open'"
                ).fetchone()[0]
        except Exception:  # noqa: BLE001
            out["open_alarms"] = None
        if staff:
            top = sc.sort_values("risk", ascending=False).head(limit)
            for r in top.itertuples():
                s = self.people.static.loc[r.campus_id]
                t = self.people.terms_of(r.campus_id)
                out["items"].append({
                    "campus_id": r.campus_id, "major": s["major"], "track": s["track"],
                    "class_level": self.people.current_extra.at[r.campus_id, "class_level"],
                    "pattern": r.pattern, "risk": round(float(r.risk), 4), "k": int(r.k),
                    "avg_credits": round(float(t[:, 0].mean()), 1), "work_hours": int(s["work_hours"] or 0),
                    "lead_time_terms": int(r.lead_time_terms), "tool_result_id": tr,
                })
        return out

    # ---------- narration (Gemini with template fallback, provenance-checked) ----------
    def narrate(self, kind: str, cid: str, plan_load: float | None = None, work: float | None = None) -> dict:
        slots: dict[str, tuple[str, str]] = {}
        if kind == "alarm":
            st = self.state(cid, work)
            if st["twins"]["refused"]:
                segs = [{"text": "There aren't enough matched students to say anything reliable yet. COOKED refuses to guess."}]
                return self._finish(segs, "template", kind)
            slots = {
                "t1": (str(st["terms_done"]["value"]), st["terms_done"]["tool_result_id"]),
                "t2": (f"{st['avg_credits']['value']:.1f}", st["avg_credits"]["tool_result_id"]),
                "t3": (str(st["twins"]["n"]), st["twins"]["tool_result_id"]),
                "t4": (str(round(st["risk"]["value"] * 100)), st["risk"]["tool_result_id"]),
            }
            descs = {
                "t1": "number of completed terms", "t2": "average credits attempted per term",
                "t3": "number of matched alumni", "t4": "model's percent chance of getting cooked",
            }
            high = st["risk"]["value"] >= OPEN_AT
            template = (
                "Heads up. After {{t1}} terms, your load is averaging {{t2}} credits. We matched {{t3}} "
                "alumni who looked like you at this point, and the model puts your chance of taking over "
                "five years or piling up withdrawals at {{t4}} percent. This is the point where it usually "
                "becomes visible, and it's still cheap to change."
                if high
                else "You look on track. After {{t1}} terms at {{t2}} credits, the model puts your risk at "
                "{{t4}} percent, measured against {{t3}} matched alumni. Keep this pace."
            )
            facts = ("risk is elevated; light credit load is the main driver" if high else "risk is low; on track")
        elif kind == "drill":
            d = self.drill(cid, plan_load, work)
            stc = d["shocks_to_cooked"]
            slots = {"t1": (f"{d['plan_load']:.0f}", d["tool_result_id"])}
            descs = {"t1": "planned credits per term"}
            if stc is None:
                slots["t2"] = (str(len(d["path"])), d["tool_result_id"])
                descs["t2"] = "number of shocks survived"
                template = "Stress test complete. At {{t1}} credits a term, your plan survived {{t2}} plausible shocks in a row. It's resilient."
                facts = "plan is resilient to every plausible shock tried"
            elif stc["value"] == 0:
                template = "Stress test complete. At {{t1}} credits a term, the plan is already past the line before any shock. The fix matters more than the drill."
                facts = "plan breaks before any shock"
            else:
                slots["t2"] = (str(stc["value"]), stc["tool_result_id"])
                descs["t2"] = "number of shocks until the plan breaks"
                spof = (d["single_point_of_failure"] or "").lower()
                noun = "shock breaks" if stc["value"] == 1 else "shocks break"
                template = f"Stress test complete. At {{{{t1}}}} credits a term, {{{{t2}}}} {noun} your plan. The weakest point: {spof}."
                facts = f"weakest point: {spof}"
        elif kind == "repair":
            r = self.repair(cid, work)
            p = r["primary"]
            if not p:
                return self._finish([{"text": r["refusal"] or "No supported change found."}], "template", kind)
            slots = {
                "t1": (str(p["target"]), p["tool_result_id"]),
                "t2": (f"{p['diff_years']:.1f}", p["tool_result_id"]),
                "t3": (str(p["support"]), p["tool_result_id"]),
            }
            descs = {"t1": "credits per term target", "t2": "years sooner, median", "t3": "number of supporting alumni"}
            template = (
                "Among " + ("matched students" if p["pool"] == "matched students" else "students at your work hours")
                + " who held {{t1}} or more credits a term, the median finished {{t2}} years sooner. "
                "{{t3}} students support this. That's what happened to them, not a promise."
            )
            facts = "credit load is the lever with the most support"
        else:
            raise NotFound(kind)

        required = set(slots)
        key = hashlib.sha256(
            json.dumps([kind, TEMPLATE_VERSION, gemini.model_name(), {k: v[0] for k, v in slots.items()}, facts]).encode()
        ).hexdigest()
        segs, source = None, "template"
        try:
            with db() as conn:
                row = conn.execute("SELECT response FROM app.llm_cache WHERE hash=%s", (key,)).fetchone()
                if row:
                    segs = provenance.fill(row[0]["script"], slots, required)
                    source = "cache" if segs else source
                if segs is None and net.enabled() and gemini.configured():
                    text = gemini.write(kind, facts, descs)
                    if text is None or provenance.fill(text, slots, required) is None:
                        text = gemini.write(kind, facts, descs)  # regenerate once (§8.3)
                    if text and provenance.fill(text, slots, required):
                        segs, source = provenance.fill(text, slots, required), "gemini"
                        conn.execute(
                            "INSERT INTO app.llm_cache(hash, kind, model, response) VALUES (%s,%s,%s,%s) "
                            "ON CONFLICT (hash) DO NOTHING",
                            (key, kind, gemini.model_name(), json.dumps({"script": text})),
                        )
        except Exception:  # noqa: BLE001 -- narration never blocks on the cache or provider
            segs = None
        if segs is None:
            segs, source = provenance.fill(template, slots, required), "template"
        return self._finish(segs, source, kind)

    def _finish(self, segs: list[dict], source: str, kind: str) -> dict:
        check = provenance.check(segs)
        if not check["ok"]:  # blocked, never shown (§8.3)
            segs = [{"text": "This message was blocked because a number could not be traced."}]
        text = "".join(s.get("text") or s.get("value") for s in segs)
        self._narrated[text] = time.time()
        try:
            with db() as conn:
                for s in segs:
                    if "value" in s:
                        conn.execute(
                            "INSERT INTO app.claim(text, tool_result_id, verdict) VALUES (%s,%s,%s)",
                            (s["value"], s["tool_result_id"], "traced"),
                        )
        except Exception as exc:  # noqa: BLE001
            log.warning("claim logging failed: %s", type(exc).__name__)
        return {"kind": kind, "segments": segs, "source": source, "provenance": check, "text": text}

    # ---------- voice ----------
    def voice(self, text: str, voice: str) -> dict:
        if text not in self._narrated:
            raise NotFound("only server-narrated scripts can be voiced")
        vid = elevenlabs.voice_id(voice) or f"unconfigured:{voice}"
        h = hashlib.sha256(f"{text}|{vid}|{os.getenv('ELEVENLABS_MODEL', '')}".encode()).hexdigest()
        with db() as conn:
            if conn.execute("SELECT 1 FROM app.voice_clip WHERE hash=%s", (h,)).fetchone():
                return {"hash": h, "available": True, "source": "cache"}
            audio = elevenlabs.render(text, voice) if net.enabled() else None
            if not audio:
                return {"hash": h, "available": False, "source": "unavailable"}
            conn.execute(
                "INSERT INTO app.voice_clip(hash, voice_id, chars, audio) VALUES (%s,%s,%s,%s) ON CONFLICT DO NOTHING",
                (h, vid, len(text), audio),
            )
        return {"hash": h, "available": True, "source": "elevenlabs"}

    # ---------- memory ----------
    def remember(self, cid: str, kind: str, note: str) -> dict:
        self.current(cid)
        with db() as conn:
            row = conn.execute(
                "INSERT INTO app.memory_note(campus_id, kind, note) VALUES (%s,%s,%s) RETURNING id",
                (cid, kind, note),
            ).fetchone()
            synced = net.enabled() and backboard.remember(conn, cid, note)
            if synced:
                conn.execute("UPDATE app.memory_note SET backboard_synced=true WHERE id=%s", (row[0],))
        return {"stored": "backboard" if synced else "local", "id": row[0]}

    def recall(self, cid: str) -> dict:
        self.current(cid)
        with db() as conn:
            notes = conn.execute(
                "SELECT kind, note, backboard_synced, created_at FROM app.memory_note WHERE campus_id=%s "
                "ORDER BY created_at DESC LIMIT 20",
                (cid,),
            ).fetchall()
            summary = backboard.recall(conn, cid) if net.enabled() else None
        return {
            "notes": [{"kind": k, "note": n, "synced": s, "at": t.isoformat()} for k, n, s, t in notes],
            "summary": summary,
            "source": "backboard" if summary else "local",
        }

    def feedback(self, alarm_id: int, useful: bool, reason: str) -> dict:
        with db() as conn:
            row = conn.execute("SELECT campus_id FROM app.alarm_event WHERE id=%s", (alarm_id,)).fetchone()
            if not row:
                raise NotFound(str(alarm_id))
            conn.execute(
                "INSERT INTO app.feedback(alarm_id, campus_id, useful, note) VALUES (%s,%s,%s,%s)",
                (alarm_id, row[0], useful, reason),
            )
        mem = self.remember(row[0], "feedback", f"Alarm {'useful' if useful else 'not useful'}: {reason}"[:280])
        return {"saved": True, "memory": mem["stored"]}

    # ---------- audit ----------
    def read_audit(self, data: bytes, mime: str) -> dict:
        cid = gemini.read_audit(data, mime) if net.enabled() else None
        via = "gemini" if cid else "local"
        if not cid:
            m = CID.search(data.decode("latin-1"))
            cid = m.group(0) if m else None
        if cid and cid not in self.people.static.index:
            cid = None
        return {"campus_id": cid, "source": via}

    # ---------- myths (computed where the data allows) ----------
    def myths(self) -> dict:
        people = self.people
        alumni = people.static[people.static.population == "alumni"]
        stopout = float(np.mean([people.gaps.get(c, 0) > 0 for c in alumni.index]))
        tr_stop = self.rec("myth_stopouts", {"n": len(alumni)})
        with db() as conn:
            wf = conn.execute(
                "SELECT avg((grade IN ('W','F'))::int)::float, count(*) FROM feat.transcripts WHERE grade <> 'IP'"
            ).fetchone()
        tr_wf = self.rec("myth_withdraw_fail_rate", {"n": wf[1]})
        # the load cliff for heavy workers (held up)
        heavy = [c for c in alumni.index if (alumni.at[c, "work_hours"] or 0) >= 20 and len(people.terms_of(c))]
        loads = np.array([people.terms_of(c)[:, 0].mean() for c in heavy])
        cooked = alumni.loc[heavy, "cooked"].to_numpy()
        light, full = cooked[loads <= 7], cooked[(loads > 11) & (loads <= 13)]
        tr_cliff = self.rec("load_cliff", {"n": len(heavy)})
        m = self.models.manifest
        tr_auc = self.rec("model_metrics", {"version": self.version})
        return {
            "items": [
                {"title": "Stop-outs are why students take longer", "value": f"{stopout:.1%}",
                 "evidence": "of alumni ever skipped a regular term. The mechanism is light loads, not stop-outs.",
                 "tool_result_id": tr_stop, "computed": True},
                {"title": "Some course combinations are killers", "value": f"{wf[0]:.1%}",
                 "evidence": f"withdraw or fail rate per enrollment across {wf[1]:,} graded enrollments; no pair spikes the way the myth says.",
                 "tool_result_id": tr_wf, "computed": True},
                {"title": "Close your skill gaps to get paid more", "value": "p = 0.085",
                 "evidence": "Skill coverage vs first salary with controls: +$1.6k, not significant (team evidence notebook).",
                 "tool_result_id": "nb_skill_gap", "computed": False},
                {"title": "Some courses set up better careers", "value": "0 of 65",
                 "evidence": "Within-course grade effects on salary after FDR correction (team evidence notebook).",
                 "tool_result_id": "nb_course_effects", "computed": False},
                {"title": "Clubs and hackathons pay off", "value": "≈ $0",
                 "evidence": "Involvement types vs salary after controls, p > 0.4; internships are the exception (team evidence notebook).",
                 "tool_result_id": "nb_involvement", "computed": False},
            ],
            "held_up": [
                {"title": "It's a cliff, not a slope", "value": f"{light.mean():.0%} vs {full.mean():.0%}",
                 "evidence": f"cooked rate for heavy workers at ≤7 vs 11–13 credits/term (n={len(light)}, {len(full)}).",
                 "tool_result_id": tr_cliff, "computed": True},
                {"title": "It's visible at enrollment", "value": f"AUC {m['metrics']['0']['auc']:.2f}",
                 "evidence": f"enrollment-only model on held-out {m['metrics']['0']['test_years'][0]}–{m['metrics']['0']['test_years'][1]} graduates; {m['metrics']['1']['auc']:.2f} after one term.",
                 "tool_result_id": tr_auc, "computed": True},
            ],
        }


_engine: Engine | None = None
_lock = threading.Lock()


def get_engine() -> Engine:
    global _engine
    if _engine is None:
        with _lock:
            if _engine is None:
                try:
                    models = Models.load(model_dir())
                except ArtifactError as exc:
                    raise NotReady(
                        "models_not_ready", "Model artifacts are not available.", ["run: make train"]
                    ) from exc
                try:
                    with db() as conn:
                        people = load_people(conn)
                except Exception as exc:
                    raise NotReady(
                        "database_unavailable", "The database is not reachable.", ["check DATABASE_URL_APP"]
                    ) from exc
                _engine = Engine(people, models)
    return _engine


def reset_engine() -> None:
    global _engine
    _engine = None


__all__ = ["MIN_SUPPORT", "Engine", "NotFound", "NotReady", "get_engine", "reset_engine"]
