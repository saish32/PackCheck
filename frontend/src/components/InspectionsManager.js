"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";
import EvidenceCaptureModal from "./EvidenceCaptureModal";
import ExtractionViewerModal from "./ExtractionViewerModal";
import ComplianceWorkspaceModal from "./ComplianceWorkspaceModal";

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

export default function InspectionsManager() {
  const { user, token, isAuthenticated, hasRole } = useAuth();
  const [inspections, setInspections] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [errorMsg, setErrorMsg] = useState(null);

  // Modals state
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [detailModalOpen, setDetailModalOpen] = useState(false);
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [evidenceModalOpen, setEvidenceModalOpen] = useState(false);
  const [evidenceInspection, setEvidenceInspection] = useState(null);
  const [extractionModalOpen, setExtractionModalOpen] = useState(false);
  const [extractionInspection, setExtractionInspection] = useState(null);
  const [complianceModalOpen, setComplianceModalOpen] = useState(false);
  const [complianceInspection, setComplianceInspection] = useState(null);

  const openEvidenceCapture = (ins) => {
    setEvidenceInspection(ins);
    setEvidenceModalOpen(true);
  };

  const openExtractionViewer = (ins) => {
    setExtractionInspection(ins);
    setExtractionModalOpen(true);
  };

  const openComplianceWorkspace = (ins) => {
    setComplianceInspection(ins);
    setComplianceModalOpen(true);
  };

  // New inspection form state
  const [formName, setFormName] = useState("");
  const [formProduct, setFormProduct] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formBatch, setFormBatch] = useState("");
  const [formPkgType, setFormPkgType] = useState("Flexible Pouch");
  const [formCategory, setFormCategory] = useState("Packaged Food & Snacks");
  const [formFssai, setFormFssai] = useState("");
  const [formNetQty, setFormNetQty] = useState("");
  const [formNotes, setFormNotes] = useState("");
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Permissions check
  const canCreate = hasRole(["inspector", "supervisor", "admin"]);
  const isSupervisorOrAdmin = hasRole(["supervisor", "admin"]);

  const fetchInspections = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        page_size: "10",
        sort_by: "created_at",
        sort_dir: "desc"
      });
      if (statusFilter) params.append("status", statusFilter);
      if (search) params.append("search", search);

      const res = await fetch(`${API_BASE_URL}/inspections?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to load inspections.");
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

  const openInspectionDetail = async (inspectionId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to fetch inspection details.");
      }
      const data = await res.json();
      setSelectedInspection(data);
      setDetailModalOpen(true);
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    setFormSubmitting(true);
    try {
      const payload = {
        name: formName,
        product_name: formProduct,
        brand_name: formBrand,
        batch_number: formBatch,
        packaging_type: formPkgType,
        category: formCategory,
        fssai_license: formFssai || null,
        net_quantity: formNetQty || null,
        notes: formNotes || null
      };

      const res = await fetch(`${API_BASE_URL}/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Failed to create inspection.");
      }

      setCreateModalOpen(false);
      resetForm();
      fetchInspections();
    } catch (err) {
      alert(`Create Error: ${err.message}`);
    } finally {
      setFormSubmitting(false);
    }
  };

  const resetForm = () => {
    setFormName("");
    setFormProduct("");
    setFormBrand("");
    setFormBatch("");
    setFormFssai("");
    setFormNetQty("");
    setFormNotes("");
  };

  const handleStatusTransition = async (targetStatus, notes) => {
    if (!selectedInspection) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${selectedInspection.inspection_id}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ to_status: targetStatus, notes: notes || null })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Status transition failed.");
      }

      openInspectionDetail(selectedInspection.inspection_id);
      fetchInspections();
    } catch (err) {
      alert(`Transition Error: ${err.message}`);
    }
  };

  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!selectedInspection) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${selectedInspection.inspection_id}/reopen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ reason: reopenReason })
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Reopen failed.");
      }

      setReopenModalOpen(false);
      setReopenReason("");
      openInspectionDetail(selectedInspection.inspection_id);
      fetchInspections();
    } catch (err) {
      alert(`Reopen Error: ${err.message}`);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case "draft": return <span className="status-pill status-draft">Draft</span>;
      case "in_progress": return <span className="status-pill status-progress">In Progress</span>;
      case "pending_review": return <span className="status-pill status-review">Pending Review</span>;
      case "approved": return <span className="status-pill status-approved">Approved</span>;
      case "rejected": return <span className="status-pill status-rejected">Rejected</span>;
      case "reopened": return <span className="status-pill status-reopened">Reopened</span>;
      default: return <span className="status-pill">{status}</span>;
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="glass-card page-card empty-state-card">
        <div className="empty-icon">🔐</div>
        <h3>Authentication Required</h3>
        <p>Please sign in using your PackCheck credentials or select a demo role to view inspections.</p>
      </div>
    );
  }

  return (
    <div className="inspections-container">
      {/* Control Bar */}
      <div className="glass-card section-header-bar">
        <div className="section-title-box">
          <h2>Inspection Management & History</h2>
          <p>
            {hasRole("inspector")
              ? "Scoped View: Displaying inspections authored by or assigned to you."
              : "System View: Full organizational oversight with role authorization."}
          </p>
        </div>

        {canCreate ? (
          <button
            className="btn-primary"
            onClick={() => setCreateModalOpen(true)}
          >
            + Create New Inspection
          </button>
        ) : (
          <div className="badge badge-idle" title="Auditors and Rule Managers have read-only access.">
            🔒 Read-Only Role Access
          </div>
        )}
      </div>

      {/* Filter & Search Bar */}
      <div className="glass-card filters-bar">
        <div className="search-box">
          <input
            type="text"
            className="form-input"
            placeholder="Search by name, brand, product, batch or ID..."
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
          />
        </div>

        <div className="filter-chips">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              className={`chip-btn ${statusFilter === opt.value ? "active" : ""}`}
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
        <div className="alert-box alert-danger">
          ⚠️ {errorMsg}
        </div>
      )}

      {/* Inspections Table */}
      <div className="glass-card table-wrapper">
        {loading ? (
          <div className="loading-state">Loading inspections...</div>
        ) : inspections.length === 0 ? (
          <div className="empty-state">
            <p>No inspection records found matching the criteria.</p>
            {canCreate && (
              <button
                className="btn-primary btn-sm"
                onClick={() => setCreateModalOpen(true)}
                style={{ marginTop: "1rem" }}
              >
                Create First Inspection
              </button>
            )}
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Inspection ID</th>
                <th>Inspection Name</th>
                <th>Product & Brand</th>
                <th>Packaging</th>
                <th>Status</th>
                <th>Inspector</th>
                <th>Date</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {inspections.map((ins) => (
                <tr key={ins.inspection_id}>
                  <td>
                    <span className="mono-badge">{ins.inspection_id}</span>
                  </td>
                  <td>
                    <strong>{ins.name}</strong>
                  </td>
                  <td>
                    <div>{ins.product_name}</div>
                    <span className="sub-text">{ins.brand_name} • {ins.batch_number}</span>
                  </td>
                  <td>
                    <div>{ins.packaging_type}</div>
                    <span className="sub-text">{ins.category}</span>
                  </td>
                  <td>{getStatusBadge(ins.status)}</td>
                  <td>{ins.inspector_name}</td>
                  <td>{new Date(ins.created_at).toLocaleDateString()}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <button
                      className="btn-text"
                      style={{ color: "var(--accent-primary)", fontWeight: 600, marginRight: "0.65rem" }}
                      onClick={() => openEvidenceCapture(ins)}
                      title="Open Multi-View Evidence Capture"
                    >
                      📸 Evidence
                    </button>
                    <button
                      className="btn-text"
                      style={{ color: "#8b5cf6", fontWeight: 600, marginRight: "0.65rem" }}
                      onClick={() => openExtractionViewer(ins)}
                      title="Open Phase 6 Regulatory Declarations Ledger"
                    >
                      📋 Declarations
                    </button>
                    <button
                      className="btn-text"
                      style={{ color: "#059669", fontWeight: 600, marginRight: "0.65rem" }}
                      onClick={() => openComplianceWorkspace(ins)}
                      title="Open Phases 7-9 Checklist & Compliance Hub"
                    >
                      ⚖️ Compliance
                    </button>
                    {ins.status === "approved" && (
                      <button
                        className="btn-text"
                        style={{ color: "#d97706", fontWeight: 600, marginRight: "0.65rem" }}
                        onClick={() => openComplianceWorkspace(ins)}
                        title="View Final Inspection Report & Download PDF"
                      >
                        📄 Report
                      </button>
                    )}
                    <button
                      className="btn-text"
                      onClick={() => openInspectionDetail(ins.inspection_id)}
                    >
                      View & Manage →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Pagination Bar */}
        {total > 10 && (
          <div className="pagination-bar">
            <span className="pagination-info">
              Showing {(page - 1) * 10 + 1} to {Math.min(page * 10, total)} of {total} inspections
            </span>
            <div className="pagination-btns">
              <button
                className="btn-page"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span className="page-indicator">Page {page}</span>
              <button
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

      {/* CREATE INSPECTION MODAL */}
      {createModalOpen && (
        <div className="modal-backdrop" onClick={() => setCreateModalOpen(false)}>
          <div className="modal-content glass-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <h3 className="modal-title">New Packaging Inspection</h3>
                <p className="modal-subtitle">Initializes an immutable record in Draft state</p>
              </div>
              <button className="btn-close" onClick={() => setCreateModalOpen(false)}>✕</button>
            </div>

            <form onSubmit={handleCreateSubmit} className="inspection-form">
              <div className="form-grid">
                <div className="form-group form-col-span-2">
                  <label className="form-label">Inspection Title / Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Britannia Bourbon 150g Batch Q3 Compliance Audit"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Product Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formProduct}
                    onChange={(e) => setFormProduct(e.target.value)}
                    placeholder="e.g. Bourbon Chocolate Biscuits"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Brand Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formBrand}
                    onChange={(e) => setFormBrand(e.target.value)}
                    placeholder="e.g. Britannia"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Batch / Lot Number *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formBatch}
                    onChange={(e) => setFormBatch(e.target.value)}
                    placeholder="e.g. BATCH-2026-B9"
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Packaging Type *</label>
                  <select
                    className="form-input"
                    value={formPkgType}
                    onChange={(e) => setFormPkgType(e.target.value)}
                  >
                    <option value="Flexible Pouch">Flexible Pouch / Wrapper</option>
                    <option value="Corrugated Carton">Corrugated Carton / Box</option>
                    <option value="Glass Bottle">Glass Bottle / Jar</option>
                    <option value="Tetra Pak">Tetra Pak / Aseptic Brick</option>
                    <option value="Rigid Plastic Container">Rigid Plastic Container</option>
                    <option value="Metal Can">Metal Can / Tin</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Regulatory Category *</label>
                  <select
                    className="form-input"
                    value={formCategory}
                    onChange={(e) => setFormCategory(e.target.value)}
                  >
                    <option value="Packaged Food & Snacks">Packaged Food & Snacks</option>
                    <option value="Beverages & Juices">Beverages & Juices</option>
                    <option value="Dairy & Milk Products">Dairy & Milk Products</option>
                    <option value="Pharmaceuticals">Pharmaceuticals</option>
                    <option value="Personal Care & Cosmetics">Personal Care & Cosmetics</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">FSSAI License / Reg. No.</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formFssai}
                    onChange={(e) => setFormFssai(e.target.value)}
                    placeholder="e.g. 10014022002345"
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Net Quantity / Declared Weight</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formNetQty}
                    onChange={(e) => setFormNetQty(e.target.value)}
                    placeholder="e.g. 150 g / 5.29 oz"
                  />
                </div>

                <div className="form-group form-col-span-2">
                  <label className="form-label">Preliminary Audit Notes</label>
                  <textarea
                    className="form-input form-textarea"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Describe inspection context, source batch location, or initial observations..."
                  />
                </div>
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreateModalOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn-primary"
                  disabled={formSubmitting}
                >
                  {formSubmitting ? "Creating..." : "Create Inspection Record"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DETAIL & HISTORY MODAL */}
      {detailModalOpen && selectedInspection && (
        <div className="modal-backdrop" onClick={() => setDetailModalOpen(false)}>
          <div className="modal-content glass-card modal-lg" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.25rem" }}>
                  <span className="mono-badge">{selectedInspection.inspection_id}</span>
                  {getStatusBadge(selectedInspection.status)}
                </div>
                <h3 className="modal-title">{selectedInspection.name}</h3>
              </div>
              <button className="btn-close" onClick={() => setDetailModalOpen(false)}>✕</button>
            </div>

            <div className="detail-sections-container">
              {/* Product Info Grid */}
              <div className="info-grid">
                <div className="info-item">
                  <span className="info-label">Product Name</span>
                  <span className="info-value">{selectedInspection.product_name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Brand Name</span>
                  <span className="info-value">{selectedInspection.brand_name}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Batch Number</span>
                  <span className="info-value">{selectedInspection.batch_number}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Packaging Type</span>
                  <span className="info-value">{selectedInspection.packaging_type}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Regulatory Category</span>
                  <span className="info-value">{selectedInspection.category}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">FSSAI License</span>
                  <span className="info-value">{selectedInspection.fssai_license || "Not Specified"}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Declared Net Weight</span>
                  <span className="info-value">{selectedInspection.net_quantity || "Not Specified"}</span>
                </div>
                <div className="info-item">
                  <span className="info-label">Lead Inspector</span>
                  <span className="info-value">{selectedInspection.inspector_name}</span>
                </div>
              </div>

              {selectedInspection.notes && (
                <div className="notes-box">
                  <strong>Notes:</strong> {selectedInspection.notes}
                </div>
              )}

              {/* Action Bar based on State Machine & Role */}
              <div className="lifecycle-action-bar">
                <h4>Inspection Actions & Workflow</h4>
                <div className="lifecycle-btn-group">
                  {/* Phase 5 Evidence Capture Hub Button */}
                  <button
                    className="btn-primary btn-sm"
                    style={{ background: "linear-gradient(135deg, #2563eb, #0d9488)", border: "none" }}
                    onClick={() => openEvidenceCapture(selectedInspection)}
                  >
                    📸 Evidence Capture Hub
                  </button>

                  {/* Phase 6 Regulatory Declarations Ledger Button */}
                  <button
                    className="btn-primary btn-sm"
                    style={{ background: "linear-gradient(135deg, #7c3aed, #2563eb)", border: "none" }}
                    onClick={() => openExtractionViewer(selectedInspection)}
                  >
                    📋 Declarations Ledger
                  </button>

                  {/* Phase 8/9 Regulatory Checklist & Compliance Hub Button */}
                  <button
                    className="btn-primary btn-sm"
                    style={{ background: "linear-gradient(135deg, #059669, #0284c7)", border: "none" }}
                    onClick={() => openComplianceWorkspace(selectedInspection)}
                  >
                    ⚖️ Checklist & Compliance Hub
                  </button>

                  {/* Draft -> Pending Review */}
                  {selectedInspection.status === "draft" && canCreate && (
                    <button
                      className="btn-secondary btn-sm"
                      onClick={() => handleStatusTransition("pending_review", "Inspection drafted and submitted for supervisor review")}
                    >
                      📤 Submit for Review
                    </button>
                  )}

                  {/* Supervisor/Admin Review Controls */}
                  {selectedInspection.status === "pending_review" && isSupervisorOrAdmin && (
                    <>
                      <button
                        className="btn-success btn-sm"
                        onClick={() => handleStatusTransition("approved", "Packaging compliance verified and approved.")}
                      >
                        ✅ Approve Inspection
                      </button>
                      <button
                        className="btn-danger btn-sm"
                        onClick={() => handleStatusTransition("rejected", "Packaging compliance audit rejected due to non-conformances.")}
                      >
                        ❌ Reject Inspection
                      </button>
                      <button
                        className="btn-secondary btn-sm"
                        onClick={() => handleStatusTransition("in_progress", "Returned to field inspector for additional evidence.")}
                      >
                        ↩ Return to In-Progress
                      </button>
                    </>
                  )}

                  {/* Reopen Finalized Inspection */}
                  {(selectedInspection.status === "approved" || selectedInspection.status === "rejected") && canCreate && (
                    <button
                      className="btn-warning btn-sm"
                      onClick={() => setReopenModalOpen(true)}
                    >
                      🔄 Reopen Inspection
                    </button>
                  )}

                  {/* Reopened -> Pending Review */}
                  {selectedInspection.status === "reopened" && canCreate && (
                    <button
                      className="btn-primary btn-sm"
                      onClick={() => handleStatusTransition("pending_review", "Re-inspected and re-submitted for supervisor review")}
                    >
                      📤 Re-Submit for Review
                    </button>
                  )}
                </div>
              </div>

              {/* Phase 4 History Timeline */}
              <div className="history-timeline-section">
                <h4>📜 Audit History & Status Timeline</h4>
                {selectedInspection.history && selectedInspection.history.length > 0 ? (
                  <div className="timeline-flow">
                    {selectedInspection.history.map((h) => (
                      <div key={h.id} className="timeline-item">
                        <div className="timeline-dot"></div>
                        <div className="timeline-body">
                          <div className="timeline-header">
                            <span className="timeline-change">
                              <strong>{h.from_status.toUpperCase()}</strong> ➔ <strong>{h.to_status.toUpperCase()}</strong>
                            </span>
                            <span className="timeline-time">
                              {new Date(h.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="timeline-actor">
                            Modified by: <strong>{h.changed_by_name}</strong> ({h.changed_by_role})
                          </div>
                          {h.reason_notes && (
                            <div className="timeline-notes">"{h.reason_notes}"</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="sub-text">No history entries recorded yet.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REOPEN JUSTIFICATION MODAL */}
      {reopenModalOpen && selectedInspection && (
        <div className="modal-backdrop" onClick={() => setReopenModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3 className="modal-title">Reopen Inspection</h3>
              <button className="btn-close" onClick={() => setReopenModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleReopenSubmit}>
              <p className="modal-subtitle" style={{ marginBottom: "1rem" }}>
                Reopening record <strong>{selectedInspection.inspection_id}</strong> requires a mandatory regulatory justification.
              </p>
              <div className="form-group">
                <label className="form-label">Justification / Reason *</label>
                <textarea
                  className="form-input form-textarea"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="State why this completed inspection is being reopened for review..."
                  required
                  minLength={3}
                />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setReopenModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-warning">
                  Confirm Reopen
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PHASE 5 MULTI-VIEW EVIDENCE CAPTURE MODAL */}
      {evidenceModalOpen && evidenceInspection && (
        <EvidenceCaptureModal
          isOpen={evidenceModalOpen}
          inspection={evidenceInspection}
          onClose={() => {
            setEvidenceModalOpen(false);
            setEvidenceInspection(null);
          }}
          onEvidenceUpdated={() => {
            fetchInspections();
            if (selectedInspection) {
              openInspectionDetail(selectedInspection.inspection_id);
            }
          }}
        />
      )}

      {/* PHASE 6 PRETRAINED OCR & STRUCTURED FIELD EXTRACTION MODAL */}
      {extractionModalOpen && extractionInspection && (
        <ExtractionViewerModal
          isOpen={extractionModalOpen}
          inspection={extractionInspection}
          onClose={() => {
            setExtractionModalOpen(false);
            setExtractionInspection(null);
          }}
          onExtractionUpdated={() => {
            fetchInspections();
            if (selectedInspection) {
              openInspectionDetail(selectedInspection.inspection_id);
            }
          }}
        />
      )}

      {/* Phases 7-9 Regulatory Checklist & Compliance Workspace Modal */}
      {complianceModalOpen && complianceInspection && (
        <ComplianceWorkspaceModal
          isOpen={complianceModalOpen}
          inspection={complianceInspection}
          onClose={() => {
            setComplianceModalOpen(false);
            setComplianceInspection(null);
          }}
        />
      )}
    </div>
  );
}
