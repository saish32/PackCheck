"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth } from "@/context/AuthContext";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export default function ComplianceWorkspaceModal({ inspection, isOpen, onClose }) {
  const { token, hasRole } = useAuth();
  const canEdit = hasRole(["inspector", "supervisor", "admin"]);
  const insId = inspection?.inspection_id || inspection?.id;

  // Active workspace tab
  const [activeTab, setActiveTab] = useState("checklist"); // 'checklist', 'compliance', 'context'
  const [filterOutcome, setFilterOutcome] = useState("all"); // 'all', 'SATISFIED', 'POTENTIAL_NON_COMPLIANCE', 'REVIEW_REQUIRED'
  const [checklistFilter, setChecklistFilter] = useState("all"); // 'all', 'APPLICABLE', 'CONDITIONAL', 'EXCLUDED', 'REVIEW_REQUIRED'

  // Data states
  const [checklistData, setChecklistData] = useState(null);
  const [complianceRun, setComplianceRun] = useState(null);
  const [loadingChecklist, setLoadingChecklist] = useState(false);
  const [loadingCompliance, setLoadingCompliance] = useState(false);
  const [evaluating, setEvaluating] = useState(false);
  const [savingContext, setSavingContext] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Phase 10-11 Report & Finalization states
  const [reportMeta, setReportMeta] = useState(null);
  const [loadingReport, setLoadingReport] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizationStep, setFinalizationStep] = useState(0); // 0 to 7
  const [finalNotes, setFinalNotes] = useState("");
  const [finalizeError, setFinalizeError] = useState(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [evidenceData, setEvidenceData] = useState(null);

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
    sector: "",
    calibration_valid: false,
    letter_height_mm: "",
    letter_width_mm: "",
    pdp_area_cm2: "",
    measurement_verified: false,
    measured_value: "",
    observed_sale_price: "",
  });

  // Populate context from inspection
  useEffect(() => {
    if (inspection?.metadata_json) {
      try {
        const meta = JSON.parse(inspection.metadata_json);
        const rc = meta.rule_context || {};
        const cal = rc.calibration || {};
        const qm = rc.quantity_measurement || {};
        const txn = rc.transaction_context || {};

        setContextForm({
          commodity_class: rc.commodity_class || inspection.product_category || "",
          package_type: rc.package_type || inspection.packaging_type || "retail",
          consumer_type: rc.consumer_type || "retail",
          declared_quantity_value: rc.declared_quantity_value ?? inspection.net_quantity_declared ?? "",
          declared_quantity_unit: rc.declared_quantity_unit || "g",
          is_imported: Boolean(rc.is_imported),
          is_ecommerce: Boolean(rc.is_ecommerce),
          is_medical_device: Boolean(rc.is_medical_device),
          sector: rc.sector || "",
          calibration_valid: Boolean(cal.valid),
          letter_height_mm: rc.letter_height_mm ?? "",
          letter_width_mm: rc.letter_width_mm ?? "",
          pdp_area_cm2: rc.pdp_area_cm2 ?? "",
          measurement_verified: Boolean(qm.verified_by_inspector),
          measured_value: qm.measured_value ?? "",
          observed_sale_price: txn.observed_sale_price ?? "",
        });
      } catch (e) {
        // ignore parse error
      }
    }
  }, [inspection]);

  // Fetch dynamic checklist
  const fetchChecklist = useCallback(async () => {
    if (!insId || !token) return;
    setLoadingChecklist(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/checklist`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setChecklistData(data);
      }
    } catch (err) {
      // silently log
      console.error("Failed to load checklist", err);
    } finally {
      setLoadingChecklist(false);
    }
  }, [insId, token]);

  // Fetch latest compliance run
  const fetchLatestCompliance = useCallback(async () => {
    if (!insId || !token) return;
    setLoadingCompliance(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/compliance/latest`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setComplianceRun(data);
      } else if (res.status === 404) {
        setComplianceRun(null);
      }
    } catch (err) {
      console.error("Failed to load compliance run", err);
    } finally {
      setLoadingCompliance(false);
    }
  }, [insId, token]);

  // Fetch permanent report metadata (Phase 10-11)
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
      } else if (res.status === 404) {
        setReportMeta(null);
      }
    } catch (err) {
      console.error("Failed to load report metadata", err);
    } finally {
      setLoadingReport(false);
    }
  }, [insId, token]);

  const fetchEvidenceStatus = useCallback(async () => {
    if (!insId || !token) return;
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/views`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setEvidenceData(data);
      }
    } catch (e) {
      console.warn("Could not check evidence status:", e);
    }
  }, [insId, token]);

  useEffect(() => {
    if (isOpen && insId) {
      setErrorMsg(null);
      setSuccessMsg(null);
      setFinalizeError(null);
      fetchChecklist();
      fetchLatestCompliance();
      fetchReportMeta();
      fetchEvidenceStatus();
    }
  }, [isOpen, insId, fetchChecklist, fetchLatestCompliance, fetchReportMeta, fetchEvidenceStatus]);

  // Execute Strict 10-Step Finalization Lifecycle
  const handleFinalize = async () => {
    if (!insId || !token) return;
    setFinalizing(true);
    setFinalizeError(null);
    setErrorMsg(null);
    setSuccessMsg(null);

    // Simulated progress steps for UI transparency
    setFinalizationStep(1); // Preparing evidence & declarations
    const stepTimer = setInterval(() => {
      setFinalizationStep((prev) => (prev < 5 ? prev + 1 : prev));
    }, 450);

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/finalize`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notes: finalNotes || "Finalized via PackCheck compliance hub." }),
      });
      clearInterval(stepTimer);

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || "Finalization failed. Temporary evidence preserved.");
      }

      setFinalizationStep(6); // Purging temporary evidence
      setTimeout(() => {
        setFinalizationStep(7); // Finalized
        setReportMeta(data.report);
        setSuccessMsg(data.message || "Inspection successfully finalized. Report is permanently stored.");
      }, 300);

      // Refresh inspection context & checklist
      fetchReportMeta();
      fetchChecklist();
    } catch (err) {
      clearInterval(stepTimer);
      setFinalizationStep(0);
      setFinalizeError(err.message);
    } finally {
      setFinalizing(false);
    }
  };

  // Download Final PDF Report
  const handleDownloadPdf = async () => {
    if (!insId || !token) return;
    setDownloadingPdf(true);
    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/report/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error("Failed to download final PDF report.");
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = reportMeta?.filename || `${insId}_Final_Report.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setDownloadingPdf(false);
    }
  };

  if (!isOpen || !inspection) return null;

  // Run Compliance Evaluation
  const handleRunEvaluation = async () => {
    setEvaluating(true);
    setErrorMsg(null);
    setSuccessMsg(null);
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
      if (!res.ok) {
        throw new Error(data.detail || "Compliance evaluation failed.");
      }
      setComplianceRun(data);
      setActiveTab("compliance");
      setSuccessMsg(`Compliance evaluation complete. State: ${data.overall_state}`);
      fetchChecklist();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setEvaluating(false);
    }
  };

  // Save Context to Inspection
  const handleSaveContext = async (e) => {
    if (e) e.preventDefault();
    setSavingContext(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const payloadContext = {
      commodity_class: contextForm.commodity_class,
      package_type: contextForm.package_type,
      consumer_type: contextForm.consumer_type,
      declared_quantity_value: contextForm.declared_quantity_value !== "" ? Number(contextForm.declared_quantity_value) : null,
      declared_quantity_unit: contextForm.declared_quantity_unit,
      is_imported: contextForm.is_imported,
      is_ecommerce: contextForm.is_ecommerce,
      is_medical_device: contextForm.is_medical_device,
      sector: contextForm.sector || null,
      calibration: {
        valid: contextForm.calibration_valid,
      },
      letter_height_mm: contextForm.letter_height_mm !== "" ? Number(contextForm.letter_height_mm) : null,
      letter_width_mm: contextForm.letter_width_mm !== "" ? Number(contextForm.letter_width_mm) : null,
      pdp_area_cm2: contextForm.pdp_area_cm2 !== "" ? Number(contextForm.pdp_area_cm2) : null,
      quantity_measurement: contextForm.measurement_verified
        ? {
            verified_by_inspector: true,
            declared_value: Number(contextForm.declared_quantity_value) || 0,
            measured_value: Number(contextForm.measured_value) || 0,
            base_unit: contextForm.declared_quantity_unit,
          }
        : null,
      transaction_context: contextForm.observed_sale_price !== ""
        ? {
            observed_sale_price: Number(contextForm.observed_sale_price),
          }
        : {},
    };

    try {
      const res = await fetch(`${API_BASE_URL}/inspections/${insId}/rule-context`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ context: payloadContext }),
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || "Failed to update regulatory context.");
      }
      setSuccessMsg("Regulatory context & verified measurements saved successfully.");
      fetchChecklist();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSavingContext(false);
    }
  };

  // Filter items
  const filteredChecklist = checklistData?.items?.filter((item) => {
    if (checklistFilter === "all") return true;
    return item.status === checklistFilter;
  }) || [];

  const filteredFindings = complianceRun?.findings?.filter((f) => {
    if (filterOutcome === "all") return true;
    return f.outcome === filterOutcome;
  }) || [];

  const getOutcomeBadge = (outcome) => {
    switch (outcome) {
      case "SATISFIED":
        return <span className="status-badge badge-satisfied">✔ SATISFIED</span>;
      case "POTENTIAL_NON_COMPLIANCE":
        return <span className="status-badge badge-pnc">⚠ POTENTIAL NON-COMPLIANCE</span>;
      case "REVIEW_REQUIRED":
      default:
        return <span className="status-badge badge-review">🔍 REVIEW REQUIRED</span>;
    }
  };

  const getChecklistStatusBadge = (status) => {
    switch (status) {
      case "APPLICABLE":
        return <span className="status-badge badge-satisfied">APPLICABLE</span>;
      case "CONDITIONAL":
        return <span className="status-badge badge-warning">CONDITIONAL</span>;
      case "EXCLUDED":
        return <span className="status-badge badge-secondary">EXCLUDED</span>;
      case "REVIEW_REQUIRED":
      default:
        return <span className="status-badge badge-review">REVIEW REQUIRED</span>;
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-card modal-xl compliance-workspace-modal" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="modal-header">
          <div>
            <div className="modal-title-row">
              <span className="platform-tag">PackCheck Regulatory Intelligence</span>
              <h3 className="modal-title">Regulatory Checklist & Compliance Hub</h3>
            </div>
            <p className="modal-subtitle">
              Inspection: <strong>{inspection.inspection_id}</strong> • Product: <strong>{inspection.product_name}</strong> • Batch: <strong>{inspection.batch_number || "N/A"}</strong>
            </p>
          </div>
          <div className="modal-header-actions">
            <div className="rulebook-hash-badge" title={`Authoritative SHA-256: ${checklistData?.rulebook_hash || complianceRun?.rulebook_hash || "LMPC Central"}`}>
              <span className="rulebook-icon">⚖️</span>
              <span className="rulebook-label">LMPC Rulebook 2026.09.16</span>
              <span className="rulebook-hash-code">
                {(checklistData?.rulebook_hash || complianceRun?.rulebook_hash || "").slice(0, 8)}...
              </span>
            </div>
            <button className="btn-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ALERTS */}
        {errorMsg && <div className="alert alert-danger">{errorMsg}</div>}
        {successMsg && <div className="alert alert-success">{successMsg}</div>}

        {/* WORKSPACE NAVIGATION TABS */}
        <div className="workspace-tabs-bar">
          <div className="workspace-tabs">
            <button
              className={`ws-tab-btn ${activeTab === "checklist" ? "active" : ""}`}
              onClick={() => setActiveTab("checklist")}
            >
              📋 Dynamic Checklist (Phase 8)
              {checklistData?.items && (
                <span className="tab-count-pill">{checklistData.items.length}</span>
              )}
            </button>
            <button
              className={`ws-tab-btn ${activeTab === "compliance" ? "active" : ""}`}
              onClick={() => setActiveTab("compliance")}
            >
              ⚖️ Compliance Evaluation (Phase 9)
              {complianceRun && (
                <span className={`tab-state-dot dot-${complianceRun.overall_state.toLowerCase()}`} />
              )}
            </button>
            <button
              className={`ws-tab-btn ${activeTab === "context" ? "active" : ""}`}
              onClick={() => setActiveTab("context")}
            >
              ⚙️ Legal Context & Measurements
            </button>
            <button
              className={`ws-tab-btn ${activeTab === "report" ? "active" : ""}`}
              onClick={() => setActiveTab("report")}
            >
              📄 Final Inspection Report (Phases 10–11)
              {reportMeta ? (
                <span className="tab-state-dot dot-satisfied" title="Report Verified & Permanently Stored" />
              ) : null}
            </button>
          </div>

          {/* QUICK ACTIONS */}
          <div className="workspace-quick-actions">
            <button
              className="btn-primary btn-sm btn-glow"
              onClick={handleRunEvaluation}
              disabled={evaluating}
            >
              {evaluating ? "⏳ Evaluating..." : "⚡ Run Compliance Evaluation"}
            </button>
          </div>
        </div>

        {/* MODAL BODY CONTENT */}
        <div className="workspace-body-container">
          {/* TAB 1: DYNAMIC CHECKLIST */}
          {activeTab === "checklist" && (
            <div className="workspace-tab-pane">
              <div className="pane-header-row">
                <div>
                  <h4 className="pane-heading">Dynamic Inspection Checklist</h4>
                  <p className="pane-subtext">
                    Customized regulatory requirements resolved from the authoritative 2026.09.16 rulebook based on commodity, package format, and distribution channel.
                  </p>
                </div>
                <div className="filter-pills">
                  {["all", "APPLICABLE", "CONDITIONAL", "EXCLUDED", "REVIEW_REQUIRED"].map((st) => (
                    <button
                      key={st}
                      className={`filter-pill ${checklistFilter === st ? "active" : ""}`}
                      onClick={() => setChecklistFilter(st)}
                    >
                      {st === "all" ? "All Checks" : st.replace("_", " ")}
                    </button>
                  ))}
                </div>
              </div>

              {loadingChecklist ? (
                <div className="workspace-loader">Loading customized regulatory checklist...</div>
              ) : filteredChecklist.length === 0 ? (
                <div className="empty-state-box">No checklist items match the selected filter.</div>
              ) : (
                <div className="checklist-grid">
                  {filteredChecklist.map((item, idx) => (
                    <div key={idx} className={`checklist-item-card status-border-${item.status.toLowerCase()}`}>
                      <div className="checklist-item-header">
                        <div className="rule-badge-group">
                          <span className="rule-id-tag">Rule {item.rule_no}</span>
                          <span className="req-key-tag">{item.requirement_key}</span>
                        </div>
                        {getChecklistStatusBadge(item.status)}
                      </div>

                      <h5 className="checklist-item-title">{item.title}</h5>
                      <p className="checklist-item-desc">{item.description}</p>

                      <div className="checklist-reason-box">
                        <strong>WHY: </strong> {item.applicability_reason}
                      </div>

                      <div className="checklist-meta-footer">
                        <div className="meta-item">
                          <span className="meta-label">Evidence Required:</span>
                          <span className="meta-val">{item.evidence_required}</span>
                        </div>
                        <div className="meta-item-split">
                          <span className="verification-mode-pill mode-{item.verification_mode.toLowerCase()}">
                            {item.verification_mode.replace("_", " ")}
                          </span>
                          <span className="source-citation">{item.regulatory_source}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: COMPLIANCE RUN & FINDINGS */}
          {activeTab === "compliance" && (
            <div className="workspace-tab-pane">
              {/* Overall State Banner */}
              {complianceRun ? (
                <div className={`overall-state-banner state-banner-${complianceRun.overall_state.toLowerCase()}`}>
                  <div className="banner-left">
                    <span className="banner-icon">
                      {complianceRun.overall_state === "SATISFIED" ? "✔" : complianceRun.overall_state === "POTENTIAL_NON_COMPLIANCE" ? "⚠" : "🔍"}
                    </span>
                    <div>
                      <div className="banner-subtitle">Overall Inspection Evaluation State</div>
                      <h3 className="banner-state-text">{complianceRun.overall_state.replace("_", " ")}</h3>
                    </div>
                  </div>
                  <div className="banner-right">
                    <div className="banner-metric">
                      <span className="metric-num">{complianceRun.findings.filter(f => f.outcome === "SATISFIED").length}</span>
                      <span className="metric-lbl">Satisfied</span>
                    </div>
                    <div className="banner-metric">
                      <span className="metric-num">{complianceRun.findings.filter(f => f.outcome === "POTENTIAL_NON_COMPLIANCE").length}</span>
                      <span className="metric-lbl">Potential Non-Compliance</span>
                    </div>
                    <div className="banner-metric">
                      <span className="metric-num">{complianceRun.findings.filter(f => f.outcome === "REVIEW_REQUIRED").length}</span>
                      <span className="metric-lbl">Review Required</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-compliance-banner glass-card">
                  <p>No compliance evaluation has been executed for this inspection yet.</p>
                  <button className="btn-primary" onClick={handleRunEvaluation} disabled={evaluating}>
                    {evaluating ? "Evaluating..." : "Run Deterministic Compliance Evaluation"}
                  </button>
                </div>
              )}

              {/* Filter bar for findings */}
              {complianceRun && (
                <div className="pane-header-row" style={{ marginTop: "1rem" }}>
                  <h4 className="pane-heading">Compliance Findings Ledger ({filteredFindings.length})</h4>
                  <div className="filter-pills">
                    {["all", "SATISFIED", "POTENTIAL_NON_COMPLIANCE", "REVIEW_REQUIRED"].map((st) => (
                      <button
                        key={st}
                        className={`filter-pill ${filterOutcome === st ? "active" : ""}`}
                        onClick={() => setFilterOutcome(st)}
                      >
                        {st === "all" ? "All Findings" : st.replace("_", " ")}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Findings Cards */}
              {complianceRun && (
                <div className="findings-list">
                  {filteredFindings.map((f) => (
                    <div key={f.finding_id || f.id} className={`finding-card finding-border-${f.outcome.toLowerCase()}`}>
                      <div className="finding-header">
                        <div className="finding-id-group">
                          <span className="finding-ref-badge">Rule {f.rule_no}</span>
                          <span className="finding-key-name">{f.requirement_key}</span>
                          <span className="finding-id-pill">{f.finding_id}</span>
                        </div>
                        <div className="finding-header-right">
                          {getOutcomeBadge(f.outcome)}
                        </div>
                      </div>

                      <div className="finding-reason-text">
                        <strong>Reason [{f.reason_code}]: </strong> {f.reason_text}
                      </div>

                      {/* Actual vs Expected Grid */}
                      {(f.actual !== null || f.expected !== null) && (
                        <div className="actual-expected-grid">
                          <div className="comparison-col">
                            <span className="col-label">Actual Observed / Measured:</span>
                            <pre className="col-val">{typeof f.actual === "object" ? JSON.stringify(f.actual, null, 2) : String(f.actual ?? "Not provided")}</pre>
                          </div>
                          <div className="comparison-col">
                            <span className="col-label">Regulatory Expected:</span>
                            <pre className="col-val">{typeof f.expected === "object" ? JSON.stringify(f.expected, null, 2) : String(f.expected ?? "Statutory threshold")}</pre>
                          </div>
                        </div>
                      )}

                      {/* Limitations & Targeted Recapture Guidance */}
                      {f.limitations && f.limitations.length > 0 && (
                        <div className="limitations-alert">
                          <span className="limitation-icon">📌</span>
                          <div>
                            <strong>Inspector Guidance:</strong>
                            <ul className="limitation-list">
                              {f.limitations.map((lim, i) => (
                                <li key={i}>{lim}</li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      )}

                      {/* Footer Metadata */}
                      <div className="finding-footer">
                        <div className="footer-left">
                          <span className="decision-source-badge">
                            Decision: {f.decision_source === "rule_engine" ? "⚙️ Deterministic Engine" : "👤 Inspector Verified"}
                          </span>
                          {f.evidence_refs && f.evidence_refs.length > 0 && (
                            <span className="evidence-ref-tag">
                              Evidence: {f.evidence_refs.join(", ")}
                            </span>
                          )}
                        </div>
                        <div className="footer-right">
                          <span className="severity-tag severity-{f.severity}">Severity: {f.severity}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 3: REGULATORY CONTEXT & MEASUREMENTS EDITOR */}
          {activeTab === "context" && (
            <div className="workspace-tab-pane">
              <div className="pane-header-row">
                <div>
                  <h4 className="pane-heading">Regulatory Context & Physical Measurements</h4>
                  <p className="pane-subtext">
                    Field-supplied measurements and regulatory qualifiers. OCR extracts declarations, but physical net quantity and letter height thresholds strictly require verified inspector measurements and calibration.
                  </p>
                </div>
              </div>

              <form onSubmit={handleSaveContext} className="context-form-grid">
                {/* Commodity & Package Formats */}
                <div className="form-section-card glass-card">
                  <h5 className="section-title">📦 Package Classification</h5>

                  <div className="form-group">
                    <label className="form-label">Commodity Class / Category</label>
                    <input
                      type="text"
                      className="form-input"
                      value={contextForm.commodity_class}
                      onChange={(e) => setContextForm({ ...contextForm, commodity_class: e.target.value })}
                      placeholder="e.g. Biscuits, Detergent, Pan Masala, Cement"
                    />
                  </div>

                  <div className="form-row-2col">
                    <div className="form-group">
                      <label className="form-label">Package Type</label>
                      <select
                        className="form-input"
                        value={contextForm.package_type}
                        onChange={(e) => setContextForm({ ...contextForm, package_type: e.target.value })}
                      >
                        <option value="retail">Retail Package</option>
                        <option value="wholesale">Wholesale Package (Shipper)</option>
                        <option value="sheet">Sheet-based Package (Film/Paper)</option>
                        <option value="container">Container Commodity</option>
                      </select>
                    </div>

                    <div className="form-group">
                      <label className="form-label">Consumer Type</label>
                      <select
                        className="form-input"
                        value={contextForm.consumer_type}
                        onChange={(e) => setContextForm({ ...contextForm, consumer_type: e.target.value })}
                      >
                        <option value="retail">Retail Consumer</option>
                        <option value="industrial">Industrial Consumer</option>
                        <option value="institutional">Institutional Consumer</option>
                      </select>
                    </div>
                  </div>

                  <div className="form-row-2col">
                    <div className="form-group">
                      <label className="form-label">Declared Net Quantity Value</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        value={contextForm.declared_quantity_value}
                        onChange={(e) => setContextForm({ ...contextForm, declared_quantity_value: e.target.value })}
                        placeholder="e.g. 500"
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Unit</label>
                      <select
                        className="form-input"
                        value={contextForm.declared_quantity_unit}
                        onChange={(e) => setContextForm({ ...contextForm, declared_quantity_unit: e.target.value })}
                      >
                        <option value="g">g (Grams)</option>
                        <option value="kg">kg (Kilograms)</option>
                        <option value="ml">ml (Millilitres)</option>
                        <option value="l">l (Litres)</option>
                        <option value="pcs">pcs / units</option>
                      </select>
                    </div>
                  </div>
                </div>

                {/* Origin, Channel & Regulatory Regimes */}
                <div className="form-section-card glass-card">
                  <h5 className="section-title">🌐 Origin, Channel & Sector</h5>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contextForm.is_imported}
                        onChange={(e) => setContextForm({ ...contextForm, is_imported: e.target.checked })}
                      />
                      <span>Imported Product (Requires Country of Origin & Importer)</span>
                    </label>
                  </div>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contextForm.is_ecommerce}
                        onChange={(e) => setContextForm({ ...contextForm, is_ecommerce: e.target.checked })}
                      />
                      <span>E-Commerce Listing (Requires Rule 6(10A) Origin Filter)</span>
                    </label>
                  </div>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contextForm.is_medical_device}
                        onChange={(e) => setContextForm({ ...contextForm, is_medical_device: e.target.checked })}
                      />
                      <span>Medical Device (CDSCO MDR 2017 Sector Routing)</span>
                    </label>
                  </div>

                  <div className="form-group" style={{ marginTop: "1rem" }}>
                    <label className="form-label">Sector Harmonization</label>
                    <select
                      className="form-input"
                      value={contextForm.sector}
                      onChange={(e) => setContextForm({ ...contextForm, sector: e.target.value })}
                    >
                      <option value="">Standard Packaged Commodity</option>
                      <option value="food">Food & Snacks (FSSAI Interaction)</option>
                      <option value="cosmetic">Cosmetics (Drugs & Cosmetics Act)</option>
                      <option value="drugs">Drugs / Pharmaceutical</option>
                      <option value="alcohol">Alcoholic Beverages (Excise)</option>
                    </select>
                  </div>
                </div>

                {/* Verified Physical Measurements (Rule 11 & 22) */}
                <div className="form-section-card glass-card">
                  <h5 className="section-title">⚖️ Physical Net Quantity Measurement</h5>
                  <p className="section-desc">
                    Required for First Schedule Maximum Permissible Error (MPE) analysis. Camera/OCR reading is not a physical measurement.
                  </p>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contextForm.measurement_verified}
                        onChange={(e) => setContextForm({ ...contextForm, measurement_verified: e.target.checked })}
                      />
                      <span>Measurement Verified by Inspector on Calibrated Scale</span>
                    </label>
                  </div>

                  {contextForm.measurement_verified && (
                    <div className="form-group" style={{ marginTop: "0.75rem" }}>
                      <label className="form-label">Actual Measured Quantity ({contextForm.declared_quantity_unit})</label>
                      <input
                        type="number"
                        step="any"
                        className="form-input"
                        value={contextForm.measured_value}
                        onChange={(e) => setContextForm({ ...contextForm, measured_value: e.target.value })}
                        placeholder="e.g. 498.5"
                        required
                      />
                    </div>
                  )}

                  <div className="form-group" style={{ marginTop: "1rem" }}>
                    <label className="form-label">Observed Sale Price (INR) (Rule 18)</label>
                    <input
                      type="number"
                      step="any"
                      className="form-input"
                      value={contextForm.observed_sale_price}
                      onChange={(e) => setContextForm({ ...contextForm, observed_sale_price: e.target.value })}
                      placeholder="e.g. 95.00 (leave blank if not observed)"
                    />
                  </div>
                </div>

                {/* Calibrated Dimensional Screening (Rule 7) */}
                <div className="form-section-card glass-card">
                  <h5 className="section-title">📏 Calibrated Font & Dimensional Screening</h5>
                  <p className="section-desc">
                    Rule 7 requires physical millimetre measurements. Without verified calibration, dimensional screening routes to REVIEW REQUIRED.
                  </p>

                  <div className="checkbox-group">
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        checked={contextForm.calibration_valid}
                        onChange={(e) => setContextForm({ ...contextForm, calibration_valid: e.target.checked })}
                      />
                      <span>Valid mm-per-pixel Calibration Reference Scale Present</span>
                    </label>
                  </div>

                  {contextForm.calibration_valid && (
                    <div className="form-row-3col" style={{ marginTop: "0.75rem" }}>
                      <div className="form-group">
                        <label className="form-label">Letter Height (mm)</label>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          value={contextForm.letter_height_mm}
                          onChange={(e) => setContextForm({ ...contextForm, letter_height_mm: e.target.value })}
                          placeholder="e.g. 3.2"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Letter Width (mm)</label>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          value={contextForm.letter_width_mm}
                          onChange={(e) => setContextForm({ ...contextForm, letter_width_mm: e.target.value })}
                          placeholder="e.g. 1.2"
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">PDP Area (cm²)</label>
                        <input
                          type="number"
                          step="any"
                          className="form-input"
                          value={contextForm.pdp_area_cm2}
                          onChange={(e) => setContextForm({ ...contextForm, pdp_area_cm2: e.target.value })}
                          placeholder="e.g. 220"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit button */}
                <div className="form-actions-full">
                  <button type="submit" className="btn-primary" disabled={savingContext || !canEdit}>
                    {savingContext ? "Saving Regulatory Context..." : "💾 Save Context & Recompute Checklist"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 4: FINAL INSPECTION REPORT (PHASES 10–11) */}
          {activeTab === "report" && (
            <div className="workspace-tab-pane">
              <div className="pane-header-row">
                <div>
                  <h4 className="pane-heading">Final PackCheck Inspection Report</h4>
                  <p className="pane-subtext">
                    Inspection finalization, verified PDF report generation, permanent database BLOB storage, and cryptographic audit trail.
                  </p>
                </div>
                {reportMeta && (
                  <button
                    className="btn-primary btn-sm"
                    onClick={handleDownloadPdf}
                    disabled={downloadingPdf}
                  >
                    {downloadingPdf ? "⏳ Downloading..." : "📥 Download Final PDF Report"}
                  </button>
                )}
              </div>

              {loadingReport ? (
                <div className="workspace-loader">Checking permanent report registry...</div>
              ) : reportMeta ? (
                /* STATE A: FINAL REPORT VERIFIED & STORED */
                <div className="report-finalized-container">
                  <div className="report-verified-banner glass-card">
                    <div className="verified-banner-header">
                      <span className="verified-icon">✔</span>
                      <div>
                        <h4 className="verified-title">Final Report Verified & Stored</h4>
                        <p className="verified-subtitle">
                          The final inspection report has been generated, verified, cryptographically hashed, and permanently committed to database storage.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="report-metadata-grid">
                    <div className="meta-card glass-card">
                      <span className="meta-card-label">Inspection ID</span>
                      <span className="meta-card-val mono-badge">{reportMeta.inspection_id}</span>
                    </div>
                    <div className="meta-card glass-card">
                      <span className="meta-card-label">Report Filename</span>
                      <span className="meta-card-val">{reportMeta.filename}</span>
                    </div>
                    <div className="meta-card glass-card">
                      <span className="meta-card-label">Permanent File Size</span>
                      <span className="meta-card-val">{(reportMeta.file_size / 1024).toFixed(1)} KB</span>
                    </div>
                    <div className="meta-card glass-card">
                      <span className="meta-card-label">Immutability Status</span>
                      <span className="meta-card-val status-immutable">🔒 Immutable Permanent Record</span>
                    </div>
                    <div className="meta-card glass-card form-col-span-2">
                      <span className="meta-card-label">Cryptographic SHA-256 Hash</span>
                      <span className="meta-card-val mono-hash">{reportMeta.sha256_hash}</span>
                    </div>
                    <div className="meta-card glass-card">
                      <span className="meta-card-label">Authoritative Rulebook</span>
                      <span className="meta-card-val">{reportMeta.rulebook_version}</span>
                    </div>
                    <div className="meta-card glass-card">
                      <span className="meta-card-label">Finalization Timestamp</span>
                      <span className="meta-card-val">{reportMeta.created_at ? new Date(reportMeta.created_at).toLocaleString() : "Confirmed"}</span>
                    </div>
                  </div>

                  <div className="report-actions-row">
                    <button
                      className="btn-primary btn-lg btn-glow"
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                    >
                      {downloadingPdf ? "⏳ Preparing PDF..." : "📥 Download Final PDF Report"}
                    </button>
                  </div>

                  <div className="disclaimer-callout-box">
                    <strong>LEGAL BOUNDARY & STATUTORY NOTICE:</strong><br />
                    PackCheck is an automated inspection-assistance and evidence-screening system designed to assist inspectors in evaluating packaged commodities under applicable standards. This document is a technical inspection report and does not constitute a statutory certificate, legal verdict, product seizure order, or penalty determination. Official statutory enforcement decisions remain under the sole jurisdiction of authorized legal metrology officers.
                  </div>
                </div>
              ) : (
                /* STATE B: PRE-FINALIZATION WORKFLOW */
                <div className="report-prefinalize-container">
                  {/* Finalization Progress Bar (shown when finalizing) */}
                  {finalizing && (
                    <div className="finalization-progress-card glass-card">
                      <h5 className="progress-card-title">Finalization & Verification Lifecycle in Progress</h5>
                      <div className="progress-steps-list">
                        {[
                          { step: 1, label: "1. Preparing evidence & declarations ledger" },
                          { step: 2, label: "2. Building professional ReportLab PDF report" },
                          { step: 3, label: "3. Deep verifying PDF structure, content & embedded images" },
                          { step: 4, label: "4. Computing SHA-256 hash & saving to permanent MySQL BLOB" },
                          { step: 5, label: "5. Retrieving from permanent storage & verifying cryptographic integrity" },
                          { step: 6, label: "6. Purging temporary source evidence for inspection" },
                          { step: 7, label: "7. Finalized inspection state committed" },
                        ].map((s) => (
                          <div
                            key={s.step}
                            className={`progress-step-item ${
                              finalizationStep > s.step ? "step-done" : finalizationStep === s.step ? "step-active" : "step-pending"
                            }`}
                          >
                            <span className="step-icon">
                              {finalizationStep > s.step ? "✔" : finalizationStep === s.step ? "⏳" : "○"}
                            </span>
                            <span className="step-text">{s.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Recoverable Error Display */}
                  {finalizeError && (
                    <div className="alert alert-danger finalize-error-box">
                      <div className="alert-title">⚠ Finalization Failed (Recoverable)</div>
                      <p>{finalizeError}</p>
                      <div className="alert-subnote">
                        <strong>Safety Guarantee:</strong> All temporary evidence source images have been strictly preserved. No evidence was purged. You may resolve the issue and safely retry.
                      </div>
                      <button className="btn-secondary btn-sm" style={{ marginTop: "0.5rem" }} onClick={handleFinalize}>
                        🔄 Retry Finalization
                      </button>
                    </div>
                  )}

                  {!finalizing && (
                    <div className="prefinalize-card glass-card">
                      <div className="prefinalize-header">
                        <h5>Ready to Finalize Inspection</h5>
                        <p>
                          Finalization executes the strict PackCheck verification lifecycle: it generates the immutable final PDF report, validates every embedded evidence image and finding, computes the SHA-256 hash, commits it to permanent MySQL BLOB storage, verifies the stored PDF, and only then purges temporary capture files.
                        </p>
                      </div>

                      <div className="form-group" style={{ marginTop: "1rem" }}>
                        <label className="form-label">Finalization / Review Remarks (Optional)</label>
                        <textarea
                          rows={3}
                          className="form-input"
                          value={finalNotes}
                          onChange={(e) => setFinalNotes(e.target.value)}
                          placeholder="Enter any reviewer remarks, justifications, or notes to record in the final report..."
                          disabled={!canEdit}
                        />
                      </div>

                      {evidenceData && (!evidenceData.views || !evidenceData.views.some(v => v.has_capture && (v.capture_status === "passed" || v.capture_status === "warning"))) && (
                        <div className="alert alert-warning" style={{ marginTop: "1rem", marginBottom: "1rem" }}>
                          <strong>📷 Packaging Evidence Required:</strong> No valid packaging photographs have been captured for this inspection yet.
                          PackCheck final reports must physically embed verified evidence images.
                          Please capture required packaging views in the Evidence Hub before finalizing.
                        </div>
                      )}

                      <div className="form-actions-full" style={{ marginTop: "1.25rem" }}>
                        <button
                          type="button"
                          className="btn-primary btn-lg btn-glow"
                          onClick={handleFinalize}
                          disabled={
                            finalizing ||
                            !canEdit ||
                            (evidenceData && (!evidenceData.views || !evidenceData.views.some(v => v.has_capture && (v.capture_status === "passed" || v.capture_status === "warning"))))
                          }
                        >
                          ⚡ Finalize Inspection & Generate Final Report
                        </button>
                      </div>

                      <div className="disclaimer-callout-box" style={{ marginTop: "1.5rem" }}>
                        <strong>NON-STATUTORY NOTICE:</strong> The finalized report is a technical inspection screening summary. It assists legal metrology officers and does not constitute statutory certification.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
