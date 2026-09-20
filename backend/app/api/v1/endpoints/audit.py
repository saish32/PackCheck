from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc
from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.audit import AuditLog
from app.schemas.audit import AuditLogListResponse, AuditLogOut
from app.api.deps import require_roles

router = APIRouter()


@router.get(
    "/logs",
    response_model=AuditLogListResponse,
    summary="List Audit Logs",
    description="Lists chronological system audit logs. Permitted for Admin, Supervisor, and Auditor only."
)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = Query(None),
    user_email: Optional[str] = Query(None),
    current_user: User = Depends(require_roles([UserRole.ADMIN, UserRole.SUPERVISOR, UserRole.AUDITOR])),
    db: Session = Depends(get_db)
):
    query = db.query(AuditLog)
    if action:
        query = query.filter(AuditLog.action == action)
    if user_email:
        query = query.filter(AuditLog.user_email.ilike(f"%{user_email}%"))

    total = query.count()
    offset = (page - 1) * page_size
    records = query.order_by(desc(AuditLog.created_at)).offset(offset).limit(page_size).all()

    return AuditLogListResponse(
        items=[AuditLogOut.model_validate(r) for r in records],
        total=total,
        page=page,
        page_size=page_size
    )
