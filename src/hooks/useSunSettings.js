import { useState, useEffect } from "react";
import { DEFAULT_SUN_SETTINGS, SUN_SETTINGS_SESSION_KEY } from "../constants/config";

export function useSunSettings() {
  const [sunControlsCollapsed, setSunControlsCollapsed] = useState(true);
  const [renderQuality, setRenderQuality] = useState("high");
  const [sunSettings, setSunSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SUN_SETTINGS;
    try {
      const raw = window.sessionStorage.getItem(SUN_SETTINGS_SESSION_KEY);
      return raw ? { ...DEFAULT_SUN_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SUN_SETTINGS;
    } catch {
      return DEFAULT_SUN_SETTINGS;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SUN_SETTINGS_SESSION_KEY, JSON.stringify(sunSettings));
  }, [sunSettings]);

  return { sunSettings, setSunSettings, sunControlsCollapsed, setSunControlsCollapsed, renderQuality, setRenderQuality };
}
