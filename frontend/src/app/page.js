"use client";

import { useState } from "react";
import { AuthProvider } from "@/context/AuthContext";
import Header from "@/components/Header";
import InspectionsManager from "@/components/InspectionsManager";
import InspectionHistoryViewer from "@/components/InspectionHistoryViewer";
import AuditLogsViewer from "@/components/AuditLogsViewer";
import EnforcementDashboard from "@/components/EnforcementDashboard";

export default function AppRoot() {
  return (
    <AuthProvider>
      <MainDashboard />
    </AuthProvider>
  );
}

function MainDashboard() {
  const [activeTab, setActiveTab] = useState("inspections");

  return (
    <div className="app-container">
      <Header activeTab={activeTab} setActiveTab={setActiveTab} />

      <main className="workspace-main" aria-live="polite">
        {activeTab === "inspections" && <InspectionsManager />}
        {activeTab === "dashboard" && <EnforcementDashboard />}
        {activeTab === "history" && <InspectionHistoryViewer />}
        {activeTab === "audit" && <AuditLogsViewer />}
      </main>

      <footer className="site-footer">
        <div>
          <strong>PackCheck</strong> · Evidence-first packaging inspection workspace
        </div>
        <div className="footer-meta">Inspection · Dashboard · History · Audit Logs</div>
      </footer>
    </div>
  );
}
