"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

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

export default function InspectionHistoryViewer() {
  const { token, isAuthenticated } = useAuth();

  // Listing and filter state
  const [inspections, setInspections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [inspectionIdFilter, setInspectionIdFilter] = useState("");
  const [inspectorFilter, setInspectorFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [pdfFilter, setPdfFilter] = useState(""); // "" (all), "true", "false"

  // Details Modal State
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailTab, setDetailTab] = useState("overview"); // overview, machine, compliance, pdf

  // PDF Viewer Modal State
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [activePdfMeta, setActivePdfMeta] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);

  // Fetch Inspections List
  const fetchInspections = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());

      if (search.trim()) params.append("search", search.trim());
      if (inspectionIdFilter.trim()) params.append("inspection_id", inspectionIdFilter.trim());
      if (inspectorFilter.trim()) params.append("inspector_name", inspectorFilter.trim());
      if (statusFilter) params.append("status", statusFilter);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (pdfFilter === "true") params.append("has_pdf", "true");
      if (pdfFilter === "false") params.append("has_pdf", "false");

      const res = await fetch(`${API_BASE_URL}/inspections?${params.toString()}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) {
          throw new Error("You do not have permission to view inspection history.");
        }
        throw new Error(`Failed to load history (HTTP ${res.status}).`);
      }

      const data = await res.json();
      setInspections(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, inspectionIdFilter, inspectorFilter, statusFilter, dateFrom, dateTo, pdfFilter]);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections]);

  // Clean up PDF object URL on unmount or when viewer closes
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  const handleResetFilters = () => {
    setSearch("");
    setInspectionIdFilter("");
    setInspectorFilter("");
    setStatusFilter("");
    setDateFrom("");
    setDateTo("");
    setPdfFilter("");
    setPage(1);
  };

  // Open Full Detail Modal (Fetches Persisted Declarations + Findings)
  const handleOpenDetails = async (ins) => {
    setDetailLoading(true);
    setDetailModalOpen(true);
    setDetailTab("overview");
    setSelectedInspection(null);

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${ins.inspection_id}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        throw new Error(`Unable to fetch inspection details (HTTP ${res.status})`);
      }

      const data = await res.json();
      setSelectedInspection(data);
    } catch (err) {
      setErrorMsg(err.message);
      setDetailModalOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  // Open Authenticated In-App PDF Viewer
  const handleViewPdf = async (ins) => {
    setPdfViewerOpen(true);
    setPdfLoading(true);
    setPdfError(null);
    setActivePdfMeta({
      inspection_id: ins.inspection_id,
      name: ins.name,
      pdf_sha256: ins.pdf_sha256,
      pdf_size: ins.pdf_size,
    });

    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/inspections/${ins.inspection_id}/report/pdf?disposition=inline`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (res.status === 404) {
        throw new Error("Final report PDF is unavailable or has not been finalized yet.");
      }
      if (res.status === 500) {
        throw new Error("Cryptographic integrity check failed. The report cannot be served.");
      }
      if (!res.ok) {
        throw new Error(`Failed to load PDF (HTTP ${res.status}).`);
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPdfBlobUrl(url);
    } catch (err) {
      setPdfError(err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  const handleClosePdfViewer = () => {
    setPdfViewerOpen(false);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setActivePdfMeta(null);
    setPdfError(null);
  };

  // Direct Download PDF (disposition=attachment)
  const handleDownloadPdf = async (inspectionId, filename) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/inspections/${inspectionId}/report/pdf?disposition=attachment`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (!res.ok) {
        if (res.status === 404) {
          alert("Final report PDF is unavailable for this inspection.");
          return;
        }
        if (res.status === 500) {
          alert("Integrity verification failure: SHA-256 mismatch. Report withheld.");
          return;
        }
        alert(`Download failed (HTTP ${res.status}).`);
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${inspectionId}_Final_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(`Download error: ${err.message}`);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "approved":
        return <span className="status-badge status-approved">Approved</span>;
      case "rejected":
        return <span className="status-badge status-rejected">Rejected</span>;
      case "pending_review":
        return <span className="status-badge status-pending">Pending Review</span>;
      case "in_progress":
        return <span className="status-badge status-progress">In Progress</span>;
      case "reopened":
        return <span className="status-badge status-reopened">Reopened</span>;
      default:
        return <span className="status-badge status-draft">Draft</span>;
    }
  };

  const getOutcomeBadge = (outcome) => {
    switch (outcome) {
      case "COMPLIANT":
        return <span className="badge badge-success">COMPLIANT</span>;
      case "NON_COMPLIANT":
        return <span className="badge badge-danger">NON-COMPLIANT</span>;
      case "REVIEW_REQUIRED":
        return <span className="badge badge-warning">REVIEW REQUIRED</span>;
      default:
        return <span className="badge badge-idle">{outcome || "NOT EVALUATED"}</span>;
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="history-container">
      {/* Page Header */}
      <div className="history-header glass-card">
        <div className="history-header-left">
          <div className="history-pill">
            <span className="pulse-dot"></span>
            Phase 12 Active • MySQL BLOB Permanent Retrieval
          </div>
          <h2 className="history-title">Inspection History & Archives</h2>
          <p className="history-subtitle">
            Search, inspect, and retrieve finalized packaging verification records and cryptographically
            verified PDFs from permanent database storage.
          </p>
        </div>
        <div className="history-header-actions">
          <button className="btn-secondary" onClick={fetchInspections} disabled={loading}>
            {loading ? "Refreshing..." : "↻ Refresh History"}
          </button>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="history-filter-panel glass-card">
        <div className="filter-grid">
          {/* Search */}
          <div className="filter-group">
            <label>Keyword Search</label>
            <input
              type="text"
              placeholder="Search name, product, brand..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Inspection ID */}
          <div className="filter-group">
            <label>Inspection ID</label>
            <input
              type="text"
              placeholder="INS-2026..."
              value={inspectionIdFilter}
              onChange={(e) => {
                setInspectionIdFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Inspector */}
          <div className="filter-group">
            <label>Inspector Name</label>
            <input
              type="text"
              placeholder="Filter by inspector..."
              value={inspectorFilter}
              onChange={(e) => {
                setInspectorFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Status */}
          <div className="filter-group">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Date From */}
          <div className="filter-group">
            <label>From Date (UTC)</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => {
                setDateFrom(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* Date To */}
          <div className="filter-group">
            <label>To Date (UTC)</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => {
                setDateTo(e.target.value);
                setPage(1);
              }}
            />
          </div>

          {/* PDF Availability */}
          <div className="filter-group">
            <label>PDF Availability</label>
            <select
              value={pdfFilter}
              onChange={(e) => {
                setPdfFilter(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All Inspections</option>
              <option value="true">With Verified Final PDF</option>
              <option value="false">Without Final PDF</option>
            </select>
          </div>

          {/* Reset Filters */}
          <div className="filter-group filter-actions-cell">
            <label>&nbsp;</label>
            <button className="btn-secondary btn-full" onClick={handleResetFilters}>
              Reset Filters
            </button>
          </div>
        </div>
      </div>

      {/* Error Message */}
      {errorMsg && (
        <div className="alert-banner alert-danger">
          <span>⚠️ {errorMsg}</span>
          <button onClick={() => setErrorMsg(null)} className="btn-close-alert">×</button>
        </div>
      )}

      {/* Results Count & Meta */}
      <div className="history-results-meta">
        <span className="results-count">
          Showing <strong>{inspections.length}</strong> of <strong>{total}</strong> historical inspections
        </span>
        {loading && <span className="loading-tag">Loading database records...</span>}
      </div>

      {/* Inspections Table / Cards */}
      {inspections.length === 0 && !loading ? (
        <div className="empty-state glass-card">
          <div className="empty-icon">📁</div>
          <h3>No historical inspections found</h3>
          <p>
            No records matched your search filters. Try adjusting your search keyword, date boundaries,
            or reset all filters to view all records.
          </p>
          <button className="btn-secondary" onClick={handleResetFilters}>
            Clear All Filters
          </button>
        </div>
      ) : (
        <div className="history-table-wrapper glass-card">
          <table className="history-table">
            <thead>
              <tr>
                <th>Inspection ID</th>
                <th>Inspection Name</th>
                <th>Product / Batch</th>
                <th>Inspector</th>
                <th>Created (UTC)</th>
                <th>Status</th>
                <th>Final Report</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((ins) => (
                <tr key={ins.inspection_id} className="history-row">
                  <td className="cell-id">
                    <span className="id-code-badge">{ins.inspection_id}</span>
                  </td>
                  <td className="cell-name">
                    <div className="inspection-title">{ins.name}</div>
                    <div className="inspection-category">{ins.category} • {ins.packaging_type}</div>
                  </td>
                  <td>
                    <div className="product-title">{ins.product_name}</div>
                    <div className="product-sub">
                      Batch: <code>{ins.batch_number}</code>
                    </div>
                  </td>
                  <td>
                    <div className="inspector-badge-pill">
                      👤 {ins.inspector_name}
                    </div>
                  </td>
                  <td>
                    <div className="date-cell">
                      {new Date(ins.created_at).toLocaleDateString(undefined, {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    <div className="time-cell">
                      {new Date(ins.created_at).toLocaleTimeString(undefined, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </div>
                  </td>
                  <td>{getStatusBadge(ins.status)}</td>
                  <td>
                    {ins.has_pdf ? (
                      <div className="pdf-ready-cell">
                        <span className="pdf-badge pdf-ready" title={`SHA256: ${ins.pdf_sha256}`}>
                          ✓ Verified PDF
                        </span>
                        {ins.pdf_size && (
                          <span className="pdf-size-sub">
                            {Math.round(ins.pdf_size / 1024)} KB
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="pdf-badge pdf-none">No Report</span>
                    )}
                  </td>
                  <td className="text-right cell-actions">
                    <div className="action-buttons-group">
                      <button
                        className="btn-action-outline"
                        onClick={() => handleOpenDetails(ins)}
                        title="View complete historical records and findings"
                      >
                        Details
                      </button>

                      {ins.has_pdf ? (
                        <>
                          <button
                            className="btn-action-primary"
                            onClick={() => handleViewPdf(ins)}
                            title="View PDF report inside authenticated browser viewer"
                          >
                            👁 View
                          </button>
                          <button
                            className="btn-action-download"
                            onClick={() => handleDownloadPdf(ins.inspection_id, `${ins.inspection_id}_Final_Report.pdf`)}
                            title="Download verified PDF artifact"
                          >
                            ⬇ PDF
                          </button>
                        </>
                      ) : (
                        <button
                          className="btn-action-disabled"
                          disabled
                          title="PDF report has not been generated for this inspection"
                        >
                          No PDF
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-bar glass-card">
          <button
            className="btn-secondary"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1 || loading}
          >
            ← Previous
          </button>
          <span className="pagination-info">
            Page <strong>{page}</strong> of <strong>{totalPages}</strong> ({total} total)
          </span>
          <button
            className="btn-secondary"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages || loading}
          >
            Next →
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. COMPREHENSIVE INSPECTION DETAILS MODAL (Phase 12 Read-Only History) */}
      {/* ========================================================================= */}
      {detailModalOpen && (
        <div className="modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <div className="modal-dialog modal-large glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-wrap">
                <span className="id-code-badge">{selectedInspection?.inspection_id || "Loading..."}</span>
                <h3>{selectedInspection?.name || "Inspection Archive Details"}</h3>
                {selectedInspection && getStatusBadge(selectedInspection.status)}
              </div>
              <button className="btn-close" onClick={() => setDetailModalOpen(false)}>✕</button>
            </div>

            {/* Modal Tabs */}
            <div className="modal-tab-bar">
              <button
                className={`modal-tab ${detailTab === "overview" ? "active" : ""}`}
                onClick={() => setDetailTab("overview")}
              >
                Inspection Overview & Review
              </button>
              <button
                className={`modal-tab ${detailTab === "machine" ? "active" : ""}`}
                onClick={() => setDetailTab("machine")}
              >
                Machine Extractions ({selectedInspection?.machine_declarations?.length || 0})
              </button>
              <button
                className={`modal-tab ${detailTab === "compliance" ? "active" : ""}`}
                onClick={() => setDetailTab("compliance")}
              >
                Compliance Findings ({selectedInspection?.compliance_findings?.length || 0})
              </button>
              <button
                className={`modal-tab ${detailTab === "pdf" ? "active" : ""}`}
                onClick={() => setDetailTab("pdf")}
              >
                Final PDF Artifact {selectedInspection?.has_pdf ? "✓" : ""}
              </button>
            </div>

            <div className="modal-body">
              {detailLoading ? (
                <div className="modal-loading-indicator">
                  <span className="pulse-dot"></span> Loading archived database records...
                </div>
              ) : selectedInspection ? (
                <>
                  {/* TAB 1: OVERVIEW & REVIEW */}
                  {detailTab === "overview" && (
                    <div className="detail-section">
                      <h4 className="section-title">Product & Inspection Metadata</h4>
                      <div className="metadata-spec-grid">
                        <div className="spec-card">
                          <label>Product Name</label>
                          <div className="spec-value">{selectedInspection.product_name}</div>
                        </div>
                        <div className="spec-card">
                          <label>Brand Name</label>
                          <div className="spec-value">{selectedInspection.brand_name}</div>
                        </div>
                        <div className="spec-card">
                          <label>Batch Number</label>
                          <div className="spec-value"><code>{selectedInspection.batch_number}</code></div>
                        </div>
                        <div className="spec-card">
                          <label>Packaging Type</label>
                          <div className="spec-value">{selectedInspection.packaging_type}</div>
                        </div>
                        <div className="spec-card">
                          <label>Category</label>
                          <div className="spec-value">{selectedInspection.category}</div>
                        </div>
                        <div className="spec-card">
                          <label>FSSAI License</label>
                          <div className="spec-value">{selectedInspection.fssai_license || "N/A"}</div>
                        </div>
                        <div className="spec-card">
                          <label>Declared Net Quantity</label>
                          <div className="spec-value">{selectedInspection.net_quantity || "N/A"}</div>
                        </div>
                        <div className="spec-card">
                          <label>Primary Inspector</label>
                          <div className="spec-value">{selectedInspection.inspector_name}</div>
                        </div>
                        <div className="spec-card">
                          <label>Created Timestamp</label>
                          <div className="spec-value">{new Date(selectedInspection.created_at).toUTCString()}</div>
                        </div>
                        <div className="spec-card">
                          <label>Completed Timestamp</label>
                          <div className="spec-value">
                            {selectedInspection.completed_at
                              ? new Date(selectedInspection.completed_at).toUTCString()
                              : "Not yet completed"}
                          </div>
                        </div>
                      </div>

                      {/* Review & Workflow Info */}
                      <h4 className="section-title" style={{ marginTop: "1.5rem" }}>Review & Authorization Information</h4>
                      <div className="review-info-card">
                        <div className="review-meta-row">
                          <div>
                            <span className="sub-label">Reviewer:</span>{" "}
                            <strong>{selectedInspection.reviewer_name || "Self / System Verified"}</strong>
                          </div>
                          {selectedInspection.reviewer_role && (
                            <div>
                              <span className="sub-label">Role:</span>{" "}
                              <span className="badge badge-supervisor">{selectedInspection.reviewer_role.toUpperCase()}</span>
                            </div>
                          )}
                          <div>
                            <span className="sub-label">Inspection Status:</span>{" "}
                            {getStatusBadge(selectedInspection.status)}
                          </div>
                        </div>

                        {selectedInspection.notes && (
                          <div className="review-notes-box">
                            <strong>Inspection Notes:</strong> {selectedInspection.notes}
                          </div>
                        )}
                      </div>

                      {/* Status Transition Audit Trail */}
                      <h4 className="section-title" style={{ marginTop: "1.5rem" }}>Status Transition History</h4>
                      {selectedInspection.history && selectedInspection.history.length > 0 ? (
                        <div className="history-timeline">
                          {selectedInspection.history.map((h, idx) => (
                            <div key={idx} className="timeline-item">
                              <div className="timeline-dot"></div>
                              <div className="timeline-content">
                                <div className="timeline-header">
                                  <span className="timeline-transition">
                                    <code>{h.from_status}</code> → <code>{h.to_status}</code>
                                  </span>
                                  <span className="timeline-time">
                                    {new Date(h.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <div className="timeline-user">
                                  Authorized by <strong>{h.changed_by_name}</strong> ({h.changed_by_role})
                                </div>
                                {h.reason_notes && (
                                  <div className="timeline-reason">{h.reason_notes}</div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="empty-subtext">No status transitions recorded.</p>
                      )}
                    </div>
                  )}

                  {/* TAB 2: MACHINE EXTRACTIONS (Phase 6) */}
                  {detailTab === "machine" && (
                    <div className="detail-section">
                      <div className="section-banner-info">
                        ℹ️ <strong>Historical Machine Evidence</strong>: Persisted OCR extractions and inspector verifications.
                        No OCR or model inference was re-run to render this archived view.
                      </div>

                      {selectedInspection.machine_declarations && selectedInspection.machine_declarations.length > 0 ? (
                        <div className="declarations-grid">
                          {selectedInspection.machine_declarations.map((decl) => (
                            <div key={decl.id} className="declaration-card">
                              <div className="decl-header">
                                <span className="decl-label">{decl.field_label || decl.field_name}</span>
                                <span className={`status-pill pill-${decl.status?.toLowerCase()}`}>
                                  {decl.status}
                                </span>
                              </div>
                              <div className="decl-body">
                                <div className="decl-row">
                                  <span className="decl-title">Verified Value:</span>
                                  <div className="decl-val-verified">{decl.verified_value || "—"}</div>
                                </div>
                                <div className="decl-row">
                                  <span className="decl-title">Raw OCR Extraction:</span>
                                  <div className="decl-val-raw">{decl.raw_text || "—"}</div>
                                </div>
                                <div className="decl-meta-row">
                                  <span>OCR Conf: <strong>{Math.round((decl.ocr_confidence || 0) * 100)}%</strong></span>
                                  <span>Extraction Conf: <strong>{Math.round((decl.extraction_confidence || 0) * 100)}%</strong></span>
                                  <span>View: <code>{decl.view_id}</code></span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="empty-state-mini">
                          <p>No structured declarations were persisted for this inspection.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 3: COMPLIANCE FINDINGS (Phase 9) */}
                  {detailTab === "compliance" && (
                    <div className="detail-section">
                      <div className="section-banner-info">
                        ℹ️ <strong>Historical Compliance Findings</strong>: Persisted outcomes evaluated by the deterministic LMPC rule engine.
                        Rules are never recalculated upon viewing historical records.
                      </div>

                      {selectedInspection.compliance_overall_state && (
                        <div className="overall-compliance-banner">
                          Overall Compliance Outcome: {getOutcomeBadge(selectedInspection.compliance_overall_state)}
                        </div>
                      )}

                      {selectedInspection.compliance_findings && selectedInspection.compliance_findings.length > 0 ? (
                        <div className="findings-table-wrap">
                          <table className="findings-table">
                            <thead>
                              <tr>
                                <th>Rule</th>
                                <th>Requirement</th>
                                <th>Outcome</th>
                                <th>Reason & Statutory Basis</th>
                                <th>Severity</th>
                              </tr>
                            </thead>
                            <tbody>
                              {selectedInspection.compliance_findings.map((f) => (
                                <tr key={f.id} className={`finding-row outcome-${f.outcome?.toLowerCase()}`}>
                                  <td className="cell-rule-no">
                                    <strong>{f.rule_no}</strong>
                                    <div className="rule-sub-id">{f.rule_id}</div>
                                  </td>
                                  <td><code>{f.requirement_key}</code></td>
                                  <td>{getOutcomeBadge(f.outcome)}</td>
                                  <td>
                                    <div className="finding-reason-text">{f.reason_text}</div>
                                    {f.reason_code && (
                                      <div className="reason-code-tag">Code: {f.reason_code}</div>
                                    )}
                                  </td>
                                  <td>
                                    <span className={`severity-tag severity-${f.severity?.toLowerCase()}`}>
                                      {f.severity || "info"}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="empty-state-mini">
                          <p>No compliance findings were persisted for this inspection.</p>
                        </div>
                      )}
                    </div>
                  )}

                  {/* TAB 4: FINAL PDF ARTIFACT */}
                  {detailTab === "pdf" && (
                    <div className="detail-section">
                      {selectedInspection.has_pdf ? (
                        <div className="pdf-spec-container">
                          <div className="pdf-success-badge">
                            ✓ Permanent Final PDF Report Available
                          </div>
                          <p className="pdf-spec-desc">
                            This inspection was finalized and permanently written to MySQL BLOB storage. Source images
                            were purged in accordance with PackCheck's temporary-image lifecycle.
                          </p>

                          <div className="hash-verification-box">
                            <label>Cryptographic Fingerprint (SHA-256):</label>
                            <div className="hash-display-row">
                              <code>{selectedInspection.pdf_sha256}</code>
                              <button
                                className="btn-copy"
                                onClick={() => copyToClipboard(selectedInspection.pdf_sha256)}
                              >
                                {copiedHash ? "✓ Copied" : "Copy Hash"}
                              </button>
                            </div>
                            <span className="hash-footnote">
                              Calculated over raw PDF bytes. Verified against database hash on every retrieval.
                            </span>
                          </div>

                          <div className="pdf-meta-pills">
                            <div className="meta-pill">
                              <span className="pill-label">File Size:</span>
                              <span className="pill-val">{Math.round((selectedInspection.pdf_size || 0) / 1024)} KB</span>
                            </div>
                            <div className="meta-pill">
                              <span className="pill-label">Format:</span>
                              <span className="pill-val">Strict PDF / ISO 32000</span>
                            </div>
                            <div className="meta-pill">
                              <span className="pill-label">Storage Backend:</span>
                              <span className="pill-val">MySQL LONGBLOB</span>
                            </div>
                          </div>

                          <div className="pdf-action-buttons">
                            <button
                              className="btn-primary"
                              onClick={() => {
                                setDetailModalOpen(false);
                                handleViewPdf(selectedInspection);
                              }}
                            >
                              👁 Open PDF in Authenticated Viewer
                            </button>
                            <button
                              className="btn-secondary"
                              onClick={() =>
                                handleDownloadPdf(
                                  selectedInspection.inspection_id,
                                  `${selectedInspection.inspection_id}_Final_Report.pdf`
                                )
                              }
                            >
                              ⬇ Download Final Report PDF
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="pdf-unavailable-box">
                          <div className="unavail-icon">📄</div>
                          <h4>No Final PDF Stored</h4>
                          <p>
                            A final verified report has not been generated or finalized for this inspection.
                            Inspections can only be finalized from the active inspection workflow.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </>
              ) : null}
            </div>

            <div className="modal-footer">
              <button className="btn-secondary" onClick={() => setDetailModalOpen(false)}>
                Close Record
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 2. AUTHENTICATED IN-APP PDF VIEWER MODAL (Blob URL with Revocation)      */}
      {/* ========================================================================= */}
      {pdfViewerOpen && (
        <div className="modal-backdrop" onClick={handleClosePdfViewer}>
          <div className="modal-dialog modal-pdf-viewer glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="pdf-viewer-header-info">
                <span className="id-code-badge">{activePdfMeta?.inspection_id}</span>
                <h3>Final Inspection Report</h3>
                {activePdfMeta?.pdf_sha256 && (
                  <span className="sha-short-badge" title={`Full SHA256: ${activePdfMeta.pdf_sha256}`}>
                    SHA256: {activePdfMeta.pdf_sha256.substring(0, 16)}...
                  </span>
                )}
              </div>
              <div className="pdf-viewer-top-actions">
                {pdfBlobUrl && (
                  <>
                    <a
                      href={pdfBlobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-action-outline"
                    >
                      ⤢ Open in New Tab
                    </a>
                    <button
                      className="btn-action-download"
                      onClick={() =>
                        handleDownloadPdf(
                          activePdfMeta.inspection_id,
                          `${activePdfMeta.inspection_id}_Final_Report.pdf`
                        )
                      }
                    >
                      ⬇ Download
                    </button>
                  </>
                )}
                <button className="btn-close" onClick={handleClosePdfViewer}>✕</button>
              </div>
            </div>

            <div className="modal-body modal-body-pdf">
              {pdfLoading ? (
                <div className="pdf-loading-box">
                  <div className="spinner"></div>
                  <p>Authenticating and streaming PDF from MySQL permanent storage...</p>
                  <span className="pdf-security-notice">
                    🔒 Verifying SHA-256 cryptographic checksum prior to rendering...
                  </span>
                </div>
              ) : pdfError ? (
                <div className="pdf-error-box">
                  <div className="error-icon">⚠️</div>
                  <h4>Unable to load PDF Report</h4>
                  <p>{pdfError}</p>
                  <button className="btn-secondary" onClick={handleClosePdfViewer}>
                    Close Viewer
                  </button>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  title={`PDF Report - ${activePdfMeta?.inspection_id}`}
                  className="pdf-iframe"
                />
              ) : null}
            </div>

            <div className="modal-footer pdf-viewer-footer">
              <span className="pdf-audit-notice">
                PackCheck Authenticated Retrieval • Verified Byte-Exact Integrity • Zero Image Dependencies
              </span>
              <button className="btn-secondary" onClick={handleClosePdfViewer}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
