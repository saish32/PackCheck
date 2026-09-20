import hashlib
import json
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request, Response, Query
from sqlalchemy.orm import Session
from sqlalchemy import desc

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.inspection import Inspection, InspectionStatus, InspectionHistory
from app.models.evidence import TemporaryEvidence
from app.models.extraction import ExtractedDeclaration
from app.models.rules import ComplianceRun, ComplianceFinding
from app.models.report import FinalizedReport
from app.storage.repository import MySQLBlobStorageRepository
from app.core.pdf_generator import generate_final_inspection_pdf, verify_pdf_bytes
from app.schemas.report import (
    FinalizeInspectionRequest,
    ReportMetadataOut,
    FinalizeInspectionResponse,
)
from app.api.deps import get_current_user, require_roles, create_audit_entry
from app.api.v1.endpoints.inspections import verify_inspection_access
from app.core.logging import logger

router = APIRouter()

TEMP_STORAGE_BASE = Path("storage/temp_captures")

# Global lock dict for in-process concurrency guard per inspection
_inspection_locks: dict[str, threading.Lock] = {}
_locks_meta_lock = threading.Lock()


def get_inspection_lock(inspection_id: str) -> threading.Lock:
    with _locks_meta_lock:
        if inspection_id not in _inspection_locks:
            _inspection_locks[inspection_id] = threading.Lock()
        return _inspection_locks[inspection_id]


