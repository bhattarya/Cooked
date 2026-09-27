"""§12 product routes over the frozen models. Replaces the Phase 1 mocks."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, File, HTTPException, Path, Query, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from api import agent, explore, model_lab
from api.auth import CurrentUser, require_signed_in
from api.engine import NotFound, db, get_engine
from api.schemas import (
    AskRequest,
    CampusID,
    Data,
    DrillRequest,
    Envelope,
    ExploreRequest,
    FeedbackRequest,
    FeedbackResult,
    MemoryRequest,
    ModelLabRequest,
    NarrateRequest,
    RepairRequest,
    SayRequest,
    VoiceRequest,
    WorkRequest,
)

router = APIRouter(tags=["product"])
WorkHours = Annotated[int | None, Query(ge=0, le=60)]
PlanLoad = Annotated[float | None, Query(ge=3, le=21)]


def wrap(data) -> Envelope[Data]:
    return Envelope[Data](model_version=get_engine().version, data=data)


@router.get("/model-lab/arena", response_model=Envelope[Data])
def model_lab_arena():
    """The frozen model arena: four competing model families per task, the pre-registered
    champion, holdout metrics, curves, feature importance and a plain-English card for each task."""
    return wrap(model_lab.arena(get_engine()))


@router.post("/model-lab/simulate", response_model=Envelope[Data])
def model_lab_simulate(body: ModelLabRequest):
    """Score one interactive, synthetic planning scenario with every model in the arena: the
    champion of each task answers, the other families answer beside it, and `drivers` lists the
    inputs moving the risk."""
    return wrap(model_lab.simulate(get_engine(), body))


@router.get("/students/{id}/state", response_model=Envelope[Data])
def state(id: CampusID, work_hours: WorkHours = None, plan_load: PlanLoad = None):
    """Risk, time-to-degree range, twin-based tiles; refuses tiles below 30 balanced twins."""
    return wrap(get_engine().state(id, work_hours, plan_load))


@router.post("/students/{id}/alarm/check", response_model=Envelope[Data])
def alarm_check(id: CampusID):
    """Run the Watchtower for one student now (idempotent under hysteresis)."""
    return wrap(get_engine().alarm_check(id))


@router.get("/alarms", response_model=Envelope[Data])
def alarms(status: Literal["open", "acknowledged", "resolved", "dismissed"] = "open"):
    """Aggregated alarm counts by pattern from the continuous aggregate; no per-student rows."""
    eng = get_engine()
    with db() as conn:
        rows = conn.execute(
            "SELECT pattern, count(*), avg(risk)::float FROM app.alarm_event WHERE status=%s "
            "GROUP BY pattern ORDER BY 2 DESC",
            (status,),
        ).fetchall()
        daily = conn.execute(
            "SELECT day, pattern, n, avg_risk::float FROM app.alarms_by_day_pattern "
            "ORDER BY day DESC LIMIT 60"
        ).fetchall()
    tr = eng.rec("alarms", {"status": status})
    return wrap(
        {
            "aggregated": True,
            "status": status,
            "items": [{"pattern": p, "n": n, "avg_risk": r, "tool_result_id": tr} for p, n, r in rows],
            "daily": [{"day": d.isoformat(), "pattern": p, "n": n, "avg_risk": r} for d, p, n, r in daily],
        }
    )


@router.post("/alarms/{id}/feedback", response_model=Envelope[FeedbackResult])
def feedback(id: Annotated[int, Path(ge=1)], body: FeedbackRequest):
    eng = get_engine()
    return Envelope[FeedbackResult](
        model_version=eng.version, data=FeedbackResult(**eng.feedback(id, body.useful, body.reason))
    )


@router.post("/drill", response_model=Envelope[Data])
def drill(body: DrillRequest):
    """Greedy adversarial drill plus 200 Monte Carlo futures written to app.drill_trajectory."""
    if body.campus_id is None:
        raise NotFound("custom profiles are on the cut list; use a synthetic campus_id")
    return wrap(get_engine().drill(body.campus_id, body.plan_load, body.work_hours))


@router.get("/drill/{id}/survival", response_model=Envelope[Data])
def survival(id: UUID):
    """Survival curve aggregated in SQL over the stored trajectories."""
    return wrap(get_engine().survival(str(id)))


@router.post("/repair", response_model=Envelope[Data])
def repair(body: RepairRequest):
    return wrap(get_engine().repair(body.campus_id, body.work_hours))


@router.post("/narrate", response_model=Envelope[Data])
def narrate(body: NarrateRequest):
    """Script as segments; numbers are tokens tied to tool results (Gemini, cache or template)."""
    return wrap(get_engine().narrate(body.kind, body.campus_id, body.plan_load, body.work_hours, body.wait))


@router.post("/voice", response_model=Envelope[Data])
def voice(body: VoiceRequest):
    """Render (or reuse) an ElevenLabs clip for a script this server narrated."""
    return wrap(get_engine().voice(body.text, body.voice))


@router.get(
    "/audio/{hash}",
    responses={200: {"content": {"audio/mpeg": {}}}},
    response_class=Response,
)
def audio(hash: Annotated[str, Path(pattern=r"^[a-f0-9]{64}$")]):
    with db() as conn:
        row = conn.execute("SELECT mime, audio FROM app.voice_clip WHERE hash=%s", (hash,)).fetchone()
    if not row:
        raise NotFound(hash)
    return Response(content=bytes(row[1]), media_type=row[0], headers={"Cache-Control": "public, max-age=86400"})


@router.post("/students/{id}/memory", response_model=Envelope[Data])
def remember(id: CampusID, body: MemoryRequest):
    return wrap(get_engine().remember(id, body.kind, body.note))


@router.get("/students/{id}/memory", response_model=Envelope[Data])
def recall(id: CampusID):
    return wrap(get_engine().recall(id))


@router.post("/audit/parse", response_model=Envelope[Data])
async def audit(file: Annotated[UploadFile, File()]):
    """Sample audits map to their synthetic student; real PDFs are read by Gemini into a profile.
    The file is never stored; only parsed courses and terms are kept."""
    data = await file.read(8_000_001)
    if len(data) > 8_000_000:
        raise HTTPException(413, "Choose an audit under 8 MB.")
    if not data:
        raise HTTPException(422, "The uploaded file is empty.")
    is_pdf = b"%PDF" in data[:1024]
    mime = ("application/pdf" if is_pdf else
            "image/png" if data.startswith(b"\x89PNG\r\n\x1a\n") else
            "image/jpeg" if data.startswith(b"\xff\xd8\xff") else
            "image/webp" if data.startswith(b"RIFF") and data[8:12] == b"WEBP" else None)
    if mime is None:
        raise HTTPException(415, "Choose a PDF, PNG, JPEG or WebP audit.")
    # Provider calls are synchronous and can take minutes; keep the event loop free for voice.
    def parse():
        return wrap(agent.intake(get_engine(), data, mime))
    return await run_in_threadpool(parse)


@router.post("/profiles/{id}/work", response_model=Envelope[Data])
def work(id: CampusID, body: WorkRequest):
    return wrap(agent.set_work(get_engine(), id, body.work_hours))


@router.post("/students/{id}/ask", response_model=Envelope[Data])
def ask(id: CampusID, body: AskRequest):
    """Voice/text question -> one tool (Gemini function calling or local router) -> spoken
    answer segments (provenance-checked) + a visual spec."""
    return wrap(agent.ask(get_engine(), id, body.question, body.work_hours, body.plan_load))


@router.post("/explore", response_model=Envelope[Data])
def cohort_explore(body: ExploreRequest):
    """Ask about the synthetic cohort before uploading an audit; returns SQL-grounded chart data."""
    return wrap(explore.explore(get_engine(), body.question))


@router.post("/say", response_model=Envelope[Data])
def say(body: SayRequest):
    """Fixed spoken lines (greeting, thanks for uploading...) registered so /voice can render them."""
    return wrap(agent.say(get_engine(), body.line, body.name))


@router.get("/institution/queue", response_model=Envelope[Data])
def queue(
    user: CurrentUser, staff: bool = False, limit: Annotated[int, Query(ge=1, le=2000)] = 200
):
    """Aggregated by pattern by default; per-student rows need a signed-in user (when auth is on)."""
    if staff:
        require_signed_in(user)
    return wrap(get_engine().queue(staff, limit))


@router.get("/myths", response_model=Envelope[Data])
def myths():
    return wrap(get_engine().myths())
