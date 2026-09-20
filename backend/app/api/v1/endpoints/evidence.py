import os
import json
import shutil
from pathlib import Path
from typing import List, Dict, Any, Optional
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Request
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.inspection import Inspection, InspectionStatus
from app.models.evidence import TemporaryEvidence
from app.schemas.evidence import (
    ViewStatusOut,
    InspectionViewsResponse,
    CaptureUploadResponse
)
from app.api.deps import get_current_user, create_audit_entry
from app.api.v1.endpoints.inspections import verify_inspection_access
from app.core.views_config import get_required_views_for_inspection
from app.core.image_validator import validate_image_capture

router = APIRouter()

_BACKEND_ROOT = Path(__file__).resolve().parents[4]
TEMP_STORAGE_BASE = Path("storage/temp_captures")


def get_inspection_storage_dir(inspection_id: str) -> Path:
    if (_BACKEND_ROOT / "storage").is_dir():
        base = _BACKEND_ROOT / "storage" / "temp_captures"
    else:
        base = Path("storage/temp_captures").resolve()
    target_dir = base / inspection_id
    target_dir.mkdir(parents=True, exist_ok=True)
    return target_dir


@router.get(
    "/{inspection_id}/views",
    response_model=InspectionViewsResponse,
    summary="Get Required Evidence Views & Progress",
    description="Retrieves context-aware required evidence views and their validation status."
)
async def get_inspection_views(
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

    verify_inspection_access(inspection, current_user)

    view_specs = get_required_views_for_inspection(inspection.packaging_type, inspection.category)
    existing_records = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id
    ).all()
    records_by_view = {r.view_id: r for r in existing_records}

    views_out: List[ViewStatusOut] = []
    required_count = 0
    completed_required_count = 0
    has_failures = False

    for spec in view_specs:
        if spec.is_required:
            required_count += 1

        rec = records_by_view.get(spec.view_id)
        if rec:
            has_capture = True
            capture_status = rec.status
            reasons = json.loads(rec.validation_codes) if rec.validation_codes else []
            guidance = rec.guidance
            file_name = rec.file_name
            width = rec.width
            height = rec.height
            updated_at = rec.updated_at.isoformat() if rec.updated_at else None
            thumb_url = f"/api/v1/inspections/{inspection_id}/evidence/{spec.view_id}/preview"

            if rec.status in ["passed", "warning"]:
                if spec.is_required:
                    completed_required_count += 1
            else:
                has_failures = True
        else:
            has_capture = False
            capture_status = "unprocessed"
            reasons = []
            guidance = None
            file_name = None
            width = None
            height = None
            updated_at = None
            thumb_url = None

        views_out.append(
            ViewStatusOut(
                view_id=spec.view_id,
                title=spec.title,
                instruction=spec.instruction,
                is_required=spec.is_required,
                display_order=spec.display_order,
                capture_status=capture_status,
                has_capture=has_capture,
                thumbnail_url=thumb_url,
                validation_reasons=reasons,
                guidance=guidance,
                file_name=file_name,
                width=width,
                height=height,
                updated_at=updated_at
            )
        )

    all_passed = (completed_required_count == required_count) and (not has_failures)

    return InspectionViewsResponse(
        inspection_id=inspection_id,
        packaging_type=inspection.packaging_type,
        category=inspection.category,
        views=views_out,
        total_views=len(views_out),
        required_views=required_count,
        completed_required=completed_required_count,
        has_failures=has_failures,
        all_required_passed=all_passed
    )


@router.post(
    "/{inspection_id}/evidence/cleanup",
    summary="Idempotent Temporary Evidence Cleanup",
    description="Safely cleans up all temporary evidence captures belonging to an inspection."
)
async def cleanup_temporary_evidence(
    inspection_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found.")

    verify_inspection_access(inspection, current_user)

    # Delete records from DB
    records = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id
    ).all()
    for r in records:
        db.delete(r)
    db.commit()

    # Delete disk files idempotently
    dirs_to_clean = [
        TEMP_STORAGE_BASE / inspection_id,
        _BACKEND_ROOT / "storage" / "temp_captures" / inspection_id
    ]
    for storage_dir in dirs_to_clean:
        if storage_dir.exists():
            shutil.rmtree(storage_dir, ignore_errors=True)

    create_audit_entry(
        db=db,
        action="evidence_cleanup",
        user=current_user,
        resource_type="evidence",
        resource_id=inspection_id,
        details=f"Cleaned up all temporary evidence captures for inspection '{inspection_id}'",
        request=request
    )

    return {"status": "success", "message": "Temporary evidence successfully purged."}


