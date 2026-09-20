"use client";

import { useState, useEffect } from "react";
import { useAuth } from "@/context/AuthContext";
import AuthModal from "./AuthModal";
import ThemeToggle from "./ThemeToggle";

const NAV_TABS = [
  { id: "inspections", label: "Inspections" },
  { id: "dashboard", label: "Dashboard" },
  { id: "history", label: "History" },
  { id: "audit", label: "Audit Logs" },
];

export default function Header({ activeTab, setActiveTab }) {
  const { user, isAuthenticated, logout, hasRole } = useAuth();
  const [theme, setTheme] = useState("light");
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const savedTheme = localStorage.getItem("packcheck_theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
      document.documentElement.setAttribute("data-theme", savedTheme);
      return;
    }

    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const initial = prefersDark ? "dark" : "light";
    setTheme(initial);
    document.documentElement.setAttribute("data-theme", initial);
  }, []);

  const toggleTheme = () => {
    const nextTheme = theme === "light" ? "dark" : "light";
    setTheme(nextTheme);
    document.documentElement.setAttribute("data-theme", nextTheme);
    localStorage.setItem("packcheck_theme", nextTheme);
  };

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

  return (
    <>
      <header className="site-header glass-card">
        <div className="brand-wrapper">
          <div className="brand-logo-badge" aria-hidden="true">PC</div>
          <div className="brand-copy">
            <div className="brand-name-row">
              <h1 className="brand-title">Pack<span>Check</span></h1>
              <span className="brand-status-dot" aria-label="PackCheck workspace ready" />
            </div>
            <p className="brand-tagline">Evidence-first packaging inspection</p>
          </div>
        </div>

        <nav className="header-nav" aria-label="Primary navigation" suppressHydrationWarning>
          {NAV_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              className={`nav-tab-btn ${activeTab === tab.id ? "active" : ""}`}
              onClick={() => setActiveTab(tab.id)}
              aria-current={activeTab === tab.id ? "page" : undefined}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <div className="header-controls">
          <ThemeToggle />

          {mounted && isAuthenticated ? (
            <div className="user-profile-pill">
              <div className="user-avatar-circle" aria-hidden="true">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : "U"}
              </div>
              <div className="user-info-text">
                <span className="user-name">{user?.full_name}</span>
                <span className={`user-role-badge ${getRoleBadgeClass(user?.role)}`}>
                  {user?.role ? user.role.toUpperCase().replace("_", " ") : "USER"}
                </span>
              </div>
              <button
                type="button"
                className="btn-text-action"
                onClick={() => setAuthModalOpen(true)}
                title="Switch demo role"
              >
                Switch
              </button>
              <button
                type="button"
                className="btn-text-action btn-danger-text"
                onClick={logout}
                title="Log out"
              >
                Exit
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="btn-primary btn-sm header-signin"
              onClick={() => setAuthModalOpen(true)}
            >
              Sign in
            </button>
          )}
        </div>
      </header>

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </>
  );
}
