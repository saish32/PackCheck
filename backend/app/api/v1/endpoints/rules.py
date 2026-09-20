import json
import uuid
from datetime import datetime, timezone
from typing import Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.orm import Session

from app.core.database import get_db
from app.core.rule_engine import current_rulebook, evaluate_inspection, generate_custom_checklist
from app.models.user import User, UserRole
from app.models.inspection import Inspection
from app.models.extraction import ExtractedDeclaration
from app.models.rules import ComplianceRun, ComplianceFinding
from app.schemas.rules import (
    RuleContextIn,
    ComplianceRunOut,
    ComplianceFindingOut,
    ChecklistItemOut,
    InspectionChecklistOut,
)
from app.api.deps import get_current_user, require_roles, create_audit_entry
from app.api.v1.endpoints.inspections import verify_inspection_access

router = APIRouter()


def _context_from_inspection(inspection: Inspection) -> Dict[str, Any]:
    try:
        payload = json.loads(inspection.metadata_json or "{}")
        context = payload.get("rule_context", {})
        return context if isinstance(context, dict) else {}
    except Exception:
        return {}


def _store_context(inspection: Inspection, context: Dict[str, Any]) -> None:
    try:
        payload = json.loads(inspection.metadata_json or "{}")
        if not isinstance(payload, dict):
            payload = {}
    except Exception:
        payload = {}
    payload["rule_context"] = context
    inspection.metadata_json = json.dumps(payload, separators=(",", ":"))


def _serialize_finding(f: ComplianceFinding) -> ComplianceFindingOut:
    return ComplianceFindingOut(
        id=f.id,
        finding_id=f.finding_id,
        rule_id=f.rule_id,
        rule_no=f.rule_no,
        requirement_key=f.requirement_key,
        outcome=f.outcome,
        reason_code=f.reason_code,
        reason_text=f.reason_text,
        actual=json.loads(f.actual_json) if f.actual_json else None,
        expected=json.loads(f.expected_json) if f.expected_json else None,
        evidence_refs=json.loads(f.evidence_refs_json) if f.evidence_refs_json else [],
        limitations=json.loads(f.limitations_json) if f.limitations_json else [],
        severity=f.severity,
        decision_source=f.decision_source,
    )


@router.get("/rules/catalog", summary="Get the active PackCheck LMPC rulebook")
async def get_rule_catalog(current_user: User = Depends(get_current_user)):
    rb = current_rulebook()
    return {
        "rulebook_id": rb["rulebook_id"],
        "version": rb["packcheck_rulebook_version"],
        "as_of_date": rb["as_of_date"],
        "rules": rb["rule_catalog"],
        "sources": rb["source_instruments"],
        "schedules": {k: v for k, v in rb["schedules"].items() if k in ["second", "third", "fourth", "fifth"]},
    }


