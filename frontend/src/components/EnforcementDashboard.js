"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function EnforcementDashboard() {
  const { token, user, isAuthenticated } = useAuth();

  // Filter states
  const [rangeType, setRangeType] = useState("today");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [appliedCustomStart, setAppliedCustomStart] = useState("");
  const [appliedCustomEnd, setAppliedCustomEnd] = useState("");

  // Data states
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);

  const fetchAnalytics = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      let queryUrl = `${API_BASE_URL}/analytics/summary?range_type=${rangeType}`;
      if (rangeType === "custom") {
        if (!appliedCustomStart || !appliedCustomEnd) {
          setLoading(false);
          return;
        }
        queryUrl += `&start_date=${encodeURIComponent(appliedCustomStart)}&end_date=${encodeURIComponent(appliedCustomEnd)}`;
      }

      const res = await fetch(queryUrl, {
        headers: {
          Authorization: `Bearer ${token}`
        },
        cache: "no-store"
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.detail || `Analytics request failed with HTTP ${res.status}`);
      }

      const result = await res.json();
      setData(result);
    } catch (err) {
      setErrorMsg(err.message || "Failed to load enforcement analytics.");
    } finally {
      setLoading(false);
    }
  }, [token, rangeType, appliedCustomStart, appliedCustomEnd]);

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  const handleApplyCustom = (e) => {
    e.preventDefault();
    if (!startDate || !endDate) {
      setErrorMsg("Please select both start and end dates.");
      return;
    }
    if (startDate > endDate) {
      setErrorMsg("Start date cannot be after end date.");
      return;
    }
    setErrorMsg(null);
    setAppliedCustomStart(startDate);
    setAppliedCustomEnd(endDate);
  };

  const formatSafeNumber = (val) => {
    if (val === null || val === undefined || isNaN(val)) return 0;
    return Number(val).toLocaleString();
  };

  const calculatePct = (numerator, denominator) => {
    if (!denominator || denominator === 0 || !numerator) return 0;
    const pct = (numerator / denominator) * 100;
    return Number.isFinite(pct) ? Math.round(pct) : 0;
  };

  const kpi = data?.kpi || {
    inspections_in_period: 0,
    satisfied_checks: 0,
    potential_non_compliances: 0,
    review_required_findings: 0,
    unresolved_inspections: 0,
    review_required_inspections: 0
  };

  const outcomes = data?.outcome_distribution || {
    satisfied: 0,
    potential_non_compliance: 0,
    review_required: 0,
    total_findings: 0
  };

  const totalFindings = outcomes.total_findings || 0;
  const satPct = calculatePct(outcomes.satisfied, totalFindings);
  const pncPct = calculatePct(outcomes.potential_non_compliance, totalFindings);
  const revPct = calculatePct(outcomes.review_required, totalFindings);

  const channels = data?.channel_distribution || { e_commerce: 0, physical: 0, unknown: 0 };
  const totalChannels = (channels.e_commerce || 0) + (channels.physical || 0) + (channels.unknown || 0);

  return (
    <div className="enforcement-dashboard-container" style={{ display: "flex", flexDirection: "column", gap: "24px", width: "100%", maxWidth: "1280px", margin: "0 auto", padding: "0 16px" }}>
      {/* Top Header Card */}
      <section className="glass-card" style={{ padding: "24px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: "16px" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
              <span style={{ fontSize: "20px" }}>📊</span>
              <h2 style={{ fontSize: "22px", fontWeight: "700", color: "var(--text-primary)" }}>
                Enforcement Dashboard & Compliance Analytics
              </h2>
            </div>
            <p style={{ fontSize: "14px", color: "var(--text-secondary)", margin: 0 }}>
              Authoritative real-time aggregation of persisted inspections, deterministic compliance findings, and review workloads.
            </p>
          </div>

          {/* Role Scoping Badge */}
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <span style={{
              fontSize: "12px",
              fontWeight: "600",
              padding: "6px 12px",
              borderRadius: "20px",
              backgroundColor: data?.scoped_to_user ? "var(--badge-warning-bg)" : "var(--badge-success-bg)",
              color: data?.scoped_to_user ? "var(--badge-warning-text)" : "var(--badge-success-text)",
              border: `1px solid ${data?.scoped_to_user ? "var(--badge-warning-border)" : "var(--badge-success-border)"}`
            }}>
              {data?.scoped_to_user ? "🔒 Scoped: My Authorized Inspections" : "🌐 Scope: Organization-Wide Visibility"}
            </span>

            <button
              onClick={fetchAnalytics}
              disabled={loading}
              className="btn-secondary"
              style={{ padding: "6px 14px", fontSize: "13px", display: "flex", alignItems: "center", gap: "6px", cursor: loading ? "not-allowed" : "pointer" }}
              title="Refresh Analytics"
            >
              <span>🔄</span> {loading ? "Updating..." : "Refresh"}
            </button>
          </div>
        </div>

        {/* Date Range Selector Controls */}
        <div style={{ marginTop: "20px", paddingTop: "16px", borderTop: "1px solid var(--border-card)", display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: "16px" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px" }} role="group" aria-label="Date range filters">
            {[
              { id: "today", label: "Today" },
              { id: "7d", label: "Last 7 Days" },
              { id: "30d", label: "Last 30 Days" },
              { id: "custom", label: "Custom Range" },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => {
                  setRangeType(btn.id);
                  if (btn.id !== "custom") {
                    setErrorMsg(null);
                  }
                }}
                className={`nav-tab-btn ${rangeType === btn.id ? "active" : ""}`}
                style={{
                  padding: "6px 16px",
                  fontSize: "13px",
                  borderRadius: "6px",
                  fontWeight: rangeType === btn.id ? "600" : "400",
                  backgroundColor: rangeType === btn.id ? "var(--accent-primary)" : "var(--bg-input)",
                  color: rangeType === btn.id ? "#ffffff" : "var(--text-secondary)",
                  border: "1px solid var(--border-card)",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
              >
                {btn.label}
              </button>
            ))}
          </div>

          {/* Custom Date Inputs if Custom Selected */}
          {rangeType === "custom" && (
            <form onSubmit={handleApplyCustom} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "10px" }}>
              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                From:
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-card)",
                    backgroundColor: "var(--bg-input)",
                    color: "var(--text-primary)",
                    fontSize: "13px"
                  }}
                  required
                />
              </label>

              <label style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                To:
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  style={{
                    padding: "5px 10px",
                    borderRadius: "6px",
                    border: "1px solid var(--border-card)",
                    backgroundColor: "var(--bg-input)",
                    color: "var(--text-primary)",
                    fontSize: "13px"
                  }}
                  required
                />
              </label>

              <button
                type="submit"
                className="btn-primary"
                style={{ padding: "6px 14px", fontSize: "12px", cursor: "pointer" }}
              >
                Apply
              </button>
            </form>
          )}

          {/* Active Period Label */}
          {data?.start_date && (
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontStyle: "italic" }}>
              Period: {data.start_date.split("T")[0]} to {data.end_date.split("T")[0]} (UTC)
            </div>
          )}
        </div>
      </section>

      {/* Error State Banner */}
      {errorMsg && (
        <div
          role="alert"
          style={{
            padding: "14px 18px",
            borderRadius: "8px",
            backgroundColor: "var(--badge-danger-bg)",
            color: "var(--badge-danger-text)",
            border: "1px solid var(--badge-danger-border)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: "14px"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span>⚠️</span>
            <strong>Error:</strong> {errorMsg}
          </div>
          <button
            onClick={fetchAnalytics}
            style={{
              padding: "4px 10px",
              fontSize: "12px",
              backgroundColor: "transparent",
              color: "inherit",
              border: "1px solid currentColor",
              borderRadius: "4px",
              cursor: "pointer"
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {loading && !data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "16px" }}>
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="glass-card" style={{ padding: "20px", height: "130px", opacity: 0.6 }}>
              <div style={{ height: "14px", width: "60%", backgroundColor: "var(--border-card)", borderRadius: "4px", marginBottom: "16px" }}></div>
              <div style={{ height: "36px", width: "40%", backgroundColor: "var(--border-card)", borderRadius: "6px" }}></div>
            </div>
          ))}
        </div>
      )}

      {/* 5 SUMMARY KPI CARDS */}
      {data && (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "16px"
          }}
          aria-label="Summary KPI Cards"
        >
          {/* Card 1: Inspections in Period */}
          <div className="glass-card" style={{ padding: "20px", borderLeft: "4px solid var(--accent-primary)" }} role="status">
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Inspections in Period
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--text-primary)", margin: "8px 0" }}>
              {formatSafeNumber(kpi.inspections_in_period)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Created within selected range
            </div>
          </div>

          {/* Card 2: Satisfied Checks */}
          <div className="glass-card" style={{ padding: "20px", borderLeft: "4px solid var(--badge-success-text)" }} role="status">
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Satisfied Checks
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--badge-success-text)", margin: "8px 0" }}>
              {formatSafeNumber(kpi.satisfied_checks)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {totalFindings > 0 ? `${satPct}% of authoritative findings` : "Deterministic verified rules"}
            </div>
          </div>

          {/* Card 3: Potential Non-Compliances */}
          <div className="glass-card" style={{ padding: "20px", borderLeft: "4px solid var(--badge-danger-text)" }} role="status">
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Potential Non-Compliances
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--badge-danger-text)", margin: "8px 0" }}>
              {formatSafeNumber(kpi.potential_non_compliances)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {totalFindings > 0 ? `${pncPct}% of authoritative findings` : "Detected requirement breaches"}
            </div>
          </div>

          {/* Card 4: Review Required */}
          <div className="glass-card" style={{ padding: "20px", borderLeft: "4px solid var(--badge-warning-text)" }} role="status">
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Review Required
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "var(--badge-warning-text)", margin: "8px 0" }}>
              {formatSafeNumber(kpi.review_required_findings)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              {formatSafeNumber(kpi.review_required_inspections)} inspections need supervisor review
            </div>
          </div>

          {/* Card 5: Unresolved Inspections */}
          <div className="glass-card" style={{ padding: "20px", borderLeft: "4px solid #6366f1" }} role="status">
            <div style={{ fontSize: "12px", color: "var(--text-muted)", fontWeight: "600", textTransform: "uppercase", letterSpacing: "0.5px" }}>
              Unresolved Inspections
            </div>
            <div style={{ fontSize: "32px", fontWeight: "800", color: "#6366f1", margin: "8px 0" }}>
              {formatSafeNumber(kpi.unresolved_inspections)}
            </div>
            <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
              Draft, In-Progress, or Pending Review
            </div>
          </div>
        </section>
      )}

      {/* Main Visualizations Row: Outcome Distribution & Top Non-Compliances */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px" }}>
          {/* Chart A: Compliance Outcome Distribution */}
          <section className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)" }}>
                Compliance Outcome Distribution
              </h3>
              <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Total Findings: {formatSafeNumber(totalFindings)}
              </span>
            </div>

            {totalFindings === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                No compliance findings recorded for this period.
              </div>
            ) : (
              <div>
                {/* Horizontal Segmented Bar */}
                <div
                  style={{
                    display: "flex",
                    height: "28px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "var(--bg-input)",
                    marginBottom: "20px"
                  }}
                  role="progressbar"
                  aria-label="Compliance Outcome Distribution Bar"
                >
                  {satPct > 0 && (
                    <div
                      style={{ width: `${satPct}%`, backgroundColor: "var(--badge-success-text)", transition: "width 0.4s ease" }}
                      title={`SATISFIED: ${outcomes.satisfied} (${satPct}%)`}
                    />
                  )}
                  {pncPct > 0 && (
                    <div
                      style={{ width: `${pncPct}%`, backgroundColor: "var(--badge-danger-text)", transition: "width 0.4s ease" }}
                      title={`POTENTIAL_NON_COMPLIANCE: ${outcomes.potential_non_compliance} (${pncPct}%)`}
                    />
                  )}
                  {revPct > 0 && (
                    <div
                      style={{ width: `${revPct}%`, backgroundColor: "var(--badge-warning-text)", transition: "width 0.4s ease" }}
                      title={`REVIEW_REQUIRED: ${outcomes.review_required} (${revPct}%)`}
                    />
                  )}
                </div>

                {/* Legend List */}
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "var(--badge-success-text)" }}></span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>SATISFIED</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>{formatSafeNumber(outcomes.satisfied)}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "13px", minWidth: "40px", textAlign: "right" }}>{satPct}%</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "var(--badge-danger-text)" }}></span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>POTENTIAL_NON_COMPLIANCE</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>{formatSafeNumber(outcomes.potential_non_compliance)}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "13px", minWidth: "40px", textAlign: "right" }}>{pncPct}%</span>
                    </div>
                  </div>

                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ width: "12px", height: "12px", borderRadius: "3px", backgroundColor: "var(--badge-warning-text)" }}></span>
                      <span style={{ color: "var(--text-primary)", fontWeight: "500" }}>REVIEW_REQUIRED</span>
                    </div>
                    <div style={{ display: "flex", gap: "12px", alignItems: "center" }}>
                      <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>{formatSafeNumber(outcomes.review_required)}</span>
                      <span style={{ color: "var(--text-muted)", fontSize: "13px", minWidth: "40px", textAlign: "right" }}>{revPct}%</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* Chart B: Common Requirement Failures */}
          <section className="glass-card" style={{ padding: "24px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "18px" }}>
              <div>
                <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", margin: 0 }}>
                  Common Requirement Failures
                </h3>
                <div style={{ fontSize: "12px", color: "var(--text-secondary)", marginTop: "2px" }}>
                  Ranked by confirmed POTENTIAL_NON_COMPLIANCE findings
                </div>
              </div>
            </div>

            {(!data.common_failures || data.common_failures.length === 0) ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                <span>✅</span> Zero confirmed non-compliances recorded in this period.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                {data.common_failures.slice(0, 6).map((item, idx) => {
                  const maxCount = data.common_failures[0]?.count || 1;
                  const barWidth = Math.max(8, Math.round((item.count / maxCount) * 100));
                  return (
                    <div key={`${item.requirement_key}-${idx}`} style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px" }}>
                        <span style={{ fontWeight: "600", color: "var(--text-primary)" }}>
                          {item.title}
                        </span>
                        <span style={{ fontWeight: "700", color: "var(--badge-danger-text)" }}>
                          {formatSafeNumber(item.count)} cases
                        </span>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <div style={{ flex: 1, height: "10px", borderRadius: "5px", backgroundColor: "var(--bg-input)", overflow: "hidden" }}>
                          <div
                            style={{
                              width: `${barWidth}%`,
                              height: "100%",
                              backgroundColor: "var(--badge-danger-text)",
                              borderRadius: "5px",
                              transition: "width 0.4s ease"
                            }}
                          />
                        </div>
                        <span style={{ fontSize: "11px", color: "var(--text-muted)", minWidth: "48px", textAlign: "right" }}>
                          Rule {item.rule_no}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}

      {/* Second Row: Commodity Category Trends & Channel Distribution */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px" }}>
          {/* Chart C: Commodity Category Trends */}
          <section className="glass-card" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", marginBottom: "16px" }}>
              Commodity Category Trends
            </h3>

            {(!data.category_trends || data.category_trends.length === 0) ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                No category data available for this period.
              </div>
            ) : (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border-card)", textAlign: "left" }}>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: "600" }}>Category</th>
                      <th style={{ padding: "8px 10px", color: "var(--text-secondary)", fontWeight: "600", textAlign: "center" }}>Total</th>
                      <th style={{ padding: "8px 10px", color: "var(--badge-success-text)", fontWeight: "600", textAlign: "center" }}>Satisfied</th>
                      <th style={{ padding: "8px 10px", color: "var(--badge-danger-text)", fontWeight: "600", textAlign: "center" }}>PNC</th>
                      <th style={{ padding: "8px 10px", color: "var(--badge-warning-text)", fontWeight: "600", textAlign: "center" }}>Review</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.category_trends.map((cat, i) => (
                      <tr key={i} style={{ borderBottom: "1px solid var(--border-card)" }}>
                        <td style={{ padding: "10px", fontWeight: "500", color: "var(--text-primary)" }}>{cat.category}</td>
                        <td style={{ padding: "10px", textAlign: "center", fontWeight: "700", color: "var(--text-primary)" }}>
                          {formatSafeNumber(cat.total_inspections)}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center", color: "var(--badge-success-text)", fontWeight: "600" }}>
                          {formatSafeNumber(cat.satisfied_count)}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center", color: "var(--badge-danger-text)", fontWeight: "600" }}>
                          {formatSafeNumber(cat.potential_non_compliance_count)}
                        </td>
                        <td style={{ padding: "10px", textAlign: "center", color: "var(--badge-warning-text)", fontWeight: "600" }}>
                          {formatSafeNumber(cat.review_required_count)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Chart D: Inspection Channel (E-Commerce vs Physical) */}
          <section className="glass-card" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", marginBottom: "4px" }}>
              Inspection Channel Distribution
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "18px" }}>
              Authoritative channel breakdown derived from inspection rule context.
            </p>

            {totalChannels === 0 ? (
              <div style={{ padding: "40px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                No inspection channel data available.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                {/* Physical */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      🏪 Physical Retail Inspection
                    </span>
                    <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>
                      {formatSafeNumber(channels.physical)} ({calculatePct(channels.physical, totalChannels)}%)
                    </span>
                  </div>
                  <div style={{ height: "10px", borderRadius: "5px", backgroundColor: "var(--bg-input)", overflow: "hidden" }}>
                    <div style={{ width: `${calculatePct(channels.physical, totalChannels)}%`, height: "100%", backgroundColor: "var(--accent-primary)" }}></div>
                  </div>
                </div>

                {/* E-Commerce */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "600", color: "var(--text-primary)", display: "flex", alignItems: "center", gap: "6px" }}>
                      🛒 E-Commerce Marketplace Listing
                    </span>
                    <span style={{ fontWeight: "700", color: "var(--text-primary)" }}>
                      {formatSafeNumber(channels.e_commerce)} ({calculatePct(channels.e_commerce, totalChannels)}%)
                    </span>
                  </div>
                  <div style={{ height: "10px", borderRadius: "5px", backgroundColor: "var(--bg-input)", overflow: "hidden" }}>
                    <div style={{ width: `${calculatePct(channels.e_commerce, totalChannels)}%`, height: "100%", backgroundColor: "#8b5cf6" }}></div>
                  </div>
                </div>

                {/* Unknown / Data Unavailable */}
                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "6px" }}>
                    <span style={{ fontWeight: "500", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "6px" }}>
                      ℹ️ Channel Unspecified / Unavailable
                    </span>
                    <span style={{ fontWeight: "600", color: "var(--text-muted)" }}>
                      {formatSafeNumber(channels.unknown)} ({calculatePct(channels.unknown, totalChannels)}%)
                    </span>
                  </div>
                  <div style={{ height: "10px", borderRadius: "5px", backgroundColor: "var(--bg-input)", overflow: "hidden" }}>
                    <div style={{ width: `${calculatePct(channels.unknown, totalChannels)}%`, height: "100%", backgroundColor: "var(--text-muted)" }}></div>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Third Row: Neutral Workload Metrics */}
      {data && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: "24px" }}>
          {/* Inspector Workload */}
          <section className="glass-card" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", marginBottom: "4px" }}>
              Field Inspection Workload
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Neutral distribution of inspections logged per inspector.
            </p>

            {(!data.inspector_workload || data.inspector_workload.length === 0) ? (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                No inspector activity recorded in this period.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data.inspector_workload.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-input)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>👤</span>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>{item.inspector_name}</span>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--accent-primary)" }}>
                      {formatSafeNumber(item.inspection_count)} inspections
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Reviewer Workload */}
          <section className="glass-card" style={{ padding: "24px" }}>
            <h3 style={{ fontSize: "16px", fontWeight: "700", color: "var(--text-primary)", marginBottom: "4px" }}>
              Pending Review Workload
            </h3>
            <p style={{ fontSize: "12px", color: "var(--text-secondary)", marginBottom: "16px" }}>
              Inspections currently awaiting supervisor review and sign-off.
            </p>

            {(!data.reviewer_workload || data.reviewer_workload.length === 0) ? (
              <div style={{ padding: "30px 20px", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                <span>✨</span> All reviews up to date. Zero inspections pending review.
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {data.reviewer_workload.map((item, idx) => (
                  <div
                    key={idx}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      backgroundColor: "var(--bg-input)"
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "16px" }}>⏳</span>
                      <span style={{ fontSize: "13px", fontWeight: "600", color: "var(--text-primary)" }}>{item.reviewer_name}</span>
                    </div>
                    <span style={{ fontSize: "13px", fontWeight: "700", color: "var(--badge-warning-text)" }}>
                      {formatSafeNumber(item.pending_count)} pending
                    </span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
