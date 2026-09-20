import time
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.logging import logger
from app.core.errors import http_exception_handler, generic_exception_handler
from app.core.init_db import init_database
from app.api.router import api_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: Initialize missing tables and idempotent demo accounts
    logger.info("Initializing PackCheck backend services...")
    init_database()
    yield
    # Shutdown: Clean up if needed
    logger.info("Shutting down PackCheck backend...")


def create_application() -> FastAPI:
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version="1.0.0",
        description="PackCheck Core API - Automated Packaging Inspection & Compliance Engine (Phases 1, 3 & 4)",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan
    )

    # Configure CORS with explicit support for Vercel domains and credentialed requests
    raw_origins = settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [str(settings.CORS_ORIGINS)]
    cors_origins = [o.strip() for o in raw_origins if o.strip() and o.strip() != "*"]
    
    known_origins = [
        "https://pack-check-mu.vercel.app",
        "https://pack-check.vercel.app",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ]
    for ko in known_origins:
        if ko not in cors_origins:
            cors_origins.append(ko)

    application.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_origin_regex=r"^https://.*\.vercel\.app$|^http://localhost:\d+$",
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
        expose_headers=["*"],
    )

    # Structured Request Logging Middleware
    @application.middleware("http")
    async def log_requests(request: Request, call_next):
        start_time = time.perf_counter()
        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.info(
                f"{request.method} {request.url.path} - Status: {response.status_code} - Duration: {duration_ms}ms"
            )
            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start_time) * 1000, 2)
            logger.error(
                f"{request.method} {request.url.path} - Failed with error: {str(exc)} - Duration: {duration_ms}ms"
            )
            raise exc

    # Exception Handlers
    application.add_exception_handler(HTTPException, http_exception_handler)
    application.add_exception_handler(Exception, generic_exception_handler)

    # API Routers
    application.include_router(api_router, prefix=settings.API_V1_STR)

    @application.get("/", tags=["Root"])
    async def root():
        return {
            "name": settings.PROJECT_NAME,
            "version": "1.0.0",
            "phase": "Phases 1, 3 & 4 - Auth, RBAC & Inspection Management Active",
            "docs": "/docs"
        }

    return application


app = create_application()
