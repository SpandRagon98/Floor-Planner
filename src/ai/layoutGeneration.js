import {
  OPENAI_MODEL,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
} from "../constants/config";
import { WALL_OPTIONS, PRODUCT_CATEGORIES } from "../constants/presets";
import { clamp } from "../utils/math";
import { ensureRoomVisualDefaults } from "../utils/textures";
import { fitRoomsInGrid } from "../utils/rooms";
import {
  getFriendlyCategoryName,
  extractPlanDimensions,
  createTemplateRoom,
  normalizeGeneratedRooms,
  makeDefaultDoorForRoom,
  makeDefaultWindowForRoom,
} from "./presets";
import { sanitizeVisionFloorPlanResponse } from "./imageAnalysis";

const SHAPE_NARROW = "narrow";
const SHAPE_LONG = "long";
const SHAPE_SQUARE = "square";

const MIN_ROOM = {
  bedroom: { w: 10, h: 10 },
  masterBedroom: { w: 12, h: 12 },
  kitchen: { w: 6, h: 8 },
  kitchenette: { w: 5, h: 6 },
  bathroom: { w: 5, h: 6 },
  halfBath: { w: 4, h: 5 },
  living: { w: 10, h: 12 },
  livingSmall: { w: 8, h: 10 },
  dining: { w: 8, h: 10 },
  corridor: { w: 3, h: 6 },
  office: { w: 8, h: 8 },
  cabin: { w: 6, h: 6 },
  reception: { w: 8, h: 6 },
  conferenceRoom: { w: 10, h: 10 },
  pantry: { w: 5, h: 5 },
  counter: { w: 10, h: 6 },
  seating: { w: 12, h: 10 },
  store: { w: 6, h: 6 },
  toilet: { w: 4, h: 4 },
  urinal: { w: 6, h: 4 },
  wash: { w: 5, h: 4 },
  guard: { w: 6, h: 6 },
  storage: { w: 10, h: 10 },
  passage: { w: 3, h: 8 },
};

function classifyShape(w, h) {
  const safeW = Math.max(1, Number(w) || 1);
  const safeH = Math.max(1, Number(h) || 1);
  const ratio = Math.max(safeW, safeH) / Math.min(safeW, safeH);
  if (ratio >= 2.5) return SHAPE_NARROW;
  if (ratio >= 1.8) return SHAPE_LONG;
  return SHAPE_SQUARE;
}

function door(wall, pos = 0.5, widthFt = DEFAULT_DOOR_WIDTH, heightFt = DEFAULT_DOOR_HEIGHT) {
  return { wall, pos, widthFt, heightFt };
}

function win(wall, pos = 0.5, widthFt = DEFAULT_WINDOW_WIDTH, heightFt = DEFAULT_WINDOW_HEIGHT, sillHeight = DEFAULT_WINDOW_SILL_HEIGHT) {
  return { wall, pos, widthFt, heightFt, sillHeight };
}

function makeRoom(name, w, h, x, y, opts = {}) {
  return {
    name,
    width: Math.round(w * 10) / 10,
    height: Math.round(h * 10) / 10,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    doors: opts.doors || [],
    windows: opts.windows || [],
    cutouts: opts.cutouts || [],
    furniture: opts.furniture || [],
  };
}

function fitRoomsToShell(rooms, tw, th) {
  if (!rooms.length) return rooms;
  let maxX = 0;
  let maxY = 0;
  rooms.forEach((r) => {
    maxX = Math.max(maxX, (Number(r.x) || 0) + (Number(r.width) || 0));
    maxY = Math.max(maxY, (Number(r.y) || 0) + (Number(r.height) || 0));
  });
  if (!maxX || !maxY) return rooms;
  const sx = tw / maxX;
  const sy = th / maxY;
  return rooms.map((r) => ({
    ...r,
    x: Math.round((Number(r.x) || 0) * sx * 10) / 10,
    y: Math.round((Number(r.y) || 0) * sy * 10) / 10,
    width: Math.round((Number(r.width) || 0) * sx * 10) / 10,
    height: Math.round((Number(r.height) || 0) * sy * 10) / 10,
  }));
}

