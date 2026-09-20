import json
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Set, Any
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import desc, or_, func

from app.core.database import get_db
from app.models.user import User, UserRole
from app.models.inspection import Inspection, InspectionStatus
from app.models.rules import ComplianceRun, ComplianceFinding
from app.schemas.analytics import (
    AnalyticsSummaryResponse,
    KPISummary,
    OutcomeDistribution,
    RequirementFailureItem,
    CategoryTrendItem,
    ChannelDistribution,
    InspectorWorkloadItem,
    ReviewerWorkloadItem,
)
from app.api.deps import get_current_user

router = APIRouter()


def parse_analytics_dates(
    range_type: str,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> tuple[datetime, datetime]:
    """
    Parses date parameters with deterministic 'start inclusive, end exclusive' boundaries.
    All returned datetimes are naive UTC for consistent database filtering.
    """
    now_utc = datetime.now(timezone.utc).replace(microsecond=0)
    today_start = now_utc.replace(hour=0, minute=0, second=0)

    rt = (range_type or "today").strip().lower()

    if rt == "today":
        start_dt = today_start
        end_dt = today_start + timedelta(days=1)
    elif rt == "7d":
        end_dt = today_start + timedelta(days=1)
        start_dt = end_dt - timedelta(days=7)
    elif rt == "30d":
        end_dt = today_start + timedelta(days=1)
        start_dt = end_dt - timedelta(days=30)
    elif rt == "custom":
        if not start_date or not end_date:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Both 'start_date' and 'end_date' (YYYY-MM-DD) are required for custom range."
            )
        try:
            parsed_start = datetime.strptime(start_date.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
            parsed_end = datetime.strptime(end_date.strip(), "%Y-%m-%d").replace(tzinfo=timezone.utc)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid date format. Expected YYYY-MM-DD."
            )

        if parsed_start > parsed_end:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="start_date cannot be greater than end_date."
            )

        start_dt = parsed_start
        # End date is inclusive of the entire end day -> exclusive boundary is next day 00:00:00
        end_dt = parsed_end + timedelta(days=1)
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid range_type '{range_type}'. Supported: 'today', '7d', '30d', 'custom'."
        )

    return start_dt.replace(tzinfo=None), end_dt.replace(tzinfo=None)


def format_requirement_title(key: str, rule_no: str) -> str:
    """Provides a human-readable title for a requirement key."""
    if not key:
        return f"Rule {rule_no}"
    clean = key.replace("_", " ").title()
    if rule_no and rule_no not in clean:
        return f"{clean} (Rule {rule_no})"
    return clean


