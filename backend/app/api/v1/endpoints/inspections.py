import uuid
from datetime import datetime, timezone
from typing import Optional, List, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Query, Request
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_
from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.inspection import Inspection, InspectionStatus, InspectionHistory
from app.models.extraction import ExtractedDeclaration
from app.models.rules import ComplianceRun, ComplianceFinding
from app.models.report import FinalizedReport
from app.storage.repository import MySQLBlobStorageRepository
from app.schemas.inspection import (
    InspectionCreate,
    InspectionUpdate,
    InspectionStatusUpdate,
    InspectionReopen,
    InspectionOut,
    InspectionDetailOut,
    InspectionListResponse,
    InspectionHistoryOut
)
from app.api.deps import get_current_user, require_roles, create_audit_entry

router = APIRouter()


def parse_date_filter(val: Optional[str], is_end: bool = False) -> Optional[datetime]:
    """
    Parses a date/timestamp filter string safely into a UTC-normalized naive datetime
    for robust database querying across timezone and midnight boundaries.
    """
    if not val or not val.strip():
        return None
    val = val.strip()
    try:
        if len(val) == 10 and val.count("-") == 2:
            dt = datetime.strptime(val, "%Y-%m-%d")
            if is_end:
                return dt.replace(hour=23, minute=59, second=59, microsecond=999999)
            return dt.replace(hour=0, minute=0, second=0, microsecond=0)
        dt = datetime.fromisoformat(val.replace("Z", "+00:00"))
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        return dt
    except Exception:
        return None


# Finite State Machine for Allowed Inspection Status Transitions
VALID_TRANSITIONS: Dict[InspectionStatus, List[InspectionStatus]] = {
    InspectionStatus.DRAFT: [InspectionStatus.IN_PROGRESS, InspectionStatus.PENDING_REVIEW],
    InspectionStatus.IN_PROGRESS: [InspectionStatus.DRAFT, InspectionStatus.PENDING_REVIEW],
    InspectionStatus.PENDING_REVIEW: [InspectionStatus.APPROVED, InspectionStatus.REJECTED, InspectionStatus.IN_PROGRESS],
    InspectionStatus.APPROVED: [InspectionStatus.REOPENED],
    InspectionStatus.REJECTED: [InspectionStatus.REOPENED],
    InspectionStatus.REOPENED: [InspectionStatus.IN_PROGRESS, InspectionStatus.PENDING_REVIEW],
}


def generate_immutable_inspection_id() -> str:
    """Generates a professional immutable inspection identifier e.g. INS-20260915-A1B2."""
    date_str = datetime.now(timezone.utc).strftime("%Y%m%d")
    short_suffix = uuid.uuid4().hex[:6].upper()
    return f"INS-{date_str}-{short_suffix}"


def verify_inspection_access(inspection: Inspection, current_user: User) -> None:
    """
    Enforces resource-level scoping.
    Inspectors can only access inspections they created or are assigned to.
    Supervisors, Auditors, Rule Managers, and Admins have system-wide read visibility.
    """
    if current_user.role == UserRole.INSPECTOR:
        if inspection.created_by_id != current_user.id and inspection.assigned_to_id != current_user.id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Access denied. You are only authorized to access your own inspection records."
            )