function materializeOpeningsForRooms(rooms) {
  return (Array.isArray(rooms) ? rooms : []).map((room) => {
    const roomWidth = Math.max(1, Number(room.width) || 1);
    const roomHeight = Math.max(1, Number(room.height) || 1);
    const convertDoor = (d) => {
      const wall = WALL_OPTIONS.includes(d?.wall) ? d.wall : "bottom";
      const wallLength = wall === "top" || wall === "bottom" ? roomWidth : roomHeight;
      const width = Math.min(Math.max(Number(d?.width) || Number(d?.widthFt) || DEFAULT_DOOR_WIDTH, 0.5), wallLength);
      const maxOffset = Math.max(0, wallLength - width);
      const offset = d?.offset != null
        ? clamp(Number(d.offset) || 0, 0, maxOffset)
        : clamp(((Number(d?.pos) || 0.5) * wallLength) - width / 2, 0, maxOffset);
      return { wall, offset, width, height: Number(d?.height) || Number(d?.heightFt) || DEFAULT_DOOR_HEIGHT };
    };
    const convertWindow = (w) => {
      const wall = WALL_OPTIONS.includes(w?.wall) ? w.wall : "top";
      const wallLength = wall === "top" || wall === "bottom" ? roomWidth : roomHeight;
      const width = Math.min(Math.max(Number(w?.width) || Number(w?.widthFt) || DEFAULT_WINDOW_WIDTH, 0.5), wallLength);
      const maxOffset = Math.max(0, wallLength - width);
      const offset = w?.offset != null
        ? clamp(Number(w.offset) || 0, 0, maxOffset)
        : clamp(((Number(w?.pos) || 0.5) * wallLength) - width / 2, 0, maxOffset);
      return {
        wall,
        offset,
        width,
        height: Number(w?.height) || Number(w?.heightFt) || DEFAULT_WINDOW_HEIGHT,
        sillHeight: Number(w?.sillHeight) || DEFAULT_WINDOW_SILL_HEIGHT,
      };
    };
    return {
      ...room,
      doors: (Array.isArray(room.doors) ? room.doors : []).map(convertDoor),
      windows: (Array.isArray(room.windows) ? room.windows : []).map(convertWindow),
    };
  });
}

function preset1BHK(tw, th, shape) {
  const isNarrow = shape === SHAPE_NARROW;
  let rooms;
  if (isNarrow) {
    const long = Math.max(tw, th);
    const short = Math.min(tw, th);
    const horiz = tw >= th;
    const seg = long / 4;
    if (horiz) {
      rooms = [
        makeRoom("Bathroom", seg, short, 0, 0, { doors: [door("right")], windows: [win("left")] }),
        makeRoom("Kitchen", seg, short, seg, 0, { doors: [door("right"), door("left")], windows: [win("top")] }),
        makeRoom("Bedroom", seg, short, seg * 2, 0, { doors: [door("right"), door("left")], windows: [win("bottom")] }),
        makeRoom("Living", seg, short, seg * 3, 0, { doors: [door("left")], windows: [win("right"), win("top")] }),
      ];
    } else {
      rooms = [
        makeRoom("Bathroom", short, seg, 0, 0, { doors: [door("bottom")], windows: [win("left")] }),
        makeRoom("Kitchen", short, seg, 0, seg, { doors: [door("bottom"), door("top")], windows: [win("right")] }),
        makeRoom("Bedroom", short, seg, 0, seg * 2, { doors: [door("bottom"), door("top")], windows: [win("left")] }),
        makeRoom("Living", short, seg, 0, seg * 3, { doors: [door("top")], windows: [win("right"), win("bottom")] }),
      ];
    }
  } else {
    const kitW = tw * 0.35;
    const bathW = tw * 0.25;
    const bedW = tw - kitW;
    const topH = th * 0.4;
    const botH = th - topH;
    rooms = [
      makeRoom("Living Room", tw, topH, 0, 0, { doors: [door("bottom", 0.5)], windows: [win("top", 0.3), win("top", 0.7)] }),
      makeRoom("Bedroom", bedW, botH, 0, topH, { doors: [door("top", 0.5)], windows: [win("left"), win("bottom")] }),
      makeRoom("Kitchen", kitW, botH * 0.6, bedW, topH, { doors: [door("left")], windows: [win("right")] }),
      makeRoom("Bathroom", bathW, botH * 0.4, tw - bathW, topH + botH * 0.6, { doors: [door("left")], windows: [win("right")] }),
    ];
  }
  return { rooms, category: "house", name: "1 BHK Home" };
}

