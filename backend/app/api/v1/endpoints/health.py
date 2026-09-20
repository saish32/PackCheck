import time
from datetime import datetime, timezone
from fastapi import APIRouter, status
from fastapi.responses import JSONResponse
from app.core.config import settings
from app.core.database import check_db_health
from app.schemas.health import HealthResponse, DatabaseHealthResponse

router = APIRouter()
START_TIME = time.time()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Application Health Check",
    description="Returns high-level application health status, uptime, and environment."
)
async def get_health() -> HealthResponse:
    uptime_seconds = round(time.time() - START_TIME, 2)
    return HealthResponse(
        status="healthy",
        timestamp=datetime.now(timezone.utc).isoformat(),
        environment=settings.ENVIRONMENT,
        uptime_seconds=uptime_seconds
    )


@router.get(
    "/health/db",
    response_model=DatabaseHealthResponse,
    summary="Database Connectivity Check",
    description="Safely tests connection to MySQL database, verifying query capability and response latency."
)
async def get_db_health():
    is_healthy, db_version, latency_ms = check_db_health()
    now_iso = datetime.now(timezone.utc).isoformat()

    if not is_healthy:
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "status": "disconnected",
                "database_version": None,
                "timestamp": now_iso,
                "latency_ms": latency_ms
            }
        )

    return DatabaseHealthResponse(
        status="connected",
        database_version=db_version,
        timestamp=now_iso,
        latency_ms=latency_ms
    )
