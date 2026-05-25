import {
  OPENAI_MODEL,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
} from "../constants/config";
import { ROOM_COLORS } from "../constants/presets";
import { clamp, getWallLength } from "../utils/math";
import { getDefaultFloorTextureId } from "../utils/textures";
import { fitRoomsInGrid } from "../utils/rooms";

export function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.includes(",") ? result.split(",")[1] : result);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function normalizeVisionWallName(wall) {
  const v = String(wall || "").toLowerCase().trim();
  if (v === "north" || v === "top")    return "top";
  if (v === "south" || v === "bottom") return "bottom";
  if (v === "west"  || v === "left")   return "left";
  if (v === "east"  || v === "right")  return "right";
  return "top";
}

export async function resizeImageFileForVision(file, maxDimension = 1600, quality = 0.82) {
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
  const ow = Number(image.width) || maxDimension, oh = Number(image.height) || maxDimension;
  const ratio = Math.min(1, maxDimension / Math.max(ow, oh));
  const w = Math.max(1, Math.round(ow * ratio)), h = Math.max(1, Math.round(oh * ratio));
  const canvas = document.createElement("canvas");
  canvas.width = w; canvas.height = h;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, 0, 0, w, h);
  const outputDataUrl = canvas.toDataURL("image/jpeg", quality);
  return { mimeType: "image/jpeg", dataUrl: outputDataUrl, base64: outputDataUrl.split(",")[1] || "" };
}

export function derivePlanSizeFromVision(rooms, fallbackWidth = 40, fallbackHeight = 30) {
  if (!Array.isArray(rooms) || !rooms.length) return { totalWidth: fallbackWidth, totalHeight: fallbackHeight };
  const maxX = Math.max(...rooms.map((r) => (Number(r.x) || 0) + (Number(r.width) || 0)));
  const maxY = Math.max(...rooms.map((r) => (Number(r.y) || 0) + (Number(r.height) || 0)));
  return { totalWidth: Math.max(10, Math.ceil(maxX || fallbackWidth)), totalHeight: Math.max(10, Math.ceil(maxY || fallbackHeight)) };
}

export function sanitizeVisionFloorPlanResponse(aiResponse, currentState) {
  if (!aiResponse || typeof aiResponse !== "object") return null;
  const rawRooms   = Array.isArray(aiResponse.rooms)   ? aiResponse.rooms   : [];
  const rawDoors   = Array.isArray(aiResponse.doors)   ? aiResponse.doors   : [];
  const rawWindows = Array.isArray(aiResponse.windows) ? aiResponse.windows : [];
  if (!rawRooms.length) return null;

  const colorizedRooms = rawRooms.map((room, index) => ({
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `room-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 8)}`,
    name: String(room?.name || `Room ${index + 1}`),
    x: Math.max(0, Number(room?.x) || 0), y: Math.max(0, Number(room?.y) || 0),
    width: Math.max(4, Number(room?.width) || 10), height: Math.max(4, Number(room?.height) || 10),
    color: ROOM_COLORS[index % ROOM_COLORS.length],
    floorTextureId: getDefaultFloorTextureId(),
    doors: [], windows: [], cutouts: [], furniture: [],
  }));

  const inferred  = derivePlanSizeFromVision(colorizedRooms, Number(currentState?.totalWidth) || 40, Number(currentState?.totalHeight) || 30);
  const totalWidth  = Math.max(10, Number(aiResponse.totalWidth)  || inferred.totalWidth);
  const totalHeight = Math.max(10, Number(aiResponse.totalHeight) || inferred.totalHeight);
  const positionedRooms = colorizedRooms.some((r) => Number(r.x) || Number(r.y))
    ? colorizedRooms : fitRoomsInGrid(colorizedRooms, totalWidth, totalHeight);

  const roomMap = new Map(positionedRooms.map((r) => [String(r.name || "").toLowerCase().trim(), r]));

  rawDoors.forEach((door) => {
    const room = roomMap.get(String(door?.room || "").toLowerCase().trim()); if (!room) return;
    const wall = normalizeVisionWallName(door?.wall);
    const wallLength = getWallLength(room, wall);
    const width = clamp(Number(door?.width) || DEFAULT_DOOR_WIDTH, 1, Math.max(1, wallLength));
    room.doors.push({ wall, offset: clamp(Number(door?.position) || 0, 0, Math.max(0, wallLength - width)), width, height: Math.max(1, Number(door?.height) || DEFAULT_DOOR_HEIGHT) });
  });
  rawWindows.forEach((win) => {
    const room = roomMap.get(String(win?.room || "").toLowerCase().trim()); if (!room) return;
    const wall = normalizeVisionWallName(win?.wall);
    const wallLength = getWallLength(room, wall);
    const width = clamp(Number(win?.width) || DEFAULT_WINDOW_WIDTH, 1, Math.max(1, wallLength));
    room.windows.push({ wall, offset: clamp(Number(win?.position) || 0, 0, Math.max(0, wallLength - width)), width, height: Math.max(1, Number(win?.height) || DEFAULT_WINDOW_HEIGHT), sillHeight: Math.max(0, Number(win?.sillHeight) || DEFAULT_WINDOW_SILL_HEIGHT) });
  });

  return {
    planName: String(aiResponse.planName || currentState?.planName || "Uploaded Floor Plan"),
    selectedCategory: currentState?.selectedCategory || "office",
    totalWidth, totalHeight, rooms: positionedRooms,
    responseText: aiResponse.responseText || `Uploaded floor plan analyzed with ${positionedRooms.length} rooms.`,
  };
}