function preset2BHK(tw, th, shape) {
  const isNarrow = shape === SHAPE_NARROW;
  let rooms;
  if (isNarrow) {
    const long = Math.max(tw, th);
    const short = Math.min(tw, th);
    const horiz = tw >= th;
    const s = long / 5;
    const build = (name, idx, opts) => horiz ? makeRoom(name, s, short, s * idx, 0, opts) : makeRoom(name, short, s, 0, s * idx, opts);
    rooms = [
      build("Bathroom", 0, { doors: [door(horiz ? "right" : "bottom")], windows: [win(horiz ? "left" : "top")] }),
      build("Kitchen", 1, { doors: [door(horiz ? "right" : "bottom"), door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left")] }),
      build("Bedroom 1", 2, { doors: [door(horiz ? "right" : "bottom")], windows: [win(horiz ? "bottom" : "right")] }),
      build("Bedroom 2", 3, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left")] }),
      build("Living", 4, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "right" : "bottom"), win(horiz ? "top" : "left")] }),
    ];
  } else {
    const col1 = tw * 0.55;
    const col2 = tw - col1;
    const topH = th * 0.5;
    const botH = th - topH;
    rooms = [
      makeRoom("Living Room", col1, topH, 0, 0, { doors: [door("bottom")], windows: [win("top", 0.3), win("top", 0.7), win("left")] }),
      makeRoom("Kitchen", col2, topH * 0.55, col1, 0, { doors: [door("left")], windows: [win("right")] }),
      makeRoom("Bathroom", col2, topH * 0.45, col1, topH * 0.55, { doors: [door("left")], windows: [win("right")] }),
      makeRoom("Bedroom 1", col1 * 0.5, botH, 0, topH, { doors: [door("top")], windows: [win("bottom"), win("left")] }),
      makeRoom("Bedroom 2", tw - col1 * 0.5, botH, col1 * 0.5, topH, { doors: [door("top")], windows: [win("bottom"), win("right")] }),
    ];
  }
  return { rooms, category: "house", name: "2 BHK Home" };
}

function preset3BHK(tw, th, shape) {
  const isNarrow = shape === SHAPE_NARROW;
  let rooms;
  if (isNarrow) {
    const long = Math.max(tw, th);
    const short = Math.min(tw, th);
    const horiz = tw >= th;
    if (short >= 10) {
      const half = short / 2;
      const s = long / 4;
      const b = (name, col, row, opts) => horiz ? makeRoom(name, s, half, s * col, half * row, opts) : makeRoom(name, half, s, half * row, s * col, opts);
      rooms = [
        b("Living", 0, 0, { doors: [door("right")], windows: [win("left"), win("top")] }),
        b("Kitchen", 0, 1, { doors: [door("right")], windows: [win("left"), win("bottom")] }),
        b("Bedroom 1", 1, 0, { doors: [door("left")], windows: [win("top")] }),
        b("Bathroom 1", 1, 1, { doors: [door("left")], windows: [win("bottom")] }),
        b("Bedroom 2", 2, 0, { doors: [door("right")], windows: [win("top")] }),
        b("Bedroom 3", 2, 1, { doors: [door("right")], windows: [win("bottom")] }),
        b("Dining", 3, 0, { doors: [door("left")], windows: [win("right"), win("top")] }),
        b("Bathroom 2", 3, 1, { doors: [door("left")], windows: [win("right")] }),
      ];
    } else {
      const s = long / 6;
      const build = (name, idx, opts) => horiz ? makeRoom(name, s, short, s * idx, 0, opts) : makeRoom(name, short, s, 0, s * idx, opts);
      rooms = [
        build("Bathroom", 0, { doors: [door(horiz ? "right" : "bottom")] }),
        build("Kitchen", 1, { doors: [door(horiz ? "right" : "bottom")] }),
        build("Bedroom 1", 2, { doors: [door(horiz ? "right" : "bottom")], windows: [win(horiz ? "top" : "left")] }),
        build("Bedroom 2", 3, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "bottom" : "right")] }),
        build("Bedroom 3", 4, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left")] }),
        build("Living", 5, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "right" : "bottom")] }),
      ];
    }
  } else {
    const col1 = tw * 0.4;
    const col2 = tw * 0.3;
    const col3 = tw - col1 - col2;
    const topH = th * 0.55;
    const botH = th - topH;
    rooms = [
      makeRoom("Living Room", col1 + col2, topH, 0, 0, { doors: [door("bottom")], windows: [win("top", 0.25), win("top", 0.75), win("left")] }),
      makeRoom("Kitchen", col3, topH * 0.55, col1 + col2, 0, { doors: [door("left")], windows: [win("right")] }),
      makeRoom("Bathroom 1", col3, topH * 0.45, col1 + col2, topH * 0.55, { doors: [door("left")] }),
      makeRoom("Bedroom 1", col1, botH, 0, topH, { doors: [door("top")], windows: [win("bottom"), win("left")] }),
      makeRoom("Bedroom 2", col2, botH, col1, topH, { doors: [door("top")], windows: [win("bottom")] }),
      makeRoom("Bedroom 3", col3, botH * 0.65, col1 + col2, topH, { doors: [door("left")], windows: [win("right"), win("bottom")] }),
      makeRoom("Bathroom 2", col3, botH * 0.35, col1 + col2, topH + botH * 0.65, { doors: [door("left")] }),
    ];
  }
  return { rooms, category: "house", name: "3 BHK Home" };
}

