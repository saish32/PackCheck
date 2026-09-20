"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

const STEPS = [
  { id: 1, title: "01 Details", desc: "Product & Packaging" },
  { id: 2, title: "02 Evidence", desc: "Multi-View Capture" },
  { id: 3, title: "03 Extraction", desc: "Pretrained OCR" },
  { id: 4, title: "04 Compliance", desc: "Rulebook Evaluation" },
  { id: 5, title: "05 Review", desc: "Findings & Actions" },
];

export default function NewInspectionWizard({ onCancel, onInspectionCreated, onOpenWorkspace }) {
  const { token, hasRole } = useAuth();
  const [currentStep, setCurrentStep] = useState(1);
  const [createdInspection, setCreatedInspection] = useState(null);

  // Form Fields (Step 1)
  const [formName, setFormName] = useState("");
  const [formProduct, setFormProduct] = useState("");
  const [formBrand, setFormBrand] = useState("");
  const [formBatch, setFormBatch] = useState("");
  const [formPkgType, setFormPkgType] = useState("Flexible Pouch");
  const [formCategory, setFormCategory] = useState("Packaged Food & Snacks");
  const [formFssai, setFormFssai] = useState("");
  const [formNetQty, setFormNetQty] = useState("");
  const [formNotes, setFormNotes] = useState("");

  // States
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Step 2 Evidence state
  const [viewsData, setViewsData] = useState(null);
  const [uploadingView, setUploadingView] = useState(null);

  // Step 3 Extraction state
  const [extracting, setExtracting] = useState(false);
  const [extractedData, setExtractedData] = useState(null);

  // Step 4 Compliance state
  const [evaluating, setEvaluating] = useState(false);
  const [complianceData, setComplianceData] = useState(null);

  // Step 1: Validate and submit draft inspection
  const validateStep1 = () => {
    const errs = {};
    if (!formName.trim()) errs.name = "Inspection title is required.";
    if (!formProduct.trim()) errs.product = "Product name is required.";
    if (!formBrand.trim()) errs.brand = "Brand name is required.";
    if (!formBatch.trim()) errs.batch = "Batch or lot number is required.";
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCreateDraft = async (proceed = true) => {
    if (!validateStep1()) {
      setErrorMsg("Please complete all required fields marked with an asterisk (*).");
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      const payload = {
        name: formName.trim(),
        product_name: formProduct.trim(),
        brand_name: formBrand.trim(),
        batch_number: formBatch.trim(),
        packaging_type: formPkgType,
        category: formCategory,
        fssai_license: formFssai.trim() || null,
        net_quantity: formNetQty.trim() || null,
        notes: formNotes.trim() || null,
      };

      const res = await fetch(`${API_BASE_URL}/inspections`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Failed to initialize inspection record.");
      }

      const created = await res.json();
      setCreatedInspection(created);
      if (onInspectionCreated) onInspectionCreated(created);

      if (proceed) {
        // Fetch evidence views and advance to Step 2
        await fetchEvidenceViews(created.inspection_id);
        setCurrentStep(2);
      } else {
        // Save draft and open workspace
        if (onOpenWorkspace) onOpenWorkspace(created);
      }
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Fetch Views & Upload
  const fetchEvidenceViews = async (insId) => {
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/views`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setViewsData(data);
      }
    } catch (err) {
      console.error("Failed to load views:", err);
    }
  };

  const handleFileUpload = async (viewId, file) => {
    if (!file || !createdInspection) return;
    setUploadingView(viewId);
    setErrorMsg(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(
        `${API_BASE_URL}/inspections/${createdInspection.inspection_id}/evidence/${viewId}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!res.ok) {
        const result = await res.json().catch(() => ({}));
        throw new Error(result.detail || `Upload failed with status ${res.status}`);
      }

      await fetchEvidenceViews(createdInspection.inspection_id);
    } catch (err) {
      setErrorMsg(`Evidence upload failed: ${err.message}`);
    } finally {
      setUploadingView(null);
    }
  };

  // Step 3: Run Extraction
  const handleRunExtraction = async () => {
    if (!createdInspection) return;
    setExtracting(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${createdInspection.inspection_id}/extract`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Extraction execution failed.");
      }

      const data = await res.json();
      setExtractedData(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setExtracting(false);
    }
  };

  // Step 4: Run Compliance
  const handleRunCompliance = async () => {
    if (!createdInspection) return;
    setEvaluating(true);
    setErrorMsg(null);

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${createdInspection.inspection_id}/compliance/evaluate`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || "Compliance evaluation failed.");
      }

      const data = await res.json();
      setComplianceData(data);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setEvaluating(false);
    }
  };

  const capturedViewsCount = (viewsData?.views || []).filter((v) => v.has_capture).length;

  return (
    <div className="new-inspection-wizard-container">
      {/* WIZARD HEADER */}
      <div className="wizard-header-bar">
        <div>
          <span className="wizard-pre-title">REGULATORY COMPLIANCE PIPELINE</span>
          <h2 className="wizard-main-title">New Packaging Inspection</h2>
          <p className="wizard-subtitle">
            Progressive workflow for physical packaging intake, evidence verification, and statutory screening.
          </p>
        </div>
        <button type="button" className="btn-secondary btn-sm" onClick={onCancel}>
          Cancel & Close
        </button>
      </div>

      {/* STEPPER PROGRESS TRACK */}
      <nav className="wizard-stepper-track" aria-label="Creation Steps">
        {STEPS.map((step) => {
          const isDone = currentStep > step.id;
          const isCurrent = currentStep === step.id;
          return (
            <div
              key={step.id}
              className={`stepper-step ${isCurrent ? "current" : isDone ? "completed" : "pending"}`}
            >
              <div className="stepper-node">
                {isDone ? <Icon name="check" size={13} /> : step.id}
              </div>
              <div className="stepper-text">
                <span className="step-title">{step.title}</span>
                <span className="step-desc">{step.desc}</span>
              </div>
              {step.id < STEPS.length && <div className="stepper-line" aria-hidden="true" />}
            </div>
          );
        })}
      </nav>

      {/* ERROR SUMMARY BANNER */}
      {errorMsg && (
        <div className="alert-banner alert-danger" role="alert">
          <Icon name="alert" size={16} />
          <span>{errorMsg}</span>
          <button type="button" className="btn-dismiss-alert" onClick={() => setErrorMsg(null)}>
            ✕
          </button>
        </div>
      )}

      {/* WIZARD BODY PANEL */}
      <div className="wizard-card-surface">
        {/* ========================================================================= */}
        {/* STEP 01 — PRODUCT & PACKAGING DETAILS                                     */}
        {/* ========================================================================= */}
        {currentStep === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateDraft(true);
            }}
            className="wizard-form"
          >
            <div className="wizard-section-heading">
              <h3>Step 01 — Packaging Inspection Parameters</h3>
              <p>Initialize an immutable record under Legal Metrology (Packaged Commodities) Rules.</p>
            </div>

            <div className="form-grid-enterprise">
              {/* Product Group */}
              <div className="form-group span-2">
                <label className="form-label" htmlFor="insp-name">
                  Inspection Record Title <span className="req-marker">*</span>
                </label>
                <input
                  id="insp-name"
                  type="text"
                  className={`form-input ${fieldErrors.name ? "input-error" : ""}`}
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Britannia Bourbon 150g Batch Q3 Compliance Audit"
                  required
                />
                {fieldErrors.name && <span className="field-error-text">{fieldErrors.name}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="product-name">
                  Product Declared Name <span className="req-marker">*</span>
                </label>
                <input
                  id="product-name"
                  type="text"
                  className={`form-input ${fieldErrors.product ? "input-error" : ""}`}
                  value={formProduct}
                  onChange={(e) => setFormProduct(e.target.value)}
                  placeholder="e.g. Bourbon Chocolate Biscuits"
                  required
                />
                {fieldErrors.product && <span className="field-error-text">{fieldErrors.product}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="brand-name">
                  Brand / Manufacturer Name <span className="req-marker">*</span>
                </label>
                <input
                  id="brand-name"
                  type="text"
                  className={`form-input ${fieldErrors.brand ? "input-error" : ""}`}
                  value={formBrand}
                  onChange={(e) => setFormBrand(e.target.value)}
                  placeholder="e.g. Britannia Industries Ltd"
                  required
                />
                {fieldErrors.brand && <span className="field-error-text">{fieldErrors.brand}</span>}
              </div>

              {/* Packaging Group */}
              <div className="form-group">
                <label className="form-label" htmlFor="batch-number">
                  Batch / Lot / Code Number <span className="req-marker">*</span>
                </label>
                <input
                  id="batch-number"
                  type="text"
                  className={`form-input ${fieldErrors.batch ? "input-error" : ""}`}
                  value={formBatch}
                  onChange={(e) => setFormBatch(e.target.value)}
                  placeholder="e.g. BATCH-2026-B9"
                  required
                />
                {fieldErrors.batch && <span className="field-error-text">{fieldErrors.batch}</span>}
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="pkg-type">
                  Packaging Material & Format <span className="req-marker">*</span>
                </label>
                <select
                  id="pkg-type"
                  className="form-select"
                  value={formPkgType}
                  onChange={(e) => setFormPkgType(e.target.value)}
                >
                  <option value="Flexible Pouch">Flexible Pouch / Polyfilm Wrapper</option>
                  <option value="Corrugated Carton">Corrugated Carton / Paper Box</option>
                  <option value="Glass Bottle">Glass Bottle / Jar</option>
                  <option value="Tetra Pak">Tetra Pak / Aseptic Brick</option>
                  <option value="Rigid Plastic Container">Rigid Plastic Container / Tub</option>
                  <option value="Metal Can">Metal Can / Aluminium Tin</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="regulatory-cat">
                  Regulatory Commodity Class <span className="req-marker">*</span>
                </label>
                <select
                  id="regulatory-cat"
                  className="form-select"
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                >
                  <option value="Packaged Food & Snacks">Packaged Food & Snacks</option>
                  <option value="Beverages & Juices">Beverages & Juices</option>
                  <option value="Dairy & Milk Products">Dairy & Milk Products</option>
                  <option value="Pharmaceuticals">Pharmaceuticals & OTC</option>
                  <option value="Personal Care & Cosmetics">Personal Care & Cosmetics</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="fssai-no">
                  FSSAI License / Registration No. (Optional)
                </label>
                <input
                  id="fssai-no"
                  type="text"
                  className="form-input"
                  value={formFssai}
                  onChange={(e) => setFormFssai(e.target.value)}
                  placeholder="e.g. 10014022002345"
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="net-quantity">
                  Declared Net Quantity (Optional)
                </label>
                <input
                  id="net-quantity"
                  type="text"
                  className="form-input"
                  value={formNetQty}
                  onChange={(e) => setFormNetQty(e.target.value)}
                  placeholder="e.g. 150 g / 5.29 oz"
                />
              </div>

              <div className="form-group span-2">
                <label className="form-label" htmlFor="prelim-notes">
                  Preliminary Audit & Field Notes (Optional)
                </label>
                <textarea
                  id="prelim-notes"
                  className="form-textarea"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  rows={2}
                  placeholder="Initial inspector observations, retail store location, or sample packaging context..."
                />
              </div>
            </div>

            <div className="wizard-actions-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => handleCreateDraft(false)}
                disabled={submitting}
              >
                Save Draft
              </button>
              <button
                type="submit"
                className="btn-primary"
                disabled={submitting}
              >
                {submitting ? "Initializing..." : "Continue to Evidence Capture →"}
              </button>
            </div>
          </form>
        )}

        {/* ========================================================================= */}
        {/* STEP 02 — MULTI-VIEW EVIDENCE CAPTURE                                     */}
        {/* ========================================================================= */}
        {currentStep === 2 && createdInspection && (
          <div className="wizard-step-body">
            <div className="wizard-section-heading">
              <div className="heading-meta-tag font-mono">{createdInspection.inspection_id}</div>
              <h3>Step 02 — Multi-View Evidence Intake</h3>
              <p>Upload clean packaging panels for automated quality analysis and OCR detection.</p>
            </div>

            <div className="wizard-evidence-grid">
              {(viewsData?.views || []).map((v) => {
                const isUploading = uploadingView === v.view_id;
                return (
                  <div key={v.view_id} className="wizard-view-box">
                    <div className="view-box-header">
                      <div className="view-title">{v.title}</div>
                      <span className={`requirement-chip ${v.is_required ? "req" : "opt"}`}>
                        {v.is_required ? "Required" : "Optional"}
                      </span>
                    </div>
                    <p className="view-instruction">{v.instruction}</p>

                    <div className="view-upload-zone">
                      {isUploading ? (
                        <div className="uploading-state">
                          <span className="spinner-sm" />
                          <span>Screening image quality...</span>
                        </div>
                      ) : v.has_capture ? (
                        <div className="capture-status-row">
                          <span className={`status-pill status-${v.capture_status}`}>
                            {v.capture_status === "passed" && "Passed"}
                            {v.capture_status === "warning" && "Warning"}
                            {v.capture_status === "recapture_required" && "Needs Recapture"}
                            {v.capture_status === "failed" && "Failed"}
                          </span>
                          <span className="file-info">{v.file_name || "Captured"}</span>
                        </div>
                      ) : (
                        <span className="no-capture-text">No photo uploaded</span>
                      )}

                      <label className="btn-upload-label">
                        <Icon name="camera" size={14} />
                        <span>{v.has_capture ? "Replace Photo" : "Upload Photo"}</span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            if (e.target.files?.[0]) {
                              handleFileUpload(v.view_id, e.target.files[0]);
                              e.target.value = "";
                            }
                          }}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="wizard-actions-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onOpenWorkspace && onOpenWorkspace(createdInspection, "evidence")}
              >
                Open in Full Evidence Hub
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => {
                  setCurrentStep(3);
                }}
                disabled={capturedViewsCount === 0}
              >
                Continue to Extraction ({capturedViewsCount} Captured) →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 03 — OCR FIELD EXTRACTION                                            */}
        {/* ========================================================================= */}
        {currentStep === 3 && createdInspection && (
          <div className="wizard-step-body">
            <div className="wizard-section-heading">
              <div className="heading-meta-tag font-mono">{createdInspection.inspection_id}</div>
              <h3>Step 03 — Pretrained OCR & Field Extraction</h3>
              <p>Run automated optical character recognition to extract regulatory declarations from packaging panels.</p>
            </div>

            <div className="wizard-action-card">
              <div className="action-card-info">
                <h4>Run Automated Extraction</h4>
                <p>
                  Extracts Mandatory Declarations under Rule 6: Product Name, Net Qty, MRP, Manufacturing Date, Best Before, FSSAI, Consumer Care, and Origin.
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleRunExtraction}
                disabled={extracting}
              >
                {extracting ? (
                  <>
                    <span className="spinner-sm" />
                    <span>Extracting Fields...</span>
                  </>
                ) : (
                  <>
                    <Icon name="sparkles" size={16} />
                    <span>Execute OCR Extraction</span>
                  </>
                )}
              </button>
            </div>

            {extractedData && (
              <div className="wizard-results-summary">
                <div className="summary-stat-pill">
                  Total Fields: <strong>{extractedData.total_declarations}</strong>
                </div>
                <div className="summary-stat-pill">
                  Verified: <strong>{extractedData.verified_count}</strong>
                </div>
                <div className="summary-stat-pill">
                  Review Required: <strong>{extractedData.review_required_count}</strong>
                </div>
              </div>
            )}

            <div className="wizard-actions-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onOpenWorkspace && onOpenWorkspace(createdInspection, "declarations")}
              >
                Open in Declarations Workspace
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCurrentStep(4)}
              >
                Continue to Compliance Evaluation →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 04 — REGULATORY COMPLIANCE EVALUATION                                 */}
        {/* ========================================================================= */}
        {currentStep === 4 && createdInspection && (
          <div className="wizard-step-body">
            <div className="wizard-section-heading">
              <div className="heading-meta-tag font-mono">{createdInspection.inspection_id}</div>
              <h3>Step 04 — Regulatory Compliance Evaluation</h3>
              <p>Evaluate extracted packaging declarations against authoritative 2026.09.16 Legal Metrology rules.</p>
            </div>

            <div className="wizard-action-card">
              <div className="action-card-info">
                <h4>Deterministic Rulebook Assessment</h4>
                <p>
                  Executes rule checks for mandatory presence, unit formatting, font size suitability, and Maximum Permissible Error (MPE).
                </p>
              </div>
              <button
                type="button"
                className="btn-primary"
                onClick={handleRunCompliance}
                disabled={evaluating}
              >
                {evaluating ? (
                  <>
                    <span className="spinner-sm" />
                    <span>Evaluating Rules...</span>
                  </>
                ) : (
                  <>
                    <Icon name="compliance" size={16} />
                    <span>Run Compliance Checks</span>
                  </>
                )}
              </button>
            </div>

            {complianceData && (
              <div className="compliance-result-box">
                <div className="result-header">
                  <span className="result-label">Overall Evaluation State:</span>
                  <span className={`status-pill status-${complianceData.overall_state?.toLowerCase()}`}>
                    {complianceData.overall_state}
                  </span>
                </div>
                <div className="result-meta-row">
                  <span>Rulebook Version: <strong>{complianceData.rulebook_version}</strong></span>
                  <span className="dot">•</span>
                  <span>Findings Count: <strong>{complianceData.findings?.length || 0}</strong></span>
                </div>
              </div>
            )}

            <div className="wizard-actions-bar">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onOpenWorkspace && onOpenWorkspace(createdInspection, "compliance")}
              >
                Open Compliance Hub
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setCurrentStep(5)}
              >
                Continue to Final Review →
              </button>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* STEP 05 — REVIEW & LIFECYCLE HANDOFF                                      */}
        {/* ========================================================================= */}
        {currentStep === 5 && createdInspection && (
          <div className="wizard-step-body">
            <div className="wizard-section-heading">
              <div className="heading-meta-tag font-mono">{createdInspection.inspection_id}</div>
              <h3>Step 05 — Inspection Record Review</h3>
              <p>Inspection record is successfully established. Choose next operational action.</p>
            </div>

            <div className="review-summary-card">
              <div className="review-summary-row">
                <span className="review-label">Product Name</span>
                <span className="review-val">{createdInspection.product_name}</span>
              </div>
              <div className="review-summary-row">
                <span className="review-label">Brand & Batch</span>
                <span className="review-val">{createdInspection.brand_name} • {createdInspection.batch_number}</span>
              </div>
              <div className="review-summary-row">
                <span className="review-label">Packaging Type</span>
                <span className="review-val">{createdInspection.packaging_type}</span>
              </div>
              <div className="review-summary-row">
                <span className="review-label">Evidence Uploaded</span>
                <span className="review-val">{capturedViewsCount} packaging panel(s)</span>
              </div>
              {complianceData && (
                <div className="review-summary-row">
                  <span className="review-label">Compliance Result</span>
                  <span className={`status-pill status-${complianceData.overall_state?.toLowerCase()}`}>
                    {complianceData.overall_state}
                  </span>
                </div>
              )}
            </div>

            <div className="wizard-actions-bar">
              <button
                type="button"
                className="btn-primary btn-lg"
                onClick={() => onOpenWorkspace && onOpenWorkspace(createdInspection, "summary")}
              >
                Open Full Inspection Workspace →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