export async function analyzeFloorPlanImageWithOpenAI(apiKey, file, currentState) {
  const safeKey = String(apiKey || "").trim();
  if (!safeKey) throw new Error("OpenAI API key is missing.");
  if (!["image/png", "image/jpeg", "image/jpg"].includes(file.type)) throw new Error("Invalid image format. Please upload a PNG or JPG file.");
  const prepared = await resizeImageFileForVision(file, 1600, 0.82);
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${safeKey}` },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: [{ type: "input_text", text: "You analyze architectural floor plan images and extract rooms, doors, and windows into clean JSON for a React floor plan generator." }] },
        { role: "user", content: [
          { type: "input_text", text: `Analyze this uploaded floor plan image and return the room layout. Use practical dimensions and include x/y coordinates when possible. Current app context:\n${JSON.stringify(currentState, null, 2)}` },
          { type: "input_image", image_url: prepared.dataUrl, detail: "high" },
        ]},
      ],
      text: { format: { type: "json_schema", name: "floor_plan_image_response", strict: true, schema: {
        type: "object",
        properties: {
          planName: { type: "string" }, totalWidth: { type: "number" }, totalHeight: { type: "number" }, responseText: { type: "string" },
          rooms: { type: "array", items: { type: "object", properties: { name: { type: "string" }, x: { type: "number" }, y: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["name", "x", "y", "width", "height"], additionalProperties: false } },
          doors: { type: "array", items: { type: "object", properties: { room: { type: "string" }, wall: { type: "string", enum: ["north", "south", "east", "west", "top", "bottom", "left", "right"] }, position: { type: "number" }, width: { type: "number" }, height: { type: "number" } }, required: ["room", "wall", "position", "width", "height"], additionalProperties: false } },
          windows: { type: "array", items: { type: "object", properties: { room: { type: "string" }, wall: { type: "string", enum: ["north", "south", "east", "west", "top", "bottom", "left", "right"] }, position: { type: "number" }, width: { type: "number" }, height: { type: "number" }, sillHeight: { type: "number" } }, required: ["room", "wall", "position", "width", "height", "sillHeight"], additionalProperties: false } },
        },
        required: ["planName", "totalWidth", "totalHeight", "responseText", "rooms", "doors", "windows"],
        additionalProperties: false,
      }}},
    }),
  });
  if (!response.ok) {
    let msg = `OpenAI vision request failed with status ${response.status}`;
    if (response.status === 401 || response.status === 403) msg = "OpenAI API key is invalid or does not have permission.";
    else if (response.status === 429) msg = "OpenAI rate limit exceeded. Please wait and try again.";
    throw new Error(msg);
  }
  const result = await response.json();
  const rawText = result?.output_text || "";
  if (!rawText) throw new Error("OpenAI vision returned an empty response.");
  return sanitizeVisionFloorPlanResponse(JSON.parse(rawText), currentState);
}