@router.post(
    "",
    response_model=InspectionOut,
    status_code=status.HTTP_201_CREATED,
    summary="Create New Inspection",
    description="Creates a new packaging inspection with an immutable ID. Permitted for Inspector, Supervisor, and Admin."
)
async def create_inspection(
    payload: InspectionCreate,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    immutable_id = generate_immutable_inspection_id()

    new_inspection = Inspection(
        inspection_id=immutable_id,
        name=payload.name,
        product_name=payload.product_name,
        brand_name=payload.brand_name,
        batch_number=payload.batch_number,
        packaging_type=payload.packaging_type,
        category=payload.category,
        barcode=payload.barcode,
        fssai_license=payload.fssai_license,
        net_quantity=payload.net_quantity,
        status=InspectionStatus.DRAFT,
        created_by_id=current_user.id,
        inspector_name=current_user.full_name,
        notes=payload.notes,
        metadata_json="{}"
    )
    db.add(new_inspection)
    db.commit()
    db.refresh(new_inspection)

    # Record initial history
    history_entry = InspectionHistory(
        inspection_id=immutable_id,
        changed_by_id=current_user.id,
        changed_by_name=current_user.full_name,
        changed_by_role=current_user.role.value,
        from_status="none",
        to_status=InspectionStatus.DRAFT.value,
        reason_notes="Initial inspection draft created"
    )
    db.add(history_entry)
    db.commit()

    # Audit event
    create_audit_entry(
        db=db,
        action="inspection_created",
        user=current_user,
        resource_type="inspection",
        resource_id=immutable_id,
        details=f"Created inspection '{new_inspection.name}' ({immutable_id})",
        request=request
    )

    return InspectionOut.model_validate(new_inspection)


@router.get(
    "",
    response_model=InspectionListResponse,
    summary="List Inspections",
    description="Lists inspections with filtering, search, and role-based record scoping."
)
async def list_inspections(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    inspection_id: Optional[str] = Query(None, description="Exact or prefix match of inspection ID"),
    name: Optional[str] = Query(None, description="Case-insensitive partial match on inspection name"),
    product_name: Optional[str] = Query(None, description="Case-insensitive partial match on product name"),
    inspector_name: Optional[str] = Query(None, description="Case-insensitive partial match on inspector name"),
    status_filter: Optional[InspectionStatus] = Query(None, alias="status", description="Filter by canonical inspection status"),
    date_from: Optional[str] = Query(None, description="Start date filter (inclusive UTC, YYYY-MM-DD or ISO)"),
    date_to: Optional[str] = Query(None, description="End date filter (inclusive UTC, YYYY-MM-DD or ISO)"),
    has_pdf: Optional[bool] = Query(None, description="Filter by availability of verified final PDF report"),
    search: Optional[str] = Query(None, description="Search by name, product, brand, batch, or ID"),
    sort_by: str = Query("created_at", pattern="^(created_at|updated_at|name|status|completed_at)$"),
    sort_dir: str = Query("desc", pattern="^(asc|desc)$"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Query Inspection joined with FinalizedReport metadata only (NO BLOB loading)
    query = db.query(
        Inspection,
        FinalizedReport.sha256_hash.label("pdf_sha256"),
        FinalizedReport.file_size.label("pdf_size")
    ).outerjoin(
        FinalizedReport,
        FinalizedReport.inspection_id == Inspection.inspection_id
    )

    # Scoping: Inspector only sees own records
    if current_user.role == UserRole.INSPECTOR:
        query = query.filter(
            or_(
                Inspection.created_by_id == current_user.id,
                Inspection.assigned_to_id == current_user.id
            )
        )

    # Search filters with type guard for direct Python invocation compatibility
    if isinstance(inspection_id, str) and inspection_id.strip():
        query = query.filter(Inspection.inspection_id.ilike(f"{inspection_id.strip()}%"))

    if isinstance(name, str) and name.strip():
        query = query.filter(Inspection.name.ilike(f"%{name.strip()}%"))

    if isinstance(product_name, str) and product_name.strip():
        query = query.filter(Inspection.product_name.ilike(f"%{product_name.strip()}%"))

    if isinstance(inspector_name, str) and inspector_name.strip():
        query = query.filter(Inspection.inspector_name.ilike(f"%{inspector_name.strip()}%"))

    if isinstance(status_filter, InspectionStatus):
        query = query.filter(Inspection.status == status_filter)

    if isinstance(date_from, str):
        dt_from = parse_date_filter(date_from, is_end=False)
        if dt_from:
            query = query.filter(Inspection.created_at >= dt_from)

    if isinstance(date_to, str):
        dt_to = parse_date_filter(date_to, is_end=True)
        if dt_to:
            query = query.filter(Inspection.created_at <= dt_to)

    if isinstance(has_pdf, bool):
        if has_pdf is True:
            query = query.filter(FinalizedReport.sha256_hash.isnot(None))
        elif has_pdf is False:
            query = query.filter(FinalizedReport.sha256_hash.is_(None))

    if isinstance(search, str) and search.strip():
        search_pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Inspection.name.ilike(search_pattern),
                Inspection.product_name.ilike(search_pattern),
                Inspection.brand_name.ilike(search_pattern),
                Inspection.batch_number.ilike(search_pattern),
                Inspection.inspection_id.ilike(search_pattern)
            )
        )

    # Sorting & Pagination type guards
    sort_col_name = sort_by if isinstance(sort_by, str) and hasattr(Inspection, sort_by) else "created_at"
    sort_column = getattr(Inspection, sort_col_name, Inspection.created_at)
    sort_direction = sort_dir if isinstance(sort_dir, str) else "desc"
    page_num = page if isinstance(page, int) else 1
    page_sz = page_size if isinstance(page_size, int) else 20

    if sort_direction == "desc":
        query = query.order_by(desc(sort_column))
    else:
        query = query.order_by(sort_column)

    total = query.count()
    offset = (page_num - 1) * page_sz
    records = query.offset(offset).limit(page_sz).all()

    items = []
    for inspection_obj, pdf_sha256, pdf_size in records:
        item_dict = InspectionOut.model_validate(inspection_obj).model_dump()
        item_dict["has_pdf"] = bool(pdf_sha256)
        item_dict["pdf_sha256"] = pdf_sha256
        item_dict["pdf_size"] = pdf_size
        items.append(InspectionOut(**item_dict))

    return InspectionListResponse(
        items=items,
        total=total,
        page=page_num,
        page_size=page_sz
    )


@router.get(
    "/{inspection_id}",
    response_model=InspectionDetailOut,
    summary="Get Inspection Details & History",
    description="Retrieves persisted historical inspection data, declarations, compliance findings, review info, and report metadata without re-executing pipelines."
)
async def get_inspection(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found."
        )

    # Strict RBAC check before exposing resource data
    verify_inspection_access(inspection, current_user)

    # Persisted audit history
    history_records = db.query(InspectionHistory).filter(
        InspectionHistory.inspection_id == inspection_id
    ).order_by(desc(InspectionHistory.created_at)).all()

    # Persisted Phase 6 declarations (strictly read-only from database)
    persisted_declarations = db.query(ExtractedDeclaration).filter(
        ExtractedDeclaration.inspection_id == inspection_id
    ).order_by(ExtractedDeclaration.id.asc()).all()

    machine_declarations = []
    for d in persisted_declarations:
        machine_declarations.append({
            "id": d.id,
            "view_id": d.view_id,
            "field_name": d.field_name,
            "field_label": d.field_label,
            "raw_text": d.raw_text,
            "normalized_value": d.normalized_value,
            "verified_value": d.verified_value,
            "is_edited": d.is_edited,
            "ocr_confidence": d.ocr_confidence,
            "extraction_confidence": d.extraction_confidence,
            "bounding_box": d.bounding_box,
            "status": d.status,
            "review_reasons": d.review_reasons,
            "created_at": d.created_at.isoformat() if d.created_at else None,
            "updated_at": d.updated_at.isoformat() if d.updated_at else None,
        })

    # Persisted Phase 9 compliance run and findings (strictly read-only from database)
    compliance_run = db.query(ComplianceRun).filter(
        ComplianceRun.inspection_id == inspection_id
    ).order_by(desc(ComplianceRun.created_at)).first()

    compliance_findings = []
    compliance_overall_state = None
    if compliance_run:
        compliance_overall_state = compliance_run.overall_state
        findings_query = db.query(ComplianceFinding).filter(
            ComplianceFinding.run_id == compliance_run.id
        ).order_by(ComplianceFinding.id.asc()).all()
        for f in findings_query:
            compliance_findings.append({
                "id": f.id,
                "finding_id": f.finding_id,
                "rule_id": f.rule_id,
                "rule_no": f.rule_no,
                "requirement_key": f.requirement_key,
                "outcome": f.outcome,
                "reason_code": f.reason_code,
                "reason_text": f.reason_text,
                "actual_json": f.actual_json,
                "expected_json": f.expected_json,
                "severity": f.severity,
                "decision_source": f.decision_source,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            })

    # Permanent report metadata from repository (NO BLOB loading)
    repo = MySQLBlobStorageRepository(db)
    pdf_meta = repo.get_metadata(inspection_id)

    # Reviewer information resolution
    reviewer_name = None
    reviewer_role = None
    if inspection.reviewer_id:
        reviewer_user = db.query(User).filter(User.id == inspection.reviewer_id).first()
        if reviewer_user:
            reviewer_name = reviewer_user.full_name
            reviewer_role = reviewer_user.role.value
    if not reviewer_name and history_records:
        for h in history_records:
            if h.from_status == InspectionStatus.PENDING_REVIEW.value:
                reviewer_name = h.changed_by_name
                reviewer_role = h.changed_by_role
                break

    detail_data = InspectionOut.model_validate(inspection).model_dump()
    detail_data["has_pdf"] = bool(pdf_meta)
    detail_data["pdf_sha256"] = pdf_meta["sha256_hash"] if pdf_meta else None
    detail_data["pdf_size"] = pdf_meta["file_size"] if pdf_meta else None
    detail_data["pdf_metadata"] = pdf_meta
    detail_data["history"] = [InspectionHistoryOut.model_validate(h) for h in history_records]
    detail_data["machine_declarations"] = machine_declarations
    detail_data["compliance_findings"] = compliance_findings
    detail_data["compliance_overall_state"] = compliance_overall_state
    detail_data["reviewer_name"] = reviewer_name
    detail_data["reviewer_role"] = reviewer_role

    return InspectionDetailOut(**detail_data)


@router.put(
    "/{inspection_id}",
    response_model=InspectionOut,
    summary="Update Inspection Metadata",
    description="Updates editable fields of an inspection. Only editable if in draft, in_progress, or reopened state."
)
async def update_inspection(
    inspection_id: str,
    payload: InspectionUpdate,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found."
        )

    verify_inspection_access(inspection, current_user)

    # Immutability guard for finalized states
    if inspection.status in [InspectionStatus.APPROVED, InspectionStatus.PENDING_REVIEW]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot edit inspection while in '{inspection.status.value}' status. Reopen or recall to draft first."
        )

    # Apply updates
    update_dict = payload.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        if value is not None:
            setattr(inspection, field, value)

    inspection.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inspection)

    create_audit_entry(
        db=db,
        action="inspection_updated",
        user=current_user,
        resource_type="inspection",
        resource_id=inspection_id,
        details=f"Updated metadata for inspection {inspection_id}",
        request=request
    )

    return InspectionOut.model_validate(inspection)