function presetOffice(tw, th, shape) {
  const isNarrow = shape === SHAPE_NARROW;
  let rooms;
  if (isNarrow) {
    const long = Math.max(tw, th);
    const short = Math.min(tw, th);
    const horiz = tw >= th;
    const s = long / 5;
    const build = (name, idx, opts) => horiz ? makeRoom(name, s, short, s * idx, 0, opts) : makeRoom(name, short, s, 0, s * idx, opts);
    rooms = [
      build("Reception", 0, { doors: [door(horiz ? "right" : "bottom")], windows: [win(horiz ? "left" : "top")] }),
      build("Manager Cabin", 1, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left")] }),
      build("Open Workspace", 2, { doors: [door(horiz ? "left" : "top"), door(horiz ? "right" : "bottom")], windows: [win(horiz ? "bottom" : "right")] }),
      build("Meeting Room", 3, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left")] }),
      build("Pantry / WC", 4, { doors: [door(horiz ? "left" : "top")] }),
    ];
  } else {
    const col1 = tw * 0.65;
    const col2 = tw - col1;
    const r1H = th * 0.35;
    const r2H = th * 0.35;
    const r3H = th - r1H - r2H;
    rooms = [
      makeRoom("Open Workspace", col1, th * 0.65, 0, 0, { doors: [door("right"), door("bottom")], windows: [win("top", 0.3), win("top", 0.7), win("left")] }),
      makeRoom("Reception", col1, th * 0.35, 0, th * 0.65, { doors: [door("top"), door("right")], windows: [win("bottom"), win("left")] }),
      makeRoom("Manager Cabin", col2, r1H, col1, 0, { doors: [door("left")], windows: [win("right")] }),
      makeRoom("Meeting Room", col2, r2H, col1, r1H, { doors: [door("left")], windows: [win("right")] }),
      makeRoom("Pantry", col2, r3H * 0.55, col1, r1H + r2H, { doors: [door("left")] }),
      makeRoom("Washroom", col2, r3H * 0.45, col1, r1H + r2H + r3H * 0.55, { doors: [door("left")] }),
    ];
  }
  return { rooms, category: "office", name: "Office Space" };
}

function presetCafe(tw, th, shape) {
  const isNarrow = shape === SHAPE_NARROW;
  let rooms;
  if (isNarrow) {
    const long = Math.max(tw, th);
    const short = Math.min(tw, th);
    const horiz = tw >= th;
    const s = long / 4;
    const build = (name, idx, opts) => horiz ? makeRoom(name, s, short, s * idx, 0, opts) : makeRoom(name, short, s, 0, s * idx, opts);
    rooms = [
      build("Counter / Barista", 0, { doors: [door(horiz ? "right" : "bottom")], windows: [win(horiz ? "left" : "top")] }),
      build("Seating Area 1", 1, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left"), win(horiz ? "bottom" : "right")] }),
      build("Seating Area 2", 2, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "top" : "left"), win(horiz ? "bottom" : "right")] }),
      build("Kitchen / Store", 3, { doors: [door(horiz ? "left" : "top")] }),
    ];
  } else {
    const counterH = th * 0.3;
    const seatH = th * 0.7;
    const storeW = tw * 0.3;
    rooms = [
      makeRoom("Counter / Barista", tw, counterH, 0, 0, { doors: [door("bottom")], windows: [win("top", 0.3), win("top", 0.7)] }),
      makeRoom("Seating Area", tw - storeW, seatH, 0, counterH, { doors: [door("top")], windows: [win("left"), win("bottom", 0.3), win("bottom", 0.7)] }),
      makeRoom("Kitchen / Store", storeW, seatH * 0.6, tw - storeW, counterH, { doors: [door("left")] }),
      makeRoom("Washroom", storeW, seatH * 0.4, tw - storeW, counterH + seatH * 0.6, { doors: [door("left")] }),
    ];
  }
  return { rooms, category: "cafe", name: "Café Layout" };
}

