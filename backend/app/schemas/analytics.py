from typing import List, Optional
from pydantic import BaseModel, Field


class KPISummary(BaseModel):
    inspections_in_period: int = Field(..., description="Distinct authorized inspections created within the period")
    satisfied_checks: int = Field(..., description="Persisted findings with outcome SATISFIED from latest authoritative runs")
    potential_non_compliances: int = Field(..., description="Persisted findings with outcome POTENTIAL_NON_COMPLIANCE from latest authoritative runs")
    review_required_findings: int = Field(..., description="Persisted findings with outcome REVIEW_REQUIRED from latest authoritative runs")
    unresolved_inspections: int = Field(..., description="Distinct authorized inspections in draft, in_progress, pending_review, or reopened")
    review_required_inspections: int = Field(..., description="Distinct inspections with >=1 REVIEW_REQUIRED finding or in pending_review/reopened status")


class OutcomeDistribution(BaseModel):
    satisfied: int = 0
    potential_non_compliance: int = 0
    review_required: int = 0
    total_findings: int = 0


class RequirementFailureItem(BaseModel):
    requirement_key: str
    rule_no: str
    title: str
    count: int


class CategoryTrendItem(BaseModel):
    category: str
    total_inspections: int
    satisfied_count: int
    potential_non_compliance_count: int
    review_required_count: int


class ChannelDistribution(BaseModel):
    e_commerce: int = 0
    physical: int = 0
    unknown: int = 0


class InspectorWorkloadItem(BaseModel):
    inspector_id: Optional[int] = None
    inspector_name: str
    inspection_count: int


class ReviewerWorkloadItem(BaseModel):
    reviewer_id: Optional[int] = None
    reviewer_name: str
    pending_count: int


class AnalyticsSummaryResponse(BaseModel):
    range_type: str
    start_date: str
    end_date: str
    user_role: str
    scoped_to_user: bool
    kpi: KPISummary
    outcome_distribution: OutcomeDistribution
    common_failures: List[RequirementFailureItem]
    category_trends: List[CategoryTrendItem]
    channel_distribution: ChannelDistribution
    inspector_workload: List[InspectorWorkloadItem]
    reviewer_workload: List[ReviewerWorkloadItem]
