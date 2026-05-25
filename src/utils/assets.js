import { ASSET_BASE } from "../constants/config";

export function resolveAssetPath(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const cleaned = raw.replace(/^\/+/, "");
  return `${ASSET_BASE}${cleaned}`;
}