function presetStorage(tw, th) {
  const col = tw * 0.25;
  const rooms = [
    makeRoom("Main Storage", tw - col, th, 0, 0, { doors: [door("right", 0.5, 6)], windows: [] }),
    makeRoom("Office", col, th * 0.4, tw - col, 0, { doors: [door("left")], windows: [win("right")] }),
    makeRoom("Loading Dock", col, th * 0.35, tw - col, th * 0.4, { doors: [door("left", 0.5, 5)] }),
    makeRoom("Washroom", col, th * 0.25, tw - col, th * 0.75, { doors: [door("left")] }),
  ];
  return { rooms, category: "storage", name: "Storage / Warehouse" };
}

function presetSecurityCabin(tw, th) {
  const rooms = [
    makeRoom("Guard Room", tw * 0.6, th, 0, 0, { doors: [door("right")], windows: [win("left"), win("top"), win("bottom")] }),
    makeRoom("Equipment / WC", tw * 0.4, th, tw * 0.6, 0, { doors: [door("left")], windows: [win("right")] }),
  ];
  return { rooms, category: "security cabin", name: "Security Cabin" };
}

function presetPublicToilet(tw, th, shape) {
  const isNarrow = shape === SHAPE_NARROW;
  let rooms;
  if (isNarrow) {
    const long = Math.max(tw, th);
    const short = Math.min(tw, th);
    const horiz = tw >= th;
    const s = long / 3;
    const build = (name, idx, opts) => horiz ? makeRoom(name, s, short, s * idx, 0, opts) : makeRoom(name, short, s, 0, s * idx, opts);
    rooms = [
      build("Men's Section", 0, { doors: [door(horiz ? "right" : "bottom")], windows: [win(horiz ? "left" : "top")] }),
      build("Wash Area", 1, { doors: [door(horiz ? "left" : "top"), door(horiz ? "right" : "bottom")] }),
      build("Women's Section", 2, { doors: [door(horiz ? "left" : "top")], windows: [win(horiz ? "right" : "bottom")] }),
    ];
  } else {
    const washH = th * 0.3;
    rooms = [
      makeRoom("Men's Section", tw * 0.5, th - washH, 0, 0, { doors: [door("bottom")], windows: [win("left"), win("top")] }),
      makeRoom("Women's Section", tw * 0.5, th - washH, tw * 0.5, 0, { doors: [door("bottom")], windows: [win("right"), win("top")] }),
      makeRoom("Wash / Lobby", tw, washH, 0, th - washH, { doors: [door("bottom", 0.5)], windows: [] }),
    ];
  }
  return { rooms, category: "public toilet", name: "Public Toilet" };
}

