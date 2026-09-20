"use client";

import { useState, useEffect, useCallback } from "react";
import { AuthProvider, useAuth } from "@/context/AuthContext";
import LandingPage from "@/components/LandingPage";
import AuthModal from "@/components/AuthModal";
import AppShell from "@/components/AppShell";
import EnforcementDashboard from "@/components/EnforcementDashboard";
import InspectionsManager from "@/components/InspectionsManager";
import InspectionWorkspace from "@/components/InspectionWorkspace";
import NewInspectionWizard from "@/components/NewInspectionWizard";
import InspectionHistoryViewer from "@/components/InspectionHistoryViewer";
import AuditLogsViewer from "@/components/AuditLogsViewer";

export default function AppRoot() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}

function MainApp() {
  const { user, isAuthenticated, loading } = useAuth();

  // Root view state - default authenticated screen is strictly 'overview'
  const [activeView, setActiveView] = useState("overview"); // 'overview', 'inspections', 'history', 'audit'
  const [selectedInspection, setSelectedInspection] = useState(null);
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState("summary"); // 'summary', 'evidence', 'declarations', 'compliance', 'report', 'activity'
  const [wizardOpen, setWizardOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [initialSyncDone, setInitialSyncDone] = useState(false);

  // Restore navigation state from URL search params on client mount
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get("view");
    const inspParam = params.get("inspection");
    const tabParam = params.get("tab");
    const actionParam = params.get("action");

    if (viewParam && ["overview", "inspections", "history", "audit"].includes(viewParam)) {
      setActiveView(viewParam);
    }

    if (actionParam === "new") {
      setWizardOpen(true);
    }

    if (inspParam) {
      // Set basic stub for immediate context, full record loaded by InspectionWorkspace
      setSelectedInspection({ inspection_id: inspParam, product_name: "Inspection " + inspParam });
      if (tabParam && ["summary", "evidence", "declarations", "compliance", "report", "activity"].includes(tabParam)) {
        setActiveWorkspaceTab(tabParam);
      }
    }

    setInitialSyncDone(true);
  }, []);

  // Sync state back to URL search params
  const updateUrlState = useCallback((view, inspectionId, tab, isWizard) => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams();
    if (view) params.set("view", view);
    if (inspectionId) {
      params.set("inspection", inspectionId);
      if (tab) params.set("tab", tab);
    }
    if (isWizard) params.set("action", "new");

    const newQuery = params.toString() ? `?${params.toString()}` : window.location.pathname;
    window.history.replaceState(null, "", newQuery);
  }, []);

  // Navigation handlers
  const handleNavigateView = (viewId) => {
    setActiveView(viewId);
    setSelectedInspection(null);
    setWizardOpen(false);
    updateUrlState(viewId, null, null, false);
  };

  const handleOpenInspection = (ins, defaultTab = "summary") => {
    setSelectedInspection(ins);
    setActiveWorkspaceTab(defaultTab);
    setWizardOpen(false);
    updateUrlState(activeView, ins.inspection_id, defaultTab, false);
  };

  const handleCloseWorkspace = () => {
    setSelectedInspection(null);
    updateUrlState(activeView, null, null, false);
  };

  const handleWorkspaceTabChange = (tabId) => {
    setActiveWorkspaceTab(tabId);
    if (selectedInspection) {
      updateUrlState(activeView, selectedInspection.inspection_id, tabId, false);
    }
  };

  const handleOpenNewWizard = () => {
    setWizardOpen(true);
    setSelectedInspection(null);
    updateUrlState(activeView, null, null, true);
  };

  const handleCloseWizard = () => {
    setWizardOpen(false);
    updateUrlState(activeView, null, null, false);
  };

  // 1. SESSION RESTORATION LOADING STATE
  // Avoid flashing unauthenticated homepage or empty dashboard while token is verified
  if (loading) {
    return (
      <div className="app-session-loading" role="status" aria-label="Restoring PackCheck session">
        <div className="loading-brand-badge" aria-hidden="true">
          <span>PC</span>
        </div>
        <div className="loading-brand-name">PackCheck</div>
        <div className="loading-status-sub font-mono">Verifying authorization & session...</div>
      </div>
    );
  }

  // 2. UNAUTHENTICATED EXPERIENCE: PUBLIC PACKCHECK HOMEPAGE
  if (!isAuthenticated) {
    return (
      <>
        <LandingPage
          onOpenAuth={() => setAuthModalOpen(true)}
          onOpenWorkspace={() => setAuthModalOpen(true)}
        />
        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
        />
      </>
    );
  }

  // 3. AUTHENTICATED EXPERIENCE: OPERATIONAL WORKSPACE (DEFAULT TO OVERVIEW)
  return (
    <AppShell
      activeView={activeView}
      onNavigate={handleNavigateView}
      inspectionContext={selectedInspection}
      activeWorkspaceTab={selectedInspection ? activeWorkspaceTab : null}
      onWorkspaceTabChange={handleWorkspaceTabChange}
    >
      {/* 1. GUIDED 5-STEP NEW INSPECTION CREATION WIZARD */}
      {wizardOpen ? (
        <NewInspectionWizard
          onCancel={handleCloseWizard}
          onInspectionCreated={(newIns) => {}}
          onOpenWorkspace={(newIns, targetTab) => {
            setWizardOpen(false);
            handleOpenInspection(newIns, targetTab || "summary");
          }}
        />
      ) : selectedInspection ? (
        /* 2. DEDICATED INSPECTION WORKSPACE (CENTRAL OBJECT) */
        <InspectionWorkspace
          inspectionId={selectedInspection.inspection_id}
          initialTab={activeWorkspaceTab}
          onBack={handleCloseWorkspace}
          onInspectionUpdated={() => {}}
        />
      ) : (
        /* 3. PRIMARY TOP-LEVEL OPERATIONAL VIEWS */
        <>
          {activeView === "overview" && (
            <EnforcementDashboard
              onNewInspection={handleOpenNewWizard}
              onOpenInspection={(ins) => handleOpenInspection(ins, "summary")}
            />
          )}

          {activeView === "inspections" && (
            <InspectionsManager
              onNewInspection={handleOpenNewWizard}
              onOpenInspection={(ins) => handleOpenInspection(ins, "summary")}
            />
          )}

          {activeView === "history" && (
            <InspectionHistoryViewer
              onOpenInspection={(ins) => handleOpenInspection(ins, "report")}
            />
          )}

          {activeView === "audit" && (
            <AuditLogsViewer />
          )}
        </>
      )}
    </AppShell>
  );
}
