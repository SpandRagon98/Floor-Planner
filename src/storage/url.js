import {
  PROJECT_ID_QUERY_PARAM,
  VIEW_QUERY_PARAM,
  VIEWER_MODE_QUERY_PARAM,
} from "../constants/config";

export function getProjectIdFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    return new URL(window.location.href).searchParams.get(PROJECT_ID_QUERY_PARAM) || "";
  } catch {
    return "";
  }
}

export function buildProjectShareUrl(projectId) {
  if (typeof window === "undefined" || !projectId) return "";
  const url = new URL(window.location.href);
  url.searchParams.set(PROJECT_ID_QUERY_PARAM, projectId);
  return url.toString();
}

export function getViewModeFromUrl() {
  if (typeof window === "undefined") return "";
  try {
    return (new URL(window.location.href).searchParams.get(VIEW_QUERY_PARAM) || "").toLowerCase();
  } catch {
    return "";
  }
}

export function isReadOnlyViewerModeFromUrl() {
  if (typeof window === "undefined") return false;
  try {
    return new URL(window.location.href).searchParams.get(VIEWER_MODE_QUERY_PARAM) === "1";
  } catch {
    return false;
  }
}

export function buildReadOnly3DViewerUrl(projectId) {
  if (typeof window === "undefined" || !projectId) return "";
  const url = new URL(window.location.href);
  url.searchParams.set(PROJECT_ID_QUERY_PARAM, projectId);
  url.searchParams.set(VIEW_QUERY_PARAM, "3d");
  url.searchParams.set(VIEWER_MODE_QUERY_PARAM, "1");
  return url.toString();
}

export function syncProjectIdToUrl(projectId) {
  if (typeof window === "undefined") return;
  try {
    const url = new URL(window.location.href);
    if (projectId) url.searchParams.set(PROJECT_ID_QUERY_PARAM, projectId);
    else url.searchParams.delete(PROJECT_ID_QUERY_PARAM);
    window.history.replaceState({}, "", url.toString());
  } catch {}
}
