"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

const STATUS_OPTIONS = [
  { value: "", label: "All Statuses" },
  { value: "approved", label: "Approved" },
  { value: "rejected", label: "Rejected" },
  { value: "pending_review", label: "Pending Review" },
  { value: "in_progress", label: "In Progress" },
  { value: "draft", label: "Draft" },
  { value: "reopened", label: "Reopened" },
];

export default function InspectionHistoryViewer({ onOpenInspection }) {
  const { token, isAuthenticated } = useAuth();

  const [inspections, setInspections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(15);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [pdfFilter, setPdfFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  // In-App Authenticated PDF Viewer Modal state
  const [pdfViewerOpen, setPdfViewerOpen] = useState(false);
  const [activePdfMeta, setActivePdfMeta] = useState(null);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState(null);
  const [copiedHash, setCopiedHash] = useState(false);

  // Fetch Inspections List
  const fetchInspections = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);

    try {
      const params = new URLSearchParams();
      params.append("page", page.toString());
      params.append("page_size", pageSize.toString());
      params.append("sort_by", "created_at");
      params.append("sort_dir", "desc");

      if (search.trim()) params.append("search", search.trim());
      if (statusFilter) params.append("status", statusFilter);
      if (dateFrom) params.append("date_from", dateFrom);
      if (dateTo) params.append("date_to", dateTo);
      if (pdfFilter === "true") params.append("has_pdf", "true");
      if (pdfFilter === "false") params.append("has_pdf", "false");

      const res = await fetch(`${API_BASE_URL}/inspections?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        throw new Error(`Failed to load history archive (HTTP ${res.status}).`);
      }

      const data = await res.json();
      setInspections(data.items || []);
      setTotal(data.total || 0);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [token, page, pageSize, search, statusFilter, dateFrom, dateTo, pdfFilter]);

  useEffect(() => {
    fetchInspections();
  }, [fetchInspections]);

  // Clean up PDF blob on unmount or close
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // Authenticated In-App PDF Viewer
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
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (res.status === 404) {
        throw new Error("Final report PDF is unavailable or has not been finalized yet.");
      }
      if (res.status === 500) {
        throw new Error("Cryptographic integrity verification failed on retrieval.");
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

  // Authenticated PDF Download
  const handleDownloadPdf = async (insId, filename) => {
    try {
      const res = await fetch(
        `${API_BASE_URL}/inspections/${insId}/report/pdf?disposition=attachment`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error("Failed to download PDF report.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `${insId}_Final_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      alert(`Download failed: ${err.message}`);
    }
  };

  const closePdfViewer = () => {
    setPdfViewerOpen(false);
    if (pdfBlobUrl) {
      URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(null);
    }
    setActivePdfMeta(null);
  };

  const copyHash = (hash) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

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

  if (!isAuthenticated) {
    return (
      <div className="empty-state-card">
        <Icon name="shield" size={36} className="empty-icon-muted" />
        <h3>Authentication Required</h3>
        <p>Please sign in to access the statutory inspection history and permanent report archive.</p>
      </div>
    );
  }

  return (
    <div className="history-archive-container">
      {/* HEADER */}
      <div className="archive-header-bar">
        <div>
          <h2 className="archive-title">Inspection History & Reports Archive</h2>
          <p className="archive-subtitle">
            Searchable permanent repository of finalized packaging inspections, SHA-256 cryptographic fingerprints, and verified PDF reports.
          </p>
        </div>
      </div>

      {/* FILTER BAR */}
      <div className="archive-filters-bar">
        <div className="search-input-wrapper">
          <Icon name="search" size={16} className="search-icon-inside" />
          <input
            type="text"
            className="search-input-field"
            placeholder="Search archive by ID, product name, batch, or brand..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filters-group-row">
          <select
            className="form-select-sm"
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>

          <select
            className="form-select-sm"
            value={pdfFilter}
            onChange={(e) => {
              setPdfFilter(e.target.value);
              setPage(1);
            }}
          >
            <option value="">All Records</option>
            <option value="true">Final PDF Stored</option>
            <option value="false">Pending Finalization</option>
          </select>

          {(search || statusFilter || pdfFilter || dateFrom || dateTo) && (
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => {
                setSearch("");
                setStatusFilter("");
                setPdfFilter("");
                setDateFrom("");
                setDateTo("");
                setPage(1);
              }}
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}

      {/* ARCHIVE TABLE */}
      <div className="archive-table-card">
        {loading ? (
          <div className="table-loading-box">
            <span className="spinner-lg" />
            <p>Retrieving inspection history archive...</p>
          </div>
        ) : inspections.length === 0 ? (
          <div className="table-empty-box">
            <Icon name="search" size={32} className="empty-icon-muted" />
            <h3>No archive records found</h3>
            <p>No inspection records match the current filter criteria.</p>
          </div>
        ) : (
          <div className="table-responsive-wrapper">
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Inspection ID</th>
                  <th>Product & Brand</th>
                  <th>Batch</th>
                  <th>Status</th>
                  <th>Date</th>
                  <th>Report Storage</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((ins) => (
                  <tr key={ins.inspection_id} className="interactive-row">
                    <td>
                      <span className="record-id-badge font-mono">{ins.inspection_id}</span>
                    </td>
                    <td>
                      <div className="table-main-text">{ins.product_name}</div>
                      <div className="table-sub-text">{ins.brand_name}</div>
                    </td>
                    <td className="font-mono table-code-text">{ins.batch_number}</td>
                    <td>{getStatusBadge(ins.status)}</td>
                    <td>{new Date(ins.created_at).toLocaleDateString()}</td>
                    <td>
                      {ins.has_pdf ? (
                        <div className="report-badge-available" title={`SHA-256: ${ins.pdf_sha256}`}>
                          <Icon name="check" size={12} />
                          <span>PDF Stored ({Math.round((ins.pdf_size || 0) / 1024)} KB)</span>
                        </div>
                      ) : (
                        <span className="report-badge-pending">Not Finalized</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="action-buttons-cell">
                        {ins.has_pdf && (
                          <button
                            type="button"
                            className="btn-text-action"
                            onClick={() => handleViewPdf(ins)}
                            title="Open authenticated PDF viewer"
                          >
                            <Icon name="report" size={14} />
                            <span>View PDF</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="btn-row-action"
                          onClick={() => onOpenInspection && onOpenInspection(ins)}
                          title="Open workspace"
                        >
                          <span>Open</span>
                          <Icon name="arrowRight" size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* PAGINATION */}
        {total > pageSize && (
          <div className="registry-pagination-bar">
            <span className="pagination-text">
              Showing {(page - 1) * pageSize + 1} to {Math.min(page * pageSize, total)} of {total} records
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
                disabled={page * pageSize >= total}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ========================================================================= */}
      {/* AUTHENTICATED IN-APP PDF VIEWER MODAL                                     */}
      {/* ========================================================================= */}
      {pdfViewerOpen && (
        <div className="modal-overlay" onClick={closePdfViewer}>
          <div className="modal-pdf-viewer-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="pdf-dialog-header">
              <div className="dialog-title-group">
                <span className="record-id-badge font-mono">{activePdfMeta?.inspection_id}</span>
                <h3>Final Inspection Report</h3>
                {activePdfMeta?.pdf_sha256 && (
                  <div className="hash-pill" title={activePdfMeta.pdf_sha256}>
                    <span>SHA-256: {activePdfMeta.pdf_sha256.slice(0, 16)}...</span>
                    <button
                      type="button"
                      className="btn-copy-mini"
                      onClick={() => copyHash(activePdfMeta.pdf_sha256)}
                    >
                      <Icon name="copy" size={12} />
                      <span>{copiedHash ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}
              </div>

              <div className="dialog-header-actions">
                {pdfBlobUrl && (
                  <>
                    <a
                      href={pdfBlobUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="btn-secondary btn-sm"
                    >
                      Open in New Tab
                    </a>
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() =>
                        handleDownloadPdf(
                          activePdfMeta?.inspection_id,
                          `${activePdfMeta?.inspection_id}_Final_Report.pdf`
                        )
                      }
                    >
                      <Icon name="download" size={14} />
                      <span>Download</span>
                    </button>
                  </>
                )}
                <button type="button" className="btn-close-dialog" onClick={closePdfViewer}>✕</button>
              </div>
            </div>

            <div className="pdf-dialog-body">
              {pdfLoading ? (
                <div className="pdf-loading-state">
                  <span className="spinner-lg" />
                  <p>Authenticating and streaming PDF report from MySQL storage...</p>
                  <span className="security-note">Verifying SHA-256 checksum prior to display.</span>
                </div>
              ) : pdfError ? (
                <div className="pdf-error-state">
                  <Icon name="alert" size={28} />
                  <h4>Unable to load PDF Report</h4>
                  <p>{pdfError}</p>
                  <button type="button" className="btn-secondary btn-sm" onClick={closePdfViewer}>
                    Close
                  </button>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  title={`PDF Report ${activePdfMeta?.inspection_id}`}
                  className="pdf-dialog-iframe"
                />
              ) : null}
            </div>

            <div className="pdf-dialog-footer">
              <span className="audit-note">
                PackCheck Authenticated Retrieval • Verified Byte-Exact Integrity • Evidence Embedded
              </span>
              <button type="button" className="btn-secondary btn-sm" onClick={closePdfViewer}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
