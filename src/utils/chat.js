import { FLOOR_PLAN_OPENAI_KEY_STORAGE } from "../constants/config";

export function createChatMessage(role, content) {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role, content,
  };
}

export function getSavedOpenAIApiKey() {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(FLOOR_PLAN_OPENAI_KEY_STORAGE) || ""; } catch { return ""; }
}

export function persistOpenAIApiKey(apiKey) {
  if (typeof window === "undefined" || !apiKey) return;
  try { window.localStorage.setItem(FLOOR_PLAN_OPENAI_KEY_STORAGE, apiKey); } catch {}
}
