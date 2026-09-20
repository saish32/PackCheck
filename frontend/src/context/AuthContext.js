"use client";

import { createContext, useContext, useState, useEffect } from "react";

const AuthContext = createContext(null);
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000/api/v1";

export const DEMO_USERS = [
  {
    role: "admin",
    name: "System Administrator",
    email: "admin@packcheck.local",
    password: "PackCheck@Admin2026!",
    badge: "Admin",
    desc: "Full system access & logs"
  },
  {
    role: "inspector",
    name: "Senior Field Inspector",
    email: "inspector@packcheck.local",
    password: "PackCheck@Inspector2026!",
    badge: "Inspector",
    desc: "Create & edit inspections"
  },
  {
    role: "supervisor",
    name: "Compliance Supervisor",
    email: "supervisor@packcheck.local",
    password: "PackCheck@Supervisor2026!",
    badge: "Supervisor",
    desc: "Review & approve records"
  },
  {
    role: "rule_manager",
    name: "Standards & Rule Manager",
    email: "rulemanager@packcheck.local",
    password: "PackCheck@Rules2026!",
    badge: "Rule Mgr",
    desc: "Standards & specifications"
  },
  {
    role: "auditor",
    name: "Statutory Quality Auditor",
    email: "auditor@packcheck.local",
    password: "PackCheck@Auditor2026!",
    badge: "Auditor",
    desc: "Read-only audits & history"
  }
];

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);

  useEffect(() => {
    // Restore session on mount
    const savedToken = localStorage.getItem("packcheck_token");
    if (savedToken) {
      setToken(savedToken);
      fetchUserProfile(savedToken);
    } else {
      setLoading(false);
    }
  }, []);

  const fetchUserProfile = async (jwtToken) => {
    try {
      const res = await fetch(`${API_BASE_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${jwtToken}` }
      });
      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
      } else {
        // Token expired or invalid
        logout();
      }
    } catch {
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: jsonToString({ email, password })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.detail || errData.message || "Invalid credentials.");
      }

      const data = await res.json();
      setToken(data.access_token);
      setUser(data.user);
      localStorage.setItem("packcheck_token", data.access_token);
      return { success: true };
    } catch (err) {
      setAuthError(err.message);
      return { success: false, error: err.message };
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/auth/logout`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
      } catch {
        // Continue clearing local state regardless
      }
    }
    setToken(null);
    setUser(null);
    localStorage.removeItem("packcheck_token");
  };

  const switchDemoAccount = async (demoEmail, demoPassword) => {
    return await login(demoEmail, demoPassword);
  };

  const hasRole = (allowedRoles) => {
    if (!user) return false;
    if (Array.isArray(allowedRoles)) {
      return allowedRoles.includes(user.role);
    }
    return user.role === allowedRoles;
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        authError,
        isAuthenticated: !!user,
        login,
        logout,
        switchDemoAccount,
        hasRole
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function jsonToString(obj) {
  return JSON.stringify(obj);
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
