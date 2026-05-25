import { OPENAI_IMAGE_MODEL } from "../constants/config";

export async function generatePlanRendersWithOpenAI(apiKey, payload) {
  const safeKey = String(apiKey || "").trim();
  if (!safeKey) throw new Error("OpenAI API key is missing.");
  const { planName, selectedCategory, totalWidth, totalHeight, rooms } = payload;
  const roomSummary = Array.isArray(rooms) ? rooms.map((room) => ({
    name: room?.name || "Room", x: Number(room?.x) || 0, y: Number(room?.y) || 0,
    width: Number(room?.width) || 0, height: Number(room?.height) || 0, color: room?.color || "",
    doors: Array.isArray(room?.doors) ? room.doors : [],
    windows: Array.isArray(room?.windows) ? room.windows : [],
    furniture: Array.isArray(room?.furniture) ? room.furniture.map((item) => ({ type: item?.type || "", x: Number(item?.x) || 0, y: Number(item?.y) || 0, width: Number(item?.width) || 0, depth: Number(item?.depth) || 0, height: Number(item?.height) || 0 })) : [],
  })) : [];

  const prompt = `Create a highly realistic architectural visualization collage based on this floor plan.\nProject: ${planName || "My Floor Plan"}, Category: ${selectedCategory || "office"}, Size: ${Number(totalWidth) || 0} ft x ${Number(totalHeight) || 0} ft\nRequirements: Single wide collage, 4 camera angles, faithful to provided layout, realistic lighting and materials. Angles: isometric overview, front interior, opposite corner, close interior detail.\nRoom data:\n${JSON.stringify(roomSummary, null, 2)}`.trim();

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${safeKey}` },
    body: JSON.stringify({ model: OPENAI_IMAGE_MODEL, prompt, size: "1536x1024", quality: "high" }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result?.error?.message || `Image generation failed with status ${response.status}`);
  const b64 = result?.data?.[0]?.b64_json;
  if (!b64) throw new Error("OpenAI did not return an image.");
  return `data:image/png;base64,${b64}`;
}