@router.post(
    "/{inspection_id}/reopen",
    response_model=InspectionOut,
    summary="Reopen Finalized Inspection",
    description="Reopens an approved or rejected inspection with a required audit justification."
)
async def reopen_inspection(
    inspection_id: str,
    payload: InspectionReopen,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found."
        )

    verify_inspection_access(inspection, current_user)

    if inspection.status not in [InspectionStatus.APPROVED, InspectionStatus.REJECTED]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Only approved or rejected inspections can be reopened. Current status is '{inspection.status.value}'."
        )

    from_status = inspection.status.value
    inspection.status = InspectionStatus.REOPENED
    inspection.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inspection)

    # Log history
    history = InspectionHistory(
        inspection_id=inspection_id,
        changed_by_id=current_user.id,
        changed_by_name=current_user.full_name,
        changed_by_role=current_user.role.value,
        from_status=from_status,
        to_status=InspectionStatus.REOPENED.value,
        reason_notes=payload.reason
    )
    db.add(history)
    db.commit()

    # Audit entry
    create_audit_entry(
        db=db,
        action="inspection_reopened",
        user=current_user,
        resource_type="inspection",
        resource_id=inspection_id,
        details=f"Reopened from '{from_status}' with reason: {payload.reason}",
        request=request
    )

    return InspectionOut.model_validate(inspection)


