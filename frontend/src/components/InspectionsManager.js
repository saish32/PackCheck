"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "draft", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "pending_review", label: "Pending Review" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "reopened", label: "Reopened" },
];

export default function InspectionsManager({ onOpenInspection, onNewInspection }) {
  const { token, isAuthenticated, hasRole } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);

  const canCreate = hasRole(["inspector", "supervisor", "admin"]);

  const fetchInspections = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "10",
        sort_by: "created_at",
        sort_dir: "desc",
      });
      if (statusFilter) params.append("status", statusFilter);
      if (search.trim()) params.append("search", search.trim());

      const res = await fetch(`${API_BASE_URL}/inspections?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.detail || "Failed to load inspection registry.");
      }

      const data = await res.json();
      setInspections(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, statusFilter, search]);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections]);

  const getStatusBadge = (status) => {
    switch (status) {
      case "draft":
        return <span className="status-pill status-draft">Draft</span>;
      case "in_progress":
        return <span className="status-pill status-in_progress">In Progress</span>;
      case "pending_review":
        return <span className="status-pill status-pending_review">Pending Review</span>;
      case "approved":
        return <span className="status-pill status-approved">Approved</span>;
      case "rejected":
        return <span className="status-pill status-rejected">Rejected</span>;
      case "reopened":
        return <span className="status-pill status-reopened">Reopened</span>;
      default:
        return <span className="status-pill">{status}</span>;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="empty-state-card">
        <Icon name="shield" size={36} className="empty-icon-muted" />
        <h3>Authentication Required</h3>
        <p>Please sign in using your PackCheck credentials or select a demo role to view inspections.</p>
      </div>
    );
  }

  return (
    <div className="registry-container">
      {/* HEADER BAR */}
      <div className="registry-header-bar">
        <div>
          <h2 className="registry-title">Packaging Inspections</h2>
          <p className="registry-subtitle">
            {hasRole("inspector")
              ? "Scoped View: Displaying inspections authored by or assigned to you."
              : "System View: Full organizational oversight with role authorization."}
          </p>
        </div>

        {canCreate ? (
          <button
            type="button"
            className="btn-primary"
            onClick={onNewInspection}
          >
            <Icon name="plus" size={15} />
            <span>New Inspection</span>
          </button>
        ) : (
          <div className="badge-readonly-notice">
            <span>Read-Only Role Access</span>
          </div>
        )}
      </div>

      {/* SEARCH AND STATUS FILTERS */}
      <div className="registry-filters-bar">
        <div className="search-input-wrapper">
          <Icon name="search" size={16} className="search-icon-inside" />
          <input
            type="text"
            className="search-input-field"
            placeholder="Search inspections by product, brand, batch, title, or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="status-chips-scroll" role="group" aria-label="Filter by Status">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              className={`chip-filter-btn ${statusFilter === opt.value ? "active" : ""}`}
              onClick={() => {
                setStatusFilter(opt.value);
                setPage(1);
              }}
            >
              {opt.label}
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

      {/* INSPECTIONS DATA TABLE */}
      <div className="registry-table-card">
        {loading ? (
          <div className="table-loading-box">
            <span className="spinner-lg" />
            <p>Loading inspection registry...</p>
          </div>
        ) : inspections.length === 0 ? (
          <div className="table-empty-box">
            <Icon name="search" size={32} className="empty-icon-muted" />
            <h3>No inspection records found</h3>
            <p>No records match the current search term or status filter.</p>
            {canCreate && (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={onNewInspection}
                style={{ marginTop: "1rem" }}
              >
                + Create First Inspection
              </button>
            )}
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Product & Brand</th>
                  <th>Batch / Lot</th>
                  <th>Packaging Format</th>
                  <th>Status</th>
                  <th>Lead Inspector</th>
                  <th>Date</th>
                  <th style={{ textAlign: "right" }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((ins) => (
                  <tr key={ins.inspection_id} className="interactive-row">
                    <td>
                      <span className="record-id-badge font-mono">{ins.inspection_id}</span>
                    </td>
                    <td>
                      <div className="table-main-text">{ins.product_name || ins.name}</div>
                      <div className="table-sub-text">{ins.brand_name}</div>
                    </td>
                    <td>
                      <span className="font-mono table-code-text">{ins.batch_number}</span>
                    </td>
                    <td>
                      <div className="table-main-text">{ins.packaging_type}</div>
                      <div className="table-sub-text">{ins.category}</div>
                    </td>
                    <td>{getStatusBadge(ins.status)}</td>
                    <td>
                      <span className="table-inspector-text">{ins.inspector_name}</span>
                    </td>
                    <td>
                      <span className="table-date-text">
                        {new Date(ins.created_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <button
                        type="button"
                        className="btn-row-action"
                        onClick={() => onOpenInspection && onOpenInspection(ins)}
                        title="Open inspection workspace"
                      >
                        <span>Open inspection</span>
                        <Icon name="arrowRight" size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION BAR */}
        {total > 10 && (
          <div className="registry-pagination-bar">
            <span className="pagination-text">
              Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of {total} inspections
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
                disabled={page * 10 >= total}
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