@router.post(
    "/{inspection_id}/evidence/{view_id}",
    response_model=CaptureUploadResponse,
    summary="Upload & Validate Temporary Evidence Capture",
    description="Captures, validates quality, checks exact and perceptual duplicates, and saves temporary view evidence."
)
async def upload_evidence_capture(
    inspection_id: str,
    view_id: str,
    request: Request,
    file: UploadFile = File(...),
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

    # Scoping: Only Inspector (creator), Supervisor, or Admin can upload evidence
    if current_user.role not in [UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{current_user.role.value}' is unauthorized to submit evidence."
        )

    # Immutability check
    if inspection.status in [InspectionStatus.APPROVED, InspectionStatus.PENDING_REVIEW]:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot upload evidence while inspection is in '{inspection.status.value}' status."
        )

    view_specs = get_required_views_for_inspection(inspection.packaging_type, inspection.category)
    current_spec = next((s for s in view_specs if s.view_id == view_id), None)
    if not current_spec:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid view '{view_id}' for packaging type '{inspection.packaging_type}'."
        )

    # Read uploaded file bytes
    file_bytes = await file.read()

    # Load existing captures for duplicate comparison
    existing_records = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id
    ).all()
    
    existing_captures_meta = []
    for r in existing_records:
        spec_match = next((s for s in view_specs if s.view_id == r.view_id), None)
        existing_captures_meta.append({
            "view_id": r.view_id,
            "view_title": spec_match.title if spec_match else r.view_id,
            "sha256_hash": r.sha256_hash,
            "dhash": r.dhash
        })

    # Run deterministic validation suite
    val_result = validate_image_capture(
        file_bytes=file_bytes,
        current_view_id=view_id,
        current_view_title=current_spec.title,
        existing_captures=existing_captures_meta
    )

    # Prepare storage directory
    storage_dir = get_inspection_storage_dir(inspection_id)
    extension = ".jpg"
    if file.filename and "." in file.filename:
        extension = "." + file.filename.rsplit(".", 1)[-1].lower()
    target_file_name = f"{view_id}{extension}"
    target_path = storage_dir / target_file_name

    # Save temporary file if decodable or update
    with open(target_path, "wb") as f_out:
        f_out.write(file_bytes)

    # Update or insert TemporaryEvidence record
    record = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id,
        TemporaryEvidence.view_id == view_id
    ).first()

    status_str = val_result.status
    codes_str = json.dumps(val_result.reasons)

    if record:
        record.file_path = str(target_path)
        record.file_name = file.filename or target_file_name
        record.file_size = len(file_bytes)
        record.mime_type = file.content_type or "image/jpeg"
        record.sha256_hash = val_result.sha256_hash
        record.dhash = val_result.dhash
        record.status = status_str
        record.validation_codes = codes_str
        record.guidance = val_result.guidance
        record.width = val_result.width
        record.height = val_result.height
    else:
        record = TemporaryEvidence(
            inspection_id=inspection_id,
            view_id=view_id,
            file_path=str(target_path),
            file_name=file.filename or target_file_name,
            file_size=len(file_bytes),
            mime_type=file.content_type or "image/jpeg",
            sha256_hash=val_result.sha256_hash,
            dhash=val_result.dhash,
            status=status_str,
            validation_codes=codes_str,
            guidance=val_result.guidance,
            width=val_result.width,
            height=val_result.height
        )
        db.add(record)

    db.commit()
    db.refresh(record)

    # Audit event if capture was replaced, failed, or passed
    audit_action = "evidence_captured" if val_result.is_valid else "evidence_capture_rejected"
    create_audit_entry(
        db=db,
        action=audit_action,
        user=current_user,
        resource_type="evidence",
        resource_id=f"{inspection_id}:{view_id}",
        details=f"Capture for view '{current_spec.title}' result: {val_result.status.upper()}. Reasons: {val_result.reasons}",
        request=request
    )

    return CaptureUploadResponse(
        success=val_result.is_valid,
        view_id=view_id,
        status=val_result.status,
        reasons=val_result.reasons,
        messages=val_result.messages,
        guidance=val_result.guidance,
        conflicting_view_id=val_result.conflicting_view_id,
        conflicting_view_title=val_result.conflicting_view_title,
        width=val_result.width,
        height=val_result.height
    )


@router.get(
    "/{inspection_id}/evidence/{view_id}/preview",
    summary="Get Temporary Evidence Image Preview",
    description="Streams the temporary capture image. Access is protected and scoped to authorized users."
)
async def get_evidence_preview(
    inspection_id: str,
    view_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found.")

    verify_inspection_access(inspection, current_user)

    record = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id,
        TemporaryEvidence.view_id == view_id
    ).first()

    if not record or not os.path.exists(record.file_path):
        raise HTTPException(status_code=404, detail="Evidence capture not found or file expired.")

    return FileResponse(record.file_path, media_type=record.mime_type)


@router.delete(
    "/{inspection_id}/evidence/{view_id}",
    summary="Discard Temporary Evidence Capture",
    description="Deletes a temporary capture and its associated record for targeted recapture."
)
async def delete_evidence_capture(
    inspection_id: str,
    view_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found.")

    verify_inspection_access(inspection, current_user)

    record = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id,
        TemporaryEvidence.view_id == view_id
    ).first()

    if record:
        if os.path.exists(record.file_path):
            try:
                os.remove(record.file_path)
            except Exception:
                pass
        db.delete(record)
        db.commit()

        create_audit_entry(
            db=db,
            action="evidence_discarded",
            user=current_user,
            resource_type="evidence",
            resource_id=f"{inspection_id}:{view_id}",
            details=f"Discarded temporary capture for view '{view_id}'",
            request=request
        )

    return {"status": "success", "message": f"Temporary evidence for view '{view_id}' removed."}

