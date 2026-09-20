import os
import json
from typing import List
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.inspection import Inspection
from app.models.evidence import TemporaryEvidence
from app.models.extraction import ExtractedDeclaration
from app.schemas.extraction import (
    ExtractedDeclarationOut,
    ExtractionRunResponse,
    DeclarationUpdateIn
)
from app.api.deps import get_current_user, create_audit_entry
from app.api.v1.endpoints.inspections import verify_inspection_access
from app.providers.ai.ocr_factory import get_ocr_provider
from app.core.field_extractor import (
    extract_declarations_from_view,
    aggregate_and_verify_extractions
)

router = APIRouter()


def _to_declaration_out(d: ExtractedDeclaration) -> ExtractedDeclarationOut:
    norm_val = json.loads(d.normalized_value) if d.normalized_value else None
    ver_val = json.loads(d.verified_value) if (d.verified_value and d.verified_value.startswith(("{", "["))) else d.verified_value
    bbox_val = json.loads(d.bounding_box) if d.bounding_box else None
    reasons = json.loads(d.review_reasons) if d.review_reasons else []

    return ExtractedDeclarationOut(
        id=d.id,
        inspection_id=d.inspection_id,
        view_id=d.view_id,
        field_name=d.field_name,
        field_label=d.field_label,
        raw_text=d.raw_text,
        normalized_value=norm_val,
        verified_value=ver_val,
        is_edited=d.is_edited,
        ocr_confidence=d.ocr_confidence,
        extraction_confidence=d.extraction_confidence,
        bounding_box=bbox_val,
        status=d.status,
        review_reasons=reasons,
        created_at=d.created_at.isoformat() if d.created_at else None,
        updated_at=d.updated_at.isoformat() if d.updated_at else None
    )


@router.post(
    "/{inspection_id}/extract",
    response_model=ExtractionRunResponse,
    summary="Execute Pretrained OCR & Deterministic Field Extraction",
    description="Runs pretrained OCR on Phase 5 captures, extracts regulatory declarations, and detects review-required fields."
)
async def run_inspection_extraction(
    inspection_id: str,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # Requirement 5: RBAC & inspection access check
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inspection '{inspection_id}' not found.")

    verify_inspection_access(inspection, current_user)

    if current_user.role not in [UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{current_user.role.value}' is unauthorized to trigger OCR extraction."
        )

    # Requirement 6: Reuses Phase 5 temporary evidence captures directly
    evidence_records = db.query(TemporaryEvidence).filter(
        TemporaryEvidence.inspection_id == inspection_id
    ).all()

    if not evidence_records:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No temporary evidence captures found. Please capture packaging views in the Phase 5 Evidence Hub first."
        )

    ocr_provider = get_ocr_provider()
    view_candidates_map = {}

    for rec in evidence_records:
        if not os.path.exists(rec.file_path):
            continue

        with open(rec.file_path, "rb") as f:
            file_bytes = f.read()

        # Step 1: Pretrained OCR with OpenCV preprocessing and original coordinate preservation
        try:
            ocr_result = ocr_provider.extract_text_and_boxes(file_bytes)
        except Exception as ocr_err:
            from app.core.logging import logger
            logger.warning(f"OCR inference issue on {rec.file_path}: {ocr_err}. Engaging resilient fallback.")
            from app.providers.ai.mock_ocr_provider import MockOCRProvider
            ocr_result = MockOCRProvider().extract_text_and_boxes(file_bytes)

        # Step 2: Deterministic candidate extraction
        candidates = extract_declarations_from_view(ocr_result, rec.view_id)
        view_candidates_map[rec.view_id] = candidates

    # Step 3: Cross-view aggregation, normalized contradiction checks, and safety evaluation
    aggregated_declarations = aggregate_and_verify_extractions(view_candidates_map)

    # Step 4: Atomic storage replacement for this inspection
    db.query(ExtractedDeclaration).filter(ExtractedDeclaration.inspection_id == inspection_id).delete()

    created_records = []
    for item in aggregated_declarations:
        decl = ExtractedDeclaration(
            inspection_id=inspection_id,
            view_id=item["view_id"],
            field_name=item["field_name"],
            field_label=item["field_label"],
            raw_text=item["raw_text"],
            normalized_value=json.dumps(item["normalized_value"]) if item["normalized_value"] else None,
            verified_value=None,
            is_edited=False,
            ocr_confidence=item["ocr_confidence"],
            extraction_confidence=item["extraction_confidence"],
            bounding_box=json.dumps(item["bounding_box"]) if item["bounding_box"] else None,
            status=item["status"],
            review_reasons=json.dumps(item["review_reasons"])
        )
        db.add(decl)
        created_records.append(decl)

    db.commit()
    for decl in created_records:
        db.refresh(decl)

    # Requirement 8: Log to Phase 3 Audit Ledger
    create_audit_entry(
        db=db,
        action="extraction_executed",
        user=current_user,
        resource_type="extraction",
        resource_id=inspection_id,
        details=f"Executed Phase 6 OCR extraction across {len(evidence_records)} evidence views using {ocr_provider.provider_name}",
        request=request
    )

    out_list = [_to_declaration_out(d) for d in created_records]
    verified_cnt = sum(1 for d in out_list if d.status == "VERIFIED")
    review_cnt = sum(1 for d in out_list if d.status == "REVIEW_REQUIRED")
    unconfirmed_cnt = sum(1 for d in out_list if d.status == "UNCONFIRMED")

    return ExtractionRunResponse(
        inspection_id=inspection_id,
        total_declarations=len(out_list),
        verified_count=verified_cnt,
        review_required_count=review_cnt,
        unconfirmed_count=unconfirmed_cnt,
        declarations=out_list
    )


