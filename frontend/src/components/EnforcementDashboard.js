"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";
import {
  OutcomeDonutChart,
  InspectorWorkloadBarChart,
  CategoryOutcomeVisual,
  CommonFailuresBarChart,
  ChannelDistributionDonut,
  ReviewerWorkloadQueue,
} from "./AnalyticsVisuals";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function EnforcementDashboard({ onNewInspection, onOpenInspection }) {
  const { token, user, isAuthenticated, hasRole } = useAuth();

  // Range type: 'today', '7d', '30d', 'custom'
  const [rangeType, setRangeType] = useState("30d");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [appliedCustom, setAppliedCustom] = useState(null);

  const [data, setData] = useState(null);
  const [recentInspections, setRecentInspections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // System Health state (Authoritative from /api/v1/health and /api/v1/health/db)
  const [healthStatus, setHealthStatus] = useState({
    api: "checking",
    db: "checking",
    dbVersion: null,
    latency: null,
  });

  const canCreate = hasRole(["inspector", "supervisor", "admin"]);

  // Dynamic time-of-day greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 17) return "Good afternoon";
    return "Good evening";
  };

  // Fetch live health
  const fetchHealth = useCallback(async () => {
    try {
      const [appRes, dbRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/health`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/health/db`, { cache: "no-store" }),
      ]);

      const apiOk = appRes.status === "fulfilled" && appRes.value.ok;
      let dbOk = false;
      let dbVer = null;
      let latency = null;

      if (dbRes.status === "fulfilled" && dbRes.value.ok) {
        const dbData = await dbRes.value.json().catch(() => ({}));
        dbOk = dbData.status === "connected";
        dbVer = dbData.database_version;
        latency = dbData.latency_ms;
      }

      setHealthStatus({
        api: apiOk ? "operational" : "unreachable",
        db: dbOk ? "connected" : "disconnected",
        dbVersion: dbVer,
        latency,
      });
    } catch {
      setHealthStatus({ api: "unreachable", db: "disconnected", dbVersion: null, latency: null });
    }
  }, []);

  // Fetch analytics & recent inspections
  const fetchOverviewData = useCallback(async (isManualRefresh = false) => {
    if (!token) return;
    if (isManualRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMsg(null);

    let query = `range_type=${rangeType}`;
    if (rangeType === "custom" && appliedCustom) {
      query += `&start_date=${appliedCustom.start}&end_date=${appliedCustom.end}`;
    }

    try {
      const [analyticsRes, inspectionsRes] = await Promise.all([
        fetch(`${API_BASE_URL}/analytics/summary?${query}`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
        fetch(`${API_BASE_URL}/inspections?page=1&page_size=6&sort_by=created_at&sort_dir=desc`, {
          headers: { Authorization: `Bearer ${token}` },
          cache: "no-store",
        }),
      ]);

      if (!analyticsRes.ok) {
        const errJson = await analyticsRes.json().catch(() => ({}));
        throw new Error(errJson.detail || "Unable to retrieve operational analytics.");
      }

      const aData = await analyticsRes.json();
      setData(aData);

      if (inspectionsRes.ok) {
        const iData = await inspectionsRes.json();
        setRecentInspections(iData.items || []);
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to load operational overview.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [token, rangeType, appliedCustom]);

  useEffect(() => {
    fetchHealth();
    fetchOverviewData();
  }, [fetchHealth, fetchOverviewData]);

  const handleApplyCustom = (e) => {
    e.preventDefault();
    if (!customStart || !customEnd) {
      setErrorMsg("Please select both start and end dates for custom range.");
      return;
    }
    if (customStart > customEnd) {
      setErrorMsg("Start date cannot be after end date.");
      return;
    }
    setAppliedCustom({ start: customStart, end: customEnd });
  };

  const kpi = data?.kpi || {
    inspections_in_period: 0,
    satisfied_checks: 0,
    potential_non_compliances: 0,
    review_required_findings: 0,
    unresolved_inspections: 0,
    review_required_inspections: 0,
  };

  const findingsEvaluated = data?.outcome_distribution?.total_findings ?? 0;
  const isSystemHealthy = healthStatus.api === "operational" && healthStatus.db === "connected";

  const getStatusBadge = (status) => {
    switch (status) {
      case "draft": return <span className="status-pill status-draft">Draft</span>;
      case "in_progress": return <span className="status-pill status-in_progress">In Progress</span>;
      case "pending_review": return <span className="status-pill status-pending_review">Pending Review</span>;
      case "approved": return <span className="status-pill status-approved">Approved</span>;
      case "rejected": return <span className="status-pill status-rejected">Rejected</span>;
      case "reopened": return <span className="status-pill status-reopened">Reopened</span>;
      default: return <span className="status-pill">{status}</span>;
    }
  };

  return (
    <div className="overview-command-center">
      {/* 1. OPERATIONS OVERVIEW HEADER */}
      <section className="overview-header-panel">
        <div className="header-greeting-block">
          <div className="header-scope-row">
            <span className="overview-eyebrow">PACKAGING INSPECTION OPERATIONS OVERVIEW</span>
            <span className="scope-badge-pill">
              {data?.scoped_to_user ? "My authorized inspections" : "Organization-wide visibility"}
            </span>
          </div>
          <h1 className="overview-welcome-title">
            {getGreeting()}, {user?.full_name || "Inspector"}
          </h1>
          <p className="overview-subtitle">
            Authoritative regulatory metrics, compliance findings distribution, and active inspection workload.
          </p>
          {data?.start_date && data?.end_date && (
            <div className="reporting-period-notice font-mono">
              Reporting period: {data.start_date.slice(0, 10)} to {data.end_date.slice(0, 10)} (UTC)
            </div>
          )}
        </div>

        <div className="overview-action-controls">
          {/* Time range selector */}
          <div className="range-selector-strip" role="group" aria-label="Overview Time Range">
            {[
              { id: "today", label: "Today" },
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "custom", label: "Custom Range" },
            ].map((r) => (
              <button
                key={r.id}
                type="button"
                className={`range-pill-btn ${rangeType === r.id ? "active" : ""}`}
                onClick={() => {
                  setRangeType(r.id);
                  if (r.id !== "custom") {
                    setAppliedCustom(null);
                  }
                }}
              >
                {r.label}
              </button>
            ))}
          </div>

          <div className="overview-btn-group">
            <button
              type="button"
              className="btn-secondary btn-refresh"
              onClick={() => fetchOverviewData(true)}
              disabled={refreshing || loading}
              title="Refresh operational metrics"
            >
              <Icon name="history" size={14} className={refreshing ? "spin-icon" : ""} />
              <span>{refreshing ? "Updating..." : "Refresh"}</span>
            </button>

            {canCreate && (
              <button
                type="button"
                className="btn-primary"
                onClick={onNewInspection}
              >
                <Icon name="plus" size={15} />
                <span>+ New Inspection</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* CUSTOM DATE RANGE FILTER BAR */}
      {rangeType === "custom" && (
        <form onSubmit={handleApplyCustom} className="custom-range-bar">
          <div className="custom-range-inputs">
            <div className="date-input-group">
              <label htmlFor="custom-start-date" className="date-input-label">From (UTC):</label>
              <input
                id="custom-start-date"
                type="date"
                className="date-picker-input"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                required
              />
            </div>
            <div className="date-input-group">
              <label htmlFor="custom-end-date" className="date-input-label">To (UTC):</label>
              <input
                id="custom-end-date"
                type="date"
                className="date-picker-input"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="btn-primary btn-sm btn-apply-dates">
              Apply Date Range
            </button>
          </div>
        </form>
      )}

      {/* ERROR BANNER WITH RETRY */}
      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span className="error-text-span">{errorMsg}</span>
          <button
            type="button"
            className="btn-secondary btn-sm btn-retry"
            onClick={() => fetchOverviewData(false)}
          >
            Retry
          </button>
        </div>
      )}

      {/* LOADING SKELETON PLACEHOLDER */}
      {loading && !data && (
        <div className="dashboard-skeleton-wrap" aria-busy="true" aria-label="Loading analytics command center">
          <div className="skeleton-kpi-grid">
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
            <div className="skeleton-card" />
          </div>
          <div className="skeleton-charts-grid">
            <div className="skeleton-card card-tall" />
            <div className="skeleton-card card-tall" />
          </div>
        </div>
      )}

      {/* 2. KPI METRICS ROW (5 Cards matching authoritative backend fields) */}
      <section className="overview-kpi-grid" aria-label="Key Performance Indicators">
        {/* Card 1: Inspections in Period */}
        <div className="kpi-metric-card">
          <div className="kpi-header">
            <span className="kpi-label">Inspections in Period</span>
            <span className="kpi-icon-wrap icon-blue"><Icon name="inspections" size={17} /></span>
          </div>
          <div className="kpi-val font-mono">{kpi.inspections_in_period}</div>
          <div className="kpi-footer">
            <span>Recorded in selected range</span>
          </div>
        </div>

        {/* Card 2: Findings Evaluated */}
        <div className="kpi-metric-card">
          <div className="kpi-header">
            <span className="kpi-label">Findings Evaluated</span>
            <span className="kpi-icon-wrap icon-purple"><Icon name="compliance" size={17} /></span>
          </div>
          <div className="kpi-val font-mono">{findingsEvaluated}</div>
          <div className="kpi-footer">
            <span>Latest authoritative compliance findings</span>
          </div>
        </div>

        {/* Card 3: Potential Non-Compliance */}
        <div className="kpi-metric-card">
          <div className="kpi-header">
            <span className="kpi-label">Potential Non-Compliance</span>
            <span className="kpi-icon-wrap icon-red"><Icon name="alert" size={17} /></span>
          </div>
          <div className="kpi-val font-mono color-danger">{kpi.potential_non_compliances}</div>
          <div className="kpi-footer">
            <span>Rule discrepancies flagged</span>
          </div>
        </div>

        {/* Card 4: Review Required */}
        <div className="kpi-metric-card">
          <div className="kpi-header">
            <span className="kpi-label">Review Required</span>
            <span className="kpi-icon-wrap icon-amber"><Icon name="clock" size={17} /></span>
          </div>
          <div className="kpi-val font-mono color-warning">{kpi.review_required_findings}</div>
          <div className="kpi-footer">
            <span>{kpi.review_required_inspections} inspections requiring review</span>
          </div>
        </div>

        {/* Card 5: Unresolved Inspections */}
        <div className="kpi-metric-card">
          <div className="kpi-header">
            <span className="kpi-label">Unresolved Inspections</span>
            <span className="kpi-icon-wrap icon-neutral"><Icon name="overview" size={17} /></span>
          </div>
          <div className="kpi-val font-mono">{kpi.unresolved_inspections}</div>
          <div className="kpi-footer">
            <span>Draft, in progress, pending, or reopened</span>
          </div>
        </div>
      </section>

      {/* 3. VISUALIZATIONS GRID (5 Visuals + 1 Operational Review Queue) */}
      <section className="analytics-visuals-section" aria-label="Operations Visualizations">
        {/* ROW 1: Primary Outcome Donut + Inspector Workload Bar Chart */}
        <div className="analytics-grid-two-col">
          <OutcomeDonutChart data={data?.outcome_distribution} />
          <InspectorWorkloadBarChart items={data?.inspector_workload || []} />
        </div>

        {/* ROW 2: Most Frequent Non-Compliance Rules + Category Outcome Breakdown */}
        <div className="analytics-grid-two-col">
          <CommonFailuresBarChart items={data?.common_failures || []} />
          <CategoryOutcomeVisual items={data?.category_trends || []} />
        </div>

        {/* ROW 3: Channel Distribution + Operational Review Queue */}
        <div className="analytics-grid-two-col">
          <ChannelDistributionDonut data={data?.channel_distribution} />
          <ReviewerWorkloadQueue items={data?.reviewer_workload || []} />
        </div>
      </section>

      {/* 4. LOWER OPERATIONS SECTION: RECENT INSPECTIONS & SYSTEM TELEMETRY */}
      <div className="overview-split-layout">
        {/* RECENT INSPECTION RECORDS */}
        <section className="enterprise-panel overview-recent-inspections" aria-label="Recent Inspection Records">
          <div className="panel-header">
            <div>
              <h3>Recent Inspection Records</h3>
              <span className="sub-count">{recentInspections.length} most recent records in scope</span>
            </div>
          </div>

          <div className="panel-table-wrap">
            {recentInspections.length === 0 ? (
              <div className="table-empty-notice">
                <p>No recent inspections found for this period.</p>
              </div>
            ) : (
              <table className="enterprise-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Product & Brand</th>
                    <th scope="col">Batch</th>
                    <th scope="col">Status</th>
                    <th scope="col">Date</th>
                    <th scope="col" style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {recentInspections.map((ins) => (
                    <tr key={ins.inspection_id} className="interactive-row">
                      <td className="font-mono">
                        <span className="record-id-badge">{ins.inspection_id}</span>
                      </td>
                      <td>
                        <div className="table-main-text font-medium">{ins.product_name}</div>
                        <div className="table-sub-text">{ins.brand_name || "Unbranded"}</div>
                      </td>
                      <td className="font-mono">{ins.batch_number || "—"}</td>
                      <td>{getStatusBadge(ins.status)}</td>
                      <td className="font-mono">{new Date(ins.created_at).toLocaleDateString()}</td>
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn-row-action"
                          onClick={() => onOpenInspection && onOpenInspection(ins)}
                          title="Open inspection workspace"
                        >
                          <span>Open Inspection</span>
                          <Icon name="arrowRight" size={13} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </section>

        {/* SYSTEM & REGULATORY TELEMETRY */}
        <aside className="overview-telemetry-sidebar" aria-label="System and Regulatory Telemetry">
          {/* Authoritative System Health */}
          <div className="enterprise-panel">
            <div className="panel-header">
              <h3>System Health</h3>
              <span className={`status-pill ${isSystemHealthy ? "status-approved" : "status-rejected"}`}>
                {isSystemHealthy ? "Operational" : "Service Issue"}
              </span>
            </div>
            <div className="panel-body">
              <dl className="key-value-list">
                <div className="kv-row">
                  <dt>API Service</dt>
                  <dd className="status-val-row">
                    <span className={`status-dot-sm ${healthStatus.api === "operational" ? "dot-online" : "dot-offline"}`} />
                    <span>{healthStatus.api === "operational" ? "Operational (Healthy)" : "Unavailable"}</span>
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>MySQL Database</dt>
                  <dd className="status-val-row">
                    <span className={`status-dot-sm ${healthStatus.db === "connected" ? "dot-online" : "dot-offline"}`} />
                    <span>
                      {healthStatus.db === "connected"
                        ? `Connected (${healthStatus.latency || 0}ms)`
                        : "Disconnected"}
                    </span>
                  </dd>
                </div>
                <div className="kv-row">
                  <dt>Configured Rulebook</dt>
                  <dd className="font-mono">LMPC v2026.09.16</dd>
                </div>
                <div className="kv-row">
                  <dt>Evaluation Engine</dt>
                  <dd>Deterministic Rules 6, 7, 8, 9, 10A, 11, 18, 22</dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Regulatory Standards Context */}
          <div className="enterprise-panel" style={{ marginTop: "1.25rem" }}>
            <div className="panel-header">
              <h3>Regulatory Standards Context</h3>
            </div>
            <div className="panel-body">
              <p className="sub-text">
                PackCheck evaluates packaging under the Legal Metrology (Packaged Commodities) Rules, 2011 and configured amendments, with First Schedule Maximum Permissible Error (MPE) analysis and verified high-resolution evidence preservation.
              </p>
              <div className="scope-badge-pill" style={{ marginTop: "0.75rem" }}>
                <span>{data?.scoped_to_user ? "Scoped to Authorized Inspections" : "Organization-Wide Oversight"}</span>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