function presetContainerHome(tw, th, shape) {
  return preset1BHK(tw, th, shape);
}

const PRESET_MATCHERS = [
  { test: /3\s*bhk|three\s*bed/i, fn: preset3BHK },
  { test: /2\s*bhk|two\s*bed/i, fn: preset2BHK },
  { test: /1\s*bhk|one\s*bed|studio/i, fn: preset1BHK },
  { test: /container\s*home/i, fn: presetContainerHome },
  { test: /office|workspace|co-?working/i, fn: presetOffice },
  { test: /caf[eé]|coffee\s*shop/i, fn: presetCafe },
  { test: /storage|warehouse/i, fn: presetStorage },
  { test: /security\s*cabin|guard\s*room/i, fn: presetSecurityCabin },
  { test: /public\s*toilet|restroom|washroom/i, fn: presetPublicToilet },
];

function validateAndRepairRooms(rooms, tw, th) {
  if (!Array.isArray(rooms) || !rooms.length) return null;
  const repaired = rooms.map((r) => {
    let x = Number(r?.x) || 0;
    let y = Number(r?.y) || 0;
    let w = Math.max(3, Math.min(Number(r?.width) || 0, tw));
    let h = Math.max(3, Math.min(Number(r?.height) || 0, th));
    x = Math.max(0, Math.min(x, tw - w));
    y = Math.max(0, Math.min(y, th - h));
    return { ...r, x, y, width: w, height: h };
  });
  const totalArea = tw * th;
  const roomArea = repaired.reduce((sum, r) => sum + r.width * r.height, 0);
  if (roomArea < totalArea * 0.5) return null;
  return repaired;
}

function repackRooms(rooms, tw, th) {
  let cx = 0;
  let cy = 0;
  let rowH = 0;
  return rooms.map((r) => {
    if (cx + r.width > tw + 0.5) {
      cx = 0;
      cy += rowH;
      rowH = 0;
    }
    const placed = { ...r, x: cx, y: cy };
    cx += r.width;
    rowH = Math.max(rowH, r.height);
    return placed;
  }).map((r) => ({
    ...r,
    x: clamp(r.x, 0, Math.max(0, tw - r.width)),
    y: clamp(r.y, 0, Math.max(0, th - r.height)),
  }));
}

export function generateSmartVariants(basePlan) {
  const { rooms, totalWidth: tw, totalHeight: th, selectedCategory } = basePlan;
  const variants = [{ ...basePlan, variantLabel: "Original" }];

  const mirrored = rooms.map((r) => ({
    ...r,
    x: tw - r.x - r.width,
    doors: (r.doors || []).map((d) => ({ ...d, wall: d.wall === "left" ? "right" : d.wall === "right" ? "left" : d.wall })),
    windows: (r.windows || []).map((w) => ({ ...w, wall: w.wall === "left" ? "right" : w.wall === "right" ? "left" : w.wall })),
  }));
  variants.push({ ...basePlan, rooms: mirrored, variantLabel: "Mirrored" });

  const flipped = rooms.map((r) => ({
    ...r,
    y: th - r.y - r.height,
    doors: (r.doors || []).map((d) => ({ ...d, wall: d.wall === "top" ? "bottom" : d.wall === "bottom" ? "top" : d.wall })),
    windows: (r.windows || []).map((w) => ({ ...w, wall: w.wall === "top" ? "bottom" : w.wall === "bottom" ? "top" : w.wall })),
  }));
  variants.push({ ...basePlan, rooms: flipped, variantLabel: "Flipped" });

  const shuffled = rooms.map((r) => {
    const factor = 0.9 + Math.random() * 0.2;
    const invFactor = 1 / factor;
    return {
      ...r,
      width: Math.max(3, Math.min(tw, Math.round(r.width * factor * 10) / 10)),
      height: Math.max(3, Math.min(th, Math.round(r.height * invFactor * 10) / 10)),
    };
  });
  variants.push({ ...basePlan, rooms: repackRooms(shuffled, tw, th), variantLabel: "Compact" });

  return variants.map((v, i) => ({
    ...v,
    rooms: normalizeGeneratedRooms(v.rooms, tw, th, selectedCategory),
    variantLabel: v.variantLabel || `Option ${i + 1}`,
  }));
}

