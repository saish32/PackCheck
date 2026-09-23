# PackCheck - Regulatory Compliance & Evidence-Screening Platform for Packaged Commodities

> **Smart India Hackathon (SIH) | Inspector-Assistance & Evidence-Screening Platform**  
> *Legal Metrology (Packaged Commodities) Rules, 2011 & Amendments Verification System*

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Python: FastAPI](https://img.shields.io/badge/Backend-FastAPI%200.115+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Frontend: Next.js](https://img.shields.io/badge/Frontend-Next.js%2015%20%7C%20React%2019-black.svg?logo=next.js&logoColor=white)](https://nextjs.org)
[![OCR: RapidOCR](https://img.shields.io/badge/OCR-RapidOCR%20%7C%20ONNX-blueviolet.svg)](https://github.com/RapidAI/RapidOCR)
[![Report: ReportLab](https://img.shields.io/badge/Reports-ReportLab%204.0+-red.svg)](https://www.reportlab.com)
[![Deployment: Render + Vercel](https://img.shields.io/badge/Cloud-Render%20%7C%20Vercel-46E3B7.svg)](https://pack-check.vercel.app)

---

## 📑 Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Why PackCheck](#3-why-packcheck)
4. [Solution Overview](#4-solution-overview)
5. [Core Features](#5-core-features)
6. [Users and Roles](#6-users-and-roles)
7. [Login & Authentication Guide](#7-login--authentication-guide)
8. [Quick Start for Judges & Evaluators (3-Minute Setup)](#8-quick-start-for-judges--evaluators-3-minute-setup)
9. [End-to-End Inspector Workflow](#9-end-to-end-inspector-workflow)
10. [Inspection Lifecycle & State Machine](#10-inspection-lifecycle--state-machine)
11. [Package Evidence & Image Processing](#11-package-evidence--image-processing)
12. [AI & Field-Aware OCR Pipeline](#12-ai--field-aware-ocr-pipeline)
13. [OCR Safety, Reconciliation & Uncertainty Handling](#13-ocr-safety-reconciliation--uncertainty-handling)
14. [Real-World Packaging Regression Example (Marie Gold)](#14-real-world-packaging-regression-example-marie-gold)
15. [Regulatory Rule Engine (LMPC 2011 + Amendments)](#15-regulatory-rule-engine-lmpc-2011--amendments)
16. [Compliance Result States](#16-compliance-result-states)
17. [Physical Measurement & Calibration Boundary](#17-physical-measurement--calibration-boundary)
18. [Inspection Workspace & Summary Screen](#18-inspection-workspace--summary-screen)
19. [Enforcement Dashboard & Analytics](#19-enforcement-dashboard--analytics)
20. [Inspection History & Retrieval](#20-inspection-history--retrieval)
21. [Security & Audit Logging](#21-security--audit-logging)
22. [Professional PDF Inspection Report Engine](#22-professional-pdf-inspection-report-engine)
23. [System Architecture](#23-system-architecture)
24. [Technology Stack](#24-technology-stack)
25. [Frontend Architecture](#25-frontend-architecture)
26. [Backend Architecture](#26-backend-architecture)
27. [REST API Documentation](#27-rest-api-documentation)
28. [Database Schema & Data Model](#28-database-schema--data-model)
29. [Security, RBAC & Hardening](#29-security-rbac--hardening)
30. [Data Lifecycle & Retention Policy](#30-data-lifecycle--retention-policy)
31. [Error & Edge-Case Handling](#31-error--edge-case-handling)
32. [Practical Use Cases](#32-practical-use-cases)
33. [Recommended 3–5 Minute SIH Demo Flow](#33-recommended-35-minute-sih-demo-flow)
34. [Local Development Setup](#34-local-development-setup)
35. [Environment Variables Reference](#35-environment-variables-reference)
36. [Cloud Deployment Architecture](#36-cloud-deployment-architecture)
37. [Automated Test Suites & Verification](#37-automated-test-suites--verification)
38. [System Limitations & Boundary Disclaimers](#38-system-limitations--boundary-disclaimers)
39. [Future Enhancements](#39-future-enhancements)
40. [Contributing Guidelines](#40-contributing-guidelines)
41. [Repository Structure](#41-repository-structure)
42. [Troubleshooting Guide](#42-troubleshooting-guide)
43. [Glossary of Terms](#43-glossary-of-terms)
44. [Statutory References & Regulatory Authorities](#44-statutory-references--regulatory-authorities)

---

## 1. Executive Summary

### What is PackCheck?
**PackCheck** is an inspector-centric, automated Legal Metrology inspection-assistance and evidence-screening platform for packaged commodities. It is engineered to assist enforcement officers in evaluating commercial packaging against the statutory requirements of the **Legal Metrology Act, 2009** and the **Legal Metrology (Packaged Commodities) Rules, 2011 (LMPC)**.

### The Core Transformation Pipeline
PackCheck bridges the gap between physical retail packaging photography and auditable compliance reports:

```
  ┌─────────────────────────┐
  │  Package Image Evidence │  (Multi-view packaging captures: front, back, MRP cluster, etc.)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │  Adaptive Preprocessing │  (Orientation correction, glare suppression, contrast tuning)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │  RapidOCR / ONNX Engine │  (Lightweight text detection & recognition; 512MB RAM safe)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │  Field-Aware Extractor  │  (MRP, Unit Price, Net Wt, PKD, Expiry, FSSAI, Batch, Shelf Life)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │ Officer Reconciliation  │  (Authoritative Inspector Input vs. OCR Package Evidence)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │ Deterministic Rules     │  (Centralized LMPC Rulebook; date-aware statutory evaluation)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │ Human-in-the-Loop Review│  (Flagged mismatches & low-confidence evidence review)
  └────────────┬────────────┘
               ▼
  ┌─────────────────────────┐
  │ Cryptographic PDF Report│  (ReportLab PDF with embedded photos, SHA-256 hash & Audit Log)
  └─────────────────────────┘
```

### Statutory Authority Boundary Notice
> [!IMPORTANT]
> **PackCheck is an evidence-screening and inspector-assistance tool, NOT a statutory enforcement authority.**  
> PackCheck does **NOT** issue legal certificates, statutory verdicts, product seizure warrants, penalty orders, or prosecution directives. OCR findings and rule evaluations serve exclusively as technical screening evidence. Final statutory enforcement determinations remain under the sole constitutional jurisdiction of authorized Legal Metrology officers.

---

## 2. Problem Statement

Commercial retail commodities sold in India are legally mandated to bear specific declarations under the Legal Metrology (Packaged Commodities) Rules, 2011. In field enforcement, state Legal Metrology inspectors encounter major bottlenecks:

1. **Multi-Surface Information Fragmentation**: Mandatory declarations (MRP, unit sale price, net weight, date of packing, batch number, FSSAI license, manufacturer details) are distributed across curved, reflective, crumpled, or folded package surfaces.
2. **Dense, Low-Resolution Print & Glare**: Thermal coding, dot-matrix inkjet timestamps, and glossy plastic pouches obscure critical details during field photography.
3. **Complex Evolving Amendments**: Over 8 major statutory amendments (such as the omission of the Second Schedule in 2022, mandatory unit sale price calculations, e-commerce disclosure rules in 2026, and medical device declaration changes) create high cognitive load for field officers.
4. **Disputed Evidence & Lack of Chain of Custody**: Traditional paper-based checklists lack cryptographic linking between the physical item photographed, the inspector’s notes, and the inspection report.
5. **Slow Manual Reporting**: Compiling notice documentation manually delays regulatory proceedings.

---

## 3. Why PackCheck

| Dimension | Generic OCR Tools | Barcode / Database Lookup | Manual Paper Checklists | **PackCheck Platform** |
| :--- | :--- | :--- | :--- | :--- |
| **Domain Awareness** | Raw unstructured text dumps | Retrieves pre-registered catalogue data | Manual visual comparison | **Field-aware LMPC extraction tailored for Indian packaging** |
| **Physical Reality** | Ignores whether text is on physical item | Verifies company database, not physical pack | Inspects pack, but prone to human fatigue | **Verifies declarations printed on the physical package itself** |
| **Regulatory Engine** | None | None | Officer memory / static tables | **Date-aware, deterministic LMPC rule engine with source citations** |
| **Inspector Authority** | Overwrites user or hallucinates | Assumes barcode database is correct | Subjective manual notes | **Preserves officer input as authoritative; highlights discrepancies** |
| **Evidence Custody** | None | None | Loose photos, vulnerability to loss | **Cryptographic SHA-256 PDF report with embedded photos & audit ledger** |
| **Cloud Footprint** | Heavy GPU transformer models | API dependencies | Zero tech | **Lightweight ONNX engine runs efficiently on ~0.1 CPU & 512MB RAM** |

---

## 4. Solution Overview

PackCheck provides an integrated end-to-end workflow:
1. **Initiate Inspection**: Inspector creates an inspection record with product name, brand, batch, packaging type, category, and optional retail measurements.
2. **Multi-View Evidence Capture**: Guided photo capture tailored to package geometry (e.g., front display, back nutrition/address panel, barcode/MRP cluster, FSSAI badge).
3. **Automated Quality Validation**: Real-time screening for blur (Laplacian variance), under/over-exposure, and perceptual image duplication (64-bit dHash).
4. **Low-Resource Pretrained OCR**: RapidOCR (ONNX DBNet + CRNN) extracts text lines and spatial bounding boxes mapped back to original source pixels.
5. **Field-Aware Extraction**: Spatial and semantic parsers isolate MRP, Unit Sale Price, Net Quantity, PKD/MFD, Use By/Expiry, Shelf Life, Batch Number, and FSSAI License.
6. **Inspector Reconciliation**: Compares officer-entered values against OCR package evidence; detects matches, discrepancies, or unconfirmed items without silently overwriting officer input.
7. **Deterministic Compliance Evaluation**: Central LMPC rule engine evaluates 10+ core statutory requirements yielding `SATISFIED`, `POTENTIAL_NON_COMPLIANCE`, or `REVIEW_REQUIRED`.
8. **Permanent PDF Finalization**: ReportLab engine embeds photos, findings, and statutory disclaimers into an immutable PDF verified by SHA-256 checksums and saved to database storage.
9. **Traceable History & Audit Trail**: Chronological, immutable audit ledger records every creation, view, update, state transition, and report generation.

---

## 5. Core Features

| Category | Implemented Capabilities |
| :--- | :--- |
| **Authentication & RBAC** | JWT (HS256) session security, password hashing with bcrypt, role-based access control across 5 distinct system roles, 1-click SIH demo account switcher. |
| **Inspection Lifecycle** | Strict 6-stage finite state machine (`draft` → `in_progress` → `pending_review` → `approved` / `rejected` → `reopened`). Reopen requires audited justification. |
| **Evidence Management** | Packaging-type-specific view configurations (Flexible Pouch, Carton, Bottle, Tin, Blister, Generic), temporary multi-view image upload, validation screening. |
| **Image Quality Screening** | Blur detection via Laplacian variance (`< 40.0`), brightness checks (`32–230`), highlight clipping detection, perceptual duplicate prevention via 64-bit dHash. |
| **OCR Engine** | RapidOCR ONNX Runtime engine, single-threaded CPU execution, single-pass memory safety, EXIF orientation correction, coordinate inverse-mapping. |
| **Field Extraction** | Spatial two-column parser, compound price splitter (MRP vs. Unit Price), net weight vs. nutrition table isolation, date parsing (PKD vs. Expiry), shelf life duration parsing, FSSAI 14-digit validation. |
| **Evidence Reconciliation** | Explicit comparison table: `CONSISTENT`, `MISMATCH_REVIEW_REQUIRED`, `OCR_ONLY_SUGGESTION`, `INSPECTOR_ONLY`, `NO_DATA`. Officer input is never overwritten. |
| **LMPC Rule Engine** | Central JSON rulebook (`LMPC_CENTRAL_PACKAGED_COMMODITIES`), deterministic Python rule handlers, temporal effective-date gating, font size calibration safeguards, MPE verification. |
| **Report Generation** | ReportLab PDF engine, embedded evidence photos with preserved aspect ratios, tabular compliance ledger, mandatory statutory disclaimer, SHA-256 cryptographic verification. |
| **Enforcement Analytics** | Real-time KPI summaries, compliance rate breakdowns, top statutory violation requirements, packaging category distributions, retail vs. e-commerce channel filtering. |
| **Audit & History** | Append-only audit logging ledger capturing actor, action, endpoint, client IP, timestamp, and details; full inspection history viewer with instant search and status filtering. |
| **User Interface** | Next.js 15 + React 19 single-page architecture, pure custom CSS tokens (no Tailwind bloat), dark/light theme switching, fully responsive across desktop, tablet, and mobile. |

---

## 6. Users and Roles

PackCheck implements strict server-side Role-Based Access Control (RBAC) enforced at every FastAPI endpoint dependency:

| Role | System Scope & Operational Duties | Allowed Actions | Restricted Actions |
| :--- | :--- | :--- | :--- |
| **System Administrator** (`admin`) | Full platform oversight, configuration, and audit verification. | View all inspections, view full system audit logs, access analytics, inspect system health. | Cannot delete finalized historical audit records. |
| **Senior Field Inspector** (`inspector`) | Field enforcement officer conducting on-site package screenings. | Create inspections, upload package evidence, execute OCR, edit declarations, submit for review, reopen own inspections. | Cannot approve or reject submitted inspections; cannot access other inspectors' drafts. |
| **Compliance Supervisor** (`supervisor`) | Senior supervisory officer overseeing inspection quality and compliance findings. | Review submitted inspections, approve/reject lifecycle transitions, inspect all organizational inspections, view audit logs. | Cannot modify raw OCR evidence coordinates directly. |
| **Standards & Rule Manager** (`rule_manager`) | Technical legal officer responsible for regulatory instruments and rulebook integrity. | View rulebook definitions, verify statutory source instruments, test compliance engine rules. | Cannot create operational field inspections or alter audit logs. |
| **Statutory Quality Auditor** (`auditor`) | External or departmental auditor conducting compliance and procedural audits. | Read-only inspection access, verify finalized cryptographic PDF reports, review audit trails. | Strictly read-only; cannot create, edit, approve, or reject inspections. |

---

## 7. Login & Authentication Guide

### SIH Presentation & Demo Access
For hackathon evaluation and technical demonstrations, PackCheck includes **1-Click Pre-Seeded Demo Accounts**. The login modal provides instant role buttons that automatically populate credentials:

| Role | Demo Email | Demo Password | Purpose in Evaluation |
| :--- | :--- | :--- | :--- |
| **Field Inspector** | `inspector@packcheck.local` | `PackCheck@Inspector2026!` | Test inspection creation, evidence upload, OCR extraction, and submission. |
| **Compliance Supervisor** | `supervisor@packcheck.local` | `PackCheck@Supervisor2026!` | Test review workflow, supervisor approval/rejection, and final PDF generation. |
| **System Admin** | `admin@packcheck.local` | `PackCheck@Admin2026!` | Test system-wide audit logging, analytics dashboards, and health diagnostics. |
| **Rule Manager** | `rulemanager@packcheck.local` | `PackCheck@Rules2026!` | Test statutory rulebook inspection and legal instrument alignment. |
| **Statutory Auditor** | `auditor@packcheck.local` | `PackCheck@Auditor2026!` | Test immutable history retrieval and SHA-256 PDF integrity verification. |

> [!NOTE]
> All demo accounts are seeded idempotently at backend boot time via `init_database()`. Passwords are protected using salted bcrypt hashes. Demo account quick-login buttons are automatically disabled in production builds via `NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS=false`.

---

## 8. Quick Start for Judges & Evaluators (3-Minute Setup)

Follow this 1-click sequence to evaluate the entire platform locally on Windows, macOS, or Linux:

### Step 1: Launch the Unified Platform Runner
From the root workspace directory, run:

```bash
# On Windows (Command Prompt or PowerShell)
run.bat

# Or using Python on any platform:
python run.py
```

The launcher will verify ports, start the **FastAPI Backend (port 8000)**, start the **Next.js Frontend (port 3000)**, and seed demo accounts automatically.

### Step 2: Open PackCheck in Your Browser
- **Web Application**: [http://localhost:3000](http://localhost:3000)
- **FastAPI Interactive Swagger Docs**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Backend Health Check**: [http://localhost:8000/api/v1/health](http://localhost:8000/api/v1/health)

### Step 3: Run the 3-Minute Walkthrough
1. Click **Sign In** in the top navigation.
2. Click the **Senior Field Inspector** 1-click badge, then click **Sign In with Credentials**.
3. You will land on the **Enforcement Dashboard** showing compliance metrics.
4. Click **Start New Inspection** (opens the guided 5-step wizard).
5. Enter a test product (e.g., `Marie Gold Biscuits`, Brand: `Britannia`, Category: `Biscuits`, Type: `Flexible Pouch`).
6. Upload sample images from `test_images/` (e.g., `marrie gold back image.jpg`, `marrie gold domanufacture.jpg`).
7. Watch PackCheck run OCR, extract MRP (`₹40.00`), Unit Price (`₹0.16/g`), Net Weight (`250 g`), PKD (`05/08/26`), and FSSAI (`10015043001129`).
8. View the **Compliance Tab** to see the 14 automated LMPC statutory checks.
9. Click **Generate PDF Report** to view the verified PDF with embedded evidence photos and cryptographic SHA-256 hash.

---

## 9. End-to-End Inspector Workflow

```mermaid
sequenceDiagram
    autonumber
    actor Inspector as Field Inspector
    actor Supervisor as Compliance Supervisor
    participant UI as Next.js Web App
    participant API as FastAPI Backend
    participant OCR as RapidOCR Engine
    participant Rules as LMPC Rule Engine
    participant PDF as ReportLab Generator
    participant DB as Persistent Database

    Inspector->>UI: Logs in with credentials
    UI->>API: POST /api/v1/auth/login
    API-->>UI: JWT Access Token (Stored securely in context)
    Inspector->>UI: Creates new inspection (INS-...)
    UI->>API: POST /api/v1/inspections
    API->>DB: Insert Inspection (Status: DRAFT)
    Inspector->>UI: Uploads package photos (front, back, etc.)
    UI->>API: POST /api/v1/inspections/{id}/evidence/{view_id}
    API->>API: Validate image quality (blur, lighting, dHash)
    API->>DB: Save Temporary Evidence record
    Inspector->>UI: Triggers Run OCR & Extraction
    UI->>API: POST /api/v1/inspections/{id}/extract
    API->>OCR: Run adaptive preprocessing + RapidOCR
    OCR-->>API: Lines, text, bounding boxes, confidences
    API->>API: Field-aware extraction (MRP, Net Wt, PKD, etc.)
    API->>DB: Upsert ExtractedDeclarations
    Inspector->>UI: Triggers Compliance Check
    UI->>API: POST /api/v1/rules/evaluate
    API->>Rules: Evaluate 10+ statutory LMPC rules
    Rules-->>API: Findings (SATISFIED / REVIEW_REQUIRED / POTENTIAL_NON_COMPLIANCE)
    API->>DB: Save ComplianceRun & Findings
    Inspector->>UI: Submits inspection for review
    UI->>API: PATCH /api/v1/inspections/{id}/status (PENDING_REVIEW)
    Supervisor->>UI: Logs in & opens submitted inspection
    Supervisor->>UI: Reviews findings & approves final report
    UI->>API: POST /api/v1/inspections/{id}/reports/finalize
    API->>PDF: Generate multi-page PDF with embedded photos
    API->>API: Verify PDF content & compute SHA-256
    API->>DB: Save FinalizedReport (pdf_blob, sha256_hash)
    API->>API: Purge temporary evidence images safely
    API->>DB: Update Inspection (Status: APPROVED)
    API-->>UI: Final report ready (Download available)
```

---

## 10. Inspection Lifecycle & State Machine

PackCheck enforces strict server-side state transitions with comprehensive audit logging at every step:

```
                  ┌────────────────────────┐
                  │         Draft          │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │      In Progress       │
                  └───────────┬────────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │     Pending Review     │
                  └──────┬──────────┬──────┘
                         │          │
        (Supervisor Appr)│          │(Supervisor Rej)
                         ▼          ▼
            ┌──────────────┐      ┌──────────────┐
            │   Approved   │      │   Rejected   │
            └──────┬───────┘      └──────┬───────┘
                   │                     │
                   │   (Reopen Reason)   │
                   └──────────┬──────────┘
                              │
                              ▼
                  ┌────────────────────────┐
                  │        Reopened        │
                  └────────────────────────┘
```

### Transition Invariants
- **Draft / In Progress**: Inspector creates inspection, captures photos, runs OCR, reconciles evidence, and evaluates compliance.
- **Pending Review**: Inspector submits inspection. Only a Supervisor or Admin can approve or reject.
- **Approved (Terminal)**: Finalization triggers ReportLab PDF generation, cryptographic hashing, permanent database storage, and safe purging of temporary image buffers.
- **Rejected**: Supervisor records rejection notes detailing necessary corrections.
- **Reopened**: Requires an explicit, audited `reason_notes` payload. Reopened inspections return to editable status for re-verification.

---

## 11. Package Evidence & Image Processing

### Multi-View Geometry Configuration
PackCheck organizes image evidence into structured visual panels defined in `backend/app/core/views_config.py`:
- **Flexible Pouch**: `front` (PDP), `back` (Information Panel), `barcode_mrp` (Date & MRP Cluster), `fssai_logo` (FSSAI License), `side_gusset` (Gusset Seals).
- **Corrugated Carton**: `front`, `back`, `top`, `bottom`, `side_left`, `side_right`.
- **Rigid Bottle / Jar**: `front`, `back`, `cap_mrp`, `base`.
- **Metal Can / Tin**: `label_primary`, `label_secondary`, `lid_mfd_exp`, `bottom`.
- **Blister Pack / Foil**: `front`, `foil_backing`.

### Image Quality Pre-Flight Checks (`image_validator.py`)
Before passing photos to the OCR engine, PackCheck runs automated quality checks:
1. **Blur Detection**: Calculates the variance of the Laplacian. Images with variance `< 40.0` are flagged with actionable guidance (e.g., *"Image is blurry; hold camera steady and tap to focus"*).
2. **Exposure & Lighting**: Checks mean brightness. Mean brightness `< 32.0` indicates severe underexposure; `> 230.0` indicates severe overexposure.
3. **Glare & Highlight Saturation**: Measures high-intensity pixel percentage (`> 250` luminance). If `> 35%` of pixels are clipped, glare is flagged.
4. **Perceptual Duplicate Prevention**: Calculates a 64-bit difference hash (`dHash`). If an inspector accidentally uploads the same image under two different views, a Hamming distance `<= 6` detects the duplicate and blocks misassignment.
5. **Cryptographic SHA-256**: Generates a tamper-evident digest of each uploaded image.

---

## 12. AI & Field-Aware OCR Pipeline

```mermaid
graph TD
    A[Raw Package Photograph] --> B[EXIF Orientation Correction]
    B --> C[Dimension Clamping max 720px]
    C --> D[Adaptive Preprocessing Pipeline]
    D --> E[Contrast Enhancement CLAHE]
    D --> F[Bilateral Denoising]
    D --> G[Angle Classification 0°, 90°, 180°, 270°]
    E & F & G --> H[RapidOCR ONNX Runtime DBNet + CRNN]
    H --> I[Text Lines + Confidence + Bounding Boxes]
    I --> J[Coordinate Inverse-Mapping to Source Image Pixels]
    J --> K[Field-Aware Spatial & Semantic Extraction]
    K --> L[Structured Declarations Ledger]
```

### Resource-Conscious Deployment on Render Free Tier (~0.1 CPU, 512MB RAM)
To ensure reliable execution on cloud instances with limited memory without crashing with Out-Of-Memory (OOM) errors:
- **Zero Heavy ML Frameworks**: No PyTorch, no TensorFlow, no CUDA dependencies.
- **ONNX Runtime Optimization**: Single-threaded CPU execution enforced at module boot:
  ```python
  os.environ["OMP_NUM_THREADS"] = "1"
  os.environ["OPENBLAS_NUM_THREADS"] = "1"
  os.environ["MKL_NUM_THREADS"] = "1"
  ```
- **Image Bounding**: Working dimensions are clamped to `720px` max dimension during detection, preserving memory while capturing small print.
- **Immediate Garbage Collection**: Intermediate NumPy arrays and image buffers are explicitly dereferenced and cleaned with `gc.collect()`.
- **Singleton OCR Engine**: A single shared RapidOCR instance is reused across requests rather than re-initialized per image.

---

## 13. OCR Safety, Reconciliation & Uncertainty Handling

PackCheck enforces strict safety boundaries between automated extraction and human inspection:

### Reconciliation Truth Matrix
When comparing officer input against OCR package evidence:

| Inspector Input | OCR Package Evidence | Comparison Status | Action / UI Presentation |
| :---: | :---: | :---: | :--- |
| **Present ($X$)** | **Present ($X$)** | `CONSISTENT` | **Match confirmed**; green verified indicator. |
| **Present ($X$)** | **Present ($Y \neq X$)** | `MISMATCH_REVIEW_REQUIRED` | **Discrepancy flagged**; requires officer manual review. |
| **Absent** | **Present ($Y$)** | `OCR_ONLY_SUGGESTION` | **Package evidence suggestion**; labeled clearly as unverified OCR. |
| **Present ($X$)** | **Absent** | `INSPECTOR_ONLY` | **Authoritative officer record preserved**; OCR detected no data. |
| **Absent** | **Absent** | `NO_DATA` | No data recorded. |

### False-Positive Protection Safeguards
- **Unit Price vs. MRP**: Compound price lines such as `₹40.00 ₹0.16/g` are split into distinct fields. Unit price is never mistaken for MRP.
- **Net Weight vs. Nutrition Panel**: Quantities inside nutrition tables (e.g., `Protein 7.8g`, `Carbohydrates 74g`) or serving sizes (e.g., `Per serve 15g`) are rejected from the package net weight candidate.
- **FSSAI License Validation**: 14-digit numbers are verified against FSSAI contextual markers (`Lic. No.`, `FSSAI`, `License`). Phone numbers and barcodes are rejected.
- **Batch Code Sanitization**: Date timestamps and clock times (e.g., `09:45 AM`) are rejected from batch/lot extraction.
- **Zero Hallucination Guarantee**: If evidence is missing, the field remains `UNCONFIRMED` with confidence `0.0`. The system never invents or guesses characters.

---

## 14. Real-World Packaging Regression Example (Marie Gold)

PackCheck’s automated regression suite (`backend/test_ocr_precision_regression.py`) tests real-world photographs from the packaged-commodity test corpus:

| Declaration Parameter | Raw OCR Text Detected | Normalized Value | Extraction Status | Confidence | Regression Assertion |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **MRP** | `40.000.16/g` | `₹40.00` (INR) | `VERIFIED` | 92% | Isolated from compound price string; unit price removed. |
| **Unit Sale Price** | `40.000.16/g` | `₹0.16/g` | `VERIFIED` | 91% | Correct denominator (`g`) and price-per-unit extracted. |
| **Net Quantity** | `250g` | `250 g` (base: `250.0 g`) | `VERIFIED` | 94% | Distinguished from nutrition facts and serving sizes. |
| **Date of Packing (PKD)**| `05/08/26` | `2026-08-05` (ISO) | `VERIFIED` | 89% | Indian `DD/MM/YY` format preserved; no US date flip. |
| **Date of Expiry (USE BY)**| `01/02/27` | `2027-02-01` (ISO) | `VERIFIED` | 90% | Distinguished from manufacturing date. |
| **Batch / Lot Number** | `A08269F` | `A08269F` | `VERIFIED` | 88% | Isolated without noise or timestamp interference. |
| **FSSAI License** | `Lic.No.10015043001129`| `10015043001129` | `VERIFIED` | 93% | Validated 14-digit statutory license pattern. |
| **Shelf Life Duration** | `BEST BEFORE 6 MONTHS` | `6 months from mfg` | `VERIFIED` | 85% | Handled as duration metadata, not calendar date. |

> *Note: These values serve as automated regression expectations and are discovered dynamically from image evidence by production code without hard-coded constants.*

---

## 15. Regulatory Rule Engine (LMPC 2011 + Amendments)

The PackCheck compliance engine executes deterministic rules compiled from the official statutory corpus:

### Central Rulebook Architecture (`rulebook.json`)
- **Corpus ID**: `PACKCHECK-LMPC-2026` (verified as of September 2026).
- **Primary Source**: Department of Consumer Affairs, Ministry of Consumer Affairs, Food & Public Distribution.
- **Base Instruments**:
  - Legal Metrology Act, 2009 (Act No. 1 of 2010).
  - Legal Metrology (Packaged Commodities) Rules, 2011 (GSR 202(E)).
- **Incorporated Amendments**:
  - `GSR 629(E)` (2017): Declarations on Principal Display Panel (PDP).
  - `GSR 779(E)` (2021): Unit Sale Price framework & mandatory font sizing.
  - `GSR 226(E)` (2022): Omission of Second Schedule standard sizes.
  - `GSR 577(E)` (2022): Electronic product QR code declarations.
  - `GSR 778(E)` (2025): Medical device declaration harmonization.
  - `GSR 881(E)` (2025): Rule 26 small package exemption restrictions.
  - `GSR 128(E)` (2026): E-commerce country of origin disclosure requirements.
  - `GSR 418(E)` (2026): AEO bonded-warehouse declarations and registration updates.

### Deterministic Rule Handlers
1. **Rule 6(1)(a)**: Name and complete address of the manufacturer / packer / importer.
2. **Rule 6(1)(b)**: Generic or common name of the commodity contained in the package.
3. **Rule 6(1)(c)**: Net quantity in terms of standard unit of weight, measure, or number.
4. **Rule 6(1)(d)**: Month and year of manufacture, packing, or import (PKD/MFD).
5. **Rule 6(1)(da)**: Maximum Retail Price (MRP) inclusive of all taxes in Indian Rupees.
6. **Rule 6(1)(e)**: Unit Sale Price (USP) declared in accordance with statutory rounding.
7. **Rule 6(1)(f)**: Consumer care contact details (name, address, telephone, email).
8. **Rule 7**: Area of Principal Display Panel (PDP) and minimum font size compliance.
9. **Rule 26**: Small package exemptions (e.g., packages `<= 10g` or `10ml`), with statutory exclusions.
10. **Maximum Permissible Error (MPE)**: Net weight tolerance verification under the First Schedule.

---

## 16. Compliance Result States

Every rule evaluation yields one of three standardized states:

```
  ┌────────────────────────────────────────────────────────────────────────┐
  │                               SATISFIED                                │
  │ The implemented deterministic check is satisfied based on available    │
  │ evidence. All mandatory components are present and conform to rules.   │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                       POTENTIAL_NON_COMPLIANCE                         │
  │ The implemented check identifies a potential discrepancy against       │
  │ statutory rules (e.g., missing MRP, invalid unit price denominator).   │
  └────────────────────────────────────────────────────────────────────────┘

  ┌────────────────────────────────────────────────────────────────────────┐
  │                           REVIEW_REQUIRED                              │
  │ Evidence or image quality is insufficient, ambiguous, uncalibrated,    │
  │ or conflicting. The officer must manually inspect the physical package.│
  └────────────────────────────────────────────────────────────────────────┘
```

---

## 17. Physical Measurement & Calibration Boundary

A core principle of PackCheck’s architecture is that **OCR reads printed declarations, but cannot measure physical quantities**:

1. **Printed vs. Actual Net Quantity**: An OCR extraction of `250 g` only proves that `250 g` is printed on the package. Determining whether the package actually contains 250 g requires a physical weighing scale.
2. **Maximum Permissible Error (MPE)**: PackCheck checks MPE compliance **only** if the officer enters a verified physical measurement from an inspection scale.
3. **Font Height in Millimetres vs. Screen Pixels**: Rule 7 mandates font sizes in physical millimetres (e.g., minimum 2.0mm or 4.0mm). PackCheck converts image pixels to physical millimetres **only when a trusted calibration scale or reference ruler is detected**. In the absence of physical calibration, PackCheck outputs `REVIEW_REQUIRED` (`NO_TRUSTED_SCALE`) rather than falsely passing or failing the package.

---

## 18. Inspection Workspace & Summary Screen

The central inspection workspace (`InspectionWorkspace.js`) provides an integrated command console organized into 6 tabs:

```
  ┌──────────────────────────────────────────────────────────────────────────┐
  │ [Summary] [Evidence (4)] [Declarations (12)] [Compliance (14)] [Report]  │
  └──────────────────────────────────────────────────────────────────────────┘
```

1. **Executive Summary Tab**:
   - High-level compliance status banner (`SATISFIED`, `POTENTIAL_NON_COMPLIANCE`, or `REVIEW_REQUIRED`).
   - **OCR Package Evidence Card**: Grid displaying extracted MRP, Net Weight, PKD, Use By, Unit Price, FSSAI, Batch, and Shelf Life with confidence tier badges (`HIGH`, `MEDIUM`, `LOW`, `REVIEW_REQUIRED`).
   - **Inspector Input vs. OCR Reconciliation Table**: Side-by-side reconciliation highlighting matches and discrepancies.
2. **Evidence Tab**: Multi-view photo manager showing captured views, blur/lighting validation badges, and image recapturing tools.
3. **Declarations Tab**: Full 12-field structured declarations ledger showing raw OCR text, normalized values, inspector edits, and bounding boxes.
4. **Compliance Tab**: Detailed statutory findings list with rule citations, legal reason codes, severity levels, and evidence links.
5. **Report Tab**: Finalized PDF viewer, cryptographic SHA-256 fingerprint, download button, and supervisor sign-off controls.
6. **Activity Tab**: Chronological audit trail showing who created, edited, reviewed, approved, or reopened the inspection.

---

## 19. Enforcement Dashboard & Analytics

The **Enforcement Dashboard** (`EnforcementDashboard.js`) provides organizational intelligence:

- **Executive KPI Cards**:
  - Total Inspections Conducted.
  - Overall Compliance Rate (%).
  - Flagged Non-Compliance Actions.
  - Inspections Awaiting Officer Review.
- **Visual Analytics**:
  - Compliance Outcome Distribution (Donut chart: Satisfied vs. Non-Compliant vs. Review Required).
  - Top Statutory Violations Bar Chart (e.g., Missing Unit Sale Price, Incomplete Consumer Care Details).
  - Packaging Type Distribution (Pouches, Cartons, Bottles, Tins).
  - Time Range Filters: `Today`, `Last 7 Days`, `Last 30 Days`, and `Custom Date Range`.
  - Channel Breakdown: Physical Retail vs. E-Commerce Marketplaces.

---

## 20. Inspection History & Retrieval

The **Inspection History Viewer** (`InspectionHistoryViewer.js`) ensures historical traceability:
- **Instant Search**: Search across inspection IDs, product names, brands, batch numbers, and inspector names.
- **Multi-Dimensional Filters**: Filter by status (`approved`, `rejected`, `pending_review`, `draft`, `reopened`), packaging category, date ranges, and compliance outcomes.
- **Deep Report Access**: Direct access to finalized reports, cryptographic hashes, and historical audit entries.
- **Append-Only Preservation**: Database records are never deleted or truncated; all inspection data is permanently retained.

---

## 21. Security & Audit Logging

PackCheck maintains an append-only ledger in `audit_logs` tracking every sensitive platform event:

| Event Type | Trigger Condition | Recorded Metadata |
| :--- | :--- | :--- |
| `AUTH_LOGIN` | User logs in with password / demo badge | User ID, role, client IP, timestamp |
| `INSPECTION_CREATE` | Inspector creates a new inspection record | Inspection ID, product name, brand, batch |
| `EVIDENCE_UPLOAD` | Package photo uploaded and validated | View ID, file size, SHA-256 hash, blur status |
| `OCR_EXTRACT` | OCR and field extraction executed | Candidate counts, average confidence |
| `COMPLIANCE_EVALUATE` | Rule engine execution triggered | Overall outcome, count of violations flagged |
| `STATUS_TRANSITION` | Lifecycle state change | From-status, to-status, reviewer, notes |
| `REPORT_FINALIZE` | Supervisor approves and creates PDF | PDF file size, SHA-256 cryptographic digest |
| `INSPECTION_REOPEN` | Approved inspection reopened for review | Justification notes, officer credentials |

---

## 22. Professional PDF Inspection Report Engine

The ReportLab-based PDF generation engine (`backend/app/core/pdf_generator.py`) generates court-ready technical inspection reports:

```
  ┌────────────────────────────────────────────────────────┐
  │  PACKCHECK INSPECTION REPORT                           │
  │  Inspection ID: INS-20260916-TEST01                    │
  │  Date: 2026-09-16 | Inspector: Senior Field Inspector  │
  ├────────────────────────────────────────────────────────┤
  │  1. Product & Inspection Metadata                      │
  │     Brand: Britannia | Commodity: Marie Gold Biscuits  │
  │     Batch: A08269F   | Net Qty: 250 g | MRP: ₹40.00    │
  ├────────────────────────────────────────────────────────┤
  │  2. High-Resolution Evidence Photography               │
  │     [Embedded Front Photo]   [Embedded Back Photo]     │
  │     (Preserved aspect ratio, non-stretched, crisp)     │
  ├────────────────────────────────────────────────────────┤
  │  3. OCR Package Evidence vs. Inspector Reconciliation  │
  │     Table comparing Officer Input against OCR Package   │
  │     Evidence with verified consistency statuses        │
  ├────────────────────────────────────────────────────────┤
  │  4. Deterministic Statutory Compliance Ledger          │
  │     Rule 6(1)(a) ... SATISFIED                         │
  │     Rule 6(1)(da)... SATISFIED (₹40.00 declared)       │
  │     Rule 6(1)(e) ... SATISFIED (₹0.16/g declared)      │
  ├────────────────────────────────────────────────────────┤
  │  5. MANDATORY NON-STATUTORY LEGAL DISCLAIMER           │
  │     "DISCLAIMER: PackCheck is an automated inspection- │
  │     assistance and evidence-screening system...        │
  │     Official enforcement decisions remain under the    │
  │     sole jurisdiction of authorized officers."         │
  ├────────────────────────────────────────────────────────┤
  │  Cryptographic Fingerprint:                            │
  │  SHA-256: 276419283f... | Size: 83,178 Bytes           │
  └────────────────────────────────────────────────────────┘
```

### PDF Storage Safety Invariant
During finalization:
1. Multi-page PDF is generated in memory using ReportLab.
2. PDF text content and embedded photos are verified using PyMuPDF / internal verifier.
3. Cryptographic SHA-256 hash is computed.
4. PDF bytes and metadata are saved to permanent database storage (`finalized_reports`).
5. Only **after** verified storage, temporary image files are cleanly purged from disk. If storage fails, temporary evidence is preserved to prevent evidence loss.

---

## 23. System Architecture

```mermaid
graph TD
    subgraph Client [Presentation Layer - Next.js 15]
        UI[AppShell / Next.js Web Application]
        Theme[Vanilla CSS Design System Dark/Light Tokens]
        AuthCtx[JWT AuthContext & Session Manager]
    end

    subgraph Gateway [API Gateway & Security Layer]
        FastAPI[FastAPI Core Server :8000]
        CORS[CORS Middleware Vercel & Localhost Allowed]
        JWTAuth[OAuth2 / JWT Bearer Dependency]
        RBAC[Server-Side RBAC Guard]
    end

    subgraph Engines [Processing & Intelligence Layer]
        OCR[RapidOCR ONNX Runtime Engine]
        Preproc[OpenCV Adaptive Preprocessor]
        FieldExt[Field-Aware Spatial & Semantic Extractor]
        RuleEngine[LMPC Deterministic Rule Engine]
        PDFGen[ReportLab PDF Generation Engine]
    end

    subgraph Data [Persistence Layer - Append Only]
        SQLAlchemy[SQLAlchemy ORM 2.0]
        DB[(PostgreSQL / MySQL Database)]
        Reports[(finalized_reports LONGBLOB Storage)]
        AuditStore[(audit_logs Ledger)]
    end

    UI --> Gateway
    Gateway --> Engines
    Engines --> Data
```

---

## 24. Technology Stack

| Component | Technology | Version | Purpose in PackCheck |
| :--- | :--- | :--- | :--- |
| **Frontend Framework** | **Next.js** | 15.1.0 | Server-side rendering, routing, and single-page application client. |
| **UI Library** | **React** | 19.0.0 | Component hierarchy, state hooks, and client-side interactions. |
| **Styling & Theme** | **Vanilla CSS** | Modern CSS3 | Custom enterprise tokens (`globals.css`), dark/light themes, zero Tailwind overhead. |
| **Backend Framework** | **FastAPI** | 0.115.0+ | High-throughput asynchronous REST API engine with OpenAPI / Swagger generation. |
| **ASGI Server** | **Uvicorn** | 0.30.0+ | Lightweight, production-grade ASGI web server. |
| **ORM / Database** | **SQLAlchemy** | 2.0.30+ | Database abstraction layer with declarative models and migration safety. |
| **Database Drivers** | **PyMySQL / Psycopg2** | Latest | Native drivers supporting both MySQL (local) and PostgreSQL (cloud). |
| **OCR Framework** | **RapidOCR** | 1.2.3+ | Lightweight ONNX-based PaddleOCR models (DBNet detection + CRNN recognition). |
| **Image Processing** | **OpenCV Headless** | 4.10.0+ | Adaptive thresholding, contrast tuning, blur detection, and EXIF transforms. |
| **Image Library** | **Pillow (PIL)** | 10.0.0+ | Image file decoding, format validation, and perceptual dHash computing. |
| **PDF Engine** | **ReportLab** | 4.0.0+ | Multi-page PDF generation with tables, embedded images, and exact typography. |
| **Authentication** | **PyJWT & Bcrypt** | 2.8+ / 4.0+ | Salted password hashing and signed JSON Web Token verification. |
| **Settings Management**| **Pydantic Settings**| 2.4.0+ | Strongly-typed environment configuration and input validation. |

---

## 25. Frontend Architecture

The frontend is structured in `frontend/src/` as a modular Next.js application:

- **`app/page.js`**: Application router switching between unauthenticated `LandingPage` and authenticated `AppShell`.
- **`app/globals.css`**: Design system (92KB) defining HSL color tokens, typography, glassmorphism, responsive grid layouts, and high-contrast accessibility styles.
- **`context/AuthContext.js`**: Client-side authentication provider managing JWT session storage, user profile state, and login/logout handlers.
- **Key Components**:
  - `AppShell.js`: Top-level authenticated layout with navigation bar, role indicators, and view switcher.
  - `LandingPage.js`: Public-facing portal with platform feature highlights and SIH demonstration links.
  - `EnforcementDashboard.js`: Metrics console with charts, KPI summary blocks, and compliance breakdown.
  - `NewInspectionWizard.js`: Guided 5-step stepper for creating new inspections.
  - `InspectionWorkspace.js`: Master 6-tab workspace for evidence management, extraction, rule checks, and reports.
  - `InspectionHistoryViewer.js`: Searchable, filterable ledger of all historical inspections.
  - `AuditLogsViewer.js`: Chronological security and operational event log viewer.
  - `AuthModal.js`: Login dialog with pre-configured 1-click SIH Demo Account buttons.
  - `ThemeToggle.js`: Seamless day / night theme toggle with `localStorage` persistence.

---

## 26. Backend Architecture

The backend is organized in `backend/app/`:

```
backend/
├── app/
│   ├── api/
│   │   ├── deps.py              # Auth dependencies, RBAC validators, DB session provider
│   │   ├── router.py            # Master API router aggregating v1 endpoint modules
│   │   └── v1/endpoints/
│   │       ├── health.py        # System health and database connectivity diagnostics
│   │       ├── auth.py          # Login, logout, current profile retrieval
│   │       ├── inspections.py   # Inspection lifecycle, CRUD, status transitions, history
│   │       ├── evidence.py      # Multi-view photo upload, validation, retrieval
│   │       ├── extraction.py    # RapidOCR execution, field extractor, declaration ledger
│   │       ├── rules.py         # LMPC rulebook definitions, compliance evaluation
│   │       ├── reports.py       # Finalized PDF generation, verification, download
│   │       ├── audit.py         # Chronological system audit logs
│   │       └── analytics.py     # Enforcement dashboard metrics and aggregations
│   ├── core/
│   │   ├── config.py            # Pydantic Settings supporting MySQL & PostgreSQL
│   │   ├── database.py          # SQLAlchemy engine, connection pooling, SessionLocal
│   │   ├── security.py          # Bcrypt password hashing & PyJWT token utilities
│   │   ├── errors.py            # Global exception handlers and error JSON schemas
│   │   ├── init_db.py           # Safe schema creation and idempotent demo seeding
│   │   ├── cv_preprocessor.py   # OpenCV adaptive preprocessor & coordinate inverse-mapper
│   │   ├── image_validator.py   # Blur, exposure, highlight clipping & dHash validation
│   │   ├── field_extractor.py   # Spatial/semantic extractor, compound price parser
│   │   ├── rule_engine.py       # Deterministic LMPC compliance evaluation engine
│   │   ├── pdf_generator.py     # ReportLab PDF generator with image verifier
│   │   └── views_config.py      # Packaging-type-specific view configurations
│   ├── models/                  # SQLAlchemy ORM models
│   ├── schemas/                 # Pydantic validation contracts
│   └── rules/lmpc/              # Official statutory corpus JSON files
│       ├── rulebook.json        # Central LMPC rules definition
│       └── source_instruments.json # Official Gazette notifications & legal sources
```

---

## 27. REST API Documentation

### Key API Routes Overview

| Method | Endpoint | Description | Allowed Roles |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | System health check and database latency. | Public |
| `POST` | `/api/v1/auth/login` | Authenticate with email/password; returns JWT token. | Public |
| `GET` | `/api/v1/auth/me` | Retrieve profile of the currently authenticated user. | All Authenticated |
| `GET` | `/api/v1/inspections` | List inspections (scoped to role; paginated & filterable). | Inspector, Supervisor, Admin, Auditor |
| `POST` | `/api/v1/inspections` | Create a new inspection in `DRAFT` status. | Inspector, Admin |
| `GET` | `/api/v1/inspections/{id}` | Retrieve comprehensive inspection details. | All Authenticated |
| `PATCH` | `/api/v1/inspections/{id}/status` | Execute lifecycle state transition (`pending_review`, etc.). | Inspector, Supervisor, Admin |
| `POST` | `/api/v1/inspections/{id}/evidence/{view_id}` | Upload and validate temporary package view photo. | Inspector, Admin |
| `POST` | `/api/v1/inspections/{id}/extract` | Run RapidOCR and field extraction across uploaded views. | Inspector, Admin |
| `GET` | `/api/v1/inspections/{id}/declarations` | Retrieve extracted declarations ledger. | All Authenticated |
| `PUT` | `/api/v1/inspections/{id}/declarations/{field}` | Officer manual verification or correction of a field. | Inspector, Admin |
| `POST` | `/api/v1/rules/evaluate` | Run deterministic LMPC compliance engine against evidence. | Inspector, Supervisor, Admin |
| `POST` | `/api/v1/inspections/{id}/reports/finalize` | Finalize inspection: generate PDF, compute SHA-256, approve. | Supervisor, Admin |
| `GET` | `/api/v1/inspections/{id}/reports/download` | Download permanent immutable inspection PDF report. | All Authorized Roles |
| `GET` | `/api/v1/analytics/summary` | Retrieve enforcement dashboard analytics and KPI metrics. | Supervisor, Admin, Auditor |
| `GET` | `/api/v1/audit/logs` | Retrieve chronological security and operational audit trail. | Supervisor, Admin, Auditor |

---

## 28. Database Schema & Data Model

```mermaid
erDiagram
    USERS ||--o{ INSPECTIONS : creates
    USERS ||--o{ AUDIT_LOGS : performs
    INSPECTIONS ||--o{ TEMPORARY_EVIDENCE : contains
    INSPECTIONS ||--o{ EXTRACTED_DECLARATIONS : yields
    INSPECTIONS ||--o{ COMPLIANCE_RUNS : evaluates
    INSPECTIONS ||--o{ INSPECTION_HISTORY : tracks
    INSPECTIONS ||--o| FINALIZED_REPORTS : produces
    COMPLIANCE_RUNS ||--o{ COMPLIANCE_FINDINGS : details

    USERS {
        int id PK
        string email UK
        string hashed_password
        string full_name
        string role
        boolean is_active
    }

    INSPECTIONS {
        int id PK
        string inspection_id UK
        string name
        string product_name
        string brand_name
        string batch_number
        string packaging_type
        string category
        string status
        int created_by_id FK
        datetime created_at
    }

    TEMPORARY_EVIDENCE {
        int id PK
        string inspection_id FK
        string view_id
        string file_path
        string sha256_hash
        string dhash
        string status
    }

    EXTRACTED_DECLARATIONS {
        int id PK
        string inspection_id FK
        string field_name
        string raw_text
        text normalized_value
        float ocr_confidence
        text bounding_box
        string status
    }

    COMPLIANCE_RUNS {
        int id PK
        string inspection_id FK
        string rulebook_hash
        string overall_state
        datetime created_at
    }

    FINALIZED_REPORTS {
        int id PK
        string inspection_id UK
        string filename
        int file_size
        string sha256_hash
        blob pdf_blob
        datetime created_at
    }
```

---

## 29. Security, RBAC & Hardening

PackCheck has been verified against common security vulnerabilities via `backend/test_phase15_security_and_hardening.py`:

1. **Horizontal Privilege Escalation**: Inspectors cannot view or modify inspection records outside their assigned jurisdiction. Unauthorized requests return `HTTP 403 Forbidden`.
2. **Path Traversal & Filename Sanitization**: File upload names are stripped of relative path sequences (`../`, `..\\`) and sanitized to prevent directory escape attacks.
3. **Malicious & Corrupted File Rejection**: Uploaded files are inspected for true MIME types and image decodability. Executables, scripts, and truncated files are rejected with `HTTP 400 Bad Request`.
4. **Text Injection & XML Escaping in PDF Generation**: Extracted text strings containing XML tags (e.g., `<script>`, `<b>`, `&`) are safely escaped before passing to ReportLab to prevent parser crashes.
5. **Fail-Safe Cryptographic Hashing**: Reports are validated using cryptographic SHA-256 digests. Downloaded reports must match the database hash byte-for-byte.
6. **No Secret Leakage**: Passwords and secrets are omitted from all API responses, audit trails, and logs.

---

## 30. Data Lifecycle & Retention Policy

```
[Camera / File Upload]
       │
       ▼
[Temporary Evidence Directory] ──(Validated, Checked for Blur/dHash, Analyzed by RapidOCR)
       │
       ▼
[Structured Declarations & Compliance Findings Stored in Database]
       │
       ▼
[Supervisor Finalization & ReportLab PDF Generation]
       │
       ▼
[Verified PDF Saved to Database LONGBLOB with SHA-256 Digest]
       │
       ▼
[Temporary Evidence Purged from Disk] ──(Zero disk bloat; immutable PDF is permanent record)
```

- **Temporary Evidence**: Image files uploaded during active inspections are stored temporarily in `backend/storage/evidence/`.
- **Permanent Archival**: Upon supervisor approval, the finalized PDF (with embedded evidence images) is committed to database storage (`finalized_reports.pdf_blob`).
- **Clean Purge**: Disk buffers are purged **only after** verified database storage.
- **Append-Only Test Policy**: Automated test suites operate in an append-only mode and do not truncate or wipe historical database records.

---

## 31. Error & Edge-Case Handling

| Edge Case Scenario | PackCheck System Behavior | User / Inspector Experience |
| :--- | :--- | :--- |
| **Blurry or out-of-focus photo** | Flagged by `image_validator.py` (`Laplacian < 40.0`). | Image is tagged `warning`; inspector receives actionable guidance to recapture. |
| **Duplicate image uploaded twice** | Detected via 64-bit `dHash` comparison (`Hamming distance <= 6`). | Upload rejected; warning alerts officer that the same photo was already used. |
| **Severe glare across price cluster** | RapidOCR yields low character confidence (`< 0.65`). | Extraction marked `REVIEW_REQUIRED`; field highlights discrepancy for manual check. |
| **Compound price line (MRP + USP)** | Parsed by `parse_compound_price_line()`. | MRP (`₹40.00`) and Unit Price (`₹0.16/g`) are isolated into distinct fields. |
| **Missing calibration reference** | Rule engine detects no physical scale reference ruler. | Font size check marked `REVIEW_REQUIRED` (`NO_TRUSTED_SCALE`); never falsely passed. |
| **Officer input differs from OCR** | Checked via `compare_inspector_and_ocr()`. | Labeled `MISMATCH_REVIEW_REQUIRED`; officer input is preserved as authoritative. |
| **Temporary PDF generation failure** | Storage transaction rolls back; state preserved. | Inspection remains in reviewable state; temporary images are preserved on disk. |

---

## 32. Practical Use Cases

1. **Retail Market Surveillance**: Legal Metrology officers conducting field checks in supermarkets and retail stores verify packages against mandatory declarations.
2. **Manufacturing Facility Audits**: Standards inspectors verify pre-packaged goods at production facilities before dispatch.
3. **E-Commerce Compliance Auditing**: Regulators audit online marketplace product listings against the 2026 country-of-origin and digital declaration rules.
4. **Import Cargo Screening**: Customs and Legal Metrology teams screen imported packaged commodities at ports of entry.
5. **Consumer Protection Dispute Verification**: Resolving consumer complaints regarding hidden unit prices, missing MRPs, or expired stock with court-ready PDF evidence.

---

## 33. Recommended 3–5 Minute SIH Demo Flow

For presentations before Smart India Hackathon evaluators:

```
[0:00 - 0:45] Login & Problem Context
• Open http://localhost:3000
• Click 1-Click "Senior Field Inspector" demo button
• Highlight the Problem: Complex LMPC rules, multi-surface packaging, evidence custody

[0:45 - 1:45] New Inspection & Evidence Capture
• Click "Start New Inspection" (Guided 5-step wizard)
• Select "Flexible Pouch" (shows packaging-specific panels: Front, Back, MRP Cluster, FSSAI)
• Upload "marrie gold back image.jpg" and "marrie gold domanufacture.jpg"
• Show real-time quality validation (checks blur, lighting, duplicate dHash)

[1:45 - 2:45] OCR Package Evidence & Reconciliation
• Click "Run OCR & Field Extraction"
• Show the "OCR Package Evidence" Card:
    - MRP: ₹40.00
    - Unit Sale Price: ₹0.16/g (separated from MRP!)
    - Net Weight: 250 g (distinguished from nutrition table!)
    - PKD: 05/08/26 -> 2026-08-05
    - USE BY: 01/02/27 -> 2027-02-01
    - Batch: A08269F | FSSAI: 10015043001129
• Show the Reconciliation Table: Officer Input vs. OCR Package Evidence

[2:45 - 3:30] Deterministic LMPC Rule Engine
• Switch to "Compliance" tab
• Point out the 14 automated LMPC statutory checks
• Highlight the Statutory Authority Boundary: OCR is evidence, not a statutory verdict

[3:30 - 4:15] PDF Generation & History
• Submit for Review -> Switch to Supervisor -> Click "Finalize & Generate PDF"
• Open the generated PDF: Embedded evidence photos, tabular findings, SHA-256 fingerprint
• Show the Audit Log: Chronological, immutable event trail
```

---

## 34. Local Development Setup

### Prerequisites
- **Python**: 3.10, 3.11, or 3.12
- **Node.js**: 18.x or 20.x
- **Git**: Installed and configured

### 1-Click Unified Runner (Recommended)
```bash
# Windows
run.bat

# Linux / macOS / Manual Python
python run.py
```

### Manual Service Startup

#### Backend Setup
```bash
# 1. Navigate to backend directory
cd backend

# 2. Create virtual environment
python -m venv venv

# 3. Activate virtual environment
# On Windows:
venv\Scripts\activate
# On Linux/macOS:
source venv/bin/activate

# 4. Install dependencies
pip install -r requirements.txt

# 5. Start FastAPI development server
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

#### Frontend Setup
```bash
# 1. Navigate to frontend directory
cd frontend

# 2. Install Node dependencies
npm install

# 3. Start Next.js development server
npm run dev
```

---

## 35. Environment Variables Reference

### Backend Configuration (`backend/.env`)

| Variable | Description | Required? | Example / Default Value |
| :--- | :--- | :---: | :--- |
| `PROJECT_NAME` | Name of the platform instance. | No | `PackCheck` |
| `ENVIRONMENT` | Runtime environment mode. | No | `development` (or `production`) |
| `API_V1_STR` | Root URL prefix for REST API endpoints. | No | `/api/v1` |
| `CORS_ORIGINS` | Permitted cross-origin resource origins (JSON array or comma-separated). | Yes | `["http://localhost:3000","https://pack-check.vercel.app"]` |
| `DATABASE_URL` | Universal DB connection URL (PostgreSQL / Supabase / Neon). | Optional | `postgresql+psycopg2://user:pass@host:5432/dbname` |
| `MYSQL_HOST` | Hostname for local MySQL server (used if `DATABASE_URL` is unset). | No | `localhost` |
| `MYSQL_PORT` | Port for local MySQL server. | No | `3306` |
| `MYSQL_USER` | MySQL database user. | No | `root` |
| `MYSQL_PASSWORD` | MySQL database password. | No | `your_password` |
| `MYSQL_DATABASE` | MySQL schema name. | No | `packcheck_db` |
| `JWT_SECRET_KEY` | Cryptographic secret key used to sign JWT access tokens. | Yes | `min_32_chars_random_secret_key` |
| `JWT_ALGORITHM` | JWT signing algorithm. | No | `HS256` |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | Session token lifetime before expiry. | No | `1440` (24 hours) |

### Frontend Configuration (`frontend/.env.local`)

| Variable | Description | Required? | Example / Default Value |
| :--- | :--- | :---: | :--- |
| `NEXT_PUBLIC_API_BASE_URL` | Base HTTP URL of the running FastAPI backend API. | Yes | `http://localhost:8000/api/v1` |
| `NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS` | Enables 1-click SIH Demo login buttons in login modal. | No | `true` (disable in production) |

---

## 36. Cloud Deployment Architecture

PackCheck is configured for cloud deployment on **Vercel** (Frontend) and **Render** (Backend):

```mermaid
graph LR
    User[Client Browser / Mobile PWA] -->|HTTPS| Vercel[Vercel Edge Network Next.js Frontend]
    Vercel -->|REST API Requests| Render[Render Web Service FastAPI Backend ~0.1 CPU, 512MB RAM]
    Render -->|SQL Queries| DB[(Managed PostgreSQL / MySQL Cloud Database)]
```

### Production Checklist
1. **Frontend (Vercel)**:
   - Root Directory: `frontend`
   - Build Command: `npm run build`
   - Output Directory: `.next`
   - Environment Variable: `NEXT_PUBLIC_API_BASE_URL=https://<your-render-backend>.onrender.com/api/v1`
2. **Backend (Render)**:
   - Root Directory: `backend`
   - Build Command: `pip install -r requirements.txt`
   - Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
   - Environment Variables: `DATABASE_URL`, `JWT_SECRET_KEY`, `CORS_ORIGINS`
   - Resource Safe: Memory strictly bounded to operate within Render’s 512MB RAM free tier.

---

## 37. Automated Test Suites & Verification

PackCheck includes an automated test harness covering unit, integration, regression, and security suites:

```bash
# Activate backend virtualenv first
cd backend
venv\Scripts\activate

# 1. OCR Precision & Field Extraction Regression Suite (Marie Gold real packaging)
python test_ocr_precision_regression.py

# 2. Phase 10: PDF Generation & Cryptographic Verification Suite
python test_phase10_pdf.py

# 3. Phase 7: Deterministic LMPC Rule Engine Unit Tests
python test_rule_engine_phase7.py

# 4. Phase 15: Security, RBAC & Adversarial Hardening Suite
python test_phase15_security_and_hardening.py

# 5. Full End-to-End Lifecycle Pipeline Test (Phases 1-11)
python test_phases1_to_11_full_lifecycle.py
```

### Test Suite Summary

| Test Suite File | What It Tests | Status |
| :--- | :--- | :---: |
| `test_ocr_precision_regression.py` | 20 assertions: MRP, Unit Price, Net Wt, PKD, Expiry, FSSAI, Batch, Shelf Life, reconciliation | **20/20 PASS** |
| `test_phase10_pdf.py` | ReportLab PDF layout, photo embedding, aspect ratios, disclaimer presence | **ALL PASS** |
| `test_rule_engine_phase7.py` | LMPC rulebook hash stability, temporal rule gating, font calibration guards | **ALL PASS** |
| `test_phase15_security_and_hardening.py` | 10 suites: RBAC privilege escalation, text injection, file upload traps | **10/10 PASS** |
| `test_phases1_to_11_full_lifecycle.py` | End-to-end flow: auth → inspection → evidence → OCR → rules → PDF | **ALL PASS** |

---

## 38. System Limitations & Boundary Disclaimers

Engineering integrity requires transparent documentation of operational boundaries:

1. **Image Quality Dependency**: OCR accuracy depends on image legibility. Severe motion blur, extreme specular reflections, or crumpled surfaces can degrade text detection. PackCheck mitigates this by flagging warnings and offering recapture options.
2. **Printed Declarations vs. Physical Measurement**: OCR confirms what is printed on the container, not the physical mass of contents inside. True net quantity compliance requires an authorized inspection scale.
3. **Physical Scale Calibration**: Font size verification in millimetres requires a reference ruler or fiducial marker. Without calibration, the system reports `REVIEW_REQUIRED` (`NO_TRUSTED_SCALE`).
4. **Advisory Screening Only**: PackCheck outputs technical findings (`SATISFIED`, `POTENTIAL_NON_COMPLIANCE`, `REVIEW_REQUIRED`). It does **not** make judicial pronouncements or legal determinations.

---

## 39. Future Enhancements

The following capabilities represent planned future enhancements:
- **Mobile Camera Assistance**: Real-time bounding-box guidance overlay on mobile devices to assist officers in framing panels correctly.
- **Multilingual Regional OCR**: Expansion of OCR models to support Indian regional languages (e.g., Hindi, Tamil, Telugu, Bengali) on dual-language packaging.
- **Direct Digital Scale Bluetooth Pairing**: Direct Bluetooth integration with portable legal metrology inspection weighing scales for automated MPE net weight verification.
- **Offline Edge Inspection Mode**: Client-side IndexedDB caching enabling field officers to capture evidence in rural areas with zero network connectivity and sync when online.

---

## 40. Contributing Guidelines

1. **Branch Hygiene**: Create feature branches from `main` (e.g., `feat/rule-amendment-2027`).
2. **Preserve Authority Boundaries**: Never introduce logic that generates automatic legal verdicts, seizure orders, or replaces officer input.
3. **Append-Only Database Integrity**: Never write database migrations or test fixtures that use `drop_all()`, `truncate`, or delete existing inspection records.
4. **Resource Constraints**: Backend services must remain capable of operating under 512MB RAM without unconstrained background threads.
5. **No Hard-Coded Production Fixtures**: Do not hard-code test values into production parsers. Production code must discover declarations dynamically from evidence.

---

## 41. Repository Structure

```
PackCheck/
├── backend/
│   ├── app/
│   │   ├── api/                 # REST routing, auth dependencies, endpoints
│   │   ├── core/                # Preprocessor, OCR, Field Extractor, Rule Engine, PDF
│   │   ├── models/              # SQLAlchemy database ORM models
│   │   ├── providers/           # RapidOCR and rule provider implementations
│   │   ├── rules/lmpc/          # Central statutory LMPC rulebook & legal sources
│   │   ├── schemas/             # Pydantic data validation schemas
│   │   └── main.py              # FastAPI application factory & lifespan context
│   ├── test_images/             # Real-world packaging photography regression corpus
│   ├── test_ocr_precision_regression.py # 20-point automated OCR regression suite
│   ├── test_phase10_pdf.py      # PDF generation & content verification tests
│   ├── test_rule_engine_phase7.py # LMPC rule engine unit tests
│   ├── test_phase15_security_and_hardening.py # Security & adversarial tests
│   ├── requirements.txt         # Minimal backend dependencies
│   └── .env.example             # Backend environment template
├── frontend/
│   ├── src/
│   │   ├── app/                 # Next.js app directory (page.js, globals.css)
│   │   ├── components/          # Reusable UI components & operational consoles
│   │   └── context/             # AuthContext (JWT session state & role helpers)
│   ├── package.json             # Minimal frontend dependencies
│   └── .env.example             # Frontend environment template
├── test_images/                 # Real packaging photography test images (Marie Gold, etc.)
├── run.bat                      # 1-Click Windows unified platform launcher
├── run.py                       # Cross-platform Python unified platform launcher
└── README.md                    # Complete platform documentation & handover guide
```

---

## 42. Troubleshooting Guide

| Symptom | Probable Cause | Recommended Resolution |
| :--- | :--- | :--- |
| **Port 8000 or 3000 already in use** | Stale background development server. | Run `run.bat` or `python run.py`; the launcher detects and frees stale ports automatically. |
| **OCR runs out of memory on Render** | Unconstrained ONNX threads exceeding 512MB RAM. | Ensure `rapid_ocr_provider.py` enforces `OMP_NUM_THREADS=1` and `Det_limit_side_len=720`. |
| **CORS errors when calling API** | Backend `CORS_ORIGINS` missing frontend domain. | Add your frontend URL (e.g. `https://pack-check.vercel.app`) to `CORS_ORIGINS` in `backend/.env`. |
| **Database connection fails** | MySQL service not running or `DATABASE_URL` misconfigured. | Ensure local MySQL is running on port 3306 or provide a valid PostgreSQL URL in `DATABASE_URL`. |
| **PDF generation fails with missing image** | Evidence image was moved or deleted from disk. | PackCheck halts finalization to prevent evidence loss; re-upload missing view photo and retry. |
| **Rupee symbol `₹` displays as question mark in console** | Windows console default code page is not UTF-8. | The runner and test scripts configure `sys.stdout.reconfigure(encoding="utf-8")` automatically. |

---

## 43. Glossary of Terms

- **LMPC**: Legal Metrology (Packaged Commodities) Rules, 2011.
- **PDP (Principal Display Panel)**: The primary surface of a package intended to be displayed to consumers under normal conditions of retail sale.
- **MRP**: Maximum Retail Price, inclusive of all statutory taxes.
- **Unit Sale Price (USP)**: The price per unit weight, volume, or count (e.g., `₹0.16/g` or `₹40.00/kg`).
- **PKD / MFD**: Date of Packing or Manufacturing.
- **FSSAI**: Food Safety and Standards Authority of India 14-digit statutory license or registration number.
- **MPE**: Maximum Permissible Error; legal net weight deficiency tolerance under the First Schedule of LMPC Rules.
- **dHash**: 64-bit difference hash used for perceptual image duplicate detection.
- **RapidOCR**: Lightweight ONNX-runtime OCR engine implementing DBNet text detection and CRNN text recognition.

---

## 44. Statutory References & Regulatory Authorities

1. **Department of Consumer Affairs**, Ministry of Consumer Affairs, Food and Public Distribution, Government of India: [Official Legal Metrology Portal](https://consumeraffairs.gov.in/pages/legal-metrology-act).
2. **The Legal Metrology Act, 2009** (Act No. 1 of 2010), Ministry of Law and Justice: [India Code Entry](https://www.indiacode.nic.in/handle/123456789/2102).
3. **The Legal Metrology (Packaged Commodities) Rules, 2011**, published vide GSR 202(E) dated 7th March 2011: [Gazette Notification](https://consumeraffairs.gov.in/pages/legal-metrology-act).
4. **Food Safety and Standards (Packaging and Labelling) Regulations, 2011**, Food Safety and Standards Authority of India: [FSSAI Regulations](https://www.fssai.gov.in).
