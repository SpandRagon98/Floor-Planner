import { ROOM_COLORS } from "../constants/presets";
import { clamp } from "./math";
import { getDefaultFloorTextureId } from "./textures";

export const createRoom = (index) => ({
  id: crypto.randomUUID(),
  name: `Room ${index + 1}`,
  width: 10,
  height: 10,
  x: 0,
  y: 0,
  color: ROOM_COLORS[index % ROOM_COLORS.length],
  floorTextureId: getDefaultFloorTextureId(),
  doors: [],
  windows: [],
  cutouts: [],
  furniture: [],
});

export function fitRoomsInGrid(rooms, totalWidth, totalHeight) {
  if (!rooms.length) return [];
  const placed = [];
  let cursorX = 0, cursorY = 0, currentRowHeight = 0;
  for (const room of rooms) {
    const roomWidth  = Number(room.width)  || 0;
    const roomHeight = Number(room.height) || 0;
    if (cursorX + roomWidth > totalWidth) {
      cursorX = 0;
      cursorY += currentRowHeight;
      currentRowHeight = 0;
    }
    placed.push({ ...room, x: cursorX, y: cursorY });
    cursorX += roomWidth;
    currentRowHeight = Math.max(currentRowHeight, roomHeight);
  }
  return placed.map((room) => ({
    ...room,
    x: clamp(room.x, 0, Math.max(0, totalWidth  - room.width)),
    y: clamp(room.y, 0, Math.max(0, totalHeight - room.height)),
  }));
}

export function getDefaultRooms(totalWidth, totalHeight) {
  return fitRoomsInGrid(
    [
      { ...createRoom(0), name: "Living Room", width: 16, height: 10 },
      { ...createRoom(1), name: "Bedroom",     width: 12, height: 10 },
      { ...createRoom(2), name: "Kitchen",     width: 12, height: 10 },
    ],
    totalWidth, totalHeight
  );
}
