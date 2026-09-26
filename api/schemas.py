"""§12 contracts. Every numeric field travels with the tool_result_id that produced it."""

from typing import Annotated, Any, Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator

# dataset students (CID-) or profiles built from an uploaded audit (USR-)
CampusID = Annotated[str, Field(pattern=r"^(CID-[0-9]{6}|USR-[0-9a-f]{10})$")]
T = TypeVar("T")


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorResponse(StrictModel):
    error: str
    message: str
    needs: list[str] = Field(default_factory=list)


class HealthChecks(StrictModel):
    database: Literal["ok", "unavailable"]
    artifact_checksum: Literal["ok", "not_configured", "mismatch"] = "not_configured"
    cache: Literal["ok", "unavailable"]


class HealthResponse(StrictModel):
    status: Literal["ok", "degraded"]
    mode: Literal["scaffold", "models"] = "scaffold"
    model_version: str | None = None
    demo_mode: bool = False
    providers: dict[str, bool] = Field(default_factory=dict)
    database_kind: Literal["tiger-cloud", "timescaledb-local", "unknown"] = "unknown"
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
    saved: bool
    memory: Literal["backboard", "local"]


class Profile(StrictModel):
    work_hours: Annotated[int, Field(ge=0, le=80)]
    credits_per_term: Annotated[int, Field(ge=0, le=24)]
    entry_type: Literal["Transfer", "First-Time Freshman"]
    residency: Literal["In-State", "Out-of-State"]


class DrillRequest(StrictModel):
    campus_id: CampusID | None = None
    profile: Profile | None = None
    plan_load: Annotated[float, Field(ge=3, le=21)] | None = None
    work_hours: Annotated[int, Field(ge=0, le=60)] | None = None

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
    work_hours: Annotated[int, Field(ge=0, le=60)] | None = None


class NarrateRequest(StrictModel):
    kind: Literal["alarm", "drill", "repair"]
    campus_id: CampusID
    plan_load: Annotated[float, Field(ge=3, le=21)] | None = None
    work_hours: Annotated[int, Field(ge=0, le=60)] | None = None
    wait: bool = True  # false: answer now with the template while Gemini writes in the background


class VoiceRequest(StrictModel):
    text: Annotated[str, Field(min_length=1, max_length=500)]
    voice: Literal["narrator", "coach"] = "narrator"


class MemoryRequest(StrictModel):
    kind: Literal["decision", "constraint", "outcome"] = "decision"
    note: Annotated[str, Field(min_length=1, max_length=280)]


class AskRequest(StrictModel):
    question: Annotated[str, Field(min_length=1, max_length=500)]
    work_hours: Annotated[int, Field(ge=0, le=60)] | None = None
    plan_load: Annotated[float, Field(ge=3, le=21)] | None = None


class SayRequest(StrictModel):
    line: Literal["greeting", "thanks", "ask_work", "ready", "listening"]
    name: Annotated[str, Field(max_length=60)] | None = None


class WorkRequest(StrictModel):
    work_hours: Annotated[int, Field(ge=0, le=60)]


class Envelope(StrictModel, Generic[T]):
    """Real (non-mock) product response."""

    mock: Literal[False] = False
    model_version: str
    data: T


Data = dict[str, Any]


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