@router.post(
    "/{inspection_id}/finalize",
    response_model=FinalizeInspectionResponse,
    summary="Finalize Inspection & Generate Permanent Report",
    description=(
        "Executes the strict non-negotiable finalization lifecycle: "
        "Generate PDF -> Verify Readability & Content -> Calculate SHA-256 -> "
        "Store in MySQL BLOB -> Retrieve & Verify Integrity -> "
        "ONLY THEN Delete Temporary Source Images -> Transition to Finalized State."
    )
)
async def finalize_inspection(
    inspection_id: str,
    payload: FinalizeInspectionRequest,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN])),
    db: Session = Depends(get_db)
):
    insp_lock = get_inspection_lock(inspection_id)
    acquired = insp_lock.acquire(blocking=True, timeout=30.0)
    if not acquired:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A finalization operation is currently in progress for this inspection. Please retry shortly."
        )

    try:
        # 1. Fetch inspection with row lock
        inspection = db.query(Inspection).filter(
            Inspection.inspection_id == inspection_id
        ).with_for_update().first()

        if not inspection:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Inspection '{inspection_id}' not found."
            )

        verify_inspection_access(inspection, current_user)

        repo = MySQLBlobStorageRepository(db)

        # 2. Idempotency Check: if verified permanent report already exists
        existing_report_meta = repo.get_metadata(inspection_id)
        if existing_report_meta:
            logger.info(f"Inspection {inspection_id} already has a permanent report. Returning existing record.")
            # Ensure status is aligned to APPROVED if report already exists
            if inspection.status != InspectionStatus.APPROVED:
                inspection.status = InspectionStatus.APPROVED
                if not inspection.completed_at:
                    inspection.completed_at = datetime.now(timezone.utc)
                db.commit()

            return FinalizeInspectionResponse(
                status="already_finalized",
                message="Inspection was already finalized. Returning existing permanent report.",
                inspection_id=inspection_id,
                report=ReportMetadataOut(**existing_report_meta),
                download_url=f"/api/v1/inspections/{inspection_id}/report/pdf"
            )

        # 3. State machine validation
        # Finalization is permitted from DRAFT, IN_PROGRESS, PENDING_REVIEW, or REOPENED
        if inspection.status not in [
            InspectionStatus.DRAFT,
            InspectionStatus.IN_PROGRESS,
            InspectionStatus.PENDING_REVIEW,
            InspectionStatus.REOPENED,
        ]:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot finalize inspection in '{inspection.status.value}' status."
            )

        # 4. Gather Authoritative Pipeline Data
        # Evidence items in deterministic chronological order
        evidence_items = db.query(TemporaryEvidence).filter(
            TemporaryEvidence.inspection_id == inspection_id
        ).order_by(
            TemporaryEvidence.created_at.asc(),
            TemporaryEvidence.id.asc()
        ).all()

        if not evidence_items:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot finalize inspection without captured evidence. Please capture packaging views in the Evidence Hub first."
            )

        # Declarations
        declarations = db.query(ExtractedDeclaration).filter(
            ExtractedDeclaration.inspection_id == inspection_id
        ).order_by(ExtractedDeclaration.id.asc()).all()

        # Compliance Run & Findings
        compliance_run = db.query(ComplianceRun).filter(
            ComplianceRun.inspection_id == inspection_id
        ).order_by(desc(ComplianceRun.created_at)).first()

        compliance_findings = []
        rulebook_ver = "2026.09.16"
        rulebook_hsh = "lmpc_rulebook_v2026_09_16_sha256"
        if compliance_run:
            compliance_findings = db.query(ComplianceFinding).filter(
                ComplianceFinding.run_id == compliance_run.id
            ).order_by(ComplianceFinding.id.asc()).all()
            rulebook_ver = compliance_run.rulebook_version or rulebook_ver
            rulebook_hsh = compliance_run.rulebook_hash or rulebook_hsh

        # History records
        history_records = db.query(InspectionHistory).filter(
            InspectionHistory.inspection_id == inspection_id
        ).order_by(InspectionHistory.created_at.asc()).all()

        # 5. Build Final PDF (Phase 10)
        try:
            pdf_bytes = generate_final_inspection_pdf(
                inspection=inspection,
                evidence_items=evidence_items,
                declarations=declarations,
                compliance_run=compliance_run,
                compliance_findings=compliance_findings,
                history_records=history_records,
                rulebook_version=rulebook_ver,
                rulebook_hash=rulebook_hsh
            )
        except Exception as exc:
            logger.error(f"PDF generation failed for inspection {inspection_id}: {str(exc)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"PDF report generation failed: {str(exc)}. Temporary evidence preserved. Please retry."
            )

        # 6. Deep Verification of Generated PDF
        valid, reason = verify_pdf_bytes(
            pdf_bytes=pdf_bytes,
            expected_inspection_id=inspection_id,
            expected_image_count=len(evidence_items),
            expected_rulebook_hash=rulebook_hsh
        )
        if not valid:
            logger.error(f"Generated PDF verification failed for inspection {inspection_id}: {reason}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Generated PDF integrity verification failed: {reason}. Temporary evidence preserved. Please retry."
            )

        # 7. Compute SHA-256 of Final PDF
        generated_sha256 = hashlib.sha256(pdf_bytes).hexdigest()
        filename = f"{inspection_id}_Final_Report.pdf"

        # 8. Persist PDF Permanently in MySQL BLOB via StorageRepository
        try:
            saved_report = repo.save_pdf(
                inspection_id=inspection_id,
                filename=filename,
                pdf_bytes=pdf_bytes,
                sha256_hash=generated_sha256,
                rulebook_version=rulebook_ver,
                rulebook_hash=rulebook_hsh,
                created_by_id=current_user.id
            )
        except Exception as exc:
            logger.error(f"Permanent report storage failed for inspection {inspection_id}: {str(exc)}", exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Failed to persist final report in permanent storage: {str(exc)}. Temporary evidence preserved."
            )

        # 9. Retrieve PDF From Permanent Storage & Verify Byte-Level Integrity
        retrieved = repo.get_pdf(inspection_id)
        if not retrieved:
            logger.error(f"Failed to retrieve stored PDF from repository for inspection {inspection_id}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Verification failure: Could not retrieve saved report from database storage. Temporary evidence preserved."
            )

        retrieved_bytes, retrieved_meta = retrieved
        retrieved_sha256 = hashlib.sha256(retrieved_bytes).hexdigest()

        if retrieved_sha256 != generated_sha256:
            logger.critical(
                f"Cryptographic hash mismatch for inspection {inspection_id}! "
                f"Generated: {generated_sha256}, Retrieved: {retrieved_sha256}"
            )
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Cryptographic verification failed: Stored PDF SHA-256 hash does not match generated report. Temporary evidence preserved."
            )

        # Also confirm retrieved bytes pass full readability verification
        ret_valid, ret_reason = verify_pdf_bytes(
            pdf_bytes=retrieved_bytes,
            expected_inspection_id=inspection_id,
            expected_image_count=len(evidence_items),
            expected_rulebook_hash=rulebook_hsh
        )
        if not ret_valid:
            logger.critical(f"Retrieved PDF failed content verification: {ret_reason}")
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Retrieved PDF verification failed: {ret_reason}. Temporary evidence preserved."
            )

        # 10. ONLY THEN: Purge Temporary Source Images (Inspection-Scoped)
        cleanup_error_msg = None
        try:
            # Delete physical files strictly within inspection directory
            dirs_to_clean = [
                TEMP_STORAGE_BASE / inspection_id,
                Path(__file__).resolve().parents[4] / "storage" / "temp_captures" / inspection_id
            ]
            cleaned_any = False
            for d in dirs_to_clean:
                if d.exists() and d.is_dir():
                    shutil.rmtree(d, ignore_errors=False)
                    cleaned_any = True
            if cleaned_any:
                logger.info(f"Purged temporary evidence directory for {inspection_id}")

            # Delete temporary DB records
            for ev_rec in evidence_items:
                db.delete(ev_rec)
            db.commit()
        except Exception as exc:
            cleanup_error_msg = str(exc)
            logger.warning(f"Error during temporary evidence cleanup for inspection {inspection_id}: {cleanup_error_msg}")
            create_audit_entry(
                db=db,
                action="evidence_cleanup_failure",
                user=current_user,
                resource_type="evidence",
                resource_id=inspection_id,
                details=f"Temporary evidence cleanup encountered error: {cleanup_error_msg}. Retaining remaining source evidence.",
                request=request
            )

        # 11. Mark Inspection Successfully Finalized (APPROVED state)
        from_status = inspection.status.value
        inspection.status = InspectionStatus.APPROVED
        inspection.completed_at = datetime.now(timezone.utc)
        inspection.reviewer_id = current_user.id
        inspection.updated_at = datetime.now(timezone.utc)

        # Update metadata_json with permanent report reference
        try:
            meta = json.loads(inspection.metadata_json or "{}")
        except Exception:
            meta = {}
        meta["final_report"] = {
            "report_id": saved_report.id,
            "filename": filename,
            "sha256_hash": generated_sha256,
            "file_size": len(pdf_bytes),
            "finalized_at": datetime.now(timezone.utc).isoformat(),
            "rulebook_version": rulebook_ver,
            "cleanup_status": "partial_failure" if cleanup_error_msg else "completed",
            "cleanup_error": cleanup_error_msg
        }
        inspection.metadata_json = json.dumps(meta)
        db.commit()
        db.refresh(inspection)

        # 12. Record InspectionHistory & Audit Log
        history_entry = InspectionHistory(
            inspection_id=inspection_id,
            changed_by_id=current_user.id,
            changed_by_name=current_user.full_name,
            changed_by_role=current_user.role.value,
            from_status=from_status,
            to_status=InspectionStatus.APPROVED.value,
            reason_notes=payload.notes or "Inspection finalized. Permanent report generated, verified, and stored."
        )
        db.add(history_entry)
        db.commit()

        create_audit_entry(
            db=db,
            action="inspection_finalized_report_generated",
            user=current_user,
            resource_type="report",
            resource_id=inspection_id,
            details=(
                f"Inspection {inspection_id} finalized. Report generated ({len(pdf_bytes)} bytes, "
                f"SHA-256: {generated_sha256[:8]}...), verified, permanently stored, and temporary evidence purged."
            ),
            request=request
        )

        return FinalizeInspectionResponse(
            status="success",
            message="Inspection successfully finalized. Verified PDF report is permanently stored.",
            inspection_id=inspection_id,
            report=ReportMetadataOut(**retrieved_meta),
            download_url=f"/api/v1/inspections/{inspection_id}/report/pdf"
        )

    finally:
        insp_lock.release()


