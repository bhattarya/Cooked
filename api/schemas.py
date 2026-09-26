"""Draft §12 contracts. Product responses are explicitly mock and contain no predictions."""

from typing import Annotated, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

CampusID = Annotated[str, Field(pattern=r"^CID-[0-9]{6}$")]
T = TypeVar("T")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorResponse(StrictModel):
    error: str
    message: str
    needs: list[str] = Field(default_factory=list)


class HealthChecks(StrictModel):
    database: Literal["ok", "unavailable"]
    artifact_checksum: Literal["not_configured"] = "not_configured"
    cache: Literal["ok", "unavailable"]


class HealthResponse(StrictModel):
    status: Literal["ok", "degraded"]
    mode: Literal["scaffold"] = "scaffold"
    checks: HealthChecks


class EvidenceNumber(StrictModel):
    value: float
    tool_result_id: str


class EvidenceRange(StrictModel):
    low: float
    high: float
    support: int
    tool_result_id: str


class MockResponse(StrictModel, Generic[T]):
    mock: Literal[True] = True
    message: str = "Phase 1 placeholder; no prediction, provider call, or database write performed."
    data: T


class StudentState(StrictModel):
    campus_id: CampusID
    delay: EvidenceRange | None = None
    still_seeking_risk: EvidenceRange | None = None
    degree_burden: EvidenceRange | None = None


class Alarm(StrictModel):
    id: str | None = None
    campus_id: CampusID | None = None
    pattern: str | None = None
    risk: EvidenceNumber | None = None
    status: Literal["open", "acknowledged", "resolved", "dismissed"] | None = None


class AlarmList(StrictModel):
    aggregated: Literal[True] = True
    items: list[Alarm] = Field(default_factory=list)


class FeedbackRequest(StrictModel):
    useful: bool
    reason: Annotated[str, Field(max_length=120)] = ""


class FeedbackResult(StrictModel):
    saved: Literal[False] = False


class Profile(StrictModel):
    work_hours: Annotated[int, Field(ge=0, le=80)]
    credits_per_term: Annotated[int, Field(ge=0, le=24)]
    entry_type: Literal["Transfer", "First-Time Freshman"]
    residency: Literal["In-State", "Out-of-State"]


class DrillRequest(StrictModel):
    campus_id: CampusID | None = None
    profile: Profile | None = None

    @model_validator(mode="after")
    def one_input(self):
        if (self.campus_id is None) == (self.profile is None):
            raise ValueError("Provide exactly one of campus_id or profile")
        return self


class DrillReport(StrictModel):
    drill_id: UUID | None = None
    shocks_to_cooked: EvidenceNumber | None = None
    single_point_of_failure: str | None = None


class SurvivalPoint(StrictModel):
    term_k: int
    survival: float
    tool_result_id: str


class SurvivalReport(StrictModel):
    drill_id: UUID
    points: list[SurvivalPoint] = Field(default_factory=list)


class RepairRequest(StrictModel):
    campus_id: CampusID


class RepairChange(StrictModel):
    lever: str
    effect: EvidenceRange


class RepairReport(StrictModel):
    primary: RepairChange | None = None
    fallback: RepairChange | None = None


class AudioPlaceholder(StrictModel):
    hash: str
    available: Literal[False] = False


class QueueReport(StrictModel):
    aggregated: Literal[True] = True
    items: list[Alarm] = Field(default_factory=list)


class Myth(StrictModel):
    title: str
    evidence: str
    tool_result_id: str


class MythsReport(StrictModel):
    items: list[Myth] = Field(default_factory=list)
