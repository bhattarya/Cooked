from typing import Annotated, Literal
from uuid import UUID

from fastapi import APIRouter, Path

from api.schemas import (
    Alarm,
    AlarmList,
    AudioPlaceholder,
    CampusID,
    DrillReport,
    DrillRequest,
    FeedbackRequest,
    FeedbackResult,
    MockResponse,
    MythsReport,
    QueueReport,
    RepairReport,
    RepairRequest,
    StudentState,
    SurvivalReport,
)

router = APIRouter(tags=["mock — backend handoff"])


@router.get("/students/{id}/state", response_model=MockResponse[StudentState])
def state(id: CampusID):
    return MockResponse(data=StudentState(campus_id=id))


@router.post("/students/{id}/alarm/check", response_model=MockResponse[Alarm])
def alarm_check(id: CampusID):
    return MockResponse(data=Alarm(campus_id=id))


@router.get("/alarms", response_model=MockResponse[AlarmList])
def alarms(status: Literal["open", "acknowledged", "resolved", "dismissed"] = "open"):
    return MockResponse(data=AlarmList())


@router.post("/alarms/{id}/feedback", response_model=MockResponse[FeedbackResult])
def feedback(id: Annotated[int, Path(ge=1)], body: FeedbackRequest):
    return MockResponse(data=FeedbackResult())


@router.post("/drill", response_model=MockResponse[DrillReport])
def drill(body: DrillRequest):
    return MockResponse(data=DrillReport())


@router.get("/drill/{id}/survival", response_model=MockResponse[SurvivalReport])
def survival(id: UUID):
    return MockResponse(data=SurvivalReport(drill_id=id))


@router.post("/repair", response_model=MockResponse[RepairReport])
def repair(body: RepairRequest):
    return MockResponse(data=RepairReport())


@router.get(
    "/audio/{hash}",
    response_model=MockResponse[AudioPlaceholder],
    description="Scaffold returns JSON only. Backend must add the PDF's audio/mpeg response.",
)
def audio(hash: Annotated[str, Path(pattern=r"^[a-f0-9]{64}$")]):
    return MockResponse(data=AudioPlaceholder(hash=hash))


@router.get("/institution/queue", response_model=MockResponse[QueueReport])
def queue():
    return MockResponse(data=QueueReport())


@router.get("/myths", response_model=MockResponse[MythsReport])
def myths():
    return MockResponse(data=MythsReport())
