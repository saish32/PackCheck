# PackCheck - Automated Packaging Inspection & Compliance Platform

> **Phases 1, 3 & 4 Active: Core Architecture, Secure Authentication & RBAC, Inspection Management & History**

PackCheck is a modern, modular enterprise platform built for automated regulatory compliance inspection of consumer packaged goods. Phases 1, 3, and 4 provide a rock-solid foundation targeting SIH Rank 1 standards.

---

## 🚀 Quick Start (Unified 1-Click Runner)

Launch all platform services (FastAPI Backend + Next.js Frontend) with a single command:

```bash
# Windows Batch (Double-click or run from command prompt)
run.bat

# Or directly with Python:
python run.py
```

- **Web Application**: http://localhost:3000
- **FastAPI Swagger Docs**: http://localhost:8000/docs
- **API Health Check**: http://localhost:8000/api/v1/health

> [!TIP]
> Press `Ctrl+C` anytime in the runner terminal to cleanly stop all background services.

---

## 🏛️ System Architecture

```
PackCheck/
├── .gitignore               # Strict gitignore ensuring .env & secrets are never committed
├── README.md                # Complete platform documentation & setup guide
├── backend/                 # FastAPI Python Backend
│   ├── app/
│   │   ├── api/
│   │   │   ├── deps.py      # JWT authentication, server-side RBAC & audit helpers
│   │   │   ├── router.py    # Master router aggregating all endpoints
│   │   │   └── v1/endpoints/
│   │   │       ├── health.py# Safe system and MySQL health checks
│   │   │       ├── auth.py  # Login, logout, current profile
│   │   │       ├── inspections.py # Lifecycle state machine, scoped lists, reopening
│   │   │       └── audit.py # Chronological security & action audit logs
│   │   ├── core/
│   │   │   ├── config.py    # Pydantic Settings & environment manager
│   │   │   ├── database.py  # SQLAlchemy engine & MySQL session manager
│   │   │   ├── errors.py    # Global exception handlers
│   │   │   ├── init_db.py   # Safe schema creation & idempotent demo seeding
│   │   │   ├── logging.py   # Simple structured request logging
│   │   │   └── security.py  # Bcrypt password hashing & PyJWT encoding/decoding
│   │   ├── models/
│   │   │   ├── base.py      # Declarative Base
│   │   │   ├── user.py      # User model with least-privilege roles
│   │   │   ├── audit.py     # AuditLog ledger
│   │   │   └── inspection.py# Inspection & InspectionHistory models
│   │   ├── providers/       # Extensible provider interfaces (Phases 2 & 3 hooks)
│   │   │   ├── ai/base.py   # BaseAIProvider abstract interface
│   │   │   └── rules/base.py# BaseRuleEngineProvider abstract interface
│   │   ├── schemas/         # Pydantic data validation contracts
│   │   │   ├── health.py
│   │   │   ├── user.py
│   │   │   ├── audit.py
│   │   │   └── inspection.py
│   │   └── main.py          # FastAPI application factory & lifespan context
│   ├── test_phase3_phase4.py# Automated RBAC & lifecycle test suite
│   ├── .env.example         # Environment template with placeholders only
│   ├── .env                 # Local environment file (gitignored)
│   └── requirements.txt     # Minimal backend dependencies
└── frontend/                # Next.js JavaScript Frontend
    ├── src/
    │   ├── app/
    │   │   ├── globals.css  # Modern Vanilla CSS design system & Day/Night tokens
    │   │   ├── layout.js    # Root layout and metadata configuration
    │   │   └── page.js      # PackCheck command center and dashboard
    │   ├── context/
    │   │   └── AuthContext.js# JWT session management & role helpers
    │   └── components/
    │       ├── Header.js           # Navigation bar with role badge & theme toggle
    │       ├── AuthModal.js        # Login form + 1-click SIH Demo Account Switcher
    │       ├── InspectionsManager.js# Full inspection creation, state machine & timeline
    │       ├── AuditLogsViewer.js  # Audit log stream with 403 unauthorized state
    │       ├── DiagnosticsHub.js   # On-demand health & MySQL latency tester
    │       └── ArchitectureRoadmap.js# SIH phase overview and modular roadmap
    ├── package.json         # Minimal dependencies (next, react, react-dom)
    ├── .env.example         # Frontend environment template with placeholders
    └── .env.local           # Local frontend environment file (gitignored)
```

