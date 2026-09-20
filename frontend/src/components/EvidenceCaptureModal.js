"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function EvidenceCaptureModal({ inspection, isOpen, onClose, onEvidenceUpdated }) {
  const { token, hasRole } = useAuth();
  const [viewsData, setViewsData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState(null);
  const [uploadingViewId, setUploadingViewId] = useState(null);
  const [cleaning, setCleaning] = useState(false);
  const [activeViewFilter, setActiveViewFilter] = useState("all"); // 'all', 'needs_attention', 'passed'

  // Authenticated preview blob URLs: { [view_id]: blobUrl }
  const [previewUrls, setPreviewUrls] = useState({});
  const previewUrlsRef = useRef({});
  previewUrlsRef.current = previewUrls;

  // Track timestamps of loaded previews to avoid redundant fetches
  const loadedTimestampsRef = useRef({});

  // Refs to trigger hidden file inputs
  const cameraInputRefs = useRef({});
  const galleryInputRefs = useRef({});

  const canUpload = hasRole(["inspector", "supervisor", "admin"]);
  const insId = inspection?.inspection_id || inspection?.id;

  // Cleanup blob URLs on unmount or inspection change
  useEffect(() => {
    return () => {
      Object.values(previewUrlsRef.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // ignore
        }
      });
      previewUrlsRef.current = {};
      loadedTimestampsRef.current = {};
    };
  }, [insId]);

  // Authenticated fetch for a specific view's temporary preview image
  const fetchEvidencePreview = useCallback(async (viewId, updatedAt) => {
    if (!insId || !token) return;

    // Skip if already loaded with same timestamp
    if (loadedTimestampsRef.current[viewId] === updatedAt && previewUrlsRef.current[viewId]) {
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}/preview`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!res.ok) {
        return;
      }

      const blob = await res.blob();
      const objectUrl = URL.createObjectURL(blob);

      setPreviewUrls((prev) => {
        if (prev[viewId]) {
          URL.revokeObjectURL(prev[viewId]);
        }
        return { ...prev, [viewId]: objectUrl };
      });
      loadedTimestampsRef.current[viewId] = updatedAt || "loaded";
    } catch (err) {
      console.error(`Failed to fetch authenticated preview for view ${viewId}:`, err);
    }
  }, [insId, token]);

  // Load context-aware views from backend
  const fetchViews = useCallback(async () => {
    if (!insId || !token) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/views`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error(`Failed to load evidence views (${res.status})`);
      }
      const data = await res.json();
      setViewsData(data);

      // Trigger authenticated preview loads for all captured views
      if (data.views && Array.isArray(data.views)) {
        data.views.forEach((v) => {
          if (v.has_capture) {
            fetchEvidencePreview(v.view_id, v.updated_at);
          } else if (previewUrlsRef.current[v.view_id]) {
            // Revoke and clear any preview if capture was removed
            URL.revokeObjectURL(previewUrlsRef.current[v.view_id]);
            setPreviewUrls((prev) => {
              const next = { ...prev };
              delete next[v.view_id];
              return next;
            });
            delete loadedTimestampsRef.current[v.view_id];
          }
        });
      }
    } catch (err) {
      setErrorMsg(err.message || "Failed to load evidence views");
    } finally {
      setLoading(false);
    }
  }, [insId, token, fetchEvidencePreview]);

  useEffect(() => {
    if (isOpen && insId) {
      fetchViews();
    }
  }, [isOpen, insId, fetchViews]);

  if (!isOpen || !inspection) return null;

  // Handle single view file upload
  const handleFileUpload = async (viewId, file) => {
    if (!file) return;
    setUploadingViewId(viewId);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`
        },
        body: formData
      });

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.detail || `Upload failed with status ${res.status}`);
      }

      // Always reload views to obtain latest capture_status, validation_reasons & guidance
      await fetchViews();
      if (onEvidenceUpdated) onEvidenceUpdated();
    } catch (err) {
      setErrorMsg(`Upload failed: ${err.message}`);
    } finally {
      setUploadingViewId(null);
    }
  };

  // Discard a single temporary view capture
  const handleDeleteEvidence = async (viewId) => {
    if (!confirm("Are you sure you want to discard this temporary capture?")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/${viewId}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`
        }
      });
      if (!res.ok) {
        throw new Error("Failed to delete capture");
      }

      if (previewUrlsRef.current[viewId]) {
        URL.revokeObjectURL(previewUrlsRef.current[viewId]);
        setPreviewUrls((prev) => {
          const next = { ...prev };
          delete next[viewId];
          return next;
        });
        delete loadedTimestampsRef.current[viewId];
      }

      await fetchViews();
      if (onEvidenceUpdated) onEvidenceUpdated();
    } catch (err) {
      setErrorMsg(`Delete failed: ${err.message}`);
    }
  };

  // Idempotent temporary evidence cleanup
  const handleCleanupEvidence = async () => {
    if (!confirm("Are you sure you want to clean up and discard all temporary evidence captures for this inspection?")) {
      return;
    }
    setCleaning(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/evidence/cleanup`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      });
      if (!res.ok) {
        throw new Error("Failed to clean up temporary evidence.");
      }

      // Revoke all previews
      Object.values(previewUrlsRef.current).forEach((url) => {
        try {
          URL.revokeObjectURL(url);
        } catch (e) {
          // ignore
        }
      });
      setPreviewUrls({});
      previewUrlsRef.current = {};
      loadedTimestampsRef.current = {};

      await fetchViews();
      if (onEvidenceUpdated) onEvidenceUpdated();
    } catch (err) {
      setErrorMsg(`Cleanup failed: ${err.message}`);
    } finally {
      setCleaning(false);
    }
  };

  const views = viewsData?.views || [];
  const requiredCount = viewsData?.required_views ?? 0;
  const completedCount = viewsData?.completed_required ?? 0;
  const failedOrWarningViews = views.filter((v) =>
    ["failed", "warning", "recapture_required"].includes(v.capture_status)
  );
  const passedViews = views.filter((v) => v.capture_status === "passed");

  const filteredViews = views.filter((v) => {
    if (activeViewFilter === "needs_attention") {
      return ["failed", "warning", "recapture_required"].includes(v.capture_status);
    }
    if (activeViewFilter === "passed") {
      return v.capture_status === "passed";
    }
    return true;
  });

  const progressPercent = requiredCount > 0
    ? Math.round((completedCount / requiredCount) * 100)
    : 0;

  const currentInspectionId = viewsData?.inspection_id || inspection.inspection_id || insId;

  return (
    <div className="modal-overlay">
      <div className="modal-card evidence-modal">
        {/* Modal Header */}
        <div className="evidence-modal-header">
          <div className="evidence-modal-title-group">
            <div className="evidence-modal-badge">Phase 5 Evidence Hub</div>
            <h2 className="evidence-modal-title">
              📸 Multi-View Evidence Capture
            </h2>
            <div className="evidence-modal-meta">
              <span><strong>Inspection:</strong> {currentInspectionId}</span>
              <span className="dot-divider">•</span>
              <span><strong>Package:</strong> {viewsData?.packaging_type || inspection.packaging_type}</span>
              <span className="dot-divider">•</span>
              <span><strong>Product:</strong> {inspection.product_name}</span>
            </div>
          </div>
          <button className="btn-close-evidence" onClick={onClose} aria-label="Close modal">
            ✕
          </button>
        </div>

        {/* Progress & Summary Bar */}
        <div className="evidence-summary-bar">
          <div className="evidence-progress-info">
            <div className="progress-labels">
              <span className="progress-count-label">
                <strong>{completedCount}</strong> of <strong>{requiredCount}</strong> required views completed
              </span>
              <span className={`progress-status-chip ${viewsData?.all_required_passed ? "status-chip-complete" : "status-chip-pending"}`}>
                {viewsData?.all_required_passed ? "✅ All Required Views Passed" : "⏳ Capture in Progress"}
              </span>
            </div>
            <div className="evidence-progress-track">
              <div
                className="evidence-progress-fill"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {failedOrWarningViews.length > 0 && (
            <div className="evidence-attention-alert">
              <span className="alert-icon">⚠️</span>
              <span className="alert-text">
                <strong>{failedOrWarningViews.length}</strong> view(s) need attention or recapture before submission.
              </span>
            </div>
          )}

          {/* Quick Filters */}
          <div className="evidence-filter-tabs">
            <button
              className={`filter-tab ${activeViewFilter === "all" ? "active" : ""}`}
              onClick={() => setActiveViewFilter("all")}
            >
              All Views ({views.length})
            </button>
            <button
              className={`filter-tab ${activeViewFilter === "needs_attention" ? "active" : ""}`}
              onClick={() => setActiveViewFilter("needs_attention")}
            >
              Needs Attention ({failedOrWarningViews.length})
            </button>
            <button
              className={`filter-tab ${activeViewFilter === "passed" ? "active" : ""}`}
              onClick={() => setActiveViewFilter("passed")}
            >
              Passed ({passedViews.length})
            </button>
          </div>
        </div>

        {/* Global Error Banner */}
        {errorMsg && (
          <div className="evidence-error-banner">
            <span className="error-icon">❌</span>
            <span className="error-text">{errorMsg}</span>
            <button className="btn-dismiss-error" onClick={() => setErrorMsg(null)}>✕</button>
          </div>
        )}

        {/* Views Container */}
        <div className="evidence-views-container">
          {loading ? (
            <div className="evidence-loading-state">
              <div className="loading-spinner"></div>
              <p>Loading context-aware evidence views for {viewsData?.packaging_type || inspection.packaging_type}...</p>
            </div>
          ) : filteredViews.length === 0 ? (
            <div className="evidence-empty-filter">
              <p>No views match the current filter.</p>
            </div>
          ) : (
            <div className="evidence-views-grid">
              {filteredViews.map((v) => {
                const isUploading = uploadingViewId === v.view_id;
                const isPassed = v.capture_status === "passed";
                const isFailed = v.capture_status === "failed" || v.capture_status === "recapture_required";
                const isWarning = v.capture_status === "warning";
                const isRequired = v.is_required;
                const hasCapture = v.has_capture;
                const previewSrc = previewUrls[v.view_id];

                return (
                  <div
                    key={v.view_id}
                    className={`evidence-card ${
                      isPassed
                        ? "card-passed"
                        : isFailed
                        ? "card-failed"
                        : isWarning
                        ? "card-warning"
                        : "card-required"
                    }`}
                  >
                    {/* Hidden Inputs for Camera and Gallery */}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      style={{ display: "none" }}
                      ref={(el) => (cameraInputRefs.current[v.view_id] = el)}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload(v.view_id, e.target.files[0]);
                          e.target.value = "";
                        }
                      }}
                    />
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ display: "none" }}
                      ref={(el) => (galleryInputRefs.current[v.view_id] = el)}
                      onChange={(e) => {
                        if (e.target.files?.[0]) {
                          handleFileUpload(v.view_id, e.target.files[0]);
                          e.target.value = "";
                        }
                      }}
                    />

                    {/* Card Header */}
                    <div className="evidence-card-header">
                      <div className="evidence-card-title-group">
                        <div className="evidence-card-badges">
                          <span className={`requirement-badge ${isRequired ? "badge-req" : "badge-opt"}`}>
                            {isRequired ? "Required View" : "Optional View"}
                          </span>
                          <span className={`status-badge-view status-${v.capture_status}`}>
                            {v.capture_status === "passed" && "✅ Passed"}
                            {isFailed && "❌ Needs Recapture"}
                            {isWarning && "⚠️ Review Warning"}
                            {v.capture_status === "unprocessed" && "📷 Pending Capture"}
                          </span>
                        </div>
                        <h3 className="evidence-card-title">{v.title}</h3>
                        <p className="evidence-card-desc">{v.instruction}</p>
                      </div>
                    </div>

                    {/* Image Preview / Capture Area */}
                    <div className="evidence-card-body">
                      {isUploading ? (
                        <div className="evidence-uploading-box">
                          <div className="loading-spinner"></div>
                          <p>Analyzing sharpness, exposure, dimensions, and duplicates...</p>
                        </div>
                      ) : hasCapture ? (
                        <div className="evidence-preview-wrapper">
                          {previewSrc ? (
                            <img
                              src={previewSrc}
                              alt={v.title}
                              className="evidence-preview-img"
                              onError={(e) => {
                                e.target.style.display = "none";
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                height: "160px",
                                background: "#0d1117",
                                color: "#94a3b8",
                                fontSize: "0.85rem"
                              }}
                            >
                              <span>Loading authenticated preview...</span>
                            </div>
                          )}
                          <div className="evidence-meta-strip">
                            <span>Resolution: {v.width && v.height ? `${v.width} × ${v.height}` : "Captured"}</span>
                            <span>{v.file_name || (v.updated_at ? new Date(v.updated_at).toLocaleTimeString() : "Captured")}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="evidence-placeholder-box">
                          <div className="placeholder-icon">📸</div>
                          <p className="placeholder-text">No photo captured yet</p>
                          <span className="placeholder-hint">Take photo with package aligned and good lighting</span>
                        </div>
                      )}

                      {/* Validation & Targeted Recapture Guidance Box */}
                      {(isFailed || isWarning) && (
                        <div className={`targeted-recapture-box ${isFailed ? "recapture-failed" : "recapture-warning"}`}>
                          <div className="recapture-header">
                            <span className="recapture-tag">
                              {v.validation_reasons && v.validation_reasons.length > 0
                                ? v.validation_reasons.map((r) => r.replace(/_/g, " ")).join(" • ")
                                : "RECAPTURE REQUIRED"}
                            </span>
                          </div>

                          <div className="recapture-content">
                            <div className="recapture-point">
                              <span className="point-label">Validation Issue:</span>
                              <span className="point-val">
                                {v.validation_reasons && v.validation_reasons.length > 0
                                  ? v.validation_reasons.map((r) => r.replace(/_/g, " ")).join(", ")
                                  : "The captured image did not meet regulatory clarity requirements."}
                              </span>
                            </div>
                            <div className="recapture-point">
                              <span className="point-label">Targeted Guidance:</span>
                              <span className="point-val">
                                {v.guidance || "Hold steady in bright light and retake a sharp photo."}
                              </span>
                            </div>
                          </div>

                          {canUpload && (
                            <div className="recapture-action-row">
                              <button
                                className="btn-recapture-primary"
                                onClick={() => cameraInputRefs.current[v.view_id]?.click()}
                              >
                                🔄 Retake Photo
                              </button>
                              <button
                                className="btn-recapture-secondary"
                                onClick={() => galleryInputRefs.current[v.view_id]?.click()}
                              >
                                📁 Choose File
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Card Footer Actions */}
                    <div className="evidence-card-footer">
                      {canUpload && (
                        <>
                          {!hasCapture ? (
                            <div className="evidence-action-btn-group">
                              <button
                                className="btn-evidence-camera"
                                onClick={() => cameraInputRefs.current[v.view_id]?.click()}
                              >
                                📷 Take Photo
                              </button>
                              <button
                                className="btn-evidence-gallery"
                                onClick={() => galleryInputRefs.current[v.view_id]?.click()}
                              >
                                🖼️ Choose File
                              </button>
                            </div>
                          ) : (
                            <div className="evidence-action-btn-group">
                              <button
                                className="btn-evidence-retake"
                                onClick={() => cameraInputRefs.current[v.view_id]?.click()}
                              >
                                🔄 Replace Capture
                              </button>
                              <button
                                className="btn-evidence-discard"
                                onClick={() => handleDeleteEvidence(v.view_id)}
                              >
                                🗑️ Discard
                              </button>
                            </div>
                          )}
                        </>
                      )}
                      {!canUpload && (
                        <div className="evidence-readonly-note">
                          <span>Read-only evidence view</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="evidence-modal-footer">
          <div className="footer-status-summary">
            {viewsData?.all_required_passed ? (
              <span className="summary-passed-text">
                🎉 All {requiredCount} required views validated. Ready for review submission!
              </span>
            ) : (
              <span className="summary-pending-text">
                ⚠️ Complete all {requiredCount} required views to submit this inspection.
              </span>
            )}
          </div>
          <div className="footer-btn-group" style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            {canUpload && views.some((v) => v.has_capture) && (
              <button
                id="btn-cleanup-evidence"
                className="btn-danger btn-sm"
                onClick={handleCleanupEvidence}
                disabled={cleaning}
                title="Purge all temporary evidence captures for this inspection"
              >
                {cleaning ? "Purging..." : "🗑️ Cleanup Evidence"}
              </button>
            )}
            <button className="btn-primary" onClick={onClose}>
              Done & Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
