"use client";

import { useState, useEffect, useCallback } from "react";
import { useAuth, DEMO_USERS } from "@/context/AuthContext";
import { Icon } from "./Icons";
import AuthModal from "./AuthModal";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

const NAV_ITEMS = [
  { id: "overview", label: "Overview", icon: "overview" },
  { id: "inspections", label: "Inspections", icon: "inspections" },
  { id: "history", label: "History & Reports", icon: "history" },
  { id: "audit", label: "Audit Logs", icon: "audit" },
];

export default function AppShell({
  activeView = "overview",
  onNavigate,
  inspectionContext = null,
  activeWorkspaceTab = null,
  onWorkspaceTabChange,
  children
}) {
  const { user, isAuthenticated, logout, hasRole, switchDemoAccount } = useAuth();
  const [theme, setTheme] = useState("light");
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userDropdownOpen, setUserDropdownOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);

  // System Health state (Authoritative from /api/v1/health and /api/v1/health/db)
  const [healthStatus, setHealthStatus] = useState({
    api: "unknown",
    db: "unknown",
    dbVersion: null,
    latency: null,
  });

  // Role permissions
  const canViewAudit = hasRole(["admin", "supervisor", "auditor"]);

  // Day/Night theme initialization
  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem("packcheck_theme");
    if (saved === "light" || saved === "dark") {
      setTheme(saved);
      document.documentElement.setAttribute("data-theme", saved);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const initial = prefersDark ? "dark" : "light";
      setTheme(initial);
      document.documentElement.setAttribute("data-theme", initial);
    }
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("packcheck_theme", nextTheme);
  };

  // Poll system health
  const checkHealth = useCallback(async () => {
    try {
      const [appRes, dbRes] = await Promise.allSettled([
        fetch(`${API_BASE_URL}/health`, { cache: "no-store" }),
        fetch(`${API_BASE_URL}/health/db`, { cache: "no-store" }),
      ]);

      let apiHealthy = appRes.status === "fulfilled" && appRes.value.ok;
      let dbHealthy = false;
      let dbVer = null;
      let latency = null;

      if (dbRes.status === "fulfilled" && dbRes.value.ok) {
        const dbData = await dbRes.value.json().catch(() => ({}));
        dbHealthy = dbData.status === "connected";
        dbVer = dbData.database_version;
        latency = dbData.latency_ms;
      }

      setHealthStatus({
        api: apiHealthy ? "operational" : "unreachable",
        db: dbHealthy ? "connected" : "disconnected",
        dbVersion: dbVer,
        latency,
      });
    } catch {
      setHealthStatus((prev) => ({
        ...prev,
        api: "unreachable",
        db: "disconnected",
      }));
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, [checkHealth]);

  // Close dropdown on outside click
  useEffect(() => {
    const handleGlobalClick = (e) => {
      if (!e.target.closest(".user-menu-container")) {
        setUserDropdownOpen(false);
      }
    };
    window.addEventListener("click", handleGlobalClick);
    return () => window.removeEventListener("click", handleGlobalClick);
  }, []);

  const getRoleBadgeClass = (role) => {
    switch (role) {
      case "admin": return "badge-admin";
      case "supervisor": return "badge-supervisor";
      case "inspector": return "badge-inspector";
      case "rule_manager": return "badge-rule";
      case "auditor": return "badge-auditor";
      default: return "badge-idle";
    }
  };

  const handleNavClick = (viewId) => {
    if (onNavigate) {
      onNavigate(viewId);
    }
    setMobileMenuOpen(false);
  };

  const isSystemHealthy = healthStatus.api === "operational" && healthStatus.db === "connected";

  return (
    <div className="app-shell-root">
      {/* SKIP LINK FOR ACCESSIBILITY */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* MOBILE DRAWER BACKDROP */}
      {mobileMenuOpen && (
        <div
          className="mobile-drawer-backdrop"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* PERSISTENT LEFT SIDEBAR */}
      <aside className={`app-sidebar ${mobileMenuOpen ? "drawer-open" : ""}`} aria-label="Application navigation">
        {/* BRAND HEADER */}
        <div
          className="sidebar-brand-block"
          onClick={() => handleNavClick("overview")}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") handleNavClick("overview"); }}
          title="Return to Operations Overview"
          style={{ cursor: "pointer" }}
        >
          <div className="brand-logo-mark" aria-hidden="true">
            <span className="logo-initials">PC</span>
          </div>
          <div className="brand-identity">
            <div className="brand-title-wrap">
              <span className="brand-name">PackCheck</span>
              <span className={`status-dot ${isSystemHealthy ? "dot-online" : "dot-warning"}`} title={isSystemHealthy ? "System Operational" : "Service degraded"} />
            </div>
            <span className="brand-sub">Regulatory Inspection OS</span>
          </div>
          <button
            type="button"
            className="mobile-drawer-close"
            onClick={(e) => {
              e.stopPropagation();
              setMobileNavOpen(false);
            }}
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        {/* PRIMARY NAVIGATION */}
        <nav className="sidebar-nav" aria-label="Primary">
          <div className="nav-group-label">NAVIGATION</div>
          <ul className="nav-list">
            {NAV_ITEMS.map((item) => {
              if (item.id === "audit" && !canViewAudit) return null;
              const isActive = activeView === item.id && !inspectionContext;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`nav-item-btn ${isActive ? "active" : ""}`}
                    onClick={() => handleNavClick(item.id)}
                    aria-current={isActive ? "page" : undefined}
                  >
                    <Icon name={item.icon} size={18} className="nav-icon" />
                    <span className="nav-label">{item.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          {/* ACTIVE RECORD CONTEXT IN SIDEBAR IF SELECTED */}
          {inspectionContext && (
            <div className="sidebar-inspection-context">
              <div className="nav-group-label">ACTIVE INSPECTION</div>
              <div className="context-card">
                <div className="context-id">{inspectionContext.inspection_id}</div>
                <div className="context-product" title={inspectionContext.product_name}>
                  {inspectionContext.product_name}
                </div>
                <div className="context-meta">
                  <span className={`status-pill status-${(inspectionContext.status || "draft").toLowerCase()}`}>
                    {(inspectionContext.status || "draft").replace("_", " ")}
                  </span>
                </div>
              </div>

              {/* CONTEXTUAL WORKSPACE TABS */}
              {activeWorkspaceTab && (
                <ul className="workspace-nav-list">
                  {[
                    { id: "summary", label: "Summary", icon: "document" },
                    { id: "evidence", label: "Evidence", icon: "evidence" },
                    { id: "declarations", label: "Declarations", icon: "declarations" },
                    { id: "compliance", label: "Compliance", icon: "compliance" },
                    { id: "report", label: "Report", icon: "report" },
                    { id: "activity", label: "Activity", icon: "activity" },
                  ].map((tab) => (
                    <li key={tab.id}>
                      <button
                        type="button"
                        className={`workspace-tab-btn ${activeWorkspaceTab === tab.id ? "active" : ""}`}
                        onClick={() => {
                          if (onWorkspaceTabChange) onWorkspaceTabChange(tab.id);
                          setMobileMenuOpen(false);
                        }}
                      >
                        <span className="ws-dot" />
                        <span>{tab.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </nav>

        {/* SYSTEM STATUS FOOTER */}
        <div className="sidebar-system-footer">
          <div className="system-status-title">SYSTEM STATUS</div>
          <div className="status-metric-row">
            <span className="status-label">API Service</span>
            <span className="status-val">
              <span className={`status-dot-sm ${healthStatus.api === "operational" ? "dot-online" : "dot-offline"}`} />
              {healthStatus.api === "operational" ? "Operational" : "Unavailable"}
            </span>
          </div>
          <div className="status-metric-row">
            <span className="status-label">Database</span>
            <span className="status-val">
              <span className={`status-dot-sm ${healthStatus.db === "connected" ? "dot-online" : "dot-offline"}`} />
              {healthStatus.db === "connected" ? "Connected" : "Disconnected"}
            </span>
          </div>
          <div className="status-metric-row">
            <span className="status-label">LMPC Rulebook</span>
            <span className="status-val font-mono">v2026.09.16</span>
          </div>
          <div className="sidebar-version-tag">
            PackCheck v1.0 • Statutory Metrology
          </div>
        </div>
      </aside>

      {/* MAIN LAYOUT WRAPPER */}
      <div className="app-main-layout">
        {/* COMPACT STICKY TOPBAR */}
        <header className="app-topbar" role="banner">
          <div className="topbar-left">
            <button
              type="button"
              className="topbar-menu-toggle"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Toggle navigation drawer"
            >
              <Icon name="menu" size={20} />
            </button>

            {/* BREADCRUMB CONTEXT */}
            <nav className="breadcrumb-nav" aria-label="Breadcrumbs">
              <button
                type="button"
                className="breadcrumb-root-btn"
                onClick={() => handleNavClick("overview")}
                title="Return to Operations Overview"
              >
                PackCheck
              </button>
              <span className="breadcrumb-separator">/</span>
              <span className="breadcrumb-segment">
                {activeView === "overview" && "Operations Overview"}
                {activeView === "inspections" && "Inspection Registry"}
                {activeView === "history" && "History & Reports Archive"}
                {activeView === "audit" && "Audit & Security Ledger"}
              </span>

              {inspectionContext && (
                <>
                  <span className="breadcrumb-separator">/</span>
                  <span className="breadcrumb-current font-mono">
                    {inspectionContext.inspection_id}
                  </span>
                  {activeWorkspaceTab && (
                    <>
                      <span className="breadcrumb-separator">/</span>
                      <span className="breadcrumb-tab-name">
                        {activeWorkspaceTab.charAt(0).toUpperCase() + activeWorkspaceTab.slice(1)}
                      </span>
                    </>
                  )}
                </>
              )}
            </nav>
          </div>

          {/* TOPBAR RIGHT CONTROLS */}
          <div className="topbar-right">
            {/* Live Operational Indicator */}
            <div
              className={`system-health-pill ${isSystemHealthy ? "health-pill-good" : "health-pill-warn"}`}
              title={
                healthStatus.dbVersion
                  ? `API: ${healthStatus.api} • DB: ${healthStatus.db} (${healthStatus.dbVersion}) • Latency: ${healthStatus.latency}ms`
                  : `API: ${healthStatus.api} • DB: ${healthStatus.db}`
              }
            >
              <span className={`status-dot-sm ${isSystemHealthy ? "dot-online" : "dot-warning"}`} />
              <span className="health-text">{isSystemHealthy ? "System Operational" : "Service Issue"}</span>
            </div>

            {/* Day / Night Theme Switcher */}
            <button
              id="theme-toggle-btn"
              type="button"
              className="btn-icon-control"
              onClick={toggleTheme}
              aria-label={`Switch to ${theme === "light" ? "night" : "day"} mode`}
              title={`Switch to ${theme === "light" ? "night" : "day"} mode`}
            >
              <Icon name={mounted && theme === "dark" ? "sun" : "moon"} size={17} />
            </button>

            {/* AUTHENTICATION / USER PROFILE */}
            {mounted && isAuthenticated ? (
              <div className="user-menu-container">
                <button
                  type="button"
                  className="user-profile-trigger"
                  onClick={() => setUserDropdownOpen(!userDropdownOpen)}
                  aria-expanded={userDropdownOpen}
                  aria-haspopup="true"
                >
                  <div className="user-avatar-circle" aria-hidden="true">
                    {user?.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
                  </div>
                  <div className="user-text-meta">
                    <span className="user-full-name">{user?.full_name || user?.email}</span>
                    <span className={`user-role-badge ${getRoleBadgeClass(user?.role)}`}>
                      {user?.role ? user.role.toUpperCase().replace("_", " ") : "USER"}
                    </span>
                  </div>
                  <Icon name="chevronDown" size={14} className="chevron-icon" />
                </button>

                {/* USER DROPDOWN */}
                {userDropdownOpen && (
                  <div className="user-dropdown-card" role="menu">
                    <div className="dropdown-user-header">
                      <div className="dropdown-name">{user?.full_name}</div>
                      <div className="dropdown-email">{user?.email}</div>
                      <span className={`user-role-badge ${getRoleBadgeClass(user?.role)}`} style={{ marginTop: "4px" }}>
                        Role: {user?.role ? user.role.toUpperCase().replace("_", " ") : "USER"}
                      </span>
                    </div>

                    <div className="dropdown-divider" />

                    {/* DEMO MODE ROLE SWITCHER */}
                    <div className="demo-switcher-section">
                      <div className="demo-section-label">
                        <Icon name="sparkles" size={13} style={{ marginRight: "4px" }} />
                        DEMO MODE — Fast Role Switch
                      </div>
                      <div className="demo-roles-list">
                        {DEMO_USERS.map((demo) => {
                          const isCurrent = user?.role === demo.role;
                          return (
                            <button
                              key={demo.role}
                              type="button"
                              className={`demo-role-btn ${isCurrent ? "current" : ""}`}
                              onClick={async () => {
                                await switchDemoAccount(demo.email, demo.password);
                                setUserDropdownOpen(false);
                              }}
                              disabled={isCurrent}
                            >
                              <span className="demo-badge-text">{demo.badge}</span>
                              <span className="demo-desc-text">{demo.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="dropdown-divider" />

                    <button
                      type="button"
                      className="dropdown-action-btn btn-logout-danger"
                      onClick={() => {
                        logout();
                        setUserDropdownOpen(false);
                      }}
                      role="menuitem"
                    >
                      <Icon name="logout" size={15} />
                      <span>Log Out of Session</span>
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <button
                type="button"
                className="btn-primary btn-sm"
                onClick={() => setAuthModalOpen(true)}
              >
                Sign In
              </button>
            )}
          </div>
        </header>

        {/* WORKSPACE CONTENT AREA */}
        <main id="main-content" className="app-workspace-main" tabIndex={-1}>
          {children}
        </main>
      </div>

      {/* AUTH MODAL */}
      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
