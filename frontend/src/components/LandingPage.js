"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Icon } from "./Icons";
import ThemeToggle from "./ThemeToggle";

export default function LandingPage({ onOpenAuth, onOpenWorkspace }) {
  const { isAuthenticated, user } = useAuth();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const scrollToSection = (e, id) => {
    e.preventDefault();
    setMobileNavOpen(false);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleBrandClick = (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="landing-root">
      {/* SKIP LINK FOR ACCESSIBILITY (GIGW / WCAG compliant) */}
      <a href="#landing-main" className="skip-link">
        Skip to main content
      </a>

      {/* 01. NAVIGATION */}
      <header className="landing-header" role="banner">
        <div className="landing-header-container">
          <a href="#" className="landing-brand-link" onClick={handleBrandClick} aria-label="PackCheck Home">
            <div className="brand-logo-mark" aria-hidden="true">
              <span className="logo-initials">PC</span>
            </div>
            <div className="landing-brand-text">
              <div className="landing-brand-eyebrow">REGULATORY INSPECTION PLATFORM</div>
              <div className="landing-brand-title">PackCheck</div>
            </div>
          </a>

          {/* DESKTOP NAV */}
          <nav className="landing-nav-desktop" aria-label="Landing page sections">
            <a href="#product" onClick={(e) => scrollToSection(e, "product")} className="landing-nav-link">
              Product
            </a>
            <a href="#workflow" onClick={(e) => scrollToSection(e, "workflow")} className="landing-nav-link">
              Workflow
            </a>
            <a href="#capabilities" onClick={(e) => scrollToSection(e, "capabilities")} className="landing-nav-link">
              Capabilities
            </a>
            <a href="#trust" onClick={(e) => scrollToSection(e, "trust")} className="landing-nav-link">
              Traceability
            </a>
            <a href="#roles" onClick={(e) => scrollToSection(e, "roles")} className="landing-nav-link">
              Roles
            </a>
          </nav>

          {/* CONTROLS */}
          <div className="landing-header-actions">
            <ThemeToggle id="landing-theme-toggle" />

            {isAuthenticated ? (
              <button
                type="button"
                className="btn-primary btn-sm btn-workspace-enter"
                onClick={onOpenWorkspace}
              >
                <span>Open Workspace</span>
                <Icon name="arrowRight" size={14} />
              </button>
            ) : (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={onOpenAuth}
              >
                Sign In
              </button>
            )}

            {/* Mobile menu toggle */}
            <button
              type="button"
              className="landing-mobile-toggle"
              onClick={() => setMobileNavOpen(!mobileNavOpen)}
              aria-label="Toggle navigation menu"
              aria-expanded={mobileNavOpen}
            >
              <Icon name={mobileNavOpen ? "close" : "menu"} size={20} />
            </button>
          </div>
        </div>

        {/* MOBILE NAV DRAWER */}
        {mobileNavOpen && (
          <nav className="landing-nav-mobile" aria-label="Mobile navigation">
            <a href="#product" onClick={(e) => scrollToSection(e, "product")} className="mobile-nav-link">
              Product
            </a>
            <a href="#workflow" onClick={(e) => scrollToSection(e, "workflow")} className="mobile-nav-link">
              Workflow
            </a>
            <a href="#capabilities" onClick={(e) => scrollToSection(e, "capabilities")} className="mobile-nav-link">
              Capabilities
            </a>
            <a href="#trust" onClick={(e) => scrollToSection(e, "trust")} className="mobile-nav-link">
              Traceability
            </a>
            <a href="#roles" onClick={(e) => scrollToSection(e, "roles")} className="mobile-nav-link">
              Roles
            </a>
            <div className="mobile-nav-auth">
              {isAuthenticated ? (
                <button
                  type="button"
                  className="btn-primary btn-full"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onOpenWorkspace();
                  }}
                >
                  Open Workspace
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary btn-full"
                  onClick={() => {
                    setMobileNavOpen(false);
                    onOpenAuth();
                  }}
                >
                  Sign In to PackCheck
                </button>
              )}
            </div>
          </nav>
        )}
      </header>

      {/* MAIN CONTENT AREA */}
      <main id="landing-main">
        {/* 02. HERO SECTION */}
        <section className="landing-hero-section">
          <div className="landing-container hero-grid">
            <div className="hero-copy-col">
              <div className="hero-pill-badge">
                <Icon name="check" size={13} className="hero-pill-icon" />
                <span>Statutory Packaging Verification System</span>
              </div>
              <h1 className="hero-main-title">
                Evidence-first packaging compliance inspection.
              </h1>
              <p className="hero-body-desc">
                Capture packaging evidence, extract declarations, evaluate applicable requirements, and produce verifiable inspection reports from one workspace.
              </p>
              <div className="hero-cta-group">
                {isAuthenticated ? (
                  <button
                    type="button"
                    className="btn-primary btn-hero-cta"
                    onClick={onOpenWorkspace}
                  >
                    <span>Open Operational Workspace</span>
                    <Icon name="arrowRight" size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-hero-cta"
                    onClick={onOpenAuth}
                  >
                    <span>Sign in to PackCheck</span>
                    <Icon name="arrowRight" size={16} />
                  </button>
                )}
                <a
                  href="#workflow"
                  onClick={(e) => scrollToSection(e, "workflow")}
                  className="btn-secondary btn-hero-cta"
                >
                  Explore workflow
                </a>
              </div>

              <div className="hero-trust-bullets">
                <div className="trust-bullet">
                  <span className="bullet-dot" aria-hidden="true" />
                  <span>Configured Legal Metrology Rulebook</span>
                </div>
                <div className="trust-bullet">
                  <span className="bullet-dot" aria-hidden="true" />
                  <span>Deterministic Rule Evaluation</span>
                </div>
                <div className="trust-bullet">
                  <span className="bullet-dot" aria-hidden="true" />
                  <span>SHA-256 Report Integrity</span>
                </div>
              </div>
            </div>

            {/* HERO PRODUCT PREVIEW COMPOSITION */}
            <div className="hero-preview-col" aria-label="PackCheck Inspection Workspace Preview">
              <div className="product-preview-shell">
                <div className="preview-window-topbar">
                  <div className="preview-window-dots">
                    <span className="dot dot-red" />
                    <span className="dot dot-yellow" />
                    <span className="dot dot-green" />
                  </div>
                  <div className="preview-window-title font-mono">
                    PackCheck Inspection • Product Preview
                  </div>
                  <span className="preview-mode-tag">Illustrative Sample</span>
                </div>

                <div className="preview-window-body">
                  {/* Step progress pills */}
                  <div className="preview-pipeline-strip">
                    <span className="pipeline-step step-done">1. Evidence</span>
                    <span className="pipeline-arrow">→</span>
                    <span className="pipeline-step step-done">2. Extraction</span>
                    <span className="pipeline-arrow">→</span>
                    <span className="pipeline-step step-done">3. Compliance</span>
                    <span className="pipeline-arrow">→</span>
                    <span className="pipeline-step step-done">4. Report</span>
                  </div>

                  {/* Compact split preview */}
                  <div className="preview-cards-split">
                    {/* Left: Packaging Evidence Mock */}
                    <div className="preview-panel preview-evidence-panel">
                      <div className="panel-micro-head">
                        <span className="micro-label">PACKAGING EVIDENCE</span>
                        <span className="micro-status font-mono">2 Views</span>
                      </div>
                      <div className="evidence-visual-box">
                        <div className="mock-package-canvas">
                          <div className="package-art-badge">PREVIEW</div>
                          <div className="package-line-title">Pure Honey Almond Bar</div>
                          <div className="package-tag-row">
                            <span className="ocr-box-indicator">Net Wt: 250 g</span>
                            <span className="ocr-box-indicator">MRP: ₹120</span>
                          </div>
                        </div>
                        <div className="evidence-meta-strip font-mono">
                          Front & Back Panels Ingested
                        </div>
                      </div>
                    </div>

                    {/* Right: Extracted Declarations & Rule Outcome */}
                    <div className="preview-panel preview-declarations-panel">
                      <div className="panel-micro-head">
                        <span className="micro-label">STATUTORY DECLARATIONS</span>
                        <span className="micro-status color-success font-mono">Verified</span>
                      </div>
                      <div className="preview-fields-list">
                        <div className="preview-field-row">
                          <span className="f-name">Product Name</span>
                          <span className="f-val">Honey Almond Bar</span>
                          <span className="badge-micro-sat">✓</span>
                        </div>
                        <div className="preview-field-row">
                          <span className="f-name">Net Quantity</span>
                          <span className="f-val font-mono">250 g</span>
                          <span className="badge-micro-sat">✓</span>
                        </div>
                        <div className="preview-field-row">
                          <span className="f-name">Max Retail Price</span>
                          <span className="f-val font-mono">₹120.00</span>
                          <span className="badge-micro-rev">Review</span>
                        </div>
                        <div className="preview-field-row">
                          <span className="f-name">FSSAI License</span>
                          <span className="f-val font-mono">10019022009876</span>
                          <span className="badge-micro-sat">✓</span>
                        </div>
                      </div>

                      <div className="preview-eval-summary">
                        <div className="eval-status-indicator">
                          <span className="status-dot-sm dot-warning" />
                          <span className="eval-text">1 Finding Awaiting Review</span>
                        </div>
                        <div className="report-hash-preview font-mono">
                          SHA-256: 7f83b1...3d9c
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 03. WORKFLOW: "FROM EVIDENCE TO VERIFIED REPORT" */}
        <section id="workflow" className="landing-section workflow-section">
          <div className="landing-container">
            <div className="section-head-center">
              <span className="section-eyebrow">INSPECTION WORKFLOW</span>
              <h2 className="section-title">From evidence to verified report</h2>
              <p className="section-subtitle">
                A structured, auditable journey ensuring packaging declarations are verified against statutory standards without manual guesswork.
              </p>
            </div>

            <div className="workflow-steps-grid">
              <div className="workflow-step-card">
                <div className="step-badge-num font-mono">01</div>
                <div className="step-icon-circle">
                  <Icon name="camera" size={20} />
                </div>
                <h3 className="step-card-title">Capture Evidence</h3>
                <p className="step-card-desc">
                  Preserve high-resolution multi-view photographic evidence of packaging panels with preserved ingestion metadata.
                </p>
              </div>

              <div className="workflow-step-card">
                <div className="step-badge-num font-mono">02</div>
                <div className="step-icon-circle">
                  <Icon name="search" size={20} />
                </div>
                <h3 className="step-card-title">Intelligent Extraction</h3>
                <p className="step-card-desc">
                  Pretrained OCR and structured field parsing extract mandatory declarations including Net Wt, MRP, and dates.
                </p>
              </div>

              <div className="workflow-step-card">
                <div className="step-badge-num font-mono">03</div>
                <div className="step-icon-circle">
                  <Icon name="check" size={20} />
                </div>
                <h3 className="step-card-title">Field Verification</h3>
                <p className="step-card-desc">
                  Human-in-the-loop verification connects extracted values directly to visible packaging image regions.
                </p>
              </div>

              <div className="workflow-step-card">
                <div className="step-badge-num font-mono">04</div>
                <div className="step-icon-circle">
                  <Icon name="compliance" size={20} />
                </div>
                <h3 className="step-card-title">Evaluate Rules</h3>
                <p className="step-card-desc">
                  Deterministic engine checks extracted declarations against the configured Legal Metrology rulebook.
                </p>
              </div>

              <div className="workflow-step-card">
                <div className="step-badge-num font-mono">05</div>
                <div className="step-icon-circle">
                  <Icon name="report" size={20} />
                </div>
                <h3 className="step-card-title">Verified Report</h3>
                <p className="step-card-desc">
                  Generate finalized statutory inspection reports with retained SHA-256 cryptographic integrity metadata.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 04. CAPABILITIES */}
        <section id="capabilities" className="landing-section capabilities-section">
          <div className="landing-container">
            <div className="section-head-center">
              <span className="section-eyebrow">SYSTEM CAPABILITIES</span>
              <h2 className="section-title">Built for statutory accuracy & audit readiness</h2>
              <p className="section-subtitle">
                Core technical capabilities designed around actual packaging verification workflows and regulatory requirements.
              </p>
            </div>

            <div className="capabilities-grid">
              <div className="capability-card">
                <div className="cap-icon-box">
                  <Icon name="evidence" size={22} />
                </div>
                <h3 className="cap-title">Evidence Capture</h3>
                <p className="cap-desc">
                  Multi-view packaging evidence capture with immutable timestamping and high-resolution visual preservation.
                </p>
              </div>

              <div className="capability-card">
                <div className="cap-icon-box">
                  <Icon name="search" size={22} />
                </div>
                <h3 className="cap-title">Intelligent Extraction</h3>
                <p className="cap-desc">
                  Pretrained OCR engine and structured field extraction for MRP, Net Quantity, Best Before, and statutory codes.
                </p>
              </div>

              <div className="capability-card">
                <div className="cap-icon-box">
                  <Icon name="check" size={22} />
                </div>
                <h3 className="cap-title">Field Verification</h3>
                <p className="cap-desc">
                  Side-by-side evidence-linked verification allowing authorized inspectors to confirm OCR readings against image evidence.
                </p>
              </div>

              <div className="capability-card">
                <div className="cap-icon-box">
                  <Icon name="compliance" size={22} />
                </div>
                <h3 className="cap-title">Compliance Evaluation</h3>
                <p className="cap-desc">
                  Rulebook-driven deterministic evaluation against configured Legal Metrology rules with transparent finding rationale.
                </p>
              </div>

              <div className="capability-card">
                <div className="cap-icon-box">
                  <Icon name="scale" size={22} />
                </div>
                <h3 className="cap-title">Measurement Checks</h3>
                <p className="cap-desc">
                  First Schedule Maximum Permissible Error (MPE) quantitative weight verification and unit standard compliance.
                </p>
              </div>

              <div className="capability-card">
                <div className="cap-icon-box">
                  <Icon name="report" size={22} />
                </div>
                <h3 className="cap-title">Verified Reporting</h3>
                <p className="cap-desc">
                  Finalized statutory inspection PDF export with retained SHA-256 cryptographic digest for tamper verification.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 05. PRODUCT SHOWCASE */}
        <section id="product" className="landing-section showcase-section">
          <div className="landing-container">
            <div className="section-head-center">
              <span className="section-eyebrow">PRODUCT SHOWCASE</span>
              <h2 className="section-title">The inspection workspace in action</h2>
              <p className="section-subtitle">
                Inspect how evidence ingestion, declaration extraction, compliance evaluation, and reporting connect within PackCheck.
              </p>
            </div>

            <div className="showcase-triad-card">
              <div className="showcase-tabs-header font-mono">
                <span className="tab-pill active">Inspection Workspace</span>
                <span className="tab-pill">Evidence</span>
                <span className="tab-pill">Declarations</span>
                <span className="tab-pill">Compliance</span>
                <span className="tab-pill">Report</span>
              </div>

              <div className="showcase-content-grid">
                {/* Column 1: Evidence Inspection */}
                <div className="showcase-col showcase-col-evidence">
                  <div className="showcase-col-title">
                    <Icon name="evidence" size={16} />
                    <span>Packaging Evidence</span>
                  </div>
                  <div className="showcase-evidence-frame">
                    <div className="frame-badge">Front Panel Image</div>
                    <div className="frame-placeholder">
                      <div className="mock-ocr-box box-1">
                        <span className="ocr-tag font-mono">PRODUCT NAME</span>
                      </div>
                      <div className="mock-ocr-box box-2">
                        <span className="ocr-tag font-mono">NET QTY</span>
                      </div>
                      <div className="mock-ocr-box box-3">
                        <span className="ocr-tag font-mono">MRP</span>
                      </div>
                    </div>
                  </div>
                  <div className="showcase-meta-note">
                    Preserves high-resolution raw photographic captures linked to every extracted field.
                  </div>
                </div>

                {/* Column 2: Extracted Declarations */}
                <div className="showcase-col showcase-col-declarations">
                  <div className="showcase-col-title">
                    <Icon name="declarations" size={16} />
                    <span>Extracted Declarations</span>
                  </div>
                  <div className="showcase-declarations-list">
                    <div className="sc-item">
                      <span className="sc-name">Product Name</span>
                      <span className="sc-val">Organic Multigrain Bar</span>
                      <span className="status-pill status-approved">Verified</span>
                    </div>
                    <div className="sc-item">
                      <span className="sc-name">Net Quantity</span>
                      <span className="sc-val font-mono">200 g</span>
                      <span className="status-pill status-approved">Verified</span>
                    </div>
                    <div className="sc-item">
                      <span className="sc-name">Max Retail Price</span>
                      <span className="sc-val font-mono">₹95.00</span>
                      <span className="status-pill status-approved">Verified</span>
                    </div>
                    <div className="sc-item">
                      <span className="sc-name">Consumer Care</span>
                      <span className="sc-val">support@brand.in</span>
                      <span className="status-pill status-in_progress">Review</span>
                    </div>
                  </div>
                  <div className="showcase-meta-note">
                    Extracted values can be verified or corrected by authorized field inspectors.
                  </div>
                </div>

                {/* Column 3: Compliance & Report */}
                <div className="showcase-col showcase-col-compliance">
                  <div className="showcase-col-title">
                    <Icon name="compliance" size={16} />
                    <span>Statutory Compliance</span>
                  </div>
                  <div className="showcase-results-box">
                    <div className="sc-finding-row row-satisfied">
                      <span className="sc-rule-pill">Rule 6</span>
                      <span className="sc-rule-title">Mandatory declarations present</span>
                      <span className="sc-rule-status color-success">Satisfied</span>
                    </div>
                    <div className="sc-finding-row row-satisfied">
                      <span className="sc-rule-pill">Rule 7</span>
                      <span className="sc-rule-title">Net quantity unit standard</span>
                      <span className="sc-rule-status color-success">Satisfied</span>
                    </div>
                    <div className="sc-finding-row row-review">
                      <span className="sc-rule-pill">Rule 11</span>
                      <span className="sc-rule-title">Consumer contact verification</span>
                      <span className="sc-rule-status color-warning">Review Req</span>
                    </div>

                    <div className="showcase-report-chip font-mono">
                      <div className="report-chip-top">
                        <Icon name="report" size={14} />
                        <span>Statutory Inspection Record</span>
                      </div>
                      <div className="report-chip-hash">
                        Digest: 9e24a1...7f1b (SHA-256)
                      </div>
                    </div>
                  </div>
                  <div className="showcase-meta-note">
                    Rules evaluate deterministically against the configured Legal Metrology rulebook.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 06. TRUST / TRACEABILITY */}
        <section id="trust" className="landing-section trust-section">
          <div className="landing-container">
            <div className="section-head-center">
              <span className="section-eyebrow">TRUST & INTEGRITY</span>
              <h2 className="section-title">Evidence-linked statutory integrity</h2>
              <p className="section-subtitle">
                PackCheck guarantees operational transparency through verifiable data lineage and cryptographic report retention.
              </p>
            </div>

            <div className="trust-features-grid">
              <div className="trust-card">
                <div className="trust-card-icon">
                  <Icon name="evidence" size={20} />
                </div>
                <h3 className="trust-card-title">Evidence-Linked Traceability</h3>
                <p className="trust-card-desc">
                  Findings connect back to inspection photographic evidence where supported, ensuring every regulatory decision is traceable.
                </p>
              </div>

              <div className="trust-card">
                <div className="trust-card-icon">
                  <Icon name="compliance" size={20} />
                </div>
                <h3 className="trust-card-title">Configured Legal Metrology Rulebook</h3>
                <p className="trust-card-desc">
                  Compliance evaluation is grounded in the Legal Metrology (Packaged Commodities) Rules, 2011 and configured amendments.
                </p>
              </div>

              <div className="trust-card">
                <div className="trust-card-icon">
                  <Icon name="audit" size={20} />
                </div>
                <h3 className="trust-card-title">Auditable Activity Trail</h3>
                <p className="trust-card-desc">
                  Every record creation, extraction update, status transition, and supervisory review is recorded with user attribution.
                </p>
              </div>

              <div className="trust-card">
                <div className="trust-card-icon">
                  <Icon name="report" size={20} />
                </div>
                <h3 className="trust-card-title">SHA-256 Report Integrity Digest</h3>
                <p className="trust-card-desc">
                  Finalized statutory reports retain a cryptographic SHA-256 hash to confirm report content consistency.
                </p>
              </div>

              <div className="trust-card">
                <div className="trust-card-icon">
                  <Icon name="history" size={20} />
                </div>
                <h3 className="trust-card-title">Persistent Final Report Storage</h3>
                <p className="trust-card-desc">
                  Finalized PDF reports and authoritative findings are stored in structured MySQL storage for statutory retrieval.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 07. ROLE-BASED VALUE */}
        <section id="roles" className="landing-section roles-section">
          <div className="landing-container">
            <div className="section-head-center">
              <span className="section-eyebrow">ROLE-BASED ACCESS CONTROL</span>
              <h2 className="section-title">Tailored for regulatory inspection teams</h2>
              <p className="section-subtitle">
                Clear segregation of duties ensures accountability across statutory inspection, supervisory approval, and audit.
              </p>
            </div>

            <div className="roles-cards-grid">
              <div className="role-card">
                <div className="role-card-header">
                  <span className="user-role-badge badge-inspector">INSPECTOR</span>
                  <h3 className="role-title">Field Inspection</h3>
                </div>
                <p className="role-desc">
                  Capture and upload multi-view packaging evidence, run OCR extraction, verify declaration fields, and manage assigned inspection workloads.
                </p>
              </div>

              <div className="role-card">
                <div className="role-card-header">
                  <span className="user-role-badge badge-supervisor">SUPERVISOR</span>
                  <h3 className="role-title">Supervisory Review</h3>
                </div>
                <p className="role-desc">
                  Review flagged discrepancies, confirm review-required findings, approve or reject inspection records, and authorize final reports.
                </p>
              </div>

              <div className="role-card">
                <div className="role-card-header">
                  <span className="user-role-badge badge-rule">RULE MANAGER</span>
                  <h3 className="role-title">Standards & Rules</h3>
                </div>
                <p className="role-desc">
                  Manage Legal Metrology rule definitions, configure First Schedule MPE tolerances, and oversee statutory criteria.
                </p>
              </div>

              <div className="role-card">
                <div className="role-card-header">
                  <span className="user-role-badge badge-auditor">AUDITOR</span>
                  <h3 className="role-title">Statutory Audit</h3>
                </div>
                <p className="role-desc">
                  Query chronological audit ledgers, verify report SHA-256 integrity digests, and conduct read-only historical compliance reviews.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 08. FINAL CTA */}
        <section className="landing-section cta-banner-section">
          <div className="landing-container">
            <div className="cta-banner-card">
              <div className="cta-copy">
                <h2 className="cta-title">Ready to inspect packaging with PackCheck?</h2>
                <p className="cta-desc">
                  Access the statutory packaging inspection workspace, run automated extraction, and produce verifiable compliance reports.
                </p>
              </div>
              <div className="cta-action">
                {isAuthenticated ? (
                  <button
                    type="button"
                    className="btn-primary btn-cta-main"
                    onClick={onOpenWorkspace}
                  >
                    <span>Open Workspace</span>
                    <Icon name="arrowRight" size={16} />
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-primary btn-cta-main"
                    onClick={onOpenAuth}
                  >
                    <span>Sign in to workspace</span>
                    <Icon name="arrowRight" size={16} />
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 09. FOOTER */}
      <footer className="landing-footer" role="contentinfo">
        <div className="landing-container footer-content-row">
          <div className="footer-brand-col">
            <div className="footer-brand-title">PackCheck</div>
            <p className="footer-tagline">
              Evidence-first packaging inspection platform
            </p>
            <div className="footer-legal-basis">
              Regulatory Basis: Legal Metrology (Packaged Commodities) Rules, 2011 and configured amendments.
            </div>
          </div>

          <div className="footer-nav-col">
            <span className="footer-col-head">Navigation</span>
            <ul className="footer-links-list">
              <li><a href="#product" onClick={(e) => scrollToSection(e, "product")}>Product</a></li>
              <li><a href="#workflow" onClick={(e) => scrollToSection(e, "workflow")}>Workflow</a></li>
              <li><a href="#capabilities" onClick={(e) => scrollToSection(e, "capabilities")}>Capabilities</a></li>
              <li><a href="#trust" onClick={(e) => scrollToSection(e, "trust")}>Traceability</a></li>
              <li><a href="#roles" onClick={(e) => scrollToSection(e, "roles")}>Roles</a></li>
            </ul>
          </div>

          <div className="footer-nav-col">
            <span className="footer-col-head">Access</span>
            <ul className="footer-links-list">
              <li>
                <button type="button" className="btn-link-action" onClick={isAuthenticated ? onOpenWorkspace : onOpenAuth}>
                  {isAuthenticated ? "Open Workspace" : "Sign In to Workspace"}
                </button>
              </li>
            </ul>
          </div>
        </div>

        <div className="landing-container footer-bottom-strip">
          <div className="copyright-text">
            © 2026 PackCheck. Regulatory Metrology Operating System.
          </div>
          <div className="footer-system-note font-mono">
            Deterministic Engine • Auditable Lineage • SHA-256 Digests
          </div>
        </div>
      </footer>
    </div>
  );
}