export function parseRuleBasedPlanCommand(prompt, currentState) {
  const text = String(prompt || "").trim();
  if (!text) return null;

  const dimensions = extractPlanDimensions(text) || {};
  const tw = Number(dimensions.totalWidth) || Number(currentState.totalWidth) || 40;
  const th = Number(dimensions.totalHeight) || Number(currentState.totalHeight) || 30;
  const shape = classifyShape(tw, th);

  for (const { test, fn } of PRESET_MATCHERS) {
    if (test.test(text)) {
      const preset = fn(tw, th, shape);
      if (!preset) continue;
      const rooms = materializeOpeningsForRooms(fitRoomsToShell(preset.rooms, tw, th));
      const validated = validateAndRepairRooms(rooms, tw, th);
      if (!validated) continue;
      return {
        planName: preset.name,
        selectedCategory: PRODUCT_CATEGORIES.includes(preset.category) ? preset.category : "office",
        totalWidth: tw,
        totalHeight: th,
        rooms: normalizeGeneratedRooms(validated, tw, th, preset.category),
        responseText: `Created a ${preset.name} with ${validated.length} rooms in ${tw} ft × ${th} ft.`,
      };
    }
  }

  const addMatch = text.toLowerCase().match(/add\s+(\d+)\s+rooms?/);
  if (addMatch) {
    const category = PRODUCT_CATEGORIES.includes(currentState.selectedCategory) ? currentState.selectedCategory : "office";
    const count = Math.max(1, Number(addMatch[1]) || 1);
    const generated = Array.from({ length: count }, (_, i) => createTemplateRoom(i, `Room ${i + 1}`, 10, 10, category));
    return {
      planName: currentState.planName,
      selectedCategory: category,
      totalWidth: tw,
      totalHeight: th,
      rooms: normalizeGeneratedRooms(generated, tw, th, category),
      responseText: `Added ${count} rooms and arranged them inside the plan.`,
    };
  }

  return null;
}

export function sanitizeOpenAIPlanResponse(aiResponse, currentState) {
  if (!aiResponse || typeof aiResponse !== "object") return null;

  const category = PRODUCT_CATEGORIES.includes(aiResponse.selectedCategory) ? aiResponse.selectedCategory : currentState.selectedCategory;
  const tw = Number(aiResponse.totalWidth) || Number(currentState.totalWidth) || 40;
  const th = Number(aiResponse.totalHeight) || Number(currentState.totalHeight) || 30;

  let rooms = Array.isArray(aiResponse.rooms) ? aiResponse.rooms : [];
  rooms = materializeOpeningsForRooms(rooms);
  rooms = normalizeGeneratedRooms(rooms, tw, th, category);

  const validated = validateAndRepairRooms(rooms, tw, th);
  if (!validated || !validated.length) return null;

  return {
    planName: aiResponse.planName || currentState.planName || "AI Floor Plan",
    selectedCategory: category,
    totalWidth: tw,
    totalHeight: th,
    rooms: validated,
    responseText: aiResponse.responseText || `Created a ${getFriendlyCategoryName(category)} layout with ${validated.length} rooms.`,
  };
}

