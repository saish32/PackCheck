"use client";

import { useState } from "react";
import { useAuth, DEMO_USERS } from "@/context/AuthContext";

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
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content glass-card" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h3 className="modal-title">Sign In to PackCheck</h3>
            <p className="modal-subtitle">Enterprise Packaging Compliance & Inspection</p>
          </div>
          <button className="btn-close" onClick={onClose}>✕</button>
        </div>

        {(localErr || authError) && (
          <div className="alert-box alert-danger">
            ⚠️ {localErr || authError}
          </div>
        )}

        {/* 1-Click Demo Accounts (Local / SIH Presentation Only) */}
        {enableDemoAccounts && (
          <div className="demo-accounts-panel">
            <div className="demo-accounts-title">
              ⚡ 1-Click Role Switcher (SIH / Demo Mode Only)
            </div>
            <div className="demo-grid">
              {DEMO_USERS.map((demo) => (
                <button
                  key={demo.role}
                  type="button"
                  className="btn-demo-account"
                  onClick={() => handleDemoClick(demo)}
                  disabled={loading}
                >
                  <div className="demo-badge-row">
                    <span className="demo-badge">{demo.badge}</span>
                    <span className="demo-name">{demo.name}</span>
                  </div>
                  <div className="demo-desc">{demo.desc}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Standard Manual Login Form */}
        <form onSubmit={handleSubmit} className="auth-form">
          <div className="form-group">
            <label className="form-label">Email Address</label>
            <input
              type="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. inspector@packcheck.local"
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input
              type="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            className="btn-primary btn-full"
            disabled={loading}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
