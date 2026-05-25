import {
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  FURNITURE_WALL_CLEARANCE,
} from "../constants/config";
import { ROOM_COLORS, WALL_OPTIONS } from "../constants/presets";
import { clamp } from "../utils/math";
import { getDefaultFloorTextureId } from "../utils/textures";
import { isKitchenSlab, getFurnitureOptionsForCategory } from "../utils/furniture";
import { fitRoomsInGrid } from "../utils/rooms";

export function getFriendlyCategoryName(category) {
  return String(category || "").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function extractPlanDimensions(prompt) {
  const text = String(prompt || "");
  const multiMatch = text.match(/(\d+(?:\.\d+)?)\s*(?:x|by|\*)\s*(\d+(?:\.\d+)?)/i);
  if (multiMatch) return { totalWidth: Number(multiMatch[1]) || 40, totalHeight: Number(multiMatch[2]) || 30 };
  const feetNums = [...text.matchAll(/(\d+(?:\.\d+)?)\s*(?:ft|feet)/gi)].map((m) => Number(m[1]));
  if (feetNums.length >= 2) return { totalWidth: feetNums[0] || 40, totalHeight: feetNums[1] || 30 };
  return null;
}

export function makeDefaultDoorForRoom(room) {
  const width = clamp(Math.max(2.5, Math.min((Number(room.width) || 8) * 0.28, 4)), 2.5, Math.max(2.5, Number(room.width) || 4));
  return [{ wall: "bottom", offset: Math.max(0, ((Number(room.width) || width) - width) / 2), width, height: DEFAULT_DOOR_HEIGHT }];
}

export function makeDefaultWindowForRoom(room) {
  const useTop = (Number(room.width) || 0) >= (Number(room.height) || 0);
  const wall = useTop ? "top" : "right";
  const wallLength = useTop ? Number(room.width) || 6 : Number(room.height) || 6;
  const width = clamp(Math.max(2.5, Math.min(wallLength * 0.32, 5)), 2.5, Math.max(2.5, wallLength));
  return [{ wall, offset: Math.max(0, (wallLength - width) / 2), width, height: DEFAULT_WINDOW_HEIGHT, sillHeight: DEFAULT_WINDOW_SILL_HEIGHT }];
}

export function createFurnitureFromPreset(preset, category, overrides = {}) {
  if (!preset) return null;
  const baseId = typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
    ? crypto.randomUUID() : `furniture-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const isSlab = isKitchenSlab(preset) || isKitchenSlab({ type: preset.type });
  if (isSlab) {
    return {
      id: baseId, type: preset.type, category,
      width: preset.width, depth: preset.depth, height: preset.height,
      slabLength: preset.width, slabDepth: preset.depth,
      attachedWall: "bottom", offset: 0, rotation: 0,
      color: preset.color, ...overrides,
    };
  }
  return {
    id: baseId, type: preset.type, category,
    width: preset.width, depth: preset.depth, height: preset.height,
    x: FURNITURE_WALL_CLEARANCE, y: FURNITURE_WALL_CLEARANCE,
    rotation: 0,
    color: preset.color,
    ...(preset.allowOutsideBuilding ? { allowOutsideBuilding: true } : {}),
    ...overrides,
  };
}

export function getDefaultFurnitureForRoomName(roomName, category) {
  const options = getFurnitureOptionsForCategory(category);
  const label = String(roomName || "").toLowerCase();
  const matchBy = (terms) => options.find((item) => terms.some((t) => String(item.type).toLowerCase().includes(t)));

  const selected = (() => {
    if (category === "house") {
      if (label.includes("bed"))    return [matchBy(["bed"]), matchBy(["wardrobe"])].filter(Boolean);
      if (label.includes("living")) return [matchBy(["sofa"]), matchBy(["center table"])].filter(Boolean);
      if (label.includes("kitchen")) return [matchBy(["kitchen slab"]), matchBy(["stove"]), matchBy(["sink"])].filter(Boolean);
      if (label.includes("dining")) return [matchBy(["dining table"])].filter(Boolean);
      if (label.includes("bath") || label.includes("toilet")) return [];
    }
    if (category === "office") {
      if (label.includes("meeting") || label.includes("conference")) return [matchBy(["conference table"])].filter(Boolean);
      if (label.includes("reception")) return [matchBy(["reception"])].filter(Boolean);
      return [matchBy(["workstation"]), matchBy(["chair"])].filter(Boolean);
    }
    if (category === "cafe") {
      if (label.includes("counter")) return [matchBy(["service counter"])].filter(Boolean);
      return [matchBy(["4-seater table"]) || matchBy(["2-seater table"]), matchBy(["chair"])].filter(Boolean);
    }
    if (category === "storage")        return [options[0], options[2]].filter(Boolean);
    if (category === "security cabin") return [matchBy(["guard chair"]), matchBy(["small desk"])].filter(Boolean);
    if (category === "public toilet")  return [matchBy(["toilet seat"]), matchBy(["wash basin"])].filter(Boolean);
    return [options[0]].filter(Boolean);
  })();

  return selected
    .map((preset, index) => createFurnitureFromPreset(preset, category, { x: FURNITURE_WALL_CLEARANCE + index * 0.8, y: FURNITURE_WALL_CLEARANCE + index * 0.8 }))
    .filter(Boolean);
}

export function createTemplateRoom(index, name, width, height, category, overrides = {}) {
  const room = {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `room-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name, width, height, x: 0, y: 0,
    color: ROOM_COLORS[index % ROOM_COLORS.length],
    floorTextureId: getDefaultFloorTextureId(),
    doors: [], windows: [], cutouts: [], furniture: [], ...overrides,
  };
  return {
    ...room,
    doors:     Array.isArray(room.doors)     && room.doors.length     ? room.doors     : makeDefaultDoorForRoom(room),
    windows:   Array.isArray(room.windows)   && room.windows.length   ? room.windows   : makeDefaultWindowForRoom(room),
    cutouts:   Array.isArray(room.cutouts) ? room.cutouts : [],
    furniture: Array.isArray(room.furniture) && room.furniture.length ? room.furniture : getDefaultFurnitureForRoomName(name, category),
  };
}

