import { useState, useEffect, useCallback } from "react";

const WORKSPACE_PREFS_STORAGE_KEY = "floor-plan-workspace-prefs";

const DEFAULT_WORKSPACE_PREFS = {
  designerCollapsed: false,
  metricsCollapsed: false,
  sidebarCollapsed: false,
};

// View-only layout preferences (collapsed panels). Deliberately not part of
// project data — they describe how this browser shows the app, not the plan.
export function useWorkspacePrefs() {
  const [workspacePrefs, setWorkspacePrefs] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_WORKSPACE_PREFS;
    try {
      const raw = window.localStorage.getItem(WORKSPACE_PREFS_STORAGE_KEY);
      if (!raw) return DEFAULT_WORKSPACE_PREFS;
      const parsed = JSON.parse(raw);
      return {
        designerCollapsed: Boolean(parsed?.designerCollapsed),
        metricsCollapsed: Boolean(parsed?.metricsCollapsed),
        sidebarCollapsed: Boolean(parsed?.sidebarCollapsed),
      };
    } catch {
      return DEFAULT_WORKSPACE_PREFS;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(WORKSPACE_PREFS_STORAGE_KEY, JSON.stringify(workspacePrefs));
    } catch {}
  }, [workspacePrefs]);

  const toggleWorkspacePref = useCallback((key) => {
    setWorkspacePrefs((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  return { workspacePrefs, toggleWorkspacePref };
}
