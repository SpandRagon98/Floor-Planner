import { clamp, rangesOverlap } from "./math";
import { getRoomOpenings } from "./normalization";

export function getOpeningLineSegment(room, opening) {
  const x = Number(room.x) || 0;
  const y = Number(room.y) || 0;
  const w = Number(room.width) || 0;
  const h = Number(room.height) || 0;
  const offset = Number(opening.offset) || 0;
  const width = Number(opening.width) || 0;
  switch (opening.wall) {
    case "top":    return { x1: x + offset, y1: y,     x2: x + offset + width, y2: y };
    case "bottom": return { x1: x + offset, y1: y + h, x2: x + offset + width, y2: y + h };
    case "left":   return { x1: x,     y1: y + offset, x2: x,     y2: y + offset + width };
    case "right":  return { x1: x + w, y1: y + offset, x2: x + w, y2: y + offset + width };
    default:       return null;
  }
}

export function getSegmentOpenings(segment, rooms, wallHeight) {
  const isVertical = segment.x1 === segment.x2;
  const fixed    = isVertical ? segment.x1 : segment.y1;
  const segStart = isVertical ? Math.min(segment.y1, segment.y2) : Math.min(segment.x1, segment.x2);
  const segEnd   = isVertical ? Math.max(segment.y1, segment.y2) : Math.max(segment.x1, segment.x2);
  const openings = [];
  rooms.forEach((room) => {
    const { doors, windows, cutouts } = getRoomOpenings(room, wallHeight);
    [...doors, ...windows, ...cutouts].forEach((opening) => {
      const line = getOpeningLineSegment(room, opening);
      if (!line) return;
      if (isVertical) {
        if (line.x1 !== line.x2 || Math.abs(line.x1 - fixed) > 0.001) return;
        const start = Math.max(segStart, Math.min(line.y1, line.y2));
        const end   = Math.min(segEnd,   Math.max(line.y1, line.y2));
        if (end - start <= 0.01) return;
        openings.push({ ...opening, start, end });
      } else {
        if (line.y1 !== line.y2 || Math.abs(line.y1 - fixed) > 0.001) return;
        const start = Math.max(segStart, Math.min(line.x1, line.x2));
        const end   = Math.min(segEnd,   Math.max(line.x1, line.x2));
        if (end - start <= 0.01) return;
        openings.push({ ...opening, start, end });
      }
    });
  });
  return openings;
}

export function buildWallSegments(rooms, totalWidth, totalHeight) {
  const grouped = new Map();
  const addSegment = (orientation, fixed, start, end, type = "room") => {
    const key = `${orientation}_${fixed}_${type}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push({ orientation, fixed, start: Math.min(start, end), end: Math.max(start, end), type });
  };

  rooms.forEach((room) => {
    const x = Number(room.x), y = Number(room.y), w = Number(room.width), h = Number(room.height);
    addSegment("H", y,     x, x + w, "room");
    addSegment("H", y + h, x, x + w, "room");
    addSegment("V", x,     y, y + h, "room");
    addSegment("V", x + w, y, y + h, "room");
  });

  addSegment("H", 0,           0, totalWidth,  "outer");
  addSegment("H", totalHeight, 0, totalWidth,  "outer");
  addSegment("V", 0,           0, totalHeight, "outer");
  addSegment("V", totalWidth,  0, totalHeight, "outer");

  const merged = [];
  for (const segments of grouped.values()) {
    segments.sort((a, b) => a.start - b.start);
    let current = { ...segments[0] };
    for (let i = 1; i < segments.length; i++) {
      const next = segments[i];
      if (next.start <= current.end) {
        current.end = Math.max(current.end, next.end);
      } else {
        merged.push(current);
        current = { ...next };
      }
    }
    merged.push(current);
  }

  return merged.map((seg) =>
    seg.orientation === "V"
      ? { x1: seg.fixed, y1: seg.start, x2: seg.fixed, y2: seg.end, type: seg.type }
      : { x1: seg.start, y1: seg.fixed, x2: seg.end, y2: seg.fixed, type: seg.type }
  );
}
