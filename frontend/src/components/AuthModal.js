"use client";

import { useState } from "react";
import { useAuth, DEMO_USERS } from "@/context/AuthContext";
import { Icon } from "./Icons";

export default function AuthModal({ isOpen, onClose }) {
  const { login, switchDemoAccount, authError } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [localErr, setLocalErr] = useState(null);

  const enableDemoAccounts = process.env.NEXT_PUBLIC_ENABLE_DEMO_ACCOUNTS !== "false";

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalErr(null);
    setLoading(true);
    const res = await login(email, password);
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setLocalErr(res.error);
    }
  };

  const handleDemoClick = async (demo) => {
    setLocalErr(null);
    setLoading(true);
    const res = await switchDemoAccount(demo.email, demo.password);
    setLoading(false);
    if (res.success) {
      onClose();
    } else {
      setLocalErr(res.error);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="auth-modal-title">
      <div className="modal-dialog-box auth-dialog" onClick={(e) => e.stopPropagation()}>
        {/* MODAL HEADER */}
        <div className="modal-dialog-header">
          <div>
            <span className="modal-eyebrow">STATUTORY VERIFICATION PORTAL</span>
            <h3 id="auth-modal-title" className="modal-title">PackCheck Sign In</h3>
          </div>
          <button type="button" className="btn-close-dialog" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        {/* ERROR BANNER */}
        {(localErr || authError) && (
          <div className="alert-banner alert-danger" style={{ marginBottom: "1rem" }}>
            <Icon name="alert" size={16} />
            <span>{localErr || authError}</span>
          </div>
        )}

        {/* 1-CLICK DEMO MODE ROLE SWITCHER */}
        {enableDemoAccounts && (
          <div className="demo-accounts-callout">
            <div className="demo-callout-header">
              <Icon name="sparkles" size={14} />
              <span>DEMO MODE — SIH Presentation Role Switcher</span>
            </div>
            <p className="demo-callout-desc">
              Select any pre-configured statutory inspection persona to test role-based permissions:
            </p>
            <div className="demo-roles-grid">
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  className="btn-demo-persona"
                  onClick={() => handleDemoClick(demo)}
                  disabled={loading}
                >
                  <div className="persona-top">
                    <span className="persona-badge">{demo.badge}</span>
                    <span className="persona-name">{demo.name}</span>
                  </div>
                  <span className="persona-desc">{demo.desc}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* STANDARD MANUAL LOGIN FORM */}
        <form onSubmit={handleSubmit} className="auth-credential-form">
          <div className="form-group">
            <label className="form-label" htmlFor="auth-email">Email Address <span className="req-marker">*</span></label>
            <input
              id="auth-email"
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. inspector@packcheck.local"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="auth-password">Password <span className="req-marker">*</span></label>
            <input
              id="auth-password"
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your authorized password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={loading}
            style={{ marginTop: "1rem" }}
          >
            {loading ? "Authenticating Session..." : "Sign In to Workspace"}
          </button>
        </form>
      </div>
    </div>
  );
}
