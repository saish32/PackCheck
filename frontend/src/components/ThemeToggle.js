"use client";

import { useState, useEffect } from "react";
import { Icon } from "./Icons";

export default function ThemeToggle({ className = "", id = "theme-toggle-btn" }) {
  const [theme, setTheme] = useState("light");
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

  const isDark = mounted && theme === "dark";

  return (
    <button
      id={id}
      type="button"
      className={`theme-toggle-btn ${className}`}
      onClick={toggleTheme}
      aria-label={`Switch to ${isDark ? "day" : "night"} mode`}
      title={`Switch to ${isDark ? "day" : "night"} mode`}
      suppressHydrationWarning
    >
      <span className="theme-toggle-icon" aria-hidden="true">
        <Icon name={isDark ? "sun" : "moon"} size={16} />
      </span>
      <span className="theme-toggle-label">{isDark ? "Day" : "Night"}</span>
    </button>
  );
}