@router.post(
    "/{inspection_id}/status",
    response_model=InspectionOut,
    summary="Transition Inspection Status",
    description="Transitions an inspection across the lifecycle following the strict state machine."
)
async def transition_inspection_status(
    inspection_id: str,
    payload: InspectionStatusUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found."
        )

    verify_inspection_access(inspection, current_user)

    current_status = inspection.status
    target_status = payload.to_status

    # 1. State machine validation
    allowed_targets = VALID_TRANSITIONS.get(current_status, [])
    if target_status not in allowed_targets:
        allowed_names = [s.value for s in allowed_targets]
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid transition from '{current_status.value}' to '{target_status.value}'. Allowed transitions: {', '.join(allowed_names) if allowed_names else 'None'}."
        )

    # 2. Role authorization for specific transitions
    if target_status in [InspectionStatus.APPROVED, InspectionStatus.REJECTED]:
        if current_user.role not in [UserRole.SUPERVISOR, UserRole.ADMIN]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Only Supervisors and Admins are authorized to approve or reject inspections. Your role is '{current_user.role.value}'."
            )
        inspection.reviewer_id = current_user.id
        if target_status == InspectionStatus.APPROVED:
            inspection.completed_at = datetime.now(timezone.utc)

    # Update inspection
    from_status_str = current_status.value
    inspection.status = target_status
    inspection.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(inspection)

    # Log history
    history = InspectionHistory(
        inspection_id=inspection_id,
        changed_by_id=current_user.id,
        changed_by_name=current_user.full_name,
        changed_by_role=current_user.role.value,
        from_status=from_status_str,
        to_status=target_status.value,
        reason_notes=payload.notes
    )
    db.add(history)
    db.commit()

    # Log audit event
    create_audit_entry(
        db=db,
        action=f"inspection_status_changed_to_{target_status.value}",
        user=current_user,
        resource_type="inspection",
        resource_id=inspection_id,
        details=f"Status changed from {from_status_str} to {target_status.value}. Notes: {payload.notes or 'None'}",
        request=request
    )

    return InspectionOut.model_validate(inspection)