export async function generatePlanFromOpenAI(apiKey, userPrompt, currentState) {
  const safeKey = String(apiKey || "").trim();
  if (!safeKey) throw new Error("OpenAI API key is missing.");

  const tw = Number(currentState.totalWidth) || 40;
  const th = Number(currentState.totalHeight) || 30;
  const shape = classifyShape(tw, th);

  const systemPrompt = `You are an expert architect AI for a React floor-plan generator.\nRules:\n- The shell is ${tw} ft × ${th} ft (${shape} shape).\n- All rooms must tile edge-to-edge with minimal overlap and use the shell efficiently.\n- Include practical x, y, width, and height values.\n- For narrow shells (≥2.5:1 ratio), prefer linear zoning along the long axis.\n- Use realistic minimum sizes: bedroom ≥10×10, bathroom ≥5×6, kitchen ≥6×8.\n- selectedCategory must be one of: ${PRODUCT_CATEGORIES.join(", ")}.\n- Return structured JSON only.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${safeKey}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      input: [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Current plan context:\n${JSON.stringify(currentState, null, 2)}\n\nUser request:\n${userPrompt}` },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "floor_plan_response",
          strict: true,
          schema: {
            type: "object",
            properties: {
              planName: { type: "string" },
              selectedCategory: { type: "string", enum: PRODUCT_CATEGORIES },
              totalWidth: { type: "number" },
              totalHeight: { type: "number" },
              responseText: { type: "string" },
              rooms: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    width: { type: "number" },
                    height: { type: "number" },
                    x: { type: "number" },
                    y: { type: "number" },
                  },
                  required: ["name", "width", "height", "x", "y"],
                  additionalProperties: false,
                },
              },
            },
            required: ["planName", "selectedCategory", "totalWidth", "totalHeight", "responseText", "rooms"],
            additionalProperties: false,
          },
        },
      },
    }),
  });

  if (!response.ok) throw new Error(`OpenAI request failed: ${response.status}`);
  const result = await response.json();
  const rawText = result?.output_text || "";
  if (!rawText) throw new Error("OpenAI returned an empty response.");
  return sanitizeOpenAIPlanResponse(JSON.parse(rawText), currentState);
}

export function generateLayoutVariants(basePlan) {
  const configs = [
    { id: "compact",  scale: 0.82, label: "Option A — Compact",  rationale: "A tighter layout that uses space efficiently. Great for smaller plots or when you want shorter walking distances between rooms." },
    { id: "standard", scale: 1.00, label: "Option B — Standard", rationale: "Balanced room sizes based on your description. This is the default recommended layout for most homes and offices." },
    { id: "spacious", scale: 1.18, label: "Option C — Spacious", rationale: "Larger rooms with more breathing room. Ideal if you want open, airy spaces and have the area to spare." },
  ];

  return configs.map((cfg) => {
    const tw = Math.round((Number(basePlan.totalWidth)  || 40) * cfg.scale);
    const th = Math.round((Number(basePlan.totalHeight) || 30) * cfg.scale);
    const scaledRooms = (Array.isArray(basePlan.rooms) ? basePlan.rooms : []).map((room) => ({
      ...room,
      id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `room-${Date.now()}-${Math.random()}`,
      width:  Math.max(4, Math.round((Number(room.width)  || 8) * cfg.scale)),
      height: Math.max(4, Math.round((Number(room.height) || 8) * cfg.scale)),
      doors:   Array.isArray(room.doors)   ? room.doors.map((d)  => ({ ...d }))  : [],
      windows: Array.isArray(room.windows) ? room.windows.map((w) => ({ ...w })) : [],
      furniture: Array.isArray(room.furniture) ? room.furniture.map((f) => ({ ...f,
        id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `f-${Date.now()}-${Math.random()}`,
        width: Math.max(0.3, (Number(f.width)  || 1) * cfg.scale),
        depth: Math.max(0.3, (Number(f.depth)  || 1) * cfg.scale),
      })) : [],
    }));

    const gridRooms = fitRoomsInGrid(scaledRooms, tw, th);
    const normalizedRooms = gridRooms.map((r, i) => ensureRoomVisualDefaults(r, i));

    return {
      ...basePlan,
      id: cfg.id,
      label: cfg.label,
      rationale: cfg.rationale,
      totalWidth: tw,
      totalHeight: th,
      rooms: normalizedRooms,
    };
  });
}
