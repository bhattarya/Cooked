import os
from contextlib import asynccontextmanager
from uuid import UUID, uuid4

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from api import auth
from api.engine import NotFound, NotReady, model_dir
from api.health import database_kind, dependency_status
from api.providers import backboard, claude, elevenlabs, gemini, net
from api.routes.product import router
from api.schemas import ErrorResponse, HealthResponse
from ml.model_interface import ArtifactError, verify


@asynccontextmanager
async def lifespan(app):
    """Refuse to start on a modified artifact (§5.4); a missing one keeps scaffold mode."""
    try:
        verify(model_dir())
    except ArtifactError as exc:
        if str(exc) != "not_configured":
            raise
    yield


app = FastAPI(
    title="COOKED — Synthetic Data Only",
    version="1.0.0",
    description="Early-warning and stress-test API over frozen, checksummed models. "
    "Every number carries the tool_result_id that produced it.",
    lifespan=lifespan,
    openapi_url="/openapi.json",
    root_path=os.getenv("API_ROOT_PATH", ""),
    # Explicit descriptions: Python 3.13 renamed HTTP 422's phrase ("Unprocessable Entity" ->
    # "Unprocessable Content"), which would make the exported contract depend on the interpreter.
    responses={
        422: {"model": ErrorResponse, "description": "Invalid request"},
        503: {"model": ErrorResponse, "description": "Service unavailable"},
    },
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    ],
    allow_methods=["GET", "POST"],
    allow_credentials=True,
    allow_headers=["Content-Type", "Authorization"],
)


@app.middleware("http")
async def demo_session(request: Request, call_next):
    # DEMO_MODE=1 is enforced in api.providers.net: no provider call can leave the machine,
    # so narration and voice replay from Postgres caches and the models run locally.
    session = request.cookies.get("cooked_session", "")
    try:
        UUID(session)
    except ValueError:
        session = str(uuid4())
    response = await call_next(request)
    response.set_cookie(
        "cooked_session",
        session,
        httponly=True,
        secure=request.url.scheme == "https",
        samesite="lax",
    )
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    return JSONResponse(
        status_code=422,
        content={
            "error": "invalid_request",
            "message": "Request does not match the documented schema.",
            "needs": ["Use synthetic identifiers and the OpenAPI request schema."],
        },
    )


@app.exception_handler(NotReady)
async def not_ready(request, exc: NotReady):
    return JSONResponse(
        status_code=503, content={"error": exc.error, "message": exc.message, "needs": exc.needs}
    )


@app.exception_handler(auth.AuthError)
async def auth_error(request, exc: auth.AuthError):
    return JSONResponse(
        status_code=exc.status,
        content={"error": exc.error, "message": exc.message, "needs": ["A valid Firebase ID token."]},
        headers={"WWW-Authenticate": "Bearer"} if exc.status == 401 else None,
    )


@app.exception_handler(NotFound)
async def not_found(request, exc: NotFound):
    return JSONResponse(
        status_code=404,
        content={"error": "not_found", "message": "No synthetic record matches.", "needs": []},
    )


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "http_error",
            "message": exc.detail if request.url.path.endswith("/audit/parse") and isinstance(exc.detail, str) else "The requested resource is unavailable.",
            "needs": [],
        },
    )


@app.get(
    "/healthz",
    response_model=HealthResponse,
    responses={503: {"model": HealthResponse}},
    tags=["infrastructure"],
)
def healthz(response: Response):
    checks = dependency_status()
    ready = checks["database"] == "ok" and checks["cache"] == "ok"
    response.status_code = 200 if ready else 503
    version = None
    if checks["artifact_checksum"] == "ok":
        try:
            version = verify(model_dir())["version"]
        except ArtifactError:
            version = None
    return HealthResponse(
        status="ok" if ready else "degraded",
        mode="models" if version else "scaffold",
        model_version=version,
        audit_reader_model=((claude.audit_model_name() if os.getenv("AUDIT_PROVIDER", "").lower() == "claude" or (net.key("ANTHROPIC_API_KEY") and not net.key("GEMINI_API_KEY")) else gemini.audit_model_name()) or None),
        demo_mode=not net.enabled(),
        database_kind=database_kind(),
        voice_usage=dict(elevenlabs.usage),
        providers={
            "gemini": gemini.configured(),
            "claude": bool(net.key("ANTHROPIC_API_KEY")),
            "elevenlabs": elevenlabs.configured("narrator"),
            "backboard": backboard.configured(),
            "firebase_auth": auth.enabled(),
        },
        checks=checks,
    )


app.include_router(router)
app.include_router(auth.router)
