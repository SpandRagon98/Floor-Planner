import { OPENAI_IMAGE_MODEL } from "../constants/config";

// Round for prompt payloads — 1 decimal is plenty for feet and keeps tokens down.
const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

// Compact, token-lean scene description. Only geometry the model needs to
// respect: no ids, no UI state, no colors-as-hex noise, no empty arrays.
export function buildCompactSceneSummary({ totalWidth, totalHeight, roomHeight, floors }) {
  const summary = {
    plotFt: [round1(totalWidth), round1(totalHeight)],
    wallHeightFt: round1(roomHeight),
    floors: (floors || []).map((floor) => ({
      name: floor.name || `Floor ${Number(floor.level) + 1}`,
      rooms: (floor.placedRooms || floor.rooms || []).map((room) => {
        const entry = {
          name: room.name || "Room",
          xy: [round1(room.x), round1(room.y)],
          wh: [round1(room.width), round1(room.height)],
        };
        if (room.floorTextureId) entry.floor = room.floorTextureId;
        const doors = (room.doors || []).map((d) => ({ wall: d.wall, off: round1(d.offset), w: round1(d.width) }));
        const windows = (room.windows || []).map((w) => ({ wall: w.wall, off: round1(w.offset), w: round1(w.width) }));
        const furniture = (room.furniture || []).map((f) => ({
          type: f.type,
          xy: [round1(f.x), round1(f.y)],
          wdh: [round1(f.width), round1(f.depth), round1(f.height)],
          ...(Number(f.rotation) ? { rot: Math.round(Number(f.rotation)) } : {}),
        }));
        if (doors.length) entry.doors = doors;
        if (windows.length) entry.windows = windows;
        if (furniture.length) entry.furniture = furniture;
        return entry;
      }),
    })),
  };
  return JSON.stringify(summary);
}

async function dataUrlToBlob(dataUrl) {
  const response = await fetch(dataUrl);
  return await response.blob();
}

/**
 * Photorealistic render that preserves the user's exact design.
 *
 * Uses the images/edits endpoint with the actual 3D-view screenshot as the
 * reference image, so the model repaints THIS scene instead of inventing a new
 * layout from a text prompt (the old images/generations approach could not
 * guarantee geometry). The compact scene JSON is a secondary constraint.
 *
 * The API key is supplied by the user at runtime (Settings → AI render) and
 * stored only in their browser's localStorage — never in the bundle.
 */
export async function generatePlanRendersWithOpenAI(apiKey, payload, { signal } = {}) {
  const safeKey = String(apiKey || "").trim();
  if (!safeKey) throw new Error("OpenAI API key is missing. Add it under Settings → AI render.");
  const { planName, selectedCategory, sceneSummary, image3D } = payload;
  if (!image3D) throw new Error("Could not capture the 3D view to use as the render reference.");

  const prompt = [
    `Photorealistic architectural visualization of the attached 3D floor-plan scene ("${planName || "Floor Plan"}", ${selectedCategory || "house"}).`,
    "Recreate exactly this scene: same camera angle, same rooms and dimensions, same walls, same door and window positions, same furniture placement and orientation, same floor levels and vertical stacking, same floor materials.",
    "Do not add, remove, resize, or reposition any geometry. No extra rooms, doors, windows, furniture, stairs, balconies, plants, decor, people, vehicles, or landscaping.",
    "Only upgrade realism: physically plausible daylight, materials, and soft shadows.",
    `Scene data (feet): ${sceneSummary || "{}"}`,
  ].join("\n");

  const form = new FormData();
  form.append("model", OPENAI_IMAGE_MODEL);
  form.append("image", await dataUrlToBlob(image3D), "scene.png");
  form.append("prompt", prompt);
  form.append("size", "1536x1024");
  form.append("quality", "medium");

  const response = await fetch("https://api.openai.com/v1/images/edits", {
    method: "POST",
    headers: { Authorization: `Bearer ${safeKey}` },
    body: form,
    signal,
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Image generation failed with status ${response.status}`);
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI did not return an image.");
  return `data:image/png;base64,${b64}`;
}
