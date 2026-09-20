"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function AuditLogsViewer() {
  const { user, token, isAuthenticated, hasRole } = useAuth();
  const [logs, setLogs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [actionFilter, setActionFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);

  const canViewLogs = hasRole(["admin", "supervisor", "auditor"]);

  const fetchLogs = useCallback(async () => {
    if (!token || !canViewLogs) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "15"
      });
      if (actionFilter) params.append("action", actionFilter);

      const res = await fetch(`${API_BASE_URL}/audit/logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to load audit logs.");
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
      <div className="glass-card page-card empty-state-card">
        <div className="empty-icon">🔐</div>
        <h3>Authentication Required</h3>
        <p>Please sign in to access the system audit log ledger.</p>
      </div>
    );
  }

  // Clear, elegant Unauthorized State for least-privilege compliance
  if (!canViewLogs) {
    return (
      <div className="glass-card page-card unauthorized-card">
        <div className="unauthorized-icon">🚫</div>
        <h3>403 — Unauthorized Role Access</h3>
        <p>
          Your current role (<strong>{user?.role?.toUpperCase()}</strong>) does not have permission
          to inspect system security and audit logs.
        </p>
        <div className="unauthorized-info">
          Audit logs are strictly restricted to <strong>Auditor</strong>, <strong>Supervisor</strong>, and <strong>Admin</strong> roles under least-privilege security controls.
        </div>
      </div>
    );
  }

  return (
    <div className="audit-container">
      <div className="glass-card section-header-bar">
        <div className="section-title-box">
          <h2>Immutable System Audit Logs</h2>
          <p>Chronological security and action audit ledger tracking authentication, status changes, and privileged operations.</p>
        </div>

        <div className="filter-chips">
          <button
            className={`chip-btn ${actionFilter === "" ? "active" : ""}`}
            onClick={() => { setActionFilter(""); setPage(1); }}
          >
            All Events
          </button>
          <button
            className={`chip-btn ${actionFilter === "login_success" ? "active" : ""}`}
            onClick={() => { setActionFilter("login_success"); setPage(1); }}
          >
            Logins
          </button>
          <button
            className={`chip-btn ${actionFilter === "inspection_created" ? "active" : ""}`}
            onClick={() => { setActionFilter("inspection_created"); setPage(1); }}
          >
            Creations
          </button>
          <button
            className={`chip-btn ${actionFilter === "inspection_reopened" ? "active" : ""}`}
            onClick={() => { setActionFilter("inspection_reopened"); setPage(1); }}
          >
            Reopens
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="alert-box alert-danger">
          ⚠️ {errorMsg}
        </div>
      )}

      <div className="glass-card table-wrapper">
        {loading ? (
          <div className="loading-state">Retrieving audit ledger...</div>
        ) : logs.length === 0 ? (
          <div className="empty-state">No audit log records found for the selected filter.</div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Timestamp (UTC)</th>
                <th>Action</th>
                <th>User / Actor</th>
                <th>Role</th>
                <th>Resource</th>
                <th>Audit Details</th>
                <th>Client IP</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id}>
                  <td className="sub-text">
                    {new Date(log.created_at).toLocaleString()}
                  </td>
                  <td>
                    <span className="mono-badge">{log.action}</span>
                  </td>
                  <td>{log.user_email || "System"}</td>
                  <td>
                    <span className="badge badge-idle">{log.user_role}</span>
                  </td>
                  <td>
                    {log.resource_type ? `${log.resource_type} (${log.resource_id || "—"})` : "—"}
                  </td>
                  <td style={{ maxWidth: "300px" }}>{log.details || "—"}</td>
                  <td className="sub-text">{log.ip_address || "local"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {total > 15 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {(page - 1) * 15 + 1} to {Math.min(page * 15, total)} of {total} audit events
            </span>
            <div className="pagination-btns">
              <button className="btn-page" disabled={page === 1} onClick={() => setPage(page - 1)}>
                Previous
              </button>
              <span className="page-indicator">Page {page}</span>
              <button className="btn-page" disabled={page * 15 >= total} onClick={() => setPage(page + 1)}>
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
