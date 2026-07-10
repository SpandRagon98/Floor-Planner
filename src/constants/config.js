export const APPS_SCRIPT_URL =
  "https://script.google.com/macros/s/AKfycbyUU2af127lB7ICm_TTkMG8Cbyr_VR9mwWUuawQMiCxAy3yEIj0dO8B7CeKy9xM8FDq8Q/exec";
export const MAX_SYNC_ROOMS = 8;
export const DEFAULT_SCALE = 12;
export const DEFAULT_ROOM_HEIGHT = 9;
export const WALL_THICKNESS_FT = 0.4;
export const ROOM_THICKNESS_FT = 0.25;

export const DEFAULT_DOOR_WIDTH = 3;
export const DEFAULT_DOOR_HEIGHT = 7;
export const DEFAULT_WINDOW_WIDTH = 4;
export const DEFAULT_WINDOW_HEIGHT = 3;
export const DEFAULT_WINDOW_SILL_HEIGHT = 3;

export const FURNITURE_WALL_CLEARANCE = 0.18;
export const DEFAULT_KITCHEN_SLAB_DEPTH = 2;
export const DEFAULT_KITCHEN_SLAB_HEIGHT = 3;

export const PROJECTS_STORAGE_KEY = "floor-plan-generator-projects";
export const PROJECT_ID_QUERY_PARAM = "projectId";
export const VIEW_QUERY_PARAM = "view";
export const VIEWER_MODE_QUERY_PARAM = "viewer";
export const FLOOR_PLAN_OPENAI_KEY_STORAGE = "floor-plan-openai-api-key";
export const THEME_STORAGE_KEY = "floor-plan-generator-theme";
export const OPENAI_MODEL = "gpt-4.1-mini";
export const OPENAI_IMAGE_MODEL = "gpt-image-1";

export const DEFAULT_WALL_COLOR = "#7e8da3";
export const DEFAULT_FLOOR_TEXTURE_ID = "white-marble";
export const ASSISTANT_COLLAPSED_SESSION_KEY = "floor-plan-assistant-collapsed";
export const SUN_SETTINGS_SESSION_KEY = "floor-plan-sun-settings";
export const DEFAULT_SUN_SETTINGS = {
  azimuth: 132,
  elevation: 46,
  intensity: 1.5,
  color: "#fff3e0",
  ambientIntensity: 0.55,
};

export const FEATURE_UPLOAD_FLOOR_PLAN_ENABLED = false;
export const FEATURE_ASSISTANT_ENABLED = false;
export const FEATURE_AI_LANDING_ENABLED = false;
export const FEATURE_AUTO_ARRANGE_ENABLED = false;
// AI Render is enabled on its own — it no longer requires the master
// FEATURE_AI_ENABLED switch (which also gates landing/assistant/upload flows
// that stay off). The OpenAI key is user-supplied via Settings → AI render.
export const FEATURE_AI_RENDER_ENABLED = true;
export const FEATURE_AI_ENABLED = false;
export const FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED = false;
export const GOOGLE_SHEETS_INCLUDE_CAPTURED_IMAGES = true;

export const EXAMPLE_PROMPTS = [
  "Design a 2BHK home in 40 by 30 feet",
  "Create a modern office layout for 20 people",
  "Plan a cozy cafe with seating for 30",
  "Build a 1BHK apartment in 28 by 22 feet",
  "Design a storage warehouse 50 by 40 feet",
  "Create a public toilet block 20 by 15 feet",
];

export const ASSET_BASE = (import.meta?.env?.BASE_URL || "/").replace(/\/?$/, "/");