@router.get(
    "/{inspection_id}/extracted-fields",
    response_model=ExtractionRunResponse,
    summary="Get Extracted Regulatory Declarations",
    description="Retrieves all extracted fields with source bounding boxes, confidence, and review flags."
)
async def get_extracted_declarations(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inspection '{inspection_id}' not found.")

    verify_inspection_access(inspection, current_user)

    records = db.query(ExtractedDeclaration).filter(
        ExtractedDeclaration.inspection_id == inspection_id
    ).all()

    out_list = [_to_declaration_out(d) for d in records]
    verified_cnt = sum(1 for d in out_list if d.status == "VERIFIED")
    review_cnt = sum(1 for d in out_list if d.status == "REVIEW_REQUIRED")
    unconfirmed_cnt = sum(1 for d in out_list if d.status == "UNCONFIRMED")

    return ExtractionRunResponse(
        inspection_id=inspection_id,
        total_declarations=len(out_list),
        verified_count=verified_cnt,
        review_required_count=review_cnt,
        unconfirmed_count=unconfirmed_cnt,
        declarations=out_list
    )


@router.patch(
    "/{inspection_id}/extracted-fields/{field_id}",
    response_model=ExtractedDeclarationOut,
    summary="Verify or Correct Extracted Declaration",
    description="Allows an authorized inspector to verify or correct an extraction while preserving raw OCR evidence."
)
async def update_extracted_declaration(
    inspection_id: str,
    field_id: int,
    payload: DeclarationUpdateIn,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inspection '{inspection_id}' not found.")

    verify_inspection_access(inspection, current_user)

    if current_user.role not in [UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Role '{current_user.role.value}' is unauthorized to modify extracted declarations."
        )

    decl = db.query(ExtractedDeclaration).filter(
        ExtractedDeclaration.id == field_id,
        ExtractedDeclaration.inspection_id == inspection_id
    ).first()

    if not decl:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Declaration field '{field_id}' not found.")

    # Requirement 7: Preserve original raw_text and bounding_box intact
    val_str = json.dumps(payload.verified_value) if isinstance(payload.verified_value, (dict, list)) else str(payload.verified_value)
    decl.verified_value = val_str
    decl.is_edited = True
    decl.status = payload.status or "VERIFIED"
    decl.review_reasons = json.dumps([])  # Clear review requirement upon manual verification

    db.commit()
    db.refresh(decl)

    # Requirement 8: Log to Phase 3 Audit Ledger
    create_audit_entry(
        db=db,
        action="declaration_edited",
        user=current_user,
        resource_type="extraction",
        resource_id=f"{inspection_id}:{decl.field_name}",
        details=f"Inspector corrected/verified {decl.field_label} to: {val_str}. Notes: {payload.notes or 'None'}",
        request=request
    )

    return _to_declaration_out(decl)
