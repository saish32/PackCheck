"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function AuditLogsViewer() {
  const { user, token, isAuthenticated, hasRole } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [viewMode, setViewMode] = useState("timeline"); // 'timeline' or 'table'
  const [errorMsg, setErrorMsg] = useState(null);

  const canViewLogs = hasRole(["admin", "supervisor", "auditor"]);

  const fetchLogs = useCallback(async () => {
    if (!token || !canViewLogs) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "15",
      });
      if (actionFilter) params.append("action", actionFilter);

      const res = await fetch(`${API_BASE_URL}/audit/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load audit logs (HTTP ${res.status}).`);
      }

      const data = await res.json();
      setLogs(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, canViewLogs, page, actionFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  if (!isAuthenticated) {
    return (
      <div className="empty-state-card">
        <Icon name="shield" size={36} className="empty-icon-muted" />
        <h3>Authentication Required</h3>
        <p>Please sign in with authorized credentials to inspect system security logs.</p>
      </div>
    );
  }

  if (!canViewLogs) {
    return (
      <div className="empty-state-card unauthorized-box">
        <Icon name="alert" size={36} style={{ color: "var(--badge-danger-text)" }} />
        <h3>403 — Unauthorized Role Access</h3>
        <p>
          Your current role (<strong>{user?.role?.toUpperCase()}</strong>) does not have permission
          to inspect system security and audit logs.
        </p>
        <span className="unauthorized-note">
          Audit logs are restricted to <strong>Auditor</strong>, <strong>Supervisor</strong>, and <strong>Admin</strong> roles under least-privilege security controls.
        </span>
      </div>
    );
  }

  return (
    <div className="audit-ledger-container">
      {/* HEADER & VIEW TOGGLES */}
      <div className="audit-header-bar">
        <div>
          <h2 className="audit-title">Statutory Security & Audit Ledger</h2>
          <p className="audit-subtitle">
            Immutable chronological record tracking user authentications, inspection creations, status transitions, and privileged operations.
          </p>
        </div>

        <div className="view-mode-toggle" role="group" aria-label="Audit View Layout">
          <button
            type="button"
            className={`toggle-pill-btn ${viewMode === "timeline" ? "active" : ""}`}
            onClick={() => setViewMode("timeline")}
          >
            <Icon name="activity" size={14} />
            <span>Timeline View</span>
          </button>
          <button
            type="button"
            className={`toggle-pill-btn ${viewMode === "table" ? "active" : ""}`}
            onClick={() => setViewMode("table")}
          >
            <Icon name="fileText" size={14} />
            <span>Structured Table</span>
          </button>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="audit-filters-bar">
        <span className="filter-label">Filter Event Type:</span>
        <div className="filter-chips-row">
          {[
            { id: "", label: "All Events" },
            { id: "login_success", label: "Logins" },
            { id: "inspection_created", label: "Creations" },
            { id: "inspection_reopened", label: "Reopens" },
            { id: "inspection_finalized_report_generated", label: "Reports Generated" },
          ].map((act) => (
            <button
              key={act.id}
              type="button"
              className={`chip-filter-btn ${actionFilter === act.id ? "active" : ""}`}
              onClick={() => {
                setActionFilter(act.id);
                setPage(1);
              }}
            >
              {act.label}
            </button>
          ))}
        </div>
      </div>

      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}

      {/* AUDIT CONTENT: TIMELINE OR TABLE */}
      <div className="audit-content-card">
        {loading ? (
          <div className="table-loading-box">
            <span className="spinner-lg" />
            <p>Retrieving cryptographic audit events...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="table-empty-box">
            <Icon name="search" size={32} className="empty-icon-muted" />
            <h3>No audit records found</h3>
            <p>No logged events match the selected event filter.</p>
          </div>
        ) : viewMode === "timeline" ? (
          /* TIMELINE PRESENTATION */
          <div className="audit-timeline-flow">
            {logs.map((log) => (
              <div key={log.id} className="audit-timeline-entry">
                <div className="timeline-node-marker">
                  <span className="timeline-dot-inner" />
                </div>
                <div className="timeline-card-surface">
                  <div className="timeline-card-header">
                    <div className="timeline-event-name">
                      <span className="event-action-badge font-mono">{log.action}</span>
                      <span className="timeline-role-badge">{log.user_role}</span>
                    </div>
                    <time className="timeline-timestamp">
                      {new Date(log.created_at).toLocaleString()}
                    </time>
                  </div>

                  <div className="timeline-actor-row">
                    <span>Actor: <strong>{log.user_email || "System"}</strong></span>
                    {log.resource_type && (
                      <>
                        <span className="dot">•</span>
                        <span>Resource: <strong>{log.resource_type}</strong> ({log.resource_id || "—"})</span>
                      </>
                    )}
                    {log.ip_address && (
                      <>
                        <span className="dot">•</span>
                        <span className="font-mono">IP: {log.ip_address}</span>
                      </>
                    )}
                  </div>

                  {log.details && (
                    <div className="timeline-details-quote">
                      {log.details}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* STRUCTURED TABLE PRESENTATION */
          <div className="table-responsive-wrapper">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Timestamp (UTC)</th>
                  <th>Action Event</th>
                  <th>Actor / Email</th>
                  <th>Role</th>
                  <th>Resource Target</th>
                  <th>Audit Log Details</th>
                  <th>Client IP</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id}>
                    <td className="table-date-text">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span className="record-id-badge font-mono">{log.action}</span>
                    </td>
                    <td>{log.user_email || "System"}</td>
                    <td>
                      <span className="table-role-tag">{log.user_role}</span>
                    </td>
                    <td className="font-mono">
                      {log.resource_type ? `${log.resource_type} (${log.resource_id || "—"})` : "—"}
                    </td>
                    <td className="details-cell">{log.details || "—"}</td>
                    <td className="font-mono table-sub-text">{log.ip_address || "local"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {total > 15 && (
          <div className="registry-pagination-bar">
            <span className="pagination-text">
              Showing {(page - 1) * 15 + 1} to {Math.min(page * 15, total)} of {total} audit records
            </span>
            <div className="pagination-controls">
              <button
                type="button"
                className="btn-page"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span className="page-current">Page {page}</span>
              <button
                type="button"
                className="btn-page"
                disabled={page * 15 >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
