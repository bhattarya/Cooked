import os
from uuid import UUID, uuid4

from fastapi import FastAPI, Request, Response
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException

from api.health import dependency_status
from api.routes.mock import router
from api.schemas import ErrorResponse, HealthResponse

app = FastAPI(
    title="COOKED Phase 1 — Synthetic Data Only",
    version="0.1.0",
    description="Draft interface for teammate review. All product endpoints return mock JSON.",
    openapi_url="/openapi.json",
    root_path=os.getenv("API_ROOT_PATH", ""),
    responses={422: {"model": ErrorResponse}, 503: {"model": ErrorResponse}},
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        s.strip() for s in os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
    ],
    allow_methods=["GET", "POST"],
    allow_headers=["Content-Type"],
)


@app.middleware("http")
async def demo_session(request: Request, call_next):
    if os.getenv("DEMO_MODE") == "1" and request.url.path not in {
        "/healthz",
        "/openapi.json",
        "/docs",
    }:
        return JSONResponse(
            status_code=503,
            content={
                "error": "cache_replay_not_implemented",
                "message": "Backend cache replay is pending.",
                "needs": ["backend cache replay implementation"],
            },
        )
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


@app.exception_handler(HTTPException)
async def http_error(request, exc):
    return JSONResponse(
        status_code=exc.status_code,
        content={
            "error": "http_error",
            "message": "The requested resource is unavailable.",
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
    return HealthResponse(status="ok" if ready else "degraded", checks=checks)


app.include_router(router)
