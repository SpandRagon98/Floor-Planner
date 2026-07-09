import { useState, useEffect } from "react";

const UI_SETTINGS_STORAGE_KEY = "floor-plan-ui-settings";

export const ACCENT_OPTIONS = [
  { id: "blue",   label: "Blue",   swatch: "#2563eb" },
  { id: "purple", label: "Purple", swatch: "#7c3aed" },
  { id: "green",  label: "Green",  swatch: "#059669" },
  { id: "orange", label: "Orange", swatch: "#ea580c" },
  { id: "pink",   label: "Pink",   swatch: "#db2777" },
  { id: "cyan",   label: "Cyan",   swatch: "#0891b2" },
];

const DEFAULT_UI_SETTINGS = { accent: "blue", glassMode: false };

export function normalizeUISettings(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    accent: ACCENT_OPTIONS.some((option) => option.id === source.accent)
      ? source.accent
      : DEFAULT_UI_SETTINGS.accent,
    glassMode: Boolean(source.glassMode),
  };
}

export function useUISettings() {
  const [uiSettings, setUISettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_UI_SETTINGS;
    try {
      const raw = window.localStorage.getItem(UI_SETTINGS_STORAGE_KEY);
      return raw ? normalizeUISettings(JSON.parse(raw)) : DEFAULT_UI_SETTINGS;
    } catch {
      return DEFAULT_UI_SETTINGS;
    }
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(UI_SETTINGS_STORAGE_KEY, JSON.stringify(uiSettings));
    } catch {}
  }, [uiSettings]);

  return { uiSettings, setUISettings };
}
