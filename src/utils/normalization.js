import {
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  DEFAULT_ROOM_HEIGHT,
} from "../constants/config";
import { WALL_OPTIONS } from "../constants/presets";
import { clamp, getWallLength } from "./math";
import { getDefaultFloorTextureId, ensureRoomVisualDefaults } from "./textures";
import { normalizeFurniture } from "./furniture";

export function normalizeDoor(door, room) {
  const wall = WALL_OPTIONS.includes(door?.wall) ? door.wall : "top";
  const wallLength = getWallLength(room, wall);
  const width = clamp(
    Number(door?.width) || DEFAULT_DOOR_WIDTH,
    0.5,
    Math.max(0.5, wallLength)
  );
  const height = Math.max(Number(door?.height) || DEFAULT_DOOR_HEIGHT, 0.5);
  const maxOffset = Math.max(0, wallLength - width);
  const offset = clamp(Number(door?.offset) || 0, 0, maxOffset);
  return { wall, offset, width, height };
}

export function normalizeWindow(windowItem, room, wallHeight) {
  const wall = WALL_OPTIONS.includes(windowItem?.wall) ? windowItem.wall : "top";
  const wallLength = getWallLength(room, wall);
  const width = clamp(
    Number(windowItem?.width) || DEFAULT_WINDOW_WIDTH,
    0.5,
    Math.max(0.5, wallLength)
  );
  const height = clamp(
    Number(windowItem?.height) || DEFAULT_WINDOW_HEIGHT,
    0.5,
    Math.max(0.5, Number(wallHeight) || DEFAULT_ROOM_HEIGHT)
  );
  const maxOffset = Math.max(0, wallLength - width);
  const offset = clamp(Number(windowItem?.offset) || 0, 0, maxOffset);
  const maxSill = Math.max(0, (Number(wallHeight) || DEFAULT_ROOM_HEIGHT) - height);
  const sillHeight = clamp(
    Number(windowItem?.sillHeight) || DEFAULT_WINDOW_SILL_HEIGHT,
    0,
    maxSill
  );
  return { wall, offset, width, height, sillHeight };
}

export function normalizeCutout(cutout, room, wallHeight) {
  const wall = WALL_OPTIONS.includes(cutout?.wall) ? cutout.wall : "top";
  const wallLength = getWallLength(room, wall);
  const width = clamp(
    Number(cutout?.width) || DEFAULT_DOOR_WIDTH,
    0.5,
    Math.max(0.5, wallLength)
  );
  const height = clamp(
    Number(cutout?.height) || DEFAULT_DOOR_HEIGHT,
    0.5,
    Math.max(0.5, Number(wallHeight) || DEFAULT_ROOM_HEIGHT)
  );
  const maxOffset = Math.max(0, wallLength - width);
  const offset = clamp(Number(cutout?.offset) || 0, 0, maxOffset);
  return { wall, offset, width, height };
}

export function getRoomOpenings(room, wallHeight) {
  const doors = Array.isArray(room.doors)
    ? room.doors.map((door) => ({ ...normalizeDoor(door, room), type: "door" }))
    : [];
  const windows = Array.isArray(room.windows)
    ? room.windows.map((windowItem) => ({
        ...normalizeWindow(windowItem, room, wallHeight),
        type: "window",
      }))
    : [];
  const cutouts = Array.isArray(room.cutouts)
    ? room.cutouts.map((cutout) => ({ ...normalizeCutout(cutout, room, wallHeight), type: "cutout" }))
    : [];
  return { doors, windows, cutouts };
}

export function normalizeRoom(room, totalWidth, totalHeight, wallHeight = DEFAULT_ROOM_HEIGHT) {
  const width  = Math.max(Number(room.width)  || 0, 0);
  const height = Math.max(Number(room.height) || 0, 0);
  const x = Number(room.x) || 0;
  const y = Number(room.y) || 0;
  const baseRoom = ensureRoomVisualDefaults({
    ...room, width, height,
    x: clamp(x, 0, Math.max(0, totalWidth  - width)),
    y: clamp(y, 0, Math.max(0, totalHeight - height)),
  });
  return {
    ...baseRoom,
    floorTextureId: baseRoom.floorTextureId || getDefaultFloorTextureId(),
    doors:    Array.isArray(baseRoom.doors)    ? baseRoom.doors.map((d)  => normalizeDoor(d, baseRoom))                  : [],
    windows:  Array.isArray(baseRoom.windows)  ? baseRoom.windows.map((w) => normalizeWindow(w, baseRoom, wallHeight))   : [],
    cutouts:  Array.isArray(baseRoom.cutouts)  ? baseRoom.cutouts.map((c) => normalizeCutout(c, baseRoom, wallHeight))   : [],
    furniture: Array.isArray(baseRoom.furniture) ? baseRoom.furniture.map((item) => normalizeFurniture(item, baseRoom))  : [],
  };
}
