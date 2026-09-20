from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, ForeignKey
from app.models.base import Base


class ComplianceRun(Base):
    __tablename__ = "compliance_runs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    inspection_id = Column(String(50), nullable=False, index=True)
    rulebook_id = Column(String(100), nullable=False)
    rulebook_version = Column(String(50), nullable=False)
    rulebook_hash = Column(String(64), nullable=False)
    engine_version = Column(String(50), nullable=False)
    effective_at = Column(DateTime, nullable=False)
    context_json = Column(Text, nullable=False)
    overall_state = Column(String(40), nullable=False, index=True)
    created_by_id = Column(Integer, nullable=False)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)


class ComplianceFinding(Base):
    __tablename__ = "compliance_findings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    run_id = Column(Integer, ForeignKey("compliance_runs.id"), nullable=False, index=True)
    finding_id = Column(String(80), nullable=False, unique=True, index=True)
    rule_id = Column(String(120), nullable=False, index=True)
    rule_no = Column(String(40), nullable=False)
    requirement_key = Column(String(120), nullable=False)
    outcome = Column(String(40), nullable=False, index=True)
    reason_code = Column(String(80), nullable=False)
    reason_text = Column(Text, nullable=False)
    actual_json = Column(Text, nullable=True)
    expected_json = Column(Text, nullable=True)
    evidence_refs_json = Column(Text, nullable=True)
    limitations_json = Column(Text, nullable=True)
    severity = Column(String(40), nullable=False, default="informational")
    decision_source = Column(String(40), nullable=False, default="rule_engine")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)
