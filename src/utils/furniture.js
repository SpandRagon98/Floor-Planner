import {
  FURNITURE_WALL_CLEARANCE,
  DEFAULT_KITCHEN_SLAB_DEPTH,
  DEFAULT_KITCHEN_SLAB_HEIGHT,
} from "../constants/config";
import { WALL_OPTIONS } from "../constants/presets";
import { clamp } from "./math";

export function isKitchenSlab(item) {
  return String(item?.type || "").toLowerCase() === "kitchen slab";
}

export function getNormalizedFurnitureRotation(rotation) {
  return ((Math.round(Number(rotation) || 0) % 360) + 360) % 360;
}

export function getRotatedFurnitureFootprint(width, depth, rotation) {
  const normalized = getNormalizedFurnitureRotation(rotation);
  if (normalized === 90 || normalized === 270) {
    return { width: depth, depth: width };
  }
  return { width, depth };
}

export function getFurniturePlacementBounds(furnitureItem, room, nextValues = {}) {
  const width = Math.max(Number(nextValues.width ?? furnitureItem?.width) || 0.5, 0.3);
  const depth = Math.max(Number(nextValues.depth ?? furnitureItem?.depth) || 0.5, 0.3);
  const rotation = getNormalizedFurnitureRotation(nextValues.rotation ?? furnitureItem?.rotation);
  const footprint = getRotatedFurnitureFootprint(width, depth, rotation);
  const roomWidth = Number(room.width) || 0;
  const roomHeight = Number(room.height) || 0;

  const minX = FURNITURE_WALL_CLEARANCE - width / 2 + footprint.width / 2;
  const minY = FURNITURE_WALL_CLEARANCE - depth / 2 + footprint.depth / 2;
  const maxX = roomWidth - FURNITURE_WALL_CLEARANCE - width / 2 - footprint.width / 2;
  const maxY = roomHeight - FURNITURE_WALL_CLEARANCE - depth / 2 - footprint.depth / 2;

  return {
    minX,
    minY,
    maxX: Math.max(minX, maxX),
    maxY: Math.max(minY, maxY),
  };
}

export function getKitchenSlabGeometry(furnitureItem, room) {
  const wall = WALL_OPTIONS.includes(furnitureItem?.attachedWall)
    ? furnitureItem.attachedWall
    : "bottom";
  const roomWidth = Number(room.width) || 0;
  const roomHeight = Number(room.height) || 0;
  const depth = Math.max(Number(furnitureItem?.slabDepth) || DEFAULT_KITCHEN_SLAB_DEPTH, 0.4);
  const height = Math.max(Number(furnitureItem?.height) || DEFAULT_KITCHEN_SLAB_HEIGHT, 0.4);
  const wallLength = wall === "top" || wall === "bottom" ? roomWidth : roomHeight;
  const length = clamp(
    Number(furnitureItem?.slabLength) || Number(furnitureItem?.width) || 4,
    1,
    Math.max(1, wallLength - FURNITURE_WALL_CLEARANCE * 2)
  );
  const maxOffset = Math.max(0, wallLength - length - FURNITURE_WALL_CLEARANCE * 2);
  const offset = clamp(Number(furnitureItem?.offset) || 0, 0, maxOffset);
  const rotation = Number(furnitureItem?.rotation) || 0;

  if (wall === "top") {
    return {
      ...furnitureItem,
      attachedWall: wall, slabLength: length, slabDepth: depth, offset,
      width: length, depth, height, rotation,
      x: FURNITURE_WALL_CLEARANCE + offset,
      y: FURNITURE_WALL_CLEARANCE,
    };
  }
  if (wall === "bottom") {
    return {
      ...furnitureItem,
      attachedWall: wall, slabLength: length, slabDepth: depth, offset,
      width: length, depth, height, rotation,
      x: FURNITURE_WALL_CLEARANCE + offset,
      y: Math.max(FURNITURE_WALL_CLEARANCE, roomHeight - depth - FURNITURE_WALL_CLEARANCE),
    };
  }
  if (wall === "left") {
    return {
      ...furnitureItem,
      attachedWall: wall, slabLength: length, slabDepth: depth, offset,
      width: depth, depth: length, height, rotation,
      x: FURNITURE_WALL_CLEARANCE,
      y: FURNITURE_WALL_CLEARANCE + offset,
    };
  }
  return {
    ...furnitureItem,
    attachedWall: wall, slabLength: length, slabDepth: depth, offset,
    width: depth, depth: length, height, rotation,
    x: Math.max(FURNITURE_WALL_CLEARANCE, roomWidth - depth - FURNITURE_WALL_CLEARANCE),
    y: FURNITURE_WALL_CLEARANCE + offset,
  };
}

export function normalizeFurniture(furnitureItem, room) {
  if (isKitchenSlab(furnitureItem)) {
    return getKitchenSlabGeometry(furnitureItem, room);
  }

  const width = Math.max(Number(furnitureItem?.width) || 0.5, 0.3);
  const depth = Math.max(Number(furnitureItem?.depth) || 0.5, 0.3);
  const height = Math.max(Number(furnitureItem?.height) || 0.5, 0.3);
  const rotation = getNormalizedFurnitureRotation(furnitureItem?.rotation);

  // allowOutsideBuilding: skip clamping to room bounds
  if (furnitureItem?.allowOutsideBuilding) {
    return {
      ...furnitureItem,
      width,
      depth,
      height,
      rotation,
      x: furnitureItem?.x != null ? Number(furnitureItem.x) : FURNITURE_WALL_CLEARANCE,
      y: furnitureItem?.y != null ? Number(furnitureItem.y) : FURNITURE_WALL_CLEARANCE,
    };
  }

  const bounds = getFurniturePlacementBounds(furnitureItem, room, {
    width,
    depth,
    rotation,
  });

  return {
    ...furnitureItem,
    width,
    depth,
    height,
    rotation,
    x: clamp(
      furnitureItem?.x != null ? Number(furnitureItem.x) : bounds.minX,
      bounds.minX,
      bounds.maxX
    ),
    y: clamp(
      furnitureItem?.y != null ? Number(furnitureItem.y) : bounds.minY,
      bounds.minY,
      bounds.maxY
    ),
  };
}
