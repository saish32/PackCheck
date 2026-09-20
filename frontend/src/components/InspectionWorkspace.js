"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function InspectionWorkspace({
  inspectionId,
  initialTab = "summary",
  onBack,
  onInspectionUpdated
}) {
  const { token, hasRole, user } = useAuth();
  const [activeTab, setActiveTab] = useState(initialTab);
  const [inspection, setInspection] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Role permissions
  const canEdit = hasRole(["inspector", "supervisor", "admin"]);
  const isSupervisorOrAdmin = hasRole(["supervisor", "admin"]);

  // Fetch full inspection record
  const fetchInspection = useCallback(async () => {
    if (!inspectionId || !token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`Failed to load inspection ${inspectionId} (HTTP ${res.status})`);
      }
      const data = await res.json();
      setInspection(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  }, [inspectionId, token]);

  useEffect(() => {
    fetchInspection();
  }, [fetchInspection]);

  // Keep tab updated if initialTab prop changes
  useEffect(() => {
    if (initialTab) setActiveTab(initialTab);
  }, [initialTab]);

  // Status transitions
  const handleStatusTransition = async (toStatus, notes) => {
    if (!inspectionId || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/status`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ to_status: toStatus, notes: notes || null }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Status transition failed.");
      }
      setSuccessMsg(`Status updated to ${toStatus.replace("_", " ").toUpperCase()}`);
      await fetchInspection();
      if (onInspectionUpdated) onInspectionUpdated();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  // Reopen Justification Modal state
  const [reopenModalOpen, setReopenModalOpen] = useState(false);
  const [reopenReason, setReopenReason] = useState("");
  const [reopening, setReopening] = useState(false);

  const handleReopenSubmit = async (e) => {
    e.preventDefault();
    if (!reopenReason.trim() || reopenReason.trim().length < 3) {
      setErrorMsg("A detailed regulatory justification of at least 3 characters is mandatory to reopen a finalized record.");
      return;
    }
    setReopening(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${inspectionId}/reopen`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ reason: reopenReason.trim() }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Reopen failed.");
      }
      setReopenModalOpen(false);
      setReopenReason("");
      setSuccessMsg("Inspection reopened. Record returned to active workflow.");
      await fetchInspection();
      if (onInspectionUpdated) onInspectionUpdated();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setReopening(false);
    }
  };

  if (loading && !inspection) {
    return (
      <div className="workspace-loading-state">
        <span className="spinner-lg" />
        <p>Loading inspection record {inspectionId}...</p>
      </div>
    );
  }

  if (errorMsg && !inspection) {
    return (
      <div className="workspace-error-state">
        <Icon name="alert" size={32} />
        <h3>Unable to load inspection</h3>
        <p>{errorMsg}</p>
        <button type="button" className="btn-secondary" onClick={onBack}>
          ← Back to Registry
        </button>
      </div>
    );
  }

  return (
    <div className="inspection-workspace-root">
      {/* RECORD HEADER CONTEXT BAR */}
      <header className="workspace-record-header">
        <div className="record-header-left">
          <button type="button" className="btn-back-link" onClick={onBack} aria-label="Return to inspection list">
            <Icon name="arrowLeft" size={16} />
            <span>Inspections</span>
          </button>

          <div className="record-identity-group">
            <div className="id-badge-row">
              <span className="record-id-badge font-mono">{inspection?.inspection_id}</span>
              <span className={`status-pill status-${(inspection?.status || "draft").toLowerCase()}`}>
                {(inspection?.status || "draft").replace("_", " ")}
              </span>
            </div>
            <h1 className="record-title">{inspection?.name || inspection?.product_name}</h1>
            <div className="record-subtitle">
              <span><strong>Product:</strong> {inspection?.product_name}</span>
              <span className="divider">•</span>
              <span><strong>Brand:</strong> {inspection?.brand_name}</span>
              <span className="divider">•</span>
              <span><strong>Batch:</strong> {inspection?.batch_number}</span>
              <span className="divider">•</span>
              <span><strong>Packaging:</strong> {inspection?.packaging_type}</span>
              <span className="divider">•</span>
              <span><strong>Inspector:</strong> {inspection?.inspector_name}</span>
            </div>
          </div>
        </div>

        {/* LIFECYCLE ACTION CONTROLS */}
        <div className="record-header-actions">
          {/* Draft -> Submit for Review */}
          {inspection?.status === "draft" && canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => handleStatusTransition("pending_review", "Inspection drafted and submitted for supervisor review.")}
            >
              Submit for Review
            </button>
          )}

          {/* Pending Review Controls (Supervisor / Admin) */}
          {inspection?.status === "pending_review" && isSupervisorOrAdmin && (
            <div className="supervisor-actions-group">
              <button
                type="button"
                className="btn-success btn-sm"
                onClick={() => handleStatusTransition("approved", "Packaging compliance verified and approved.")}
              >
                Approve Inspection
              </button>
              <button
                type="button"
                className="btn-danger btn-sm"
                onClick={() => handleStatusTransition("rejected", "Packaging compliance rejected due to non-conformances.")}
              >
                Reject Inspection
              </button>
              <button
                type="button"
                className="btn-secondary btn-sm"
                onClick={() => handleStatusTransition("in_progress", "Returned to field inspector for additional evidence.")}
              >
                Return to In-Progress
              </button>
            </div>
          )}

          {/* Reopen Action for Finalized Records */}
          {(inspection?.status === "approved" || inspection?.status === "rejected") && canEdit && (
            <button
              type="button"
              className="btn-warning btn-sm"
              onClick={() => setReopenModalOpen(true)}
            >
              Reopen Record
            </button>
          )}

          {/* Reopened -> Re-submit */}
          {inspection?.status === "reopened" && canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => handleStatusTransition("pending_review", "Re-inspected and re-submitted for supervisor review.")}
            >
              Re-Submit for Review
            </button>
          )}
        </div>
      </header>

      {/* FEEDBACK BANNERS */}
      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="alert-banner alert-success">
          <Icon name="check" size={16} />
          <span>{successMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setSuccessMsg(null)}>✕</button>
        </div>
      )}

      {/* WORKSPACE NAVIGATION TABS */}
      <nav className="workspace-tabs-strip" aria-label="Inspection Sections">
        {[
          { id: "summary", label: "Summary", icon: "document" },
          { id: "evidence", label: "Evidence", icon: "evidence" },
          { id: "declarations", label: "Declarations", icon: "declarations" },
          { id: "compliance", label: "Compliance", icon: "compliance" },
          { id: "report", label: "Report", icon: "report" },
          { id: "activity", label: "Activity", icon: "activity" },
        ].map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className={`workspace-tab-item ${isActive ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={isActive ? "page" : undefined}
            >
              <Icon name={tab.icon} size={16} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* WORKSPACE TAB CONTENT PANELS */}
      <div className="workspace-tab-content">
        {activeTab === "summary" && (
          <SummaryTab
            inspection={inspection}
            canEdit={canEdit}
            onNavigateTab={setActiveTab}
          />
        )}

        {activeTab === "evidence" && (
          <EvidenceTab
            inspection={inspection}
            canEdit={canEdit}
            onUpdate={fetchInspection}
          />
        )}

        {activeTab === "declarations" && (
          <DeclarationsTab
            inspection={inspection}
            canEdit={canEdit}
            onUpdate={fetchInspection}
          />
        )}

        {activeTab === "compliance" && (
          <ComplianceTab
            inspection={inspection}
            canEdit={canEdit}
            onUpdate={fetchInspection}
          />
        )}

        {activeTab === "report" && (
          <ReportTab
            inspection={inspection}
            canEdit={canEdit}
            onUpdate={fetchInspection}
          />
        )}

        {activeTab === "activity" && (
          <ActivityTab inspection={inspection} />
        )}
      </div>

      {/* REOPEN JUSTIFICATION MODAL */}
      {reopenModalOpen && (
        <div className="modal-overlay" onClick={() => setReopenModalOpen(false)}>
          <div className="modal-dialog-box" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "500px" }}>
            <div className="modal-dialog-header">
              <h3>Reopen Inspection Record</h3>
              <button type="button" className="btn-close-dialog" onClick={() => setReopenModalOpen(false)}>✕</button>
            </div>
            <form onSubmit={handleReopenSubmit}>
              <p className="modal-dialog-desc">
                Reopening finalized record <strong className="font-mono">{inspection?.inspection_id}</strong> requires an authoritative regulatory justification recorded in the immutable audit ledger.
              </p>
              <div className="form-group" style={{ marginTop: "1rem" }}>
                <label className="form-label" htmlFor="reopen-reason">
                  Regulatory Justification / Reason <span className="req-marker">*</span>
                </label>
                <textarea
                  id="reopen-reason"
                  className="form-textarea"
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="State the statutory reason, additional physical evidence received, or supervisor directive..."
                  rows={3}
                  required
                  minLength={3}
                />
              </div>
              <div className="modal-dialog-actions">
                <button type="button" className="btn-secondary" onClick={() => setReopenModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-warning" disabled={reopening}>
                  {reopening ? "Reopening..." : "Confirm Reopen"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TAB 1: SUMMARY TAB
// ============================================================================
function SummaryTab({ inspection, canEdit, onNavigateTab }) {
  return (
    <div className="tab-pane-summary">
      <div className="summary-grid">
        {/* Identity & Product Card */}
        <section className="enterprise-panel">
          <div className="panel-header">
            <h3>Packaging & Product Parameters</h3>
          </div>
          <div className="panel-body">
            <dl className="key-value-list">
              <div className="kv-row">
                <dt>Product Name</dt>
                <dd>{inspection.product_name}</dd>
              </div>
              <div className="kv-row">
                <dt>Brand Name</dt>
                <dd>{inspection.brand_name}</dd>
              </div>
              <div className="kv-row">
                <dt>Batch / Lot Number</dt>
                <dd className="font-mono">{inspection.batch_number}</dd>
              </div>
              <div className="kv-row">
                <dt>Packaging Material</dt>
                <dd>{inspection.packaging_type}</dd>
              </div>
              <div className="kv-row">
                <dt>Commodity Category</dt>
                <dd>{inspection.category}</dd>
              </div>
              <div className="kv-row">
                <dt>Declared Net Quantity</dt>
                <dd>{inspection.net_quantity || "Not Specified"}</dd>
              </div>
              <div className="kv-row">
                <dt>FSSAI License / Reg.</dt>
                <dd className="font-mono">{inspection.fssai_license || "Not Specified"}</dd>
              </div>
            </dl>
          </div>
        </section>

        {/* Ownership & Timeline Card */}
        <section className="enterprise-panel">
          <div className="panel-header">
            <h3>Inspection Governance & Ownership</h3>
          </div>
          <div className="panel-body">
            <dl className="key-value-list">
              <div className="kv-row">
                <dt>Lead Field Inspector</dt>
                <dd>{inspection.inspector_name}</dd>
              </div>
              <div className="kv-row">
                <dt>Record Created</dt>
                <dd>{new Date(inspection.created_at).toLocaleString()}</dd>
              </div>
              <div className="kv-row">
                <dt>Last Modified</dt>
                <dd>{new Date(inspection.updated_at).toLocaleString()}</dd>
              </div>
              <div className="kv-row">
                <dt>Completed / Finalized</dt>
                <dd>{inspection.completed_at ? new Date(inspection.completed_at).toLocaleString() : "Active Record"}</dd>
              </div>
            </dl>

            {inspection.notes && (
              <div className="notes-callout" style={{ marginTop: "1rem" }}>
                <strong>Preliminary Notes:</strong> {inspection.notes}
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Quick Stage Shortcuts */}
      <section className="enterprise-panel" style={{ marginTop: "1.25rem" }}>
        <div className="panel-header">
          <h3>Inspection Workflow Navigation</h3>
        </div>
        <div className="workflow-shortcuts-grid">
          <button type="button" className="workflow-stage-card" onClick={() => onNavigateTab("evidence")}>
            <div className="stage-card-icon"><Icon name="camera" size={20} /></div>
            <div className="stage-card-content">
              <h4>01. Evidence Capture</h4>
              <p>Upload and verify physical packaging panel photographs with quality check.</p>
            </div>
          </button>
          <button type="button" className="workflow-stage-card" onClick={() => onNavigateTab("declarations")}>
            <div className="stage-card-icon"><Icon name="declarations" size={20} /></div>
            <div className="stage-card-content">
              <h4>02. Declarations Ledger</h4>
              <p>Review pretrained OCR extractions, bounding boxes, and field verifications.</p>
            </div>
          </button>
          <button type="button" className="workflow-stage-card" onClick={() => onNavigateTab("compliance")}>
            <div className="stage-card-icon"><Icon name="compliance" size={20} /></div>
            <div className="stage-card-content">
              <h4>03. Compliance Hub</h4>
              <p>Evaluate LMPC rules, review findings, and verify font & scale measurements.</p>
            </div>
          </button>
          <button type="button" className="workflow-stage-card" onClick={() => onNavigateTab("report")}>
            <div className="stage-card-icon"><Icon name="report" size={20} /></div>
            <div className="stage-card-content">
              <h4>04. Final Report & PDF</h4>
              <p>Execute finalization lifecycle, view cryptographic PDF, and download artifact.</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}

// ============================================================================
// TAB 2: EVIDENCE TAB (Large Image-First Viewer & Quality Screening)
// ============================================================================
function EvidenceTab({ inspection, canEdit, onUpdate }) {
  const { token } = useAuth();
  const insId = inspection?.inspection_id;
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedViewId, setSelectedViewId] = useState(null);
  const [previewUrls, setPreviewUrls] = useState({});
  const previewUrlsRef = useRef({});
  previewUrlsRef.current = previewUrls;
  const [zoomLevel, setZoomLevel] = useState(1);
  const [uploadingView, setUploadingView] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Revoke object URLs on unmount
  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => {
        try { URL.revokeObjectURL(url); } catch (e) {}
      });
      previewUrlsRef.current = {};
    };
  }, [insId]);

  // Load preview blob
  const fetchPreview = useCallback(async (viewId) => {
    if (!insId || !token || previewUrlsRef.current[viewId]) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setPreviewUrls((prev) => ({ ...prev, [viewId]: objUrl }));
      }
    } catch (err) {
      console.error(`Preview fetch failed for ${viewId}:`, err);
    }
  }, [insId, token]);

  const fetchViews = useCallback(async () => {
    if (!insId || !token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/views`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setViewsData(data);
        const views = data.views || [];
        if (views.length > 0) {
          // Select captured view or first view
          const captured = views.find((v) => v.has_capture);
          setSelectedViewId((prev) => prev || (captured ? captured.view_id : views[0].view_id));
          views.forEach((v) => {
            if (v.has_capture) fetchPreview(v.view_id);
          });
        }
      }
    } catch (err) {
      setErrorMsg("Failed to load evidence views.");
    } finally {
      setLoading(false);
    }
  }, [insId, token, fetchPreview]);

  useEffect(() => {
    fetchViews();
  }, [fetchViews]);

  const handleUpload = async (viewId, file) => {
    if (!file || !insId) return;
    setUploadingView(viewId);
    setErrorMsg(null);
    const formData = new FormData();
    formData.append("file", file);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || `Upload failed with status ${res.status}`);
      }
      // Clear old preview if exists
      if (previewUrlsRef.current[viewId]) {
        URL.revokeObjectURL(previewUrlsRef.current[viewId]);
        setPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[viewId];
          return next;
        });
      }
      await fetchViews();
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setUploadingView(null);
    }
  };

  const handleDelete = async (viewId) => {
    if (!confirm("Are you sure you want to discard this temporary evidence photo?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to discard photo");
      if (previewUrlsRef.current[viewId]) {
        URL.revokeObjectURL(previewUrlsRef.current[viewId]);
        setPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[viewId];
          return next;
        });
      }
      await fetchViews();
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(err.message);
    }
  };

  const views = viewsData?.views || [];
  const currentView = views.find((v) => v.view_id === selectedViewId) || views[0];
  const currentPreview = currentView ? previewUrls[currentView.view_id] : null;

  return (
    <div className="tab-pane-evidence">
      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}

      {/* VIEW SELECTOR CHIPS */}
      <div className="evidence-panel-selector">
        {views.map((v) => (
          <button
            key={v.view_id}
            type="button"
            className={`view-selector-pill ${selectedViewId === v.view_id ? "active" : ""}`}
            onClick={() => {
              setSelectedViewId(v.view_id);
              setZoomLevel(1);
            }}
          >
            <span className={`status-dot-sm ${v.has_capture ? (v.capture_status === "passed" ? "dot-online" : "dot-warning") : "dot-offline"}`} />
            <span>{v.title}</span>
            {v.is_required && <span className="req-tag">REQ</span>}
          </button>
        ))}
      </div>

      {/* MAIN EVIDENCE TWO-COLUMN WORKSPACE */}
      <div className="evidence-workspace-split">
        {/* LEFT: LARGE IMAGE VIEWER */}
        <div className="evidence-image-viewport">
          {/* ZOOM TOOLBAR */}
          <div className="viewer-toolbar">
            <span className="toolbar-label">{currentView?.title || "Packaging View"}</span>
            <div className="zoom-controls">
              <button
                type="button"
                className="btn-toolbar"
                onClick={() => setZoomLevel((z) => Math.max(0.5, z - 0.25))}
                title="Zoom Out"
                aria-label="Zoom Out"
              >
                <Icon name="zoomOut" size={15} />
              </button>
              <span className="zoom-level-text">{Math.round(zoomLevel * 100)}%</span>
              <button
                type="button"
                className="btn-toolbar"
                onClick={() => setZoomLevel((z) => Math.min(3, z + 0.25))}
                title="Zoom In"
                aria-label="Zoom In"
              >
                <Icon name="zoomIn" size={15} />
              </button>
              <button
                type="button"
                className="btn-toolbar"
                onClick={() => setZoomLevel(1)}
                title="Reset Zoom"
                aria-label="Reset Zoom"
              >
                <Icon name="reset" size={15} />
              </button>
            </div>
          </div>

          {/* IMAGE DISPLAY CONTAINER */}
          <div className="image-stage-area">
            {uploadingView === currentView?.view_id ? (
              <div className="image-loading-placeholder">
                <span className="spinner-lg" />
                <p>Analyzing sharpness, exposure, dimensions, and duplicates...</p>
              </div>
            ) : currentPreview ? (
              <div className="image-pan-wrap">
                <img
                  src={currentPreview}
                  alt={currentView?.title}
                  className="evidence-master-img"
                  style={{ transform: `scale(${zoomLevel})` }}
                />
              </div>
            ) : (
              <div className="image-empty-placeholder">
                <Icon name="camera" size={36} className="empty-icon-muted" />
                <p>No photograph captured for <strong>{currentView?.title}</strong></p>
                <span className="placeholder-sub">Upload packaging photo using the controls panel on the right.</span>
              </div>
            )}
          </div>
        </div>

        {/* RIGHT: METADATA & QUALITY CONTROLS */}
        <aside className="evidence-controls-sidebar">
          {currentView && (
            <div className="enterprise-panel">
              <div className="panel-header">
                <h3>{currentView.title} Metadata</h3>
                <span className={`status-pill status-${currentView.capture_status || "unprocessed"}`}>
                  {currentView.capture_status === "passed" && "Passed"}
                  {currentView.capture_status === "warning" && "Warning"}
                  {currentView.capture_status === "recapture_required" && "Recapture Required"}
                  {currentView.capture_status === "failed" && "Failed"}
                  {(!currentView.capture_status || currentView.capture_status === "unprocessed") && "Pending"}
                </span>
              </div>

              <div className="panel-body">
                <p className="panel-instruction-text">{currentView.instruction}</p>

                <dl className="key-value-list" style={{ marginTop: "0.75rem" }}>
                  <div className="kv-row">
                    <dt>Requirement</dt>
                    <dd>{currentView.is_required ? "Mandatory Regulatory View" : "Optional Secondary View"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Resolution</dt>
                    <dd className="font-mono">
                      {currentView.width && currentView.height ? `${currentView.width} × ${currentView.height} px` : "—"}
                    </dd>
                  </div>
                  <div className="kv-row">
                    <dt>File Name</dt>
                    <dd className="font-mono">{currentView.file_name || "—"}</dd>
                  </div>
                  <div className="kv-row">
                    <dt>Last Captured</dt>
                    <dd>{currentView.updated_at ? new Date(currentView.updated_at).toLocaleTimeString() : "—"}</dd>
                  </div>
                </dl>

                {/* Targeted Recapture Guidance Box */}
                {(currentView.capture_status === "warning" || currentView.capture_status === "recapture_required" || currentView.capture_status === "failed") && (
                  <div className="recapture-guidance-box">
                    <div className="recapture-title">
                      <Icon name="warning" size={14} />
                      <span>Quality Attention Required</span>
                    </div>
                    {currentView.validation_reasons && currentView.validation_reasons.length > 0 && (
                      <p className="validation-reasons">
                        <strong>Issue:</strong> {currentView.validation_reasons.map((r) => r.replace(/_/g, " ")).join(", ")}
                      </p>
                    )}
                    <p className="guidance-text">
                      <strong>Guidance:</strong> {currentView.guidance || "Hold steady in good light, align package squarely, and retake."}
                    </p>
                  </div>
                )}

                {/* Upload & Action Buttons */}
                {canEdit && (
                  <div className="evidence-action-row" style={{ marginTop: "1.25rem" }}>
                    <label className="btn-primary btn-sm btn-file-upload">
                      <Icon name="camera" size={14} />
                      <span>{currentView.has_capture ? "Replace Photo" : "Upload Photo"}</span>
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          if (e.target.files?.[0]) {
                            handleUpload(currentView.view_id, e.target.files[0]);
                            e.target.value = "";
                          }
                        }}
                      />
                    </label>

                    {currentView.has_capture && (
                      <button
                        type="button"
                        className="btn-danger btn-sm"
                        onClick={() => handleDelete(currentView.view_id)}
                      >
                        <Icon name="trash" size={14} />
                        <span>Discard</span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// TAB 3: DECLARATIONS / OCR TAB (Evidence-Linked 3-Area Verification Workspace)
// ============================================================================
function DeclarationsTab({ inspection, canEdit, onUpdate }) {
  const { token } = useAuth();
  const insId = inspection?.inspection_id;
  const [declarations, setDeclarations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [selectedView, setSelectedView] = useState("back");
  const [availableViews, setAvailableViews] = useState([]);
  const [activeFieldId, setActiveFieldId] = useState(null);
  const [filterStatus, setFilterStatus] = useState("all");
  const [previewUrls, setPreviewUrls] = useState({});
  const previewUrlsRef = useRef({});
  previewUrlsRef.current = previewUrls;
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Inspector verification form
  const [editingField, setEditingField] = useState(null);
  const [verifiedInput, setVerifiedInput] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [submittingEdit, setSubmittingEdit] = useState(false);

  // Load preview
  const fetchPreview = useCallback(async (viewId) => {
    if (!insId || !token || previewUrlsRef.current[viewId]) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}/preview`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const blob = await res.blob();
        const objUrl = URL.createObjectURL(blob);
        setPreviewUrls((prev) => ({ ...prev, [viewId]: objUrl }));
      }
    } catch (e) {}
  }, [insId, token]);

  const loadData = useCallback(async () => {
    if (!insId || !token) return;
    setLoading(true);
    try {
      const [viewsRes, declRes] = await Promise.all([
        fetch(`${API_BASE_URL}/inspections/${insId}/views`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/inspections/${insId}/extracted-fields`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);

      if (viewsRes.ok) {
        const vData = await viewsRes.json();
        const captured = (vData.views || []).filter((v) => v.has_capture);
        setAvailableViews(captured);
        if (captured.length > 0) {
          const defaultView = captured.find((v) => v.view_id === "back") || captured[0];
          setSelectedView(defaultView.view_id);
          captured.forEach((v) => fetchPreview(v.view_id));
        }
      }

      if (declRes.ok) {
        const dData = await declRes.json();
        setDeclarations(dData.declarations || []);
      }
    } catch (err) {
      setErrorMsg("Failed to load declarations ledger.");
    } finally {
      setLoading(false);
    }
  }, [insId, token, fetchPreview]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Run extraction
  const handleRunExtraction = async () => {
    setExtracting(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/extract`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Extraction execution failed.");
      setDeclarations(data.declarations || []);
      setSuccessMsg(`Extracted ${data.total_declarations} regulatory declarations (${data.verified_count} verified, ${data.review_required_count} review required).`);
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setExtracting(false);
    }
  };

  // Select field to edit in right panel
  const handleSelectField = (field) => {
    setActiveFieldId(field.id);
    setEditingField(field);
    const initialVal = field.verified_value || (field.normalized_value ? JSON.stringify(field.normalized_value) : (field.raw_text || ""));
    setVerifiedInput(initialVal);
    setEditNotes("");
    if (field.view_id && field.view_id !== "all") {
      setSelectedView(field.view_id);
    }
  };

  // Save verification
  const handleSaveVerification = async (e) => {
    e.preventDefault();
    if (!editingField) return;
    setSubmittingEdit(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/extracted-fields/${editingField.id}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          verified_value: verifiedInput,
          status: "VERIFIED",
          notes: editNotes,
        }),
      });
      const updated = await res.json();
      if (!res.ok) throw new Error(updated.detail || "Failed to update declaration");
      setDeclarations((prev) => prev.map((d) => (d.id === updated.id ? updated : d)));
      setEditingField(updated);
      setSuccessMsg(`Field '${updated.field_label}' verified successfully.`);
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(`Verification error: ${err.message}`);
    } finally {
      setSubmittingEdit(false);
    }
  };

  const currentViewBBoxes = declarations.filter(
    (d) => d.view_id === selectedView && d.bounding_box && d.bounding_box.normalized
  );
  const currentPreviewUrl = previewUrls[selectedView];

  const filteredDecls = declarations.filter((d) => {
    if (filterStatus === "review_required") return d.status === "REVIEW_REQUIRED";
    if (filterStatus === "verified") return d.status === "VERIFIED";
    if (filterStatus === "unconfirmed") return d.status === "UNCONFIRMED";
    return true;
  });

  return (
    <div className="tab-pane-declarations">
      {/* HEADER ACTION STRIP */}
      <div className="declarations-top-strip">
        <div className="decl-stats-bar">
          <span className="stat-pill">Total: <strong>{declarations.length}</strong></span>
          <span className="stat-pill verified">Verified: <strong>{declarations.filter((d) => d.status === "VERIFIED").length}</strong></span>
          <span className="stat-pill review">Review Required: <strong>{declarations.filter((d) => d.status === "REVIEW_REQUIRED").length}</strong></span>
        </div>

        <div className="decl-actions-bar">
          {canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleRunExtraction}
              disabled={extracting || availableViews.length === 0}
            >
              {extracting ? (
                <>
                  <span className="spinner-sm" />
                  <span>Extracting...</span>
                </>
              ) : (
                <>
                  <Icon name="sparkles" size={14} />
                  <span>Run Pretrained OCR Extraction</span>
                </>
              )}
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
      {successMsg && (
        <div className="alert-banner alert-success">
          <Icon name="check" size={16} />
          <span>{successMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setSuccessMsg(null)}>✕</button>
        </div>
      )}

      {/* 3-AREA DECLARATIONS WORKSPACE */}
      <div className="declarations-triptych-grid">
        {/* AREA 1 (LEFT): EVIDENCE IMAGE + BOUNDING BOXES */}
        <section className="decl-triptych-column evidence-col">
          <div className="col-header">
            <h4>Physical Evidence Panel</h4>
            <div className="view-chips-mini">
              {availableViews.map((v) => (
                <button
                  key={v.view_id}
                  type="button"
                  className={`btn-chip-mini ${selectedView === v.view_id ? "active" : ""}`}
                  onClick={() => setSelectedView(v.view_id)}
                >
                  {v.title}
                </button>
              ))}
            </div>
          </div>

          <div className="decl-bbox-stage">
            {currentPreviewUrl ? (
              <div className="bbox-image-container">
                <img src={currentPreviewUrl} alt="Evidence Panel" className="bbox-source-image" />
                {currentViewBBoxes.map((d) => {
                  const norm = d.bounding_box.normalized;
                  const isSelected = activeFieldId === d.id;
                  const isReview = d.status === "REVIEW_REQUIRED";
                  const isVerified = d.status === "VERIFIED";

                  return (
                    <div
                      key={d.id}
                      className={`bbox-rect ${isSelected ? "selected" : isReview ? "review" : isVerified ? "verified" : "unconfirmed"}`}
                      style={{
                        left: `${norm.x_pct}%`,
                        top: `${norm.y_pct}%`,
                        width: `${norm.w_pct}%`,
                        height: `${norm.h_pct}%`,
                      }}
                      onClick={() => handleSelectField(d)}
                      title={`${d.field_label}: ${d.raw_text || "Field"}`}
                    >
                      <span className="bbox-tag">{d.field_label}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="stage-placeholder">
                <p>No captured photo for view '{selectedView}'.</p>
              </div>
            )}
          </div>
          <div className="bbox-legend-bar">
            <span className="leg-item"><span className="leg-box leg-verified" /> Verified</span>
            <span className="leg-item"><span className="leg-box leg-review" /> Review Required</span>
            <span className="leg-item"><span className="leg-box leg-selected" /> Selected</span>
          </div>
        </section>

        {/* AREA 2 (CENTER): EXTRACTED FIELDS LIST */}
        <section className="decl-triptych-column fields-col">
          <div className="col-header">
            <h4>Extracted Declarations</h4>
            <select
              className="form-select-sm"
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
            >
              <option value="all">All Declarations ({declarations.length})</option>
              <option value="review_required">Review Required</option>
              <option value="verified">Verified</option>
              <option value="unconfirmed">Unconfirmed</option>
            </select>
          </div>

          <div className="fields-scroll-list">
            {filteredDecls.length === 0 ? (
              <div className="empty-fields-state">
                <p>No declarations match filter.</p>
                {declarations.length === 0 && canEdit && (
                  <button type="button" className="btn-primary btn-sm" onClick={handleRunExtraction} disabled={extracting}>
                    Run OCR Extraction
                  </button>
                )}
              </div>
            ) : (
              filteredDecls.map((d) => {
                const isSelected = activeFieldId === d.id;
                return (
                  <div
                    key={d.id}
                    className={`decl-item-card ${isSelected ? "selected" : ""} status-${(d.status || "").toLowerCase()}`}
                    onClick={() => handleSelectField(d)}
                  >
                    <div className="decl-item-top">
                      <span className="decl-label">{d.field_label}</span>
                      <span className={`status-pill status-${(d.status || "unconfirmed").toLowerCase()}`}>
                        {d.status === "VERIFIED" ? "Verified" : d.status === "REVIEW_REQUIRED" ? "Review" : "Unconfirmed"}
                      </span>
                    </div>
                    <div className="decl-raw-snippet font-mono">
                      {d.raw_text ? `"${d.raw_text}"` : <span className="text-muted">Undetected</span>}
                    </div>
                    <div className="decl-conf-strip">
                      <span>OCR: {Math.round((d.ocr_confidence || 0) * 100)}%</span>
                      <span className="divider">•</span>
                      <span>Match: {Math.round((d.extraction_confidence || 0) * 100)}%</span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </section>

        {/* AREA 3 (RIGHT): VERIFICATION & EDIT PANEL */}
        <aside className="decl-triptych-column verify-col">
          <div className="col-header">
            <h4>Inspector Verification</h4>
          </div>

          <div className="verify-panel-body">
            {editingField ? (
              <form onSubmit={handleSaveVerification} className="verify-form">
                <div className="verify-field-badge">
                  <span className="field-tag">{editingField.field_label}</span>
                  <span className={`status-pill status-${editingField.status?.toLowerCase()}`}>
                    {editingField.status}
                  </span>
                </div>

                <div className="form-group" style={{ marginTop: "1rem" }}>
                  <label className="form-label">Raw OCR Evidence (Immutable):</label>
                  <div className="immutable-ocr-box font-mono">
                    {editingField.raw_text || "None (Undetected)"}
                  </div>
                </div>

                {editingField.normalized_value && (
                  <div className="form-group">
                    <label className="form-label">Normalized Value:</label>
                    <div className="normalized-box font-mono">
                      {editingField.normalized_value.canonical || JSON.stringify(editingField.normalized_value)}
                    </div>
                  </div>
                )}

                <div className="form-group">
                  <label className="form-label" htmlFor="verified-val-input">
                    Verified / Corrected Value <span className="req-marker">*</span>
                  </label>
                  <input
                    id="verified-val-input"
                    type="text"
                    className="form-input"
                    value={verifiedInput}
                    onChange={(e) => setVerifiedInput(e.target.value)}
                    placeholder="Enter confirmed packaging value..."
                    disabled={!canEdit}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label" htmlFor="verify-notes-input">
                    Audit Justification Notes
                  </label>
                  <textarea
                    id="verify-notes-input"
                    className="form-textarea"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Explain source of truth or reason for field verification..."
                    rows={2}
                    disabled={!canEdit}
                  />
                </div>

                {canEdit && (
                  <button type="submit" className="btn-primary btn-full" disabled={submittingEdit}>
                    {submittingEdit ? "Saving Verification..." : "Confirm & Verify Field"}
                  </button>
                )}
              </form>
            ) : (
              <div className="verify-empty-state">
                <p>Select any declaration field from the center ledger to review and verify.</p>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============================================================================
// TAB 4: COMPLIANCE TAB (State Banner, Authoritative Rulebook Hash & Findings)
// ============================================================================
function ComplianceTab({ inspection, canEdit, onUpdate }) {
  const { token } = useAuth();
  const insId = inspection?.inspection_id;
  const [complianceRun, setComplianceRun] = useState(null);
  const [checklistData, setChecklistData] = useState(null);
  const [evaluating, setEvaluating] = useState(false);
  const [filterOutcome, setFilterOutcome] = useState("all");
  const [copiedHash, setCopiedHash] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Regulatory context state
  const [contextForm, setContextForm] = useState({
    commodity_class: "",
    package_type: "retail",
    consumer_type: "retail",
    declared_quantity_value: "",
    declared_quantity_unit: "g",
    is_imported: false,
    is_ecommerce: false,
    is_medical_device: false,
    calibration_valid: false,
    letter_height_mm: "",
    letter_width_mm: "",
    pdp_area_cm2: "",
    measurement_verified: false,
    measured_value: "",
    observed_sale_price: "",
  });
  const [savingContext, setSavingContext] = useState(false);

  // Fetch compliance & checklist
  const loadCompliance = useCallback(async () => {
    if (!insId || !token) return;
    try {
      const [compRes, checkRes] = await Promise.all([
        fetch(`${API_BASE_URL}/inspections/${insId}/compliance/latest`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/inspections/${insId}/checklist`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (compRes.ok) {
        const cData = await compRes.json();
        setComplianceRun(cData);
      }
      if (checkRes.ok) {
        const kData = await checkRes.json();
        setChecklistData(kData);
      }
    } catch (e) {}
  }, [insId, token]);

  useEffect(() => {
    loadCompliance();
  }, [loadCompliance]);

  // Run evaluation
  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/compliance/evaluate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Compliance evaluation failed.");
      setComplianceRun(data);
      setSuccessMsg(`Compliance evaluated. Authoritative state: ${data.overall_state}`);
      if (onUpdate) onUpdate();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const copyRulebookHash = (hash) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const findings = complianceRun?.findings || [];
  const satisfiedCount = findings.filter((f) => f.outcome === "SATISFIED").length;
  const pncCount = findings.filter((f) => f.outcome === "POTENTIAL_NON_COMPLIANCE").length;
  const reviewCount = findings.filter((f) => f.outcome === "REVIEW_REQUIRED").length;

  const filteredFindings = findings.filter((f) => {
    if (filterOutcome === "all") return true;
    return f.outcome === filterOutcome;
  });

  return (
    <div className="tab-pane-compliance">
      {/* COMPLIANCE ASSESSMENT BANNER */}
      <section className="compliance-decision-banner">
        <div className="decision-left">
          <div className="decision-pre-tag">AUTHORITATIVE COMPLIANCE ASSESSMENT</div>
          <div className="decision-state-row">
            <span className="state-label">OVERALL DECISION:</span>
            <span className={`compliance-state-badge state-${(complianceRun?.overall_state || "UNASSESSED").toLowerCase()}`}>
              {complianceRun?.overall_state || "PENDING EVALUATION"}
            </span>
          </div>
          <p className="decision-explainer">
            Evaluated against statutory Legal Metrology (Packaged Commodities) Rules, 2011 (as amended).
          </p>
        </div>

        <div className="decision-right">
          <div className="rulebook-meta-box">
            <div className="rulebook-row">
              <span className="rb-label">Rulebook Version:</span>
              <span className="rb-val">{complianceRun?.rulebook_version || "2026.09.16"}</span>
            </div>
            <div className="rulebook-row">
              <span className="rb-label">Authoritative SHA-256:</span>
              <div className="hash-copy-wrap">
                <span className="rb-val font-mono" title={complianceRun?.rulebook_hash}>
                  {complianceRun?.rulebook_hash ? `${complianceRun.rulebook_hash.slice(0, 16)}...` : "Authoritative"}
                </span>
                {complianceRun?.rulebook_hash && (
                  <button
                    type="button"
                    className="btn-copy-mini"
                    onClick={() => copyRulebookHash(complianceRun.rulebook_hash)}
                    title="Copy full SHA-256 hash"
                  >
                    <Icon name="copy" size={12} />
                    <span>{copiedHash ? "Copied" : "Copy"}</span>
                  </button>
                )}
              </div>
            </div>
          </div>

          {canEdit && (
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={handleRunEvaluation}
              disabled={evaluating}
              style={{ marginTop: "0.75rem" }}
            >
              {evaluating ? (
                <>
                  <span className="spinner-sm" />
                  <span>Evaluating...</span>
                </>
              ) : (
                <>
                  <Icon name="compliance" size={15} />
                  <span>Evaluate Compliance</span>
                </>
              )}
            </button>
          )}
        </div>
      </section>

      {/* THREE FINDING SUMMARY COUNTS */}
      <div className="findings-summary-triad">
        <div className="triad-card satisfied">
          <span className="triad-count">{satisfiedCount}</span>
          <span className="triad-label">Satisfied Checks</span>
          <span className="triad-sub">Mandatory provisions verified</span>
        </div>
        <div className="triad-card pnc">
          <span className="triad-count">{pncCount}</span>
          <span className="triad-label">Potential Non-Compliances</span>
          <span className="triad-sub">Breaches requiring intervention</span>
        </div>
        <div className="triad-card review">
          <span className="triad-count">{reviewCount}</span>
          <span className="triad-label">Review Required</span>
          <span className="triad-sub">Ambiguities needing human audit</span>
        </div>
      </div>

      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}
      {successMsg && (
        <div className="alert-banner alert-success">
          <Icon name="check" size={16} />
          <span>{successMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setSuccessMsg(null)}>✕</button>
        </div>
      )}

      {/* FINDINGS TABLE */}
      <section className="enterprise-panel" style={{ marginTop: "1.5rem" }}>
        <div className="panel-header">
          <div className="panel-title-with-filters">
            <h3>Statutory Evaluation Findings</h3>
            <div className="filter-chips-mini">
              {[
                { id: "all", label: "All Findings" },
                { id: "POTENTIAL_NON_COMPLIANCE", label: "Non-Compliances" },
                { id: "REVIEW_REQUIRED", label: "Review Required" },
                { id: "SATISFIED", label: "Satisfied" },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`btn-chip-mini ${filterOutcome === f.id ? "active" : ""}`}
                  onClick={() => setFilterOutcome(f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="panel-table-wrap">
          {filteredFindings.length === 0 ? (
            <div className="table-empty-notice">
              <p>No findings recorded under selected filter.</p>
              {!complianceRun && canEdit && (
                <button type="button" className="btn-primary btn-sm" onClick={handleRunEvaluation} disabled={evaluating}>
                  Run Compliance Evaluation
                </button>
              )}
            </div>
          ) : (
            <table className="enterprise-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Requirement</th>
                  <th>Outcome</th>
                  <th>Severity</th>
                  <th>Statutory Reason & Evaluated Value</th>
                  <th>Decision Basis</th>
                </tr>
              </thead>
              <tbody>
                {filteredFindings.map((f) => (
                  <tr key={f.id} className={`outcome-row ${f.outcome?.toLowerCase()}`}>
                    <td className="font-mono">
                      <strong>Rule {f.rule_no}</strong>
                      <span className="sub-tag">{f.rule_id}</span>
                    </td>
                    <td><code>{f.requirement_key}</code></td>
                    <td>
                      <span className={`status-pill status-${f.outcome?.toLowerCase()}`}>
                        {f.outcome === "SATISFIED" && "Satisfied"}
                        {f.outcome === "POTENTIAL_NON_COMPLIANCE" && "Potential Non-Compliance"}
                        {f.outcome === "REVIEW_REQUIRED" && "Review Required"}
                      </span>
                    </td>
                    <td>
                      <span className={`severity-tag severity-${(f.severity || "info").toLowerCase()}`}>
                        {f.severity || "info"}
                      </span>
                    </td>
                    <td>
                      <div className="finding-reason">{f.reason_text}</div>
                      {f.reason_code && <span className="reason-code">Code: {f.reason_code}</span>}
                    </td>
                    <td>
                      <span className="sub-text">{f.decision_source || "Deterministic Engine"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* ACTIONABLE RECOMMENDATIONS */}
      {complianceRun?.findings && complianceRun.findings.some((f) => f.outcome !== "SATISFIED") && (
        <section className="enterprise-panel" style={{ marginTop: "1.5rem" }}>
          <div className="panel-header">
            <h3>Actionable Compliance Recommendations</h3>
          </div>
          <div className="recommendations-list">
            {complianceRun.findings
              .filter((f) => f.outcome !== "SATISFIED")
              .map((f) => (
                <div key={f.id} className={`recommendation-card outcome-${f.outcome?.toLowerCase()}`}>
                  <div className="rec-header">
                    <span className="rec-rule">Rule {f.rule_no}: {f.requirement_key}</span>
                    <span className={`status-pill status-${f.outcome?.toLowerCase()}`}>{f.outcome}</span>
                  </div>
                  <div className="rec-body">
                    <div className="rec-step">
                      <span className="step-tag">What was found:</span>
                      <span className="step-val">{f.reason_text}</span>
                    </div>
                    <div className="rec-step">
                      <span className="step-tag">Why it matters:</span>
                      <span className="step-val">Statutory requirement under Packaged Commodities Rules 2011.</span>
                    </div>
                    <div className="rec-step">
                      <span className="step-tag">Recommended Action:</span>
                      <span className="step-val">
                        {f.outcome === "POTENTIAL_NON_COMPLIANCE"
                          ? "Issue notice of non-conformance or return batch for correction."
                          : "Verify packaging panel physically with calibrated equipment."}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============================================================================
// TAB 5: REPORT TAB (Authenticated In-App PDF Preview with SHA-256 Integrity)
// ============================================================================
function ReportTab({ inspection, canEdit, onUpdate }) {
  const { token } = useAuth();
  const insId = inspection?.inspection_id;
  const [reportMeta, setReportMeta] = useState(null);
  const [loadingReport, setLoadingReport] = useState(true);
  const [pdfBlobUrl, setPdfBlobUrl] = useState(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [copiedHash, setCopiedHash] = useState(false);

  // Finalization lifecycle state
  const [finalizing, setFinalizing] = useState(false);
  const [finalizationStep, setFinalizationStep] = useState(0);
  const [finalNotes, setFinalNotes] = useState("");
  const [finalizeError, setFinalizeError] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  // Clean up blob URL on unmount
  useEffect(() => {
    return () => {
      if (pdfBlobUrl) {
        URL.revokeObjectURL(pdfBlobUrl);
      }
    };
  }, [pdfBlobUrl]);

  // Fetch report metadata
  const fetchReportMeta = useCallback(async () => {
    if (!insId || !token) return;
    setLoadingReport(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/report`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setReportMeta(data);
        // Automatically load authenticated PDF preview
        loadPdfPreview();
      } else {
        setReportMeta(null);
      }
    } catch (e) {
      setReportMeta(null);
    } finally {
      setLoadingReport(false);
    }
  }, [insId, token]);

  useEffect(() => {
    fetchReportMeta();
  }, [fetchReportMeta]);

  // Authenticated PDF Preview stream
  const loadPdfPreview = async () => {
    if (!insId || !token) return;
    setPdfLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/report/pdf?disposition=inline`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load PDF preview from permanent BLOB storage.");
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      if (pdfBlobUrl) URL.revokeObjectURL(pdfBlobUrl);
      setPdfBlobUrl(objUrl);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setPdfLoading(false);
    }
  };

  // Download PDF
  const handleDownloadPdf = async () => {
    if (!insId || !token) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/report/pdf?disposition=attachment`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to download PDF report.");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportMeta?.filename || `${insId}_Final_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  // Finalize Lifecycle
  const handleFinalize = async () => {
    if (!insId || !token) return;
    setFinalizing(true);
    setFinalizeError(null);
    setErrorMsg(null);
    setFinalizationStep(1);

    const stepInterval = setInterval(() => {
      setFinalizationStep((s) => (s < 5 ? s + 1 : s));
    }, 450);

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: finalNotes || "Finalized via PackCheck workspace." }),
      });
      clearInterval(stepInterval);
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Finalization failed. Source evidence preserved.");
      }
      setFinalizationStep(6);
      setTimeout(() => {
        setFinalizationStep(7);
        setReportMeta(data.report);
        fetchReportMeta();
        if (onUpdate) onUpdate();
      }, 300);
    } catch (err) {
      clearInterval(stepInterval);
      setFinalizationStep(0);
      setFinalizeError(err.message);
    } finally {
      setFinalizing(false);
    }
  };

  const copyHash = (hash) => {
    if (!hash) return;
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <div className="tab-pane-report">
      {errorMsg && (
        <div className="alert-banner alert-danger">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>✕</button>
        </div>
      )}

      {loadingReport ? (
        <div className="report-loading-box">
          <span className="spinner-lg" />
          <p>Checking permanent report registry...</p>
        </div>
      ) : reportMeta ? (
        /* STATE A: PERMANENT FINAL REPORT VERIFIED & STORED */
        <div className="report-finalized-view">
          <div className="report-verified-header-panel">
            <div className="verified-status-row">
              <span className="status-pill status-approved">Permanent Final Report Verified</span>
              <span className="storage-badge">MySQL LONGBLOB Storage</span>
            </div>
            <h2>Final Inspection Report — {reportMeta.inspection_id}</h2>
            <p>
              This inspection was formally finalized. The report contains verified packaging evidence images, complete declarations ledger, deterministic rule findings, and cryptographic SHA-256 fingerprint.
            </p>
          </div>

          <div className="report-meta-columns-grid">
            <div className="meta-info-card">
              <span className="card-label">Filename</span>
              <span className="card-value font-mono">{reportMeta.filename}</span>
            </div>
            <div className="meta-info-card">
              <span className="card-label">File Size</span>
              <span className="card-value">{Math.round((reportMeta.file_size || 0) / 1024)} KB</span>
            </div>
            <div className="meta-info-card">
              <span className="card-label">Rulebook Version</span>
              <span className="card-value">{reportMeta.rulebook_version}</span>
            </div>
            <div className="meta-info-card">
              <span className="card-label">Finalized At</span>
              <span className="card-value">{new Date(reportMeta.created_at).toLocaleString()}</span>
            </div>
            <div className="meta-info-card span-all">
              <span className="card-label">Cryptographic SHA-256 Checksum</span>
              <div className="hash-row">
                <span className="card-value font-mono">{reportMeta.sha256_hash}</span>
                <button type="button" className="btn-copy-mini" onClick={() => copyHash(reportMeta.sha256_hash)}>
                  <Icon name="copy" size={12} />
                  <span>{copiedHash ? "Copied" : "Copy Hash"}</span>
                </button>
              </div>
            </div>
          </div>

          {/* IN-APP AUTHENTICATED PDF PREVIEW */}
          <div className="report-pdf-viewer-frame">
            <div className="frame-toolbar">
              <span className="toolbar-title font-mono">{reportMeta.filename}</span>
              <div className="frame-actions">
                {pdfBlobUrl && (
                  <a
                    href={pdfBlobUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-secondary btn-sm"
                  >
                    Open in New Window
                  </a>
                )}
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  onClick={handleDownloadPdf}
                  disabled={downloadingPdf}
                >
                  <Icon name="download" size={14} />
                  <span>{downloadingPdf ? "Downloading..." : "Download PDF Report"}</span>
                </button>
              </div>
            </div>

            <div className="pdf-embed-wrapper">
              {pdfLoading ? (
                <div className="pdf-loading-state">
                  <span className="spinner-lg" />
                  <p>Authenticating and streaming PDF report from MySQL storage...</p>
                </div>
              ) : pdfBlobUrl ? (
                <iframe
                  src={pdfBlobUrl}
                  title={`Final Report ${reportMeta.inspection_id}`}
                  className="pdf-iframe-element"
                />
              ) : (
                <div className="pdf-error-state">
                  <p>Unable to render PDF preview.</p>
                  <button type="button" className="btn-secondary btn-sm" onClick={loadPdfPreview}>
                    Retry Preview
                  </button>
                </div>
              )}
            </div>
          </div>

          <div className="statutory-disclaimer-note">
            <strong>STATUTORY METROLOGY NOTICE:</strong> This technical report is generated by PackCheck for inspection assistance under the Legal Metrology Act, 2009. Official enforcement actions remain under the jurisdiction of authorized legal metrology officers.
          </div>
        </div>
      ) : (
        /* STATE B: PRE-FINALIZATION WORKFLOW */
        <div className="report-prefinalize-view">
          <div className="enterprise-panel">
            <div className="panel-header">
              <h3>Finalize Inspection & Generate Official Report</h3>
            </div>
            <div className="panel-body">
              <p>
                Finalization executes PackCheck's strict verification lifecycle:
                generates the high-resolution PDF embedding packaging photographs, validates readability and content, calculates the SHA-256 hash, commits it to permanent MySQL BLOB storage, verifies cryptographic byte integrity, and then purges temporary capture images.
              </p>

              {finalizing && (
                <div className="finalization-progress-tracker" style={{ marginTop: "1.25rem" }}>
                  <h4>Finalization & Verification Lifecycle</h4>
                  <ul className="progress-steps-list">
                    {[
                      { s: 1, label: "Preparing evidence and declarations ledger" },
                      { s: 2, label: "Building ReportLab PDF report" },
                      { s: 3, label: "Deep verifying PDF structure, content and embedded images" },
                      { s: 4, label: "Computing SHA-256 hash and saving to MySQL BLOB" },
                      { s: 5, label: "Retrieving from permanent storage and verifying integrity" },
                      { s: 6, label: "Purging temporary source evidence" },
                      { s: 7, label: "Committed finalized state" },
                    ].map((step) => (
                      <li
                        key={step.s}
                        className={`step-item ${
                          finalizationStep > step.s ? "done" : finalizationStep === step.s ? "active" : "pending"
                        }`}
                      >
                        <span className="step-dot">{finalizationStep > step.s ? "✓" : step.s}</span>
                        <span className="step-title">{step.label}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {finalizeError && (
                <div className="alert-banner alert-danger" style={{ marginTop: "1rem" }}>
                  <Icon name="alert" size={16} />
                  <div>
                    <strong>Finalization Error:</strong> {finalizeError}
                    <div className="sub-note">Safety guarantee: Temporary evidence source images have been strictly preserved.</div>
                  </div>
                </div>
              )}

              {!finalizing && (
                <>
                  <div className="form-group" style={{ marginTop: "1.25rem" }}>
                    <label className="form-label" htmlFor="final-remarks">
                      Reviewer Final Remarks (Optional)
                    </label>
                    <textarea
                      id="final-remarks"
                      className="form-textarea"
                      value={finalNotes}
                      onChange={(e) => setFinalNotes(e.target.value)}
                      placeholder="Add reviewer notes, justification notes, or statutory remarks to record permanently in the final report..."
                      rows={2}
                      disabled={!canEdit}
                    />
                  </div>

                  <div className="action-row" style={{ marginTop: "1.25rem" }}>
                    <button
                      type="button"
                      className="btn-primary btn-lg"
                      onClick={handleFinalize}
                      disabled={!canEdit}
                    >
                      <Icon name="sparkles" size={16} />
                      <span>Finalize Inspection & Generate Report</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TAB 6: ACTIVITY TAB (Chronological Audit History Timeline)
// ============================================================================
function ActivityTab({ inspection }) {
  const history = inspection?.history || [];

  return (
    <div className="tab-pane-activity">
      <div className="enterprise-panel">
        <div className="panel-header">
          <h3>Inspection Status & Governance Timeline</h3>
        </div>
        <div className="panel-body">
          {history.length === 0 ? (
            <p className="sub-text">No lifecycle status events recorded yet.</p>
          ) : (
            <div className="timeline-event-stream">
              {history.map((h) => (
                <div key={h.id} className="timeline-node-item">
                  <div className="node-marker" />
                  <div className="node-content">
                    <div className="node-header">
                      <span className="status-transition">
                        <strong>{h.from_status.toUpperCase()}</strong> → <strong>{h.to_status.toUpperCase()}</strong>
                      </span>
                      <span className="node-time">{new Date(h.created_at).toLocaleString()}</span>
                    </div>
                    <div className="node-actor">
                      Modified by: <strong>{h.changed_by_name}</strong> ({h.changed_by_role})
                    </div>
                    {h.reason_notes && (
                      <div className="node-notes font-mono">"{h.reason_notes}"</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
