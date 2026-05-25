import {
  PROJECTS_STORAGE_KEY,
  WALL_THICKNESS_FT,
  ROOM_THICKNESS_FT,
  DEFAULT_SCALE,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_SUN_SETTINGS,
  DEFAULT_WALL_COLOR,
} from "../constants/config";
import { getDefaultRooms } from "../utils/rooms";

export function createProjectId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `project-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function getDefaultProjectState() {
  return {
    planName: "My Floor Plan",
    totalWidth: 40,
    totalHeight: 10,
    wallThickness: WALL_THICKNESS_FT,
    roomThickness: ROOM_THICKNESS_FT,
    scale: DEFAULT_SCALE,
    roomHeight: DEFAULT_ROOM_HEIGHT,
    activeView: "2d",
    selectedCategory: "house",
    rooms: getDefaultRooms(40, 10),
    furnitureSelections: {},
    customPresetDimensions: {},
    assistantCollapsed: false,
    sunSettings: DEFAULT_SUN_SETTINGS,
    globalWallColor: DEFAULT_WALL_COLOR,
  };
}

export function readProjectsFromStorage() {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PROJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

export function writeProjectsToStorage(projects) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(PROJECTS_STORAGE_KEY, JSON.stringify(projects)); } catch {}
}