---

## 👥 Seeded Demo Accounts (Local / SIH Presentation)

All demo accounts are idempotently seeded on startup with secure bcrypt hashes:

| Role | Email | Password | Primary Permissions |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin@packcheck.local` | `PackCheck@Admin2026!` | Full oversight, audit logs, user management |
| **Inspector** | `inspector@packcheck.local` | `PackCheck@Inspector2026!` | Create, edit draft, submit for review, reopen own inspections |
| **Supervisor** | `supervisor@packcheck.local` | `PackCheck@Supervisor2026!` | View all inspections, review, approve, reject, reopen, view audit logs |
| **Rule Manager** | `rulemanager@packcheck.local` | `PackCheck@Rules2026!` | Standards oversight, inspect specifications |
| **Auditor** | `auditor@packcheck.local` | `PackCheck@Auditor2026!` | Read-only inspection inspection and audit log verification |

> [!NOTE]
> The **1-Click Demo Switcher** in the UI is enabled in local/development mode via `NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS=true` and is automatically disabled in production builds.

---

## 🔄 Inspection State Machine

Inspection lifecycle transitions are strictly enforced server-side:

```
                  ┌────────────────────────┐
                  │         Draft          │
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

---

## 📮 Postman Testing Guide

### 1. Authenticate (Login)
- **Method**: `POST`
- **URL**: `http://127.0.0.1:8000/api/v1/auth/login`
- **Headers**: `Content-Type: application/json`
- **Body**:
  ```json
  {
    "email": "inspector@packcheck.local",
    "password": "PackCheck@Inspector2026!"
  }
  ```
- **Response**: Returns `access_token` and user profile.

### 2. Create Inspection (Inspector/Supervisor/Admin)
- **Method**: `POST`
- **URL**: `http://127.0.0.1:8000/api/v1/inspections`
- **Headers**:
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "name": "Britannia 50-50 Maska Chaska 120g Batch 14",
    "product_name": "50-50 Maska Chaska",
    "brand_name": "Britannia",
    "batch_number": "BC-2026-M4",
    "packaging_type": "Flexible Pouch",
    "category": "Packaged Food & Snacks",
    "fssai_license": "10014022002345",
    "net_quantity": "120g",
    "notes": "Pre-packaging compliance verification"
  }
  ```
- **Response**: Returns `201 Created` with immutable `INS-YYYYMMDD-XXXX` ID.

### 3. Transition Status (Submit for Review)
- **Method**: `POST`
- **URL**: `http://127.0.0.1:8000/api/v1/inspections/<inspection_id>/status`
- **Headers**:
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "to_status": "pending_review",
    "notes": "Inspection completed by field inspector. Submitting for supervisor review."
  }
  ```

### 4. Approve Inspection (Supervisor or Admin)
- **Method**: `POST`
- **URL**: `http://127.0.0.1:8000/api/v1/inspections/<inspection_id>/status`
- **Headers**:
  - `Authorization: Bearer <supervisor_token>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "to_status": "approved",
    "notes": "Packaging compliance verified against standard legal metrology."
  }
  ```

### 5. Reopen Inspection
- **Method**: `POST`
- **URL**: `http://127.0.0.1:8000/api/v1/inspections/<inspection_id>/reopen`
- **Headers**:
  - `Authorization: Bearer <access_token>`
  - `Content-Type: application/json`
- **Body**:
  ```json
  {
    "reason": "Batch sample discrepancy flagged by warehouse audit."
  }
  ```

### 6. View Audit Logs (Admin/Supervisor/Auditor)
- **Method**: `GET`
- **URL**: `http://127.0.0.1:8000/api/v1/audit/logs`
- **Headers**: `Authorization: Bearer <auditor_or_admin_token>`
