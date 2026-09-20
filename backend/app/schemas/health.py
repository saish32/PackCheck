from typing import Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = Field(..., description="Service health status, e.g. healthy")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    environment: str = Field(..., description="Current running environment")
    uptime_seconds: float = Field(..., description="Uptime of the backend process in seconds")


class DatabaseHealthResponse(BaseModel):
    status: str = Field(..., description="Database connection health, e.g. connected or disconnected")
    database_version: Optional[str] = Field(None, description="MySQL server version if connected")
    timestamp: str = Field(..., description="ISO 8601 UTC timestamp")
    latency_ms: float = Field(..., description="Round-trip query latency in milliseconds")
