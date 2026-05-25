import { useState, useEffect } from "react";
import { FEATURE_ASSISTANT_ENABLED, ASSISTANT_COLLAPSED_SESSION_KEY } from "../constants/config";

export function useAssistantCollapsed() {
  const [assistantCollapsed, setAssistantCollapsed] = useState(() => {
    if (!FEATURE_ASSISTANT_ENABLED) return true;
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ASSISTANT_COLLAPSED_SESSION_KEY) === "true";
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(ASSISTANT_COLLAPSED_SESSION_KEY, assistantCollapsed ? "true" : "false");
  }, [assistantCollapsed]);

  return { assistantCollapsed, setAssistantCollapsed };
}