export function buildPresetTemplate(kind, totalWidth, totalHeight) {
  const k = String(kind || "").toLowerCase();
  if (k === "1bhk") return { planName: "1BHK Floor Plan", selectedCategory: "house", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Living Room", 14, 12, "house"), createTemplateRoom(1, "Bedroom 1", 12, 12, "house"),
    createTemplateRoom(2, "Kitchen", 10, 8, "house"), createTemplateRoom(3, "Bathroom", 6, 8, "house", { furniture: [] }),
  ]};
  if (k === "2bhk") return { planName: "2BHK Floor Plan", selectedCategory: "house", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Living Room", 14, 12, "house"), createTemplateRoom(1, "Bedroom 1", 12, 11, "house"),
    createTemplateRoom(2, "Bedroom 2", 11, 10, "house"), createTemplateRoom(3, "Kitchen", 10, 8, "house"),
    createTemplateRoom(4, "Bathroom 1", 6, 7, "house", { furniture: [] }), createTemplateRoom(5, "Bathroom 2", 6, 7, "house", { furniture: [] }),
  ]};
  if (k === "office") return { planName: "Office Layout", selectedCategory: "office", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Reception", 10, 10, "office"), createTemplateRoom(1, "Workspace", 16, 14, "office"),
    createTemplateRoom(2, "Meeting Room", 12, 10, "office"),
  ]};
  if (k === "cafe") return { planName: "Cafe Layout", selectedCategory: "cafe", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Seating Area", 16, 14, "cafe"), createTemplateRoom(1, "Service Counter", 10, 8, "cafe"),
    createTemplateRoom(2, "Kitchen / Prep", 10, 8, "cafe"),
  ]};
  if (k === "storage") return { planName: "Storage Layout", selectedCategory: "storage", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Storage Area", Math.max(18, totalWidth - 4), Math.max(14, totalHeight - 4), "storage"),
  ]};
  if (k === "security cabin") return { planName: "Security Cabin Layout", selectedCategory: "security cabin", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Security Cabin", Math.max(8, totalWidth - 2), Math.max(8, totalHeight - 2), "security cabin"),
  ]};
  if (k === "public toilet") return { planName: "Public Toilet Layout", selectedCategory: "public toilet", totalWidth, totalHeight, rooms: [
    createTemplateRoom(0, "Male Toilet", 10, 8, "public toilet"), createTemplateRoom(1, "Female Toilet", 10, 8, "public toilet"),
    createTemplateRoom(2, "Wash Area", 8, 6, "public toilet"),
  ]};
  return null;
}

export function normalizeGeneratedRooms(rooms, totalWidth, totalHeight, category) {
  const nextRooms = Array.isArray(rooms) ? rooms : [];
  const baseRooms = nextRooms.map((room, index) =>
    createTemplateRoom(index, room.name || `Room ${index + 1}`, Math.max(6, Number(room.width) || 10), Math.max(6, Number(room.height) || 10), category, {
      ...room,
      furniture: Array.isArray(room.furniture) && room.furniture.length
        ? room.furniture.map((item, itemIndex) => createFurnitureFromPreset(
            { type: item.type || `Furniture ${itemIndex + 1}`, width: Number(item.width) || 3, depth: Number(item.depth) || 2, height: Number(item.height) || 3, color: item.color || "#d4dde8" },
            category,
            { x: Number(item.x) || FURNITURE_WALL_CLEARANCE, y: Number(item.y) || FURNITURE_WALL_CLEARANCE, attachedWall: item.attachedWall, slabLength: item.slabLength, slabDepth: item.slabDepth, offset: Number(item.offset) || 0, rotation: Number(item.rotation) || 0 }
          ))
        : getDefaultFurnitureForRoomName(room.name, category),
      doors:   Array.isArray(room.doors)   && room.doors.length   ? room.doors.map((d) => ({ wall: WALL_OPTIONS.includes(d.wall) ? d.wall : "bottom", offset: Number(d.offset) || 0, width: Number(d.width) || DEFAULT_DOOR_WIDTH, height: Number(d.height) || DEFAULT_DOOR_HEIGHT }))   : makeDefaultDoorForRoom(room),
      windows: Array.isArray(room.windows) && room.windows.length ? room.windows.map((w) => ({ wall: WALL_OPTIONS.includes(w.wall) ? w.wall : "top", offset: Number(w.offset) || 0, width: Number(w.width) || DEFAULT_WINDOW_WIDTH, height: Number(w.height) || DEFAULT_WINDOW_HEIGHT, sillHeight: Number(w.sillHeight) || DEFAULT_WINDOW_SILL_HEIGHT })) : makeDefaultWindowForRoom(room),
      cutouts: Array.isArray(room.cutouts) ? room.cutouts.map((c) => ({ wall: WALL_OPTIONS.includes(c.wall) ? c.wall : "top", offset: Number(c.offset) || 0, width: Number(c.width) || DEFAULT_DOOR_WIDTH, height: Number(c.height) || DEFAULT_DOOR_HEIGHT })) : [],
    })
  );
  return fitRoomsInGrid(baseRooms, Number(totalWidth), Number(totalHeight));
}