@router.get(
    "/summary",
    response_model=AnalyticsSummaryResponse,
    summary="Get Enforcement Analytics Summary",
    description="Aggregates authoritative inspection, compliance, review, and workload metrics with strict server-side RBAC scoping."
)
async def get_analytics_summary(
    range_type: str = Query("today", description="Range type: today, 7d, 30d, custom"),
    start_date: Optional[str] = Query(None, description="Start date (YYYY-MM-DD) for custom range"),
    end_date: Optional[str] = Query(None, description="End date (YYYY-MM-DD) for custom range"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    # 1. Parse and validate date boundaries
    start_naive, end_naive = parse_analytics_dates(range_type, start_date, end_date)

    # 2. Enforce strict server-side RBAC scoping
    # Inspector: strictly authorized to own / assigned records
    # Supervisor, Admin, Auditor, Rule Manager: authorized operational/system visibility
    scoped_to_user = False
    base_insp_query = db.query(Inspection)

    if current_user.role == UserRole.INSPECTOR:
        scoped_to_user = True
        base_insp_query = base_insp_query.filter(
            or_(
                Inspection.created_by_id == current_user.id,
                Inspection.assigned_to_id == current_user.id
            )
        )

    # 3. Retrieve authorized inspections created within the period
    inspections_in_period = base_insp_query.filter(
        Inspection.created_at >= start_naive,
        Inspection.created_at < end_naive
    ).all()

    total_inspections_in_period = len(inspections_in_period)

    # If no authorized inspections exist in the period, return zeroed aggregate
    if total_inspections_in_period == 0:
        return AnalyticsSummaryResponse(
            range_type=range_type,
            start_date=start_naive.isoformat(),
            end_date=end_naive.isoformat(),
            user_role=current_user.role.value,
            scoped_to_user=scoped_to_user,
            kpi=KPISummary(
                inspections_in_period=0,
                satisfied_checks=0,
                potential_non_compliances=0,
                review_required_findings=0,
                unresolved_inspections=0,
                review_required_inspections=0
            ),
            outcome_distribution=OutcomeDistribution(
                satisfied=0,
                potential_non_compliance=0,
                review_required=0,
                total_findings=0
            ),
            common_failures=[],
            category_trends=[],
            channel_distribution=ChannelDistribution(
                e_commerce=0,
                physical=0,
                unknown=0
            ),
            inspector_workload=[],
            reviewer_workload=[]
        )

    auth_insp_ids = [insp.inspection_id for insp in inspections_in_period]
    insp_by_id = {insp.inspection_id: insp for insp in inspections_in_period}

    # 4. Unresolved Inspections in period
    unresolved_statuses = {
        InspectionStatus.DRAFT,
        InspectionStatus.IN_PROGRESS,
        InspectionStatus.PENDING_REVIEW,
        InspectionStatus.REOPENED,
    }
    unresolved_count = sum(1 for insp in inspections_in_period if insp.status in unresolved_statuses)

    # 5. Resolve Latest Authoritative Compliance Run per Inspection (No double-counting)
    # Order by inspection_id, created_at desc, id desc
    all_runs = db.query(ComplianceRun).filter(
        ComplianceRun.inspection_id.in_(auth_insp_ids)
    ).order_by(
        ComplianceRun.inspection_id.asc(),
        desc(ComplianceRun.created_at),
        desc(ComplianceRun.id)
    ).all()

    latest_run_by_insp: Dict[str, ComplianceRun] = {}
    for r in all_runs:
        if r.inspection_id not in latest_run_by_insp:
            latest_run_by_insp[r.inspection_id] = r

    latest_run_ids = [r.id for r in latest_run_by_insp.values()]
    run_to_insp = {r.id: r.inspection_id for r in latest_run_by_insp.values()}

    # 6. Fetch findings strictly from the latest authoritative runs
    findings: List[ComplianceFinding] = []
    if latest_run_ids:
        findings = db.query(ComplianceFinding).filter(
            ComplianceFinding.run_id.in_(latest_run_ids)
        ).all()

    satisfied_count = 0
    pnc_count = 0
    review_required_findings_count = 0

    failure_counts: Dict[tuple, int] = {}
    failure_meta: Dict[tuple, tuple] = {}
    inspections_with_review_finding: Set[str] = set()

    findings_by_insp: Dict[str, List[ComplianceFinding]] = {insp_id: [] for insp_id in auth_insp_ids}

    for f in findings:
        insp_id = run_to_insp.get(f.run_id)
        if insp_id:
            findings_by_insp[insp_id].append(f)

        if f.outcome == "SATISFIED":
            satisfied_count += 1
        elif f.outcome == "POTENTIAL_NON_COMPLIANCE":
            pnc_count += 1
            key_tuple = (f.requirement_key, f.rule_no)
            failure_counts[key_tuple] = failure_counts.get(key_tuple, 0) + 1
            if key_tuple not in failure_meta:
                failure_meta[key_tuple] = (f.requirement_key, f.rule_no, format_requirement_title(f.requirement_key, f.rule_no))
        elif f.outcome == "REVIEW_REQUIRED":
            review_required_findings_count += 1
            if insp_id:
                inspections_with_review_finding.add(insp_id)

    total_findings = satisfied_count + pnc_count + review_required_findings_count

    # 7. Review-Required Inspections (Inspection-Level Metric)
    # Count distinct inspections where latest run has >= 1 REVIEW_REQUIRED finding
    # OR current status is pending_review or reopened.
    review_required_inspections: Set[str] = set(inspections_with_review_finding)
    for insp in inspections_in_period:
        if insp.status in {InspectionStatus.PENDING_REVIEW, InspectionStatus.REOPENED}:
            review_required_inspections.add(insp.inspection_id)

    # 8. Common Requirement Failures (Ranked POTENTIAL_NON_COMPLIANCE only)
    common_failures_list: List[RequirementFailureItem] = []
    sorted_failures = sorted(failure_counts.items(), key=lambda x: x[1], reverse=True)
    for key_tuple, cnt in sorted_failures[:10]:
        req_key, r_no, title = failure_meta[key_tuple]
        common_failures_list.append(
            RequirementFailureItem(
                requirement_key=req_key,
                rule_no=r_no,
                title=title,
                count=cnt
            )
        )

    # 9. Commodity Category Trends
    category_map: Dict[str, Dict[str, int]] = {}
    for insp in inspections_in_period:
        cat = (insp.category or "").strip()
        if not cat:
            cat = "Unknown / Unspecified"
        if cat not in category_map:
            category_map[cat] = {
                "total": 0,
                "satisfied": 0,
                "pnc": 0,
                "review": 0
            }
        category_map[cat]["total"] += 1
        for f in findings_by_insp.get(insp.inspection_id, []):
            if f.outcome == "SATISFIED":
                category_map[cat]["satisfied"] += 1
            elif f.outcome == "POTENTIAL_NON_COMPLIANCE":
                category_map[cat]["pnc"] += 1
            elif f.outcome == "REVIEW_REQUIRED":
                category_map[cat]["review"] += 1

    category_trends_list = [
        CategoryTrendItem(
            category=cat,
            total_inspections=data["total"],
            satisfied_count=data["satisfied"],
            potential_non_compliance_count=data["pnc"],
            review_required_count=data["review"]
        )
        for cat, data in sorted(category_map.items(), key=lambda x: x[1]["total"], reverse=True)
    ]

    # 10. Inspection Channel Distribution (E-Commerce vs Physical vs Unknown)
    ecom_count = 0
    phys_count = 0
    unknown_count = 0

    for insp in inspections_in_period:
        channel = None
        try:
            if insp.metadata_json:
                meta = json.loads(insp.metadata_json)
                rule_ctx = meta.get("rule_context")
                if isinstance(rule_ctx, dict) and "is_ecommerce" in rule_ctx:
                    is_ecom = rule_ctx.get("is_ecommerce")
                    if is_ecom is True:
                        channel = "e_commerce"
                    elif is_ecom is False:
                        channel = "physical"
        except Exception:
            channel = None

        if channel == "e_commerce":
            ecom_count += 1
        elif channel == "physical":
            phys_count += 1
        else:
            unknown_count += 1

    # 11. Workload Metrics (Neutral operational workload)
    # Inspector Workload: inspections grouped by inspector
    insp_workload_map: Dict[tuple, int] = {}
    for insp in inspections_in_period:
        key = (insp.created_by_id, insp.inspector_name or f"Inspector #{insp.created_by_id}")
        insp_workload_map[key] = insp_workload_map.get(key, 0) + 1

    inspector_workload_list = [
        InspectorWorkloadItem(
            inspector_id=key[0],
            inspector_name=key[1],
            inspection_count=cnt
        )
        for key, cnt in sorted(insp_workload_map.items(), key=lambda x: x[1], reverse=True)
    ]

    # Reviewer Workload: inspections awaiting review (pending_review)
    pending_inspections = [insp for insp in inspections_in_period if insp.status == InspectionStatus.PENDING_REVIEW]
    reviewer_workload_map: Dict[tuple, int] = {}

    # Pre-fetch reviewer names if present
    reviewer_ids = {insp.reviewer_id for insp in pending_inspections if insp.reviewer_id is not None}
    reviewer_users = {}
    if reviewer_ids:
        users = db.query(User).filter(User.id.in_(reviewer_ids)).all()
        reviewer_users = {u.id: u.full_name for u in users}

    for insp in pending_inspections:
        if insp.reviewer_id is not None:
            r_name = reviewer_users.get(insp.reviewer_id, f"Reviewer #{insp.reviewer_id}")
            r_key = (insp.reviewer_id, r_name)
        else:
            r_key = (None, "Awaiting Assignment")
        reviewer_workload_map[r_key] = reviewer_workload_map.get(r_key, 0) + 1

    reviewer_workload_list = [
        ReviewerWorkloadItem(
            reviewer_id=r_key[0],
            reviewer_name=r_key[1],
            pending_count=cnt
        )
        for r_key, cnt in sorted(reviewer_workload_map.items(), key=lambda x: x[1], reverse=True)
    ]

    return AnalyticsSummaryResponse(
        range_type=range_type,
        start_date=start_naive.isoformat(),
        end_date=end_naive.isoformat(),
        user_role=current_user.role.value,
        scoped_to_user=scoped_to_user,
        kpi=KPISummary(
            inspections_in_period=total_inspections_in_period,
            satisfied_checks=satisfied_count,
            potential_non_compliances=pnc_count,
            review_required_findings=review_required_findings_count,
            unresolved_inspections=unresolved_count,
            review_required_inspections=len(review_required_inspections)
        ),
        outcome_distribution=OutcomeDistribution(
            satisfied=satisfied_count,
            potential_non_compliance=pnc_count,
            review_required=review_required_findings_count,
            total_findings=total_findings
        ),
        common_failures=common_failures_list,
        category_trends=category_trends_list,
        channel_distribution=ChannelDistribution(
            e_commerce=ecom_count,
            physical=phys_count,
            unknown=unknown_count
        ),
        inspector_workload=inspector_workload_list,
        reviewer_workload=reviewer_workload_list
    )
