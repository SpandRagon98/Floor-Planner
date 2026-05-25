import { DEFAULT_WALL_COLOR } from "../constants/config";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function normalizeHexColor(value, fallback = DEFAULT_WALL_COLOR) {
  const text = String(value || "").trim();
  return /^#([0-9a-fA-F]{6})$/.test(text) ? text : fallback;
}

export function isValidHttpUrl(value) {
  const text = String(value || "").trim();
  if (!text) return false;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}

export function getSunPosition(azimuth, elevation, distance = 90, centerX = 0, centerZ = 0) {
  const az = (Number(azimuth || 0) * Math.PI) / 180;
  const el = (Number(elevation || 0) * Math.PI) / 180;
  const horizontal = Math.cos(el) * distance;
  return [
    centerX + horizontal * Math.cos(az),
    Math.max(10, Math.sin(el) * distance),
    centerZ + horizontal * Math.sin(az),
  ];
}

export function rangesOverlapInclusive(a1, a2, b1, b2) {
  return Math.max(a1, b1) <= Math.min(a2, b2);
}

export function rangesOverlap(a1, a2, b1, b2) {
  return Math.max(a1, b1) < Math.min(a2, b2);
}

export function subtractRanges(baseStart, baseEnd, cuts) {
  let parts = [{ start: baseStart, end: baseEnd }];
  cuts.forEach((cut) => {
    const next = [];
    parts.forEach((part) => {
      if (!rangesOverlap(part.start, part.end, cut.start, cut.end)) {
        next.push(part);
        return;
      }
      if (cut.start > part.start) next.push({ start: part.start, end: cut.start });
      if (cut.end < part.end)   next.push({ start: cut.end,   end: part.end   });
    });
    parts = next;
  });
  return parts.filter((part) => part.end - part.start > 0.01);
}

export function getWallLength(room, wall) {
  if (wall === "top" || wall === "bottom") return Number(room.width) || 0;
  return Number(room.height) || 0;
}
