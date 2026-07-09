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

export function createFloorId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `floor-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createFloor(level = 0, rooms = [], name = "") {
  return {
    id: createFloorId(),
    name: String(name || "").trim() || `Floor ${level + 1}`,
    level,
    rooms: Array.isArray(rooms) ? rooms : [],
  };
}

// Normalizes any project state (old single-floor or new multi-floor) into
// { floors, activeFloorId }. Old saves with only a rooms array migrate into Floor 1.
export function migrateProjectStateToFloors(projectState) {
  const state = projectState || {};
  const rawFloors = Array.isArray(state.floors) ? state.floors : null;

  if (rawFloors && rawFloors.length) {
    const floors = rawFloors.map((floor, index) => ({
      id: floor?.id || createFloorId(),
      name: String(floor?.name || "").trim() || `Floor ${index + 1}`,
      level: index,
      rooms: Array.isArray(floor?.rooms) ? floor.rooms : [],
    }));
    const activeFloorId = floors.some((floor) => floor.id === state.activeFloorId)
      ? state.activeFloorId
      : floors[0].id;
    return { floors, activeFloorId };
  }

  const legacyRooms = Array.isArray(state.rooms) && state.rooms.length
    ? state.rooms
    : getDefaultRooms(Number(state.totalWidth) || 40, Number(state.totalHeight) || 10);
  const firstFloor = createFloor(0, legacyRooms);
  return { floors: [firstFloor], activeFloorId: firstFloor.id };
}

export function getDefaultProjectState() {
  const firstFloor = createFloor(0, getDefaultRooms(40, 10));
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
    rooms: firstFloor.rooms,
    floors: [firstFloor],
    activeFloorId: firstFloor.id,
    floorViewMode3D: "all",
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
