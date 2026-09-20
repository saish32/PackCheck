"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function ExtractionViewerModal({ inspection, isOpen, onClose, onExtractionUpdated }) {
  const { token, hasRole } = useAuth();
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Active state
  const [selectedView, setSelectedView] = useState("back");
  const [availableViews, setAvailableViews] = useState([]);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all"); // 'all', 'review_required', 'verified', 'unconfirmed'
  const [mobileTab, setMobileTab] = useState("declarations"); // 'evidence' or 'declarations'

  // Image preview state
  const [previewUrls, setPreviewUrls] = useState({});
  const previewUrlsRef = useRef({});
  previewUrlsRef.current = previewUrls;

  // Edit / Verification modal state
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingField, setEditingField] = useState(null);
  const [verifiedInput, setVerifiedInput] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  const canEdit = hasRole(["inspector", "supervisor", "admin"]);
  const insId = inspection?.inspection_id || inspection?.id;

  // Cleanup blob URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((u) => {
        try {
          URL.revokeObjectURL(u);
        } catch (e) {
          // ignore
        }
      });
      previewUrlsRef.current = {};
    };
  }, [insId]);

  // Authenticated fetch for view preview image
  const fetchPreview = useCallback(async (viewId) => {
    if (!insId || !token || previewUrlsRef.current[viewId]) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}/preview`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      setPreviewUrls((prev) => ({ ...prev, [viewId]: objUrl }));
    } catch (e) {
      console.error(`Failed to load preview for ${viewId}:`, e);
    }
  }, [insId, token]);

  // Load available captured views from Phase 5 endpoint
  const loadViews = useCallback(async () => {
    if (!insId || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/views`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const captured = (data.views || []).filter((v) => v.has_capture);
        setAvailableViews(captured);
        if (captured.length > 0) {
          // Default to view with back or first captured view
          const backView = captured.find((v) => v.view_id === "back") || captured[0];
          setSelectedView(backView.view_id);
          captured.forEach((v) => fetchPreview(v.view_id));
        }
      }
    } catch (e) {
      console.error("Failed to load inspection views:", e);
    }
  }, [insId, token, fetchPreview]);

  // Load extracted fields
  const fetchDeclarations = useCallback(async () => {
    if (!insId || !token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/extracted-fields`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        throw new Error(`Failed to load declarations (${res.status})`);
      }
      const data = await res.json();
      setDeclarations(data.declarations || []);
    } catch (err) {
      setErrorMsg(err.message || "Failed to load extracted fields");
    } finally {
      setLoading(false);
    }
  }, [insId, token]);

  // Initial load
  useEffect(() => {
    if (isOpen && insId) {
      loadViews();
      fetchDeclarations();
    }
  }, [isOpen, insId, loadViews, fetchDeclarations]);

  if (!isOpen || !inspection) return null;

  // Run Phase 6 OCR & Field Extraction
  const handleRunExtraction = async () => {
    setExtracting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/extract`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Extraction execution failed");
      }
      setDeclarations(data.declarations || []);
      setSuccessMsg(`Extracted ${data.total_declarations} regulatory declarations (${data.verified_count} verified, ${data.review_required_count} review required).`);
      if (onExtractionUpdated) onExtractionUpdated();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setExtracting(false);
    }
  };

  // Open Edit / Verification Dialog
  const openEditModal = (decl) => {
    setEditingField(decl);
    // Prepopulate with verified_value if present, else normalized representation or raw text
    const initialVal = decl.verified_value || (decl.normalized_value ? JSON.stringify(decl.normalized_value) : (decl.raw_text || ""));
    setVerifiedInput(initialVal);
    setEditNotes("");
    setEditModalOpen(true);
  };

  // Submit Inspector Verification / Correction (Requirement 7 & 8)
  const handleSaveEdit = async (e) => {
    e.preventDefault();
    if (!editingField) return;
    setSubmittingEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/extracted-fields/${editingField.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          verified_value: verifiedInput,
          status: "VERIFIED",
          notes: editNotes
        })
      });
      const updated = await res.json();
      if (!res.ok) {
        throw new Error(updated.detail || "Failed to update declaration");
      }
      setDeclarations((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setEditModalOpen(false);
      setEditingField(null);
      setSuccessMsg(`Declaration '${updated.field_label}' verified and updated.`);
      if (onExtractionUpdated) onExtractionUpdated();
    } catch (err) {
      alert(`Error updating field: ${err.message}`);
    } finally {
      setSubmittingEdit(false);
    }
  };

  // Stats calculation
  const verifiedCount = declarations.filter((d) => d.status === "VERIFIED").length;
  const reviewCount = declarations.filter((d) => d.status === "REVIEW_REQUIRED").length;
  const unconfirmedCount = declarations.filter((d) => d.status === "UNCONFIRMED").length;

  // Filter declarations
  const filteredDeclarations = declarations.filter((d) => {
    if (filterStatus === "review_required") return d.status === "REVIEW_REQUIRED";
    if (filterStatus === "verified") return d.status === "VERIFIED";
    if (filterStatus === "unconfirmed") return d.status === "UNCONFIRMED";
    return true;
  });

  // Bounding boxes for the currently selected view
  const currentViewBBoxes = declarations.filter(
    (d) => d.view_id === selectedView && d.bounding_box && d.bounding_box.normalized
  );

  const selectedViewObj = availableViews.find((v) => v.view_id === selectedView);
  const currentPreviewUrl = previewUrls[selectedView];

  return (
    <div className="modal-overlay">
      <div className="modal-card extraction-modal">
        {/* Header */}
        <div className="extraction-modal-header">
          <div className="extraction-title-group">
            <div className="extraction-badge">Phase 6 Pretrained OCR & Extraction</div>
            <h2 className="extraction-title">📋 Regulatory Declarations Ledger</h2>
            <div className="extraction-meta">
              <span><strong>Inspection:</strong> {insId}</span>
              <span className="dot-divider">•</span>
              <span><strong>Package:</strong> {inspection.packaging_type}</span>
              <span className="dot-divider">•</span>
              <span><strong>Product:</strong> {inspection.product_name}</span>
            </div>
          </div>
          <div className="extraction-header-actions">
            {canEdit && (
              <button
                className="btn-primary btn-sm"
                onClick={handleRunExtraction}
                disabled={extracting || availableViews.length === 0}
                style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}
              >
                {extracting ? "⚡ Extracting..." : "⚡ Run OCR Extraction"}
              </button>
            )}
            <button className="btn-close-evidence" onClick={onClose} aria-label="Close modal">
              ✕
            </button>
          </div>
        </div>

        {/* Stats & Filter Bar */}
        <div className="extraction-summary-bar">
          <div className="extraction-stats-chips">
            <span className="stat-chip stat-total">Total: <strong>{declarations.length}</strong></span>
            <span className="stat-chip stat-verified">✅ Verified: <strong>{verifiedCount}</strong></span>
            <span className="stat-chip stat-review">⚠️ Review Required: <strong>{reviewCount}</strong></span>
            <span className="stat-chip stat-unconfirmed">⚪ Unconfirmed: <strong>{unconfirmedCount}</strong></span>
          </div>

          <div className="extraction-filter-tabs">
            <button
              className={`filter-tab ${filterStatus === "all" ? "active" : ""}`}
              onClick={() => setFilterStatus("all")}
            >
              All ({declarations.length})
            </button>
            <button
              className={`filter-tab ${filterStatus === "review_required" ? "active" : ""}`}
              onClick={() => setFilterStatus("review_required")}
            >
              Review Required ({reviewCount})
            </button>
            <button
              className={`filter-tab ${filterStatus === "verified" ? "active" : ""}`}
              onClick={() => setFilterStatus("verified")}
            >
              Verified ({verifiedCount})
            </button>
            <button
              className={`filter-tab ${filterStatus === "unconfirmed" ? "active" : ""}`}
              onClick={() => setFilterStatus("unconfirmed")}
            >
              Unconfirmed ({unconfirmedCount})
            </button>
          </div>

          {/* Mobile responsive tab toggle */}
          <div className="mobile-view-toggle">
            <button
              className={`toggle-btn ${mobileTab === "declarations" ? "active" : ""}`}
              onClick={() => setMobileTab("declarations")}
            >
              📋 Declarations List ({filteredDeclarations.length})
            </button>
            <button
              className={`toggle-btn ${mobileTab === "evidence" ? "active" : ""}`}
              onClick={() => setMobileTab("evidence")}
            >
              🖼️ Visual Evidence Overlay
            </button>
          </div>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="evidence-error-banner" style={{ margin: "0.5rem 1.5rem" }}>
            <span>❌ {errorMsg}</span>
            <button className="btn-dismiss-error" onClick={() => setErrorMsg(null)}>✕</button>
          </div>
        )}
        {successMsg && (
          <div className="alert-box alert-success" style={{ margin: "0.5rem 1.5rem", borderRadius: "8px" }}>
            <span>{successMsg}</span>
            <button className="btn-dismiss-error" onClick={() => setSuccessMsg(null)}>✕</button>
          </div>
        )}

        {/* Main Body: Dual-Pane Layout */}
        <div className="extraction-body-container">
          {/* LEFT PANE: Interactive Evidence Image with Bounding Boxes */}
          <div className={`extraction-left-pane ${mobileTab === "evidence" ? "mobile-show" : "mobile-hide"}`}>
            <div className="pane-header">
              <h4>Source Evidence & Bounding Boxes</h4>
              {/* View Switcher */}
              <div className="view-selector-btns">
                {availableViews.map((v) => (
                  <button
                    key={v.view_id}
                    className={`btn-view-chip ${selectedView === v.view_id ? "active" : ""}`}
                    onClick={() => setSelectedView(v.view_id)}
                  >
                    {v.title}
                  </button>
                ))}
              </div>
            </div>

            <div className="image-bbox-viewport">
              {currentPreviewUrl ? (
                <div className="image-bbox-wrapper">
                  <img
                    src={currentPreviewUrl}
                    alt={selectedViewObj?.title || "Evidence View"}
                    className="source-evidence-img"
                  />
                  {/* Bounding Box Overlays */}
                  {currentViewBBoxes.map((d) => {
                    const norm = d.bounding_box.normalized;
                    const isSelected = activeFieldId === d.id;
                    const isReview = d.status === "REVIEW_REQUIRED";
                    const isVerified = d.status === "VERIFIED";

                    return (
                      <div
                        key={d.id}
                        className={`bbox-overlay-rect ${
                          isSelected ? "bbox-selected" : isReview ? "bbox-review" : isVerified ? "bbox-verified" : "bbox-unconfirmed"
                        }`}
                        style={{
                          left: `${norm.x_pct}%`,
                          top: `${norm.y_pct}%`,
                          width: `${norm.w_pct}%`,
                          height: `${norm.h_pct}%`
                        }}
                        onClick={() => setActiveFieldId(d.id)}
                        title={`${d.field_label}: ${d.raw_text || "Extracted field"}`}
                      >
                        <span className="bbox-label-tag">{d.field_label}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="evidence-placeholder-box" style={{ height: "100%" }}>
                  <p>No captured image available for view: {selectedView}</p>
                </div>
              )}
            </div>
            <div className="bbox-legend">
              <span className="legend-item"><span className="legend-dot dot-verified"></span> Verified</span>
              <span className="legend-item"><span className="legend-dot dot-review"></span> Review Required</span>
              <span className="legend-item"><span className="legend-dot dot-selected"></span> Selected Field</span>
            </div>
          </div>

          {/* RIGHT PANE: Extracted Regulatory Declarations Ledger */}
          <div className={`extraction-right-pane ${mobileTab === "declarations" ? "mobile-show" : "mobile-hide"}`}>
            {loading ? (
              <div className="evidence-loading-state">
                <div className="loading-spinner"></div>
                <p>Loading extracted declarations...</p>
              </div>
            ) : declarations.length === 0 ? (
              <div className="evidence-empty-filter" style={{ textAlign: "center", padding: "3rem 1rem" }}>
                <p>No declarations extracted yet.</p>
                {canEdit && availableViews.length > 0 && (
                  <button
                    className="btn-primary btn-sm"
                    onClick={handleRunExtraction}
                    disabled={extracting}
                    style={{ marginTop: "1rem" }}
                  >
                    ⚡ Run Pretrained OCR & Extraction
                  </button>
                )}
                {availableViews.length === 0 && (
                  <p className="sub-text" style={{ marginTop: "0.5rem" }}>
                    Please capture packaging views in the Phase 5 Evidence Hub first.
                  </p>
                )}
              </div>
            ) : (
              <div className="declarations-cards-list">
                {filteredDeclarations.map((d) => {
                  const isSelected = activeFieldId === d.id;
                  const isReview = d.status === "REVIEW_REQUIRED";
                  const isVerified = d.status === "VERIFIED";
                  const isUnconfirmed = d.status === "UNCONFIRMED";

                  return (
                    <div
                      key={d.id}
                      className={`declaration-card ${
                        isSelected ? "card-selected" : isReview ? "card-review" : isVerified ? "card-verified" : "card-unconfirmed"
                      }`}
                      onClick={() => {
                        setActiveFieldId(d.id);
                        if (d.view_id && d.view_id !== "all") {
                          setSelectedView(d.view_id);
                        }
                      }}
                    >
                      {/* Card Header */}
                      <div className="decl-card-header">
                        <div className="decl-title-row">
                          <h4 className="decl-field-label">{d.field_label}</h4>
                          <span
                            className={`decl-status-badge ${
                              isVerified ? "badge-verified" : isReview ? "badge-review" : "badge-unconfirmed"
                            }`}
                          >
                            {isVerified && "✅ Verified"}
                            {isReview && "⚠️ Review Required"}
                            {isUnconfirmed && "⚪ Unconfirmed"}
                          </span>
                        </div>
                        <div className="decl-meta-row">
                          <span className="decl-view-tag">Panel: {d.view_id.toUpperCase()}</span>
                          <span className="dot-divider">•</span>
                          <span className="conf-tag">OCR Conf: {Math.round(d.ocr_confidence * 100)}%</span>
                          <span className="dot-divider">•</span>
                          <span className="conf-tag">Match Conf: {Math.round(d.extraction_confidence * 100)}%</span>
                        </div>
                      </div>

                      {/* Card Body */}
                      <div className="decl-card-body">
                        {/* Raw OCR Text (Immutable) */}
                        <div className="decl-data-row">
                          <span className="decl-data-label">Raw OCR Evidence:</span>
                          <div className="raw-ocr-box">
                            {d.raw_text ? `"${d.raw_text}"` : <span className="italic-text">Not detected on package</span>}
                          </div>
                        </div>

                        {/* Normalized Structured Representation */}
                        {d.normalized_value && (
                          <div className="decl-data-row">
                            <span className="decl-data-label">Normalized Value:</span>
                            <div className="normalized-data-val">
                              {d.normalized_value.canonical || JSON.stringify(d.normalized_value)}
                            </div>
                          </div>
                        )}

                        {/* Verified / Corrected Value (Requirement 7) */}
                        {d.is_edited && d.verified_value && (
                          <div className="decl-data-row verified-highlight-row">
                            <span className="decl-data-label">Inspector Verified Value:</span>
                            <div className="verified-data-val">
                              <strong>{d.verified_value}</strong>
                              <span className="edited-badge">✏️ Edited</span>
                            </div>
                          </div>
                        )}

                        {/* Review Required Warning Reasons */}
                        {isReview && d.review_reasons && d.review_reasons.length > 0 && (
                          <div className="decl-alert-reasons">
                            <span className="alert-reason-title">⚠️ Action Required:</span>
                            <ul className="alert-reasons-list">
                              {d.review_reasons.map((r, idx) => (
                                <li key={idx}>
                                  {r === "CONTRADICTORY_VALUES" && "Contradictory values detected across packaging panels."}
                                  {r === "LOW_OCR_CONFIDENCE" && "OCR recognition confidence below statutory threshold (70%)."}
                                  {r === "LOW_EXTRACTION_CONFIDENCE" && "Field pattern structure match is ambiguous."}
                                  {r === "DECLARATION_NOT_FOUND" && "Mandatory declaration could not be located on uploaded panels."}
                                  {!["CONTRADICTORY_VALUES", "LOW_OCR_CONFIDENCE", "LOW_EXTRACTION_CONFIDENCE", "DECLARATION_NOT_FOUND"].includes(r) && r}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {/* Card Footer Actions */}
                      {canEdit && (
                        <div className="decl-card-footer">
                          <button
                            className="btn-text btn-sm"
                            style={{ color: "var(--accent-primary)", fontWeight: 600 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              openEditModal(d);
                            }}
                          >
                            ✏️ Verify / Correct Field
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="evidence-modal-footer">
          <div className="footer-status-summary">
            <span>
              <strong>{verifiedCount}</strong> verified declarations •{" "}
              <strong style={{ color: reviewCount > 0 ? "var(--badge-warning-text)" : "inherit" }}>
                {reviewCount}
              </strong>{" "}
              requiring review.
            </span>
          </div>
          <div className="footer-btn-group">
            <button className="btn-primary" onClick={onClose}>
              Done & Close
            </button>
          </div>
        </div>
      </div>

      {/* INSPECTOR VERIFICATION / CORRECTION MODAL (Requirement 7 & 8) */}
      {editModalOpen && editingField && (
        <div className="modal-backdrop" onClick={() => setEditModalOpen(false)}>
          <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "540px" }}>
            <div className="modal-header">
              <h3 className="modal-title">Verify Declaration: {editingField.field_label}</h3>
              <button className="btn-close" onClick={() => setEditModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleSaveEdit}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Original Raw OCR Text (Immutable Evidence):</label>
                <div className="raw-ocr-box" style={{ background: "var(--bg-input)", padding: "0.5rem" }}>
                  {editingField.raw_text || "None (Undetected)"}
                </div>
              </div>

              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Verified / Corrected Regulatory Value *</label>
                <input
                  type="text"
                  className="form-input"
                  value={verifiedInput}
                  onChange={(e) => setVerifiedInput(e.target.value)}
                  placeholder="Enter the verified packaging value..."
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: "1.25rem" }}>
                <label className="form-label">Audit Justification Notes</label>
                <textarea
                  className="form-input form-textarea"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Explain source of truth or reason for verification..."
                  rows={2}
                />
              </div>

              <div className="modal-actions">
                <button type="button" className="btn-secondary" onClick={() => setEditModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={submittingEdit}>
                  {submittingEdit ? "Saving Verification..." : "Confirm & Verify Field"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
