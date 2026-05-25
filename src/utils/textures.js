import { DEFAULT_FLOOR_TEXTURE_ID } from "../constants/config";
import { FLOOR_TEXTURE_LIBRARY, ROOM_COLORS } from "../constants/presets";

export function getFloorTextureById(textureId) {
  return FLOOR_TEXTURE_LIBRARY.find((item) => item.id === textureId) || FLOOR_TEXTURE_LIBRARY[0];
}

export function getDefaultFloorTextureId() {
  return FLOOR_TEXTURE_LIBRARY[0]?.id || DEFAULT_FLOOR_TEXTURE_ID;
}

export function ensureRoomVisualDefaults(room, index = 0) {
  return {
    ...room,
    color: room?.color || ROOM_COLORS[index % ROOM_COLORS.length],
    floorTextureId: room?.floorTextureId || getDefaultFloorTextureId(),
  };
}