@router.post("/inspections/{inspection_id}/rule-context", summary="Set the inspection-specific legal context", response_model=Dict[str, Any])
async def set_rule_context(
    inspection_id: str,
    payload: RuleContextIn,
    request: Request,
    current_user: User = Depends(require_roles([UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN])),
    db: Session = Depends(get_db),
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inspection '{inspection_id}' not found.")
    verify_inspection_access(inspection, current_user)
    existing = _context_from_inspection(inspection)
    existing.update(payload.context)
    _store_context(inspection, existing)
    db.commit()
    create_audit_entry(db, "rule_context_updated", current_user, "inspection", inspection_id,
                       f"Updated regulatory context keys: {sorted(payload.context.keys())}", request)
    return {"inspection_id": inspection_id, "rule_context": existing}


@router.post("/inspections/{inspection_id}/compliance/evaluate", response_model=ComplianceRunOut, summary="Evaluate the inspection against the active LMPC rule engine")
async def evaluate_rules(
    inspection_id: str,
    request: Request,
    payload: RuleContextIn | None = None,
    current_user: User = Depends(require_roles([UserRole.INSPECTOR, UserRole.SUPERVISOR, UserRole.ADMIN, UserRole.RULE_MANAGER])),
    db: Session = Depends(get_db),
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Inspection '{inspection_id}' not found.")
    verify_inspection_access(inspection, current_user)

    context = _context_from_inspection(inspection)
    if payload and payload.context:
        context.update(payload.context)
        _store_context(inspection, context)
        db.flush()

    extracted_rows = db.query(ExtractedDeclaration).filter(ExtractedDeclaration.inspection_id == inspection_id).all()
    extracted = [{
        "id": r.id,
        "field_name": r.field_name,
        "raw_text": r.raw_text,
        "normalized_value": r.normalized_value,
        "verified_value": r.verified_value,
        "status": r.status,
        "bounding_box": r.bounding_box,
        "view_id": r.view_id,
    } for r in extracted_rows]

    effective_at = payload.effective_at if payload and payload.effective_at else datetime.now(timezone.utc)
    result = evaluate_inspection(context=context, extracted=extracted, effective_at=effective_at)

    context_snapshot = dict(context)
    context_snapshot["_applicability"] = result["applicability"]

    run = ComplianceRun(
        inspection_id=inspection_id,
        rulebook_id=result["rulebook_id"],
        rulebook_version=result["rulebook_version"],
        rulebook_hash=result["rulebook_hash"],
        engine_version=result["engine_version"],
        effective_at=result["effective_at"],
        context_json=json.dumps(context_snapshot, default=str, separators=(",", ":")),
        overall_state=result["overall_state"],
        created_by_id=current_user.id,
    )
    db.add(run)
    db.flush()

    stored_findings = []
    for f in result["findings"]:
        fid = f"FND-{inspection_id}-{uuid.uuid4().hex[:10].upper()}"
        row = ComplianceFinding(
            run_id=run.id,
            finding_id=fid,
            rule_id=f["rule_id"],
            rule_no=f["rule_no"],
            requirement_key=f["requirement_key"],
            outcome=f["outcome"],
            reason_code=f["reason_code"],
            reason_text=f["reason_text"],
            actual_json=json.dumps(f.get("actual"), default=str),
            expected_json=json.dumps(f.get("expected"), default=str),
            evidence_refs_json=json.dumps(f.get("evidence_refs", [])),
            limitations_json=json.dumps(f.get("limitations", [])),
            severity=f.get("severity", "informational"),
            decision_source=f.get("decision_source", "rule_engine"),
        )
        db.add(row)
        stored_findings.append(row)

    db.commit()
    db.refresh(run)
    for row in stored_findings:
        db.refresh(row)

    create_audit_entry(db, "compliance_run_created", current_user, "compliance_run", str(run.id),
                       f"Rulebook {run.rulebook_version} / {run.rulebook_hash}; overall={run.overall_state}", request)

    return ComplianceRunOut(
        run_id=run.id,
        inspection_id=inspection_id,
        rulebook_id=run.rulebook_id,
        rulebook_version=run.rulebook_version,
        rulebook_hash=run.rulebook_hash,
        engine_version=run.engine_version,
        effective_at=run.effective_at,
        overall_state=run.overall_state,
        applicability=result["applicability"],
        findings=[_serialize_finding(x) for x in stored_findings],
        created_at=run.created_at,
    )


@router.get("/inspections/{inspection_id}/compliance/latest", response_model=ComplianceRunOut, summary="Get latest compliance run")
async def latest_compliance(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail=f"Inspection '{inspection_id}' not found.")
    verify_inspection_access(inspection, current_user)
    run = db.query(ComplianceRun).filter(ComplianceRun.inspection_id == inspection_id).order_by(ComplianceRun.id.desc()).first()
    if not run:
        raise HTTPException(status_code=404, detail="No compliance run exists for this inspection.")
    findings = db.query(ComplianceFinding).filter(ComplianceFinding.run_id == run.id).all()
    try:
        applicability = json.loads(run.context_json).get("_applicability", {})
    except Exception:
        applicability = {}
    if not applicability:
        applicability = {"effective_at": run.effective_at.isoformat()}
    return ComplianceRunOut(
        run_id=run.id, inspection_id=run.inspection_id, rulebook_id=run.rulebook_id,
        rulebook_version=run.rulebook_version, rulebook_hash=run.rulebook_hash,
        engine_version=run.engine_version, effective_at=run.effective_at,
        overall_state=run.overall_state, applicability=applicability,
        findings=[_serialize_finding(x) for x in findings], created_at=run.created_at
    )


@router.get("/inspections/{inspection_id}/checklist", response_model=InspectionChecklistOut, summary="Generate dynamic customized inspection checklist")
async def get_inspection_checklist(
    inspection_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail=f"Inspection '{inspection_id}' not found.")
    verify_inspection_access(inspection, current_user)

    context = _context_from_inspection(inspection)
    effective_at = datetime.now(timezone.utc)
    checklist = generate_custom_checklist(context=context, effective_at=effective_at)

    return InspectionChecklistOut(
        inspection_id=inspection_id,
        rulebook_id=checklist["rulebook_id"],
        rulebook_version=checklist["rulebook_version"],
        rulebook_hash=checklist["rulebook_hash"],
        engine_version=checklist["engine_version"],
        effective_at=checklist["effective_at"],
        applicability_summary=checklist["applicability_summary"],
        items=[ChecklistItemOut(**item) for item in checklist["items"]],
    )


@router.post("/inspections/{inspection_id}/checklist", response_model=InspectionChecklistOut, summary="Preview dynamic checklist with ad-hoc context (non-persistent)")
async def preview_inspection_checklist(
    inspection_id: str,
    payload: RuleContextIn | None = None,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Computes a dynamic checklist with ad-hoc context preview.
    NON-PERSISTENT: Does not overwrite or commit to the inspection database record.
    """
    inspection = db.query(Inspection).filter(Inspection.inspection_id == inspection_id).first()
    if not inspection:
        raise HTTPException(status_code=404, detail=f"Inspection '{inspection_id}' not found.")
    verify_inspection_access(inspection, current_user)

    # In-memory merge only; do not persist to db
    context = _context_from_inspection(inspection)
    if payload and payload.context:
        context = dict(context)
        context.update(payload.context)

    effective_at = payload.effective_at if (payload and payload.effective_at) else datetime.now(timezone.utc)
    checklist = generate_custom_checklist(context=context, effective_at=effective_at)

    return InspectionChecklistOut(
        inspection_id=inspection_id,
        rulebook_id=checklist["rulebook_id"],
        rulebook_version=checklist["rulebook_version"],
        rulebook_hash=checklist["rulebook_hash"],
        engine_version=checklist["engine_version"],
        effective_at=checklist["effective_at"],
        applicability_summary=checklist["applicability_summary"],
        items=[ChecklistItemOut(**item) for item in checklist["items"]],
    )

