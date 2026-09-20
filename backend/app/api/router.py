from fastapi import APIRouter
from app.api.v1.endpoints import health, auth, inspections, audit, evidence, extraction, rules, reports, analytics

api_router = APIRouter()

# Health & Diagnostics
api_router.include_router(health.router, tags=["Health & Diagnostics"])

# Phase 3: Auth & RBAC
api_router.include_router(auth.router, prefix="/auth", tags=["Authentication & RBAC"])

# Phase 4: Inspection Management & History
api_router.include_router(inspections.router, prefix="/inspections", tags=["Inspection Management"])

# Phase 5: Multi-View Evidence Capture & Recapture
api_router.include_router(evidence.router, prefix="/inspections", tags=["Evidence Capture"])

# Phase 6: Pretrained OCR & Structured Field Extraction
api_router.include_router(extraction.router, prefix="/inspections", tags=["OCR & Field Extraction"])

# Phase 3/4: System Audit Logs
api_router.include_router(audit.router, prefix="/audit", tags=["Audit Logging"])

# Phase 7: Regulatory Corpus + Deterministic LMPC Rule Engine
api_router.include_router(rules.router, tags=["Regulatory Rules & Compliance Engine"])

# Phases 10–11: Professional PDF Report Engine & Permanent Storage
api_router.include_router(reports.router, prefix="/inspections", tags=["Final Reports & Storage"])

# Phase 14: Enforcement Dashboard & Analytics
api_router.include_router(analytics.router, prefix="/analytics", tags=["Enforcement Analytics"])

