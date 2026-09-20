from datetime import datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, Field, ConfigDict


class RuleContextIn(BaseModel):
    model_config = ConfigDict(extra="allow")
    effective_at: Optional[datetime] = None
    context: Dict[str, Any] = Field(default_factory=dict)


class ComplianceFindingOut(BaseModel):
    id: Optional[int] = None
    finding_id: str
    rule_id: str
    rule_no: str
    requirement_key: str
    outcome: str
    reason_code: str
    reason_text: str
    actual: Any = None
    expected: Any = None
    evidence_refs: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)
    severity: str
    decision_source: str


class ComplianceRunOut(BaseModel):
    run_id: int
    inspection_id: str
    rulebook_id: str
    rulebook_version: str
    rulebook_hash: str
    engine_version: str
    effective_at: datetime
    overall_state: str
    applicability: Dict[str, Any]
    findings: List[ComplianceFindingOut]
    created_at: datetime


class ChecklistItemOut(BaseModel):
    rule_id: str
    rule_no: str
    requirement_key: str
    title: str
    description: str
    status: str  # APPLICABLE, EXCLUDED, CONDITIONAL, REVIEW_REQUIRED
    applicability_reason: str
    evidence_required: str
    verification_mode: str  # MACHINE_VISION, INSPECTOR_VERIFIED, INSTRUMENT_MEASUREMENT, DOCUMENTARY
    regulatory_source: str
    rulebook_version: str


class InspectionChecklistOut(BaseModel):
    inspection_id: str
    rulebook_id: str
    rulebook_version: str
    rulebook_hash: str
    engine_version: str
    effective_at: datetime
    applicability_summary: Dict[str, Any]
    items: List[ChecklistItemOut]