@router.get(
    "/{inspection_id}/report",
    response_model=ReportMetadataOut,
    summary="Get Finalized Report Metadata",
    description="Retrieves permanent report metadata for a finalized inspection."
)
async def get_report_metadata(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(
        Inspection.inspection_id == inspection_id
    ).first()
    if not inspection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found."
        )

    verify_inspection_access(inspection, current_user)

    repo = MySQLBlobStorageRepository(db)
    meta = repo.get_metadata(inspection_id)
    if not meta:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"No finalized report exists for inspection '{inspection_id}'."
        )

    return ReportMetadataOut(**meta)


@router.get(
    "/{inspection_id}/report/pdf",
    summary="Retrieve & Stream Final PDF Report",
    description="Retrieves the verified immutable final PDF report from MySQL BLOB storage. Enforces strict RBAC, SHA-256 integrity verification, and disposition control."
)
async def download_final_report_pdf(
    inspection_id: str,
    request: Request,
    disposition: str = Query("inline", pattern="^(inline|attachment)$", description="Content disposition: inline for browser viewer, attachment for download"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Resolve immutable inspection resource
    inspection = db.query(Inspection).filter(
        Inspection.inspection_id == inspection_id
    ).first()
    if not inspection:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Inspection '{inspection_id}' not found."
        )

    # 2. Strict RBAC authorization before checking or revealing report availability
    verify_inspection_access(inspection, current_user)

    # 3. Retrieve final PDF from repository
    repo = MySQLBlobStorageRepository(db)
    report_data = repo.get_pdf(inspection_id)
    if not report_data:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finalized PDF report for inspection '{inspection_id}' not found."
        )

    pdf_bytes, meta = report_data
    if not pdf_bytes:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Finalized PDF report for inspection '{inspection_id}' is empty or unavailable."
        )

    # 4. Rigorous SHA-256 Integrity Verification
    expected_hash = meta.get("sha256_hash", "")
    actual_hash = hashlib.sha256(pdf_bytes).hexdigest()
    if not expected_hash or actual_hash.lower() != expected_hash.lower():
        logger.error(
            f"INTEGRITY FAILURE: Inspection {inspection_id} stored hash ({expected_hash}) "
            f"does not match retrieved BLOB hash ({actual_hash}). Aborting delivery."
        )
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Report integrity verification failed. Cryptographic hash mismatch."
        )

    # 5. Deterministic safe filename and headers
    safe_filename = f"{inspection_id}_Final_Report.pdf"
    disp_val = disposition if isinstance(disposition, str) and disposition in ["inline", "attachment"] else "inline"
    content_disp = f'{disp_val}; filename="{safe_filename}"'

    # 6. Audit logging
    action_name = "report_viewed" if disp_val == "inline" else "report_downloaded"
    create_audit_entry(
        db=db,
        action=action_name,
        user=current_user,
        resource_type="report",
        resource_id=inspection_id,
        details=f"Retrieved finalized PDF report for {inspection_id} (disposition={disp_val}, size={len(pdf_bytes)} bytes, sha256={expected_hash[:10]}...)",
        request=request
    )

    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Type": "application/pdf",
            "Content-Disposition": content_disp,
            "Content-Length": str(len(pdf_bytes)),
            "X-Report-SHA256": expected_hash,
            "X-Inspection-ID": inspection_id,
        }
    )
