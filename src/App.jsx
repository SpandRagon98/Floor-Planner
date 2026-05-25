
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import "./App.css";
import { Canvas } from "@react-three/fiber";
import { OrbitControls, Grid, Text as DreiText } from "@react-three/drei";
import * as THREE from "three";
import {
  Home,
  Plus,
  Trash2,
  RotateCcw,
  RotateCw,
  Sofa,
  Save,
  FolderOpen,
  FilePlus2,
  X,
  MessageSquare,
  Mic,
  Send,
  Sparkles,
  Bot,
  Image as ImageIcon,
  Loader2,
  ExternalLink,
  Sun,
  Moon,
  Sliders,
  ArrowLeft,
  ChevronUp,
  PaintBucket,
} from "lucide-react";

import {
  APPS_SCRIPT_URL,
  MAX_SYNC_ROOMS,
  DEFAULT_SCALE,
  DEFAULT_ROOM_HEIGHT,
  WALL_THICKNESS_FT,
  ROOM_THICKNESS_FT,
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  FURNITURE_WALL_CLEARANCE,
  DEFAULT_KITCHEN_SLAB_DEPTH,
  DEFAULT_KITCHEN_SLAB_HEIGHT,
  PROJECTS_STORAGE_KEY,
  PROJECT_ID_QUERY_PARAM,
  VIEW_QUERY_PARAM,
  VIEWER_MODE_QUERY_PARAM,
  FLOOR_PLAN_OPENAI_KEY_STORAGE,
  THEME_STORAGE_KEY,
  OPENAI_MODEL,
  OPENAI_IMAGE_MODEL,
  DEFAULT_WALL_COLOR,
  DEFAULT_FLOOR_TEXTURE_ID,
  ASSISTANT_COLLAPSED_SESSION_KEY,
  SUN_SETTINGS_SESSION_KEY,
  DEFAULT_SUN_SETTINGS,
  FEATURE_UPLOAD_FLOOR_PLAN_ENABLED,
  FEATURE_ASSISTANT_ENABLED,
  FEATURE_AI_LANDING_ENABLED,
  FEATURE_AUTO_ARRANGE_ENABLED,
  FEATURE_AI_RENDER_ENABLED,
  FEATURE_AI_ENABLED,
  FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED,
  GOOGLE_SHEETS_INCLUDE_CAPTURED_IMAGES,
  EXAMPLE_PROMPTS,
  ASSET_BASE,
} from "./constants/config";
import {
  ROOM_COLORS,
  WALL_OPTIONS,
  PRODUCT_CATEGORIES,
  FLOOR_TEXTURE_LIBRARY,
  FURNITURE_PRODUCT_RECOMMENDATIONS,
  TOILET_SEAT_FURNITURE,
  EXTRA_FURNITURE,
  FURNITURE_PRESETS,
} from "./constants/presets";
import { clamp, delay, normalizeHexColor, isValidHttpUrl, getSunPosition, rangesOverlapInclusive, rangesOverlap, subtractRanges, getWallLength } from "./utils/math";
import { getFloorTextureById, getDefaultFloorTextureId, ensureRoomVisualDefaults } from "./utils/textures";
import { isKitchenSlab, getNormalizedFurnitureRotation, getRotatedFurnitureFootprint, getFurniturePlacementBounds, getKitchenSlabGeometry, normalizeFurniture } from "./utils/furniture";
import { normalizeDoor, normalizeWindow, normalizeCutout, normalizeRoom, getRoomOpenings } from "./utils/normalization";
import { getOpeningLineSegment, getSegmentOpenings, buildWallSegments } from "./utils/geometry";
import { createRoom, fitRoomsInGrid, getDefaultRooms } from "./utils/rooms";
import { createProjectId, getDefaultProjectState, readProjectsFromStorage, writeProjectsToStorage } from "./storage/projects";
import { getProjectIdFromUrl, buildProjectShareUrl, getViewModeFromUrl, isReadOnlyViewerModeFromUrl, buildReadOnly3DViewerUrl, syncProjectIdToUrl } from "./storage/url";
import { getFurnitureOptionsForCategory, getDefaultFurnitureSelection, getFurnitureRecommendationItems } from "./utils/furniture";
import { getFriendlyCategoryName, extractPlanDimensions, makeDefaultDoorForRoom, makeDefaultWindowForRoom, createFurnitureFromPreset, getDefaultFurnitureForRoomName, createTemplateRoom, buildPresetTemplate, normalizeGeneratedRooms } from "./ai/presets";
import { generateSmartVariants, parseRuleBasedPlanCommand, sanitizeOpenAIPlanResponse, generatePlanFromOpenAI, generateLayoutVariants } from "./ai/layoutGeneration";
import { fileToBase64, normalizeVisionWallName, resizeImageFileForVision, derivePlanSizeFromVision, sanitizeVisionFloorPlanResponse, analyzeFloorPlanImageWithOpenAI } from "./ai/imageAnalysis";
import { generatePlanRendersWithOpenAI } from "./ai/renderGeneration";

function resolveAssetPath(path) {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^(https?:|data:|blob:)/i.test(raw)) return raw;
  const cleaned = raw.replace(/^\/+/, "");
  return `${ASSET_BASE}${cleaned}`;
}

// ─── 3D Wall ─────────────────────────────────────────────────────────────────

function WallMesh({ segment, wallThickness, height, rooms, globalWallColor }) {
  const { x1, y1, x2, y2 } = segment;
  const isVertical = x1 === x2;
  const length = isVertical ? Math.abs(y2 - y1) : Math.abs(x2 - x1);
  if (!Number.isFinite(length) || length <= 0) return null;

  const openings = getSegmentOpenings(segment, rooms, height).map((opening) => {
    if (opening.type === "door" || opening.type === "cutout") {
      return { ...opening, bottom: 0, top: clamp(Number(opening.height) || DEFAULT_DOOR_HEIGHT, 0.1, height) };
    }
    const sillHeight = clamp(Number(opening.sillHeight) || 0, 0, Math.max(0, height - 0.1));
    const openingHeight = clamp(Number(opening.height) || DEFAULT_WINDOW_HEIGHT, 0.1, Math.max(0.1, height - sillHeight));
    return { ...opening, bottom: sillHeight, top: Math.min(height, sillHeight + openingHeight) };
  });

  const verticalBreaks = Array.from(
    new Set([0, height, ...openings.flatMap((o) => [o.bottom, o.top])])
  ).filter((v) => v >= 0 && v <= height).sort((a, b) => a - b);

  const wallStart = isVertical ? Math.min(y1, y2) : Math.min(x1, x2);
  const wallEnd = isVertical ? Math.max(y1, y2) : Math.max(x1, x2);
  const bands = [];

  for (let i = 0; i < verticalBreaks.length - 1; i++) {
    const bandBottom = verticalBreaks[i];
    const bandTop = verticalBreaks[i + 1];
    const bandHeight = bandTop - bandBottom;
    if (bandHeight <= 0.01) continue;
    const cuts = openings
      .filter((o) => o.bottom < bandTop && o.top > bandBottom)
      .map((o) => ({ start: o.start, end: o.end }));
    subtractRanges(wallStart, wallEnd, cuts).forEach((part) => {
      if (part.end - part.start > 0.01) {
        bands.push({
          ...part,
          bandBottom,
          bandTop,
          bandHeight,
          partLength: part.end - part.start,
        });
      }
    });
  }

  const wallColor = globalWallColor || DEFAULT_WALL_COLOR;

  return (
    <group>
      {bands.map((band, index) => {
        if (isVertical) {
          return (
            <mesh
              key={index}
              castShadow
              receiveShadow
              position={[x1, (band.bandBottom + band.bandTop) / 2, (band.start + band.end) / 2]}
            >
              <boxGeometry args={[wallThickness, band.bandHeight, band.partLength]} />
              <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.02} />
            </mesh>
          );
        }
        return (
          <mesh
            key={index}
            castShadow
            receiveShadow
            position={[(band.start + band.end) / 2, (band.bandBottom + band.bandTop) / 2, y1]}
          >
            <boxGeometry args={[band.partLength, band.bandHeight, wallThickness]} />
            <meshStandardMaterial color={wallColor} roughness={0.9} metalness={0.02} />
          </mesh>
        );
      })}
    </group>
  );
}

function RoomFloor3D({ room, isLowQuality = false }) {
  const textureMeta = getFloorTextureById(room.floorTextureId);
  const resolvedTexturePath = useMemo(() => resolveAssetPath(textureMeta.image), [textureMeta.image]);
  const [textureLoadFailed, setTextureLoadFailed] = useState(false);
  const [baseTexture, setBaseTexture] = useState(null);

  useEffect(() => {
    let isCancelled = false;
    setTextureLoadFailed(false);
    setBaseTexture(null);

    if (isLowQuality || !resolvedTexturePath) {
      setTextureLoadFailed(true);
      return undefined;
    }

    const loader = new THREE.TextureLoader();
    loader.load(
      resolvedTexturePath,
      (loadedTexture) => {
        if (isCancelled) return;
        setBaseTexture(loadedTexture);
      },
      undefined,
      () => {
        if (isCancelled) return;
        setTextureLoadFailed(true);
      }
    );

    return () => {
      isCancelled = true;
    };
  }, [resolvedTexturePath, isLowQuality]);

  const preparedTexture = useMemo(() => {
    if (isLowQuality || !baseTexture || textureLoadFailed) return null;
    const next = baseTexture.clone();
    next.wrapS = THREE.RepeatWrapping;
    next.wrapT = THREE.RepeatWrapping;
    const tileScale = Math.max(0.25, Math.min(4, Number(room.floorTileScale) || 1));
    next.repeat.set(
      Math.max(0.25, (Number(room.width) || 1) / (Number(textureMeta.tileWidth) || 1) / tileScale),
      Math.max(0.25, (Number(room.height) || 1) / (Number(textureMeta.tileHeight) || 1) / tileScale)
    );
    next.anisotropy = 8;
    next.needsUpdate = true;
    return next;
  }, [baseTexture, textureLoadFailed, room.width, room.height, textureMeta.tileWidth, textureMeta.tileHeight, room.floorTileScale, isLowQuality]);

  useEffect(() => () => {
    preparedTexture?.dispose?.();
  }, [preparedTexture]);

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[Number(room.x) + Number(room.width) / 2, 0.03, Number(room.y) + Number(room.height) / 2]}
      receiveShadow={!isLowQuality}
    >
      <planeGeometry args={[Math.max(Number(room.width) - 0.12, 0.2), Math.max(Number(room.height) - 0.12, 0.2)]} />
      <meshStandardMaterial
        map={preparedTexture || null}
        color={preparedTexture ? "#ffffff" : (room.color || "#ffffff")}
        roughness={isLowQuality ? 0.96 : 0.82}
        metalness={isLowQuality ? 0.01 : 0.04}
      />
    </mesh>
  );
}

const DOOR_OPEN_ANGLE = Math.PI / 6; // 30° open so door is clearly recognizable

function Door3D({ room, door, wallThickness }) {
  const line = getOpeningLineSegment(room, door);
  if (!line) return null;

  const width = Number(door.width) || DEFAULT_DOOR_WIDTH;
  const height = Number(door.height) || DEFAULT_DOOR_HEIGHT;
  const depth = Math.max(0.12, wallThickness * 0.7);
  const doorLeafThickness = Math.max(0.045, depth * 0.22);
const doorLeafOffset = wallThickness * 0.7 + doorLeafThickness * 0.6;
  const frameThickness = Math.max(0.08, Math.min(width, height) * 0.045);
  const centerX = (line.x1 + line.x2) / 2;
  const centerZ = (line.y1 + line.y2) / 2;
  const rotateY = door.wall === "left" || door.wall === "right" ? Math.PI / 2 : 0;

  return (
    <group position={[centerX, 0, centerZ]} rotation={[0, rotateY, 0]}>
      {/* Hollow U-frame: left bar, right bar, top bar */}
      {/* Left bar */}
      <mesh castShadow receiveShadow position={[-(width / 2 + frameThickness / 2), height / 2, 0]}>
        <boxGeometry args={[frameThickness, height + frameThickness, depth]} />
        <meshStandardMaterial color="#7f5d44" roughness={0.84} />
      </mesh>
      {/* Right bar */}
      <mesh castShadow receiveShadow position={[width / 2 + frameThickness / 2, height / 2, 0]}>
        <boxGeometry args={[frameThickness, height + frameThickness, depth]} />
        <meshStandardMaterial color="#7f5d44" roughness={0.84} />
      </mesh>
      {/* Top bar */}
      <mesh castShadow receiveShadow position={[0, height + frameThickness / 2, 0]}>
        <boxGeometry args={[width + frameThickness * 2, frameThickness, depth]} />
        <meshStandardMaterial color="#7f5d44" roughness={0.84} />
      </mesh>

    {/* Pivoting door leaf — hinged at left edge (-width/2), open ~30° */}
<group position={[-width / 2, 0, 0]} rotation={[0, -DOOR_OPEN_ANGLE, 0]}>
  <mesh castShadow receiveShadow position={[width / 2, height / 2, doorLeafOffset]}>
    <boxGeometry args={[width, height, doorLeafThickness]} />
    <meshStandardMaterial color="#b78656" roughness={0.72} />
  </mesh>

  <mesh castShadow position={[width / 2, height * 0.58, doorLeafOffset + doorLeafThickness * 0.55]}>
    <boxGeometry args={[width * 0.72, height * 0.05, Math.max(0.015, doorLeafThickness * 0.35)]} />
    <meshStandardMaterial color="#c89a68" roughness={0.68} />
  </mesh>

  <mesh castShadow position={[width - frameThickness * 2.4, height * 0.48, doorLeafOffset + doorLeafThickness * 0.8]}>
    <cylinderGeometry args={[0.03, 0.03, 0.24, 18]} />
    <meshStandardMaterial color="#cfd5dc" metalness={0.9} roughness={0.2} />
  </mesh>

  <mesh castShadow position={[frameThickness * 2.4, height * 0.48, doorLeafOffset + doorLeafThickness * 0.8]} rotation={[0, Math.PI, 0]}>
    <cylinderGeometry args={[0.03, 0.03, 0.24, 18]} />
    <meshStandardMaterial color="#cfd5dc" metalness={0.9} roughness={0.2} />
  </mesh>
</group>
    </group>
  );
}

function Window3D({ room, windowItem, wallThickness }) {
  const line = getOpeningLineSegment(room, windowItem);
  if (!line) return null;

  const width = Number(windowItem.width) || DEFAULT_WINDOW_WIDTH;
  const height = Number(windowItem.height) || DEFAULT_WINDOW_HEIGHT;
  const sillHeight = Number(windowItem.sillHeight) || DEFAULT_WINDOW_SILL_HEIGHT;
  const depth = Math.max(0.08, wallThickness * 0.42);
  const frame = Math.max(0.035, Math.min(width, height) * 0.04);
  const centerX = (line.x1 + line.x2) / 2;
  const centerZ = (line.y1 + line.y2) / 2;
  const centerY = sillHeight + height / 2;
  const rotateY = windowItem.wall === "left" || windowItem.wall === "right" ? Math.PI / 2 : 0;
  const dividerCount = width >= 4.5 ? 2 : 1;

  return (
    <group position={[centerX, centerY, centerZ]} rotation={[0, rotateY, 0]}>
      
      {/* Left glass pane — extra transparent, more glass-like */}
      <mesh receiveShadow position={[-width / 4, 0, 0.02]}>
        <boxGeometry args={[width / 2 - frame * 0.5, height, Math.max(0.02, depth * 0.16)]} />
       <meshPhysicalMaterial
  color="#ffffff"
  transparent
  opacity={0.3}
  transmission={0.5}
  roughness={0.005}
  metalness={0}
  thickness={0.05}
  ior={1.45}
  reflectivity={0.95}
  clearcoat={1}
  clearcoatRoughness={0.05}
  attenuationDistance={80}
  attenuationColor="#ffffff"
  depthWrite={false}
  side={THREE.DoubleSide}
/>
      </mesh>
      {/* Right glass pane */}
      <mesh receiveShadow position={[width / 4, 0, 0.02]}>
        <boxGeometry args={[width / 2 - frame * 0.5, height, Math.max(0.02, depth * 0.16)]} />
      <meshPhysicalMaterial
  color="#ffffff"
  transparent
  opacity={0.3}
  transmission={0.5}
  roughness={0.005}
  metalness={0}
  thickness={0.05}
  ior={1.45}
  reflectivity={0.95}
  clearcoat={1}
  clearcoatRoughness={0.05}
  attenuationDistance={80}
  attenuationColor="#ffffff"
  depthWrite={false}
  side={THREE.DoubleSide}
/>
      </mesh>

      {dividerCount >= 1 && (
        <mesh castShadow receiveShadow position={[0, 0, 0.03]}>
          <boxGeometry args={[frame * 0.9, height, Math.max(0.02, depth * 0.25)]} />
          <meshStandardMaterial color="#dbe3ec" roughness={0.58} metalness={0.08} />
        </mesh>
      )}
      {dividerCount === 2 && (
        <>
          <mesh castShadow receiveShadow position={[-width * 0.25, 0, 0.03]}>
            <boxGeometry args={[frame * 0.75, height, Math.max(0.02, depth * 0.25)]} />
            <meshStandardMaterial color="#dbe3ec" roughness={0.58} metalness={0.08} />
          </mesh>
          <mesh castShadow receiveShadow position={[width * 0.25, 0, 0.03]}>
            <boxGeometry args={[frame * 0.75, height, Math.max(0.02, depth * 0.25)]} />
            <meshStandardMaterial color="#dbe3ec" roughness={0.58} metalness={0.08} />
          </mesh>
        </>
      )}
      <mesh castShadow receiveShadow position={[0, 0, 0.03]}>
        <boxGeometry args={[width, frame * 0.8, Math.max(0.02, depth * 0.25)]} />
        <meshStandardMaterial color="#dbe3ec" roughness={0.58} metalness={0.08} />
      </mesh>
    </group>
  );
}

// ─── Furniture helpers ────────────────────────────────────────────────────────

function FurnitureMaterial({ color }) {
  return <meshStandardMaterial color={color || "#cfd8e3"} roughness={0.72} metalness={0.08} />;
}

function FurnitureLabel({ x, y, z, text }) {
  return (
    <DreiText position={[x, y, z]} fontSize={0.22} color="#243246" anchorX="center" anchorY="middle">
      {text}
    </DreiText>
  );
}

// ─── Staircase3D ─────────────────────────────────────────────────────────────

function Staircase3D({ worldX, worldZ, width, depth, height, color, rotRad }) {
  const stepCount = clamp(Math.round(height), 4, 16);
  const stepH = height / stepCount;
  const stepD = depth / stepCount;

  return (
    <group position={[worldX, 0, worldZ - depth / 2]} rotation={[0, rotRad, 0]}>
      {Array.from({ length: stepCount }, (_, i) => (
        <mesh key={i} castShadow receiveShadow
          position={[0, stepH * i + stepH / 2, stepD * i + stepD / 2]}>
          <boxGeometry args={[width, stepH, stepD]} />
          <meshStandardMaterial color={color || "#8a9ab5"} roughness={0.6} metalness={0.35} />
        </mesh>
      ))}
      {/* Left handrail post */}
      <mesh castShadow position={[-width / 2 + 0.12, height / 2 + 0.5, depth / 2]}>
        <boxGeometry args={[0.12, height + 1, 0.12]} />
        <meshStandardMaterial color="#6b7a8d" metalness={0.55} roughness={0.4} />
      </mesh>
      {/* Right handrail post */}
      <mesh castShadow position={[width / 2 - 0.12, height / 2 + 0.5, depth / 2]}>
        <boxGeometry args={[0.12, height + 1, 0.12]} />
        <meshStandardMaterial color="#6b7a8d" metalness={0.55} roughness={0.4} />
      </mesh>
    </group>
  );
}

// ─── 3D Furniture (group-based positioning for rotation support) ──────────────

function Furniture3D({ room, furnitureItem, isSelected = false, onSelect, isLowQuality = false }) {
  const roomX = Number(room.x) || 0;
  const roomY = Number(room.y) || 0;
  const width  = Number(furnitureItem.width)  || 1;
  const depth  = Number(furnitureItem.depth)  || 1;
  const height = Number(furnitureItem.height) || 1;
  const rotationDeg = Number(furnitureItem.rotation) || 0;
  const rotRad = (rotationDeg * Math.PI) / 180;

  const worldX = roomX + (Number(furnitureItem.x) || 0) + width / 2;
  const worldZ = roomY + (Number(furnitureItem.y) || 0) + depth / 2;

  const color   = furnitureItem.color || "#cfd8e3";
  const labelY  = height + 0.35;
  const type    = String(furnitureItem.type || "").toLowerCase();
  const isToilet = type.includes("toilet") || type.includes("wc");
  const hasRec  = FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED && getFurnitureRecommendationItems(furnitureItem.type).length > 0;
  const outlineColor = isSelected ? "#0f3b72" : "#8ea0b5";
  const legW    = Math.max(0.12, Math.min(width, depth) * 0.12);
  const ringInner = Math.max(Math.min(width, depth) * 0.24, 0.22);
  const ringOuter = Math.max(Math.min(width, depth) * 0.3,  0.30);

  const handleSelect = (e) => {
    if (!hasRec || typeof onSelect !== "function") return;
    e?.stopPropagation?.();
    onSelect(furnitureItem);
  };

  const RecommendationRing = () =>
    hasRec ? (
      <mesh position={[0, height + 0.03, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[ringInner, ringOuter, 32]} />
        <meshBasicMaterial color={outlineColor} transparent opacity={0.95} />
      </mesh>
    ) : null;

  if (isLowQuality && !isToilet) {
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh receiveShadow position={[0, height / 2, 0]}>
          <boxGeometry args={[width, height, depth]} />
          <meshStandardMaterial color={color} roughness={0.9} metalness={0.02} />
        </mesh>
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }
  if (isToilet) {
    const bowlWidth = Math.max(0.8, width * 0.58);
    const bowlDepth = Math.max(1.05, depth * 0.52);
    const bowlHeight = Math.max(0.42, height * 0.2);
    const tankWidth = Math.max(0.9, width * 0.76);
    const tankHeight = Math.max(0.55, height * 0.28);
    const tankDepth = Math.max(0.28, depth * 0.16);
    const seatY = bowlHeight + 0.34;

    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, 0.16, depth * 0.08]}>
          <cylinderGeometry args={[bowlWidth * 0.22, bowlWidth * 0.3, 0.32, 28]} />
          <meshStandardMaterial color="#d9e5ef" roughness={0.28} metalness={0.03} />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          position={[0, bowlHeight / 2 + 0.25, depth * 0.08]}
          scale={[1, 1, bowlDepth / bowlWidth]}
        >
          <cylinderGeometry args={[bowlWidth * 0.42, bowlWidth * 0.34, bowlHeight, 36]} />
          <meshStandardMaterial color="#f5fbff" roughness={0.22} metalness={0.04} />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          position={[0, seatY, depth * 0.08]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[bowlWidth * 0.66, bowlDepth * 0.78, 1]}
        >
          <torusGeometry args={[0.42, 0.055, 12, 36]} />
          <meshStandardMaterial color="#ffffff" roughness={0.18} metalness={0.03} />
        </mesh>

        <mesh
          receiveShadow
          position={[0, seatY + 0.01, depth * 0.08]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[bowlWidth * 0.45, bowlDepth * 0.54, 1]}
        >
          <ringGeometry args={[0.28, 0.44, 36]} />
          <meshStandardMaterial color="#d9eef8" roughness={0.2} metalness={0.02} side={THREE.DoubleSide} />
        </mesh>

        <mesh
          castShadow
          receiveShadow
          position={[0, seatY + 0.08, -depth * 0.18]}
          rotation={[Math.PI / 2, 0, 0]}
          scale={[bowlWidth * 0.56, bowlDepth * 0.5, 1]}
        >
          <circleGeometry args={[0.44, 36]} />
          <meshStandardMaterial color="#f8fbff" roughness={0.2} metalness={0.03} side={THREE.DoubleSide} />
        </mesh>

        <mesh castShadow receiveShadow position={[0, tankHeight / 2 + bowlHeight + 0.42, -depth * 0.34]}>
          <boxGeometry args={[tankWidth, tankHeight, tankDepth]} />
          <meshStandardMaterial color="#eef7fc" roughness={0.24} metalness={0.03} />
        </mesh>

        <mesh castShadow receiveShadow position={[tankWidth * 0.22, bowlHeight + tankHeight + 0.74, -depth * 0.34]}>
          <boxGeometry args={[tankWidth * 0.18, 0.035, tankDepth * 0.42]} />
          <meshStandardMaterial color="#c7d2de" roughness={0.22} metalness={0.65} />
        </mesh>

        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Staircase ──
  if (type.includes("staircase")) {
    return <Staircase3D worldX={worldX} worldZ={worldZ} width={width} depth={depth} height={height} color={color} rotRad={rotRad} />;
  }


  // ── Sofa ──
  if (type.includes("sofa")) {
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, 0.55, 0]}>
          <boxGeometry args={[width, 1.1, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 1.04, 0]}>
          <boxGeometry args={[width * 0.88, 0.22, depth * 0.82]} />
          <meshStandardMaterial color="#eef2f7" roughness={0.9} metalness={0.02} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 1.55, -depth * 0.32]}>
          <boxGeometry args={[width, 1.1, Math.max(0.3, depth * 0.22)]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[-width * 0.42, 1.05, 0]}>
          <boxGeometry args={[Math.max(0.25, width * 0.12), 1, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[width * 0.42, 1.05, 0]}>
          <boxGeometry args={[Math.max(0.25, width * 0.12), 1, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Table / Desk / Counter ──
  if (type.includes("table") || type.includes("desk") || type.includes("workstation") || type.includes("counter")) {
    const topThickness = Math.max(0.14, height * 0.15);
    const legHeight    = Math.max(0.35, height - topThickness);
    const legPositions = [
      [-width / 2 + legW / 2, legHeight / 2, -depth / 2 + legW / 2],
      [ width / 2 - legW / 2, legHeight / 2, -depth / 2 + legW / 2],
      [-width / 2 + legW / 2, legHeight / 2,  depth / 2 - legW / 2],
      [ width / 2 - legW / 2, legHeight / 2,  depth / 2 - legW / 2],
    ];
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, legHeight + topThickness / 2, 0]}>
          <boxGeometry args={[width, topThickness, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, legHeight + topThickness + 0.02, 0]}>
          <boxGeometry args={[width * 0.92, Math.max(0.04, topThickness * 0.18), depth * 0.92]} />
          <meshStandardMaterial color="#f8fafc" roughness={0.65} metalness={0.1} />
        </mesh>
        {legPositions.map((pos, idx) => (
          <mesh key={idx} castShadow receiveShadow position={pos}>
            <boxGeometry args={[legW, legHeight, legW]} />
            <FurnitureMaterial color={color} />
          </mesh>
        ))}
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Chair ──
  if (type.includes("chair")) {
    const legPositions = [
      [-width / 2 + legW / 2, 0.55, -depth / 2 + legW / 2],
      [ width / 2 - legW / 2, 0.55, -depth / 2 + legW / 2],
      [-width / 2 + legW / 2, 0.55,  depth / 2 - legW / 2],
      [ width / 2 - legW / 2, 0.55,  depth / 2 - legW / 2],
    ];
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, 1.1, 0]}>
          <boxGeometry args={[width, 0.25, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 2.1, -depth * 0.34]}>
          <boxGeometry args={[width, 1.8, Math.max(0.12, depth * 0.16)]} />
          <FurnitureMaterial color={color} />
        </mesh>
        {legPositions.map((pos, idx) => (
          <mesh key={idx} castShadow receiveShadow position={pos}>
            <boxGeometry args={[legW, 1.1, legW]} />
            <FurnitureMaterial color={color} />
          </mesh>
        ))}
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Bed ──
  if (type.includes("bed")) {
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, 0.35, 0]}>
          <boxGeometry args={[width, 0.7, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 0.9, 0]}>
          <boxGeometry args={[width * 0.92, 0.4, depth * 0.92]} />
          <meshStandardMaterial color="#f3f5f8" roughness={0.9} metalness={0.02} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, 1.2, -depth * 0.39]}>
          <boxGeometry args={[width, 0.6, Math.max(0.25, depth * 0.12)]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Switch Rack ──
  if (type.includes("switch rack")) {
    const frameW = Math.max(0.08, width * 0.04);
    const frameD = Math.max(0.08, depth * 0.08);
    const shelfCount = Math.max(2, Math.min(4, Math.round(height / 2)));
    const innerHeight = Math.max(0.4, height - 0.18);
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
          <boxGeometry args={[width, height, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height / 2, depth * 0.16]}>
          <boxGeometry args={[Math.max(0.2, width - frameW * 2.2), Math.max(0.2, height - 0.18), Math.max(0.02, depth * 0.08)]} />
          <meshStandardMaterial color="#1f2937" roughness={0.5} metalness={0.35} />
        </mesh>
        {[-1, 1].map((dir) => (
          <mesh key={`rack-side-${dir}`} castShadow receiveShadow position={[dir * (width / 2 - frameW / 2), height / 2, 0]}>
            <boxGeometry args={[frameW, height, depth]} />
            <meshStandardMaterial color="#7c8796" roughness={0.58} metalness={0.32} />
          </mesh>
        ))}
        {[-1, 1].map((dir) => (
          <mesh key={`rack-edge-${dir}`} castShadow receiveShadow position={[0, height / 2, dir * (depth / 2 - frameD / 2)]}>
            <boxGeometry args={[width, height, frameD]} />
            <meshStandardMaterial color="#8b97a6" roughness={0.62} metalness={0.22} />
          </mesh>
        ))}
        {Array.from({ length: shelfCount }, (_, index) => {
          const yPos = innerHeight * ((index + 1) / (shelfCount + 1));
          return (
            <mesh key={`rack-shelf-${index}`} castShadow receiveShadow position={[0, yPos, 0]}>
              <boxGeometry args={[Math.max(0.2, width - frameW * 2.4), Math.max(0.05, height * 0.04), Math.max(0.18, depth * 0.82)]} />
              <meshStandardMaterial color="#cbd5df" roughness={0.7} metalness={0.12} />
            </mesh>
          );
        })}
        <mesh castShadow receiveShadow position={[0, height - Math.max(0.09, height * 0.05), depth / 2 + 0.015]}>
          <boxGeometry args={[Math.max(0.25, width * 0.72), Math.max(0.05, height * 0.05), 0.03]} />
          <meshStandardMaterial color="#e5e7eb" roughness={0.35} metalness={0.18} />
        </mesh>
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Urinal ──
  if (type.includes("urinal")) {
    const bodyWidth = Math.max(0.55, width * 0.72);
    const bodyDepth = Math.max(0.45, depth * 0.68);
    const rimHeight = Math.max(0.08, height * 0.04);
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, height * 0.6, -depth * 0.08]}>
          <boxGeometry args={[bodyWidth, Math.max(0.5, height * 0.78), bodyDepth]} />
          <meshStandardMaterial color="#eef5fb" roughness={0.28} metalness={0.04} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height * 0.9, -depth * 0.02]}>
          <cylinderGeometry args={[Math.max(0.18, bodyWidth * 0.34), Math.max(0.22, bodyWidth * 0.42), Math.max(0.25, height * 0.22), 28, 1, false, Math.PI, Math.PI]} />
          <meshStandardMaterial color="#f8fbff" roughness={0.22} metalness={0.03} side={THREE.DoubleSide} />
        </mesh>
        <mesh receiveShadow position={[0, height * 0.76, bodyDepth * 0.12]}>
          <boxGeometry args={[Math.max(0.2, bodyWidth * 0.76), Math.max(0.18, height * 0.42), Math.max(0.08, bodyDepth * 0.28)]} />
          <meshStandardMaterial color="#dfe9f3" roughness={0.2} metalness={0.02} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height * 0.38, bodyDepth * 0.2]}>
          <cylinderGeometry args={[Math.max(0.06, bodyWidth * 0.1), Math.max(0.07, bodyWidth * 0.12), Math.max(0.2, height * 0.22), 18]} />
          <meshStandardMaterial color="#edf4fa" roughness={0.26} metalness={0.03} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height * 0.96, -bodyDepth * 0.06]}>
          <boxGeometry args={[Math.max(0.25, bodyWidth * 0.82), rimHeight, Math.max(0.16, bodyDepth * 0.5)]} />
          <meshStandardMaterial color="#ffffff" roughness={0.18} metalness={0.03} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height * 0.98, bodyDepth * 0.32]}>
          <cylinderGeometry args={[0.035, 0.035, 0.16, 16]} />
          <meshStandardMaterial color="#c7d2de" roughness={0.2} metalness={0.85} />
        </mesh>
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── CCTV Monitor Unit ──
  if (type.includes("cctv monitor unit")) {
    const screenW = Math.max(0.8, width * 0.84);
    const screenH = Math.max(0.8, height * 0.42);
    const screenD = Math.max(0.08, depth * 0.14);
    const consoleH = Math.max(0.4, height * 0.24);
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, consoleH / 2, 0]}>
          <boxGeometry args={[width, consoleH, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, consoleH + screenH * 0.38, -depth * 0.08]}>
          <boxGeometry args={[screenW, screenH, screenD]} />
          <meshStandardMaterial color="#1f2937" roughness={0.42} metalness={0.4} />
        </mesh>
        <mesh receiveShadow position={[0, consoleH + screenH * 0.38, screenD * 0.52]}>
          <boxGeometry args={[screenW * 0.88, screenH * 0.82, Math.max(0.02, screenD * 0.18)]} />
          <meshStandardMaterial color="#2b5c85" emissive="#15324a" emissiveIntensity={0.65} roughness={0.22} metalness={0.18} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, consoleH + screenH * 0.06, -depth * 0.1]}>
          <boxGeometry args={[Math.max(0.1, width * 0.08), Math.max(0.3, height * 0.22), Math.max(0.08, depth * 0.16)]} />
          <meshStandardMaterial color="#8d99a8" roughness={0.5} metalness={0.34} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, consoleH + 0.05, 0]}>
          <boxGeometry args={[Math.max(0.55, width * 0.34), 0.08, Math.max(0.4, depth * 0.28)]} />
          <meshStandardMaterial color="#9aa7b5" roughness={0.45} metalness={0.3} />
        </mesh>
        {[-1, 0, 1].map((xPos) => (
          <mesh key={`monitor-indicator-${xPos}`} receiveShadow position={[xPos * width * 0.18, consoleH * 0.52, depth / 2 + 0.02]}>
            <boxGeometry args={[0.08, 0.08, 0.04]} />
            <meshStandardMaterial color={xPos === 0 ? "#74c69d" : "#cbd5df"} roughness={0.3} metalness={0.12} />
          </mesh>
        ))}
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Cabinet / Wardrobe / Shelf / Rack / Display Unit ──
  if (
    type.includes("cabinet") || type.includes("wardrobe") ||
    type.includes("rack")    || type.includes("shelf")    ||
    type.includes("display unit")
  ) {
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
        <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
          <boxGeometry args={[width, height, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[-width * 0.24, height / 2, depth / 2 + 0.01]}>
          <boxGeometry args={[0.06, height * 0.72, 0.06]} />
          <meshStandardMaterial color="#7a8797" roughness={0.7} metalness={0.15} />
        </mesh>
        <mesh castShadow receiveShadow position={[width * 0.24, height / 2, depth / 2 + 0.01]}>
          <boxGeometry args={[0.06, height * 0.72, 0.06]} />
          <meshStandardMaterial color="#7a8797" roughness={0.7} metalness={0.15} />
        </mesh>
        <RecommendationRing />
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Kitchen Slab ──
  if (type.includes("kitchen slab")) {
    return (
      <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]}>
        <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
          <boxGeometry args={[width, height, depth]} />
          <FurnitureMaterial color={color} />
        </mesh>
        <mesh castShadow receiveShadow position={[0, height + 0.05, 0]}>
          <boxGeometry args={[width, 0.1, depth]} />
          <meshStandardMaterial color="#9aa6b4" roughness={0.55} metalness={0.12} />
        </mesh>
        <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
      </group>
    );
  }

  // ── Default box ──
  return (
    <group position={[worldX, 0, worldZ]} rotation={[0, rotRad, 0]} onClick={handleSelect}>
      <mesh castShadow receiveShadow position={[0, height / 2, 0]}>
        <boxGeometry args={[width, height, depth]} />
        <FurnitureMaterial color={color} />
      </mesh>
      <RecommendationRing />
      <FurnitureLabel x={0} y={labelY} z={0} text={furnitureItem.type} />
    </group>
  );
}

// ─── 3D Scene ─────────────────────────────────────────────────────────────────

function Floor3DScene({
  rooms,
  totalWidth,
  totalHeight,
  wallThickness,
  roomThickness,
  roomHeight,
  wallSegments,
  selectedFurnitureKey,
  onFurnitureSelect,
  sunSettings,
  globalWallColor,
  orbitControlsRef,
  renderQuality = "high",
}) {
  const centerX = totalWidth / 2;
  const centerZ = totalHeight / 2;
   const wt = Math.max(0.22, Number(wallThickness) || WALL_THICKNESS_FT);
  const rt = Math.max(0.12, Number(roomThickness) || ROOM_THICKNESS_FT);
  const h = Math.max(8, Number(roomHeight) || DEFAULT_ROOM_HEIGHT);
  const safeSun = { ...DEFAULT_SUN_SETTINGS, ...(sunSettings || {}) };
  const sunPos = getSunPosition(safeSun.azimuth, safeSun.elevation, Math.max(totalWidth, totalHeight) * 1.8, centerX, centerZ);
  const shadowCamExtent = Math.max(totalWidth, totalHeight) * 2;
  const isLowQuality = renderQuality === "low";

  return (
    <>
      <ambientLight intensity={isLowQuality ? 0.8 : safeSun.ambientIntensity} />
      {isLowQuality ? (
        <hemisphereLight intensity={0.24} groundColor="#d5dde7" color="#f7fafc" />
      ) : (
        <>
          <hemisphereLight intensity={0.42} groundColor="#cad4df" color="#f8fbff" />
          <directionalLight
            position={sunPos}
            intensity={safeSun.intensity}
            color={safeSun.color}
            castShadow
            shadow-mapSize-width={4096}
            shadow-mapSize-height={4096}
            shadow-bias={-0.0003}
            shadow-camera-near={0.5}
            shadow-camera-far={400}
            shadow-camera-left={-shadowCamExtent}
            shadow-camera-right={shadowCamExtent}
            shadow-camera-top={shadowCamExtent}
            shadow-camera-bottom={-shadowCamExtent}
          />
        </>
      )}
      {!isLowQuality && (
        <Grid
          args={[Math.max(totalWidth + 20, 80), Math.max(totalHeight + 20, 80)]}
          cellSize={1}
          cellThickness={0.5}
          sectionSize={5}
          sectionThickness={1}
          fadeDistance={120}
          fadeStrength={1}
          position={[centerX, 0, centerZ]}
        />
      )}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.02, centerZ]} receiveShadow>
        <planeGeometry args={[totalWidth, totalHeight]} />
        <meshStandardMaterial color="#e7ebf0" roughness={0.93} metalness={0.04} />
      </mesh>

      {rooms.map((room) => {
        const x = Number(room.x) || 0;
        const z = Number(room.y) || 0;
        const w = Math.max(Number(room.width) || 0, 0.2);
        const d = Math.max(Number(room.height) || 0, 0.2);
        return (
          <group key={room.id}>
            <RoomFloor3D key={`${room.id}-${room.floorTextureId || ""}-${room.floorTileScale || 1}-${renderQuality}`} room={room} isLowQuality={isLowQuality} />
            <DreiText
              position={[x + w / 2, 0.12, z + d / 2]}
              fontSize={0.52}
              color="#162033"
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {room.name || "Room"}
            </DreiText>
            <DreiText
              position={[x + w / 2, 0.12, z + d / 2 + 0.95]}
              fontSize={0.34}
              color="#445065"
              anchorX="center"
              anchorY="middle"
              rotation={[-Math.PI / 2, 0, 0]}
            >
              {`${w} ft × ${d} ft`}
            </DreiText>

            {(room.furniture || []).map((item) => (
              <Furniture3D
                key={item.id}
                room={room}
                furnitureItem={item}
                isSelected={selectedFurnitureKey === `${room.id}-${item.id}`}
                onSelect={(sel) => onFurnitureSelect?.(room, sel)}
                isLowQuality={isLowQuality}
              />
            ))}
          </group>
        );
      })}

            {(wallSegments || []).map((segment, index) => (
        <WallMesh
          key={index}
          segment={segment}
          wallThickness={segment.type === "outer" ? wt : rt}
          height={h}
          rooms={rooms}
          globalWallColor={globalWallColor}
        />
      ))}

      {rooms.map((room) => {
        const { doors, windows } = getRoomOpenings(room, h);
        return (
          <group key={`openings-3d-${room.id}`}>
            {doors.map((door, idx) => (
              <Door3D key={`door-3d-${room.id}-${idx}`} room={room} door={door} wallThickness={wt} />
            ))}
            {windows.map((win, idx) => (
              <Window3D key={`window-3d-${room.id}-${idx}`} room={room} windowItem={win} wallThickness={wt} />
            ))}
          </group>
        );
      })}

      <DreiText position={[centerX, 0.18, -2]} fontSize={0.75} color="#0f172a" anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, 0]}>
        {`Width: ${totalWidth} ft`}
      </DreiText>
      <DreiText position={[-2, 0.18, centerZ]} fontSize={0.75} color="#0f172a" anchorX="center" anchorY="middle" rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        {`Height: ${totalHeight} ft`}
      </DreiText>

      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        enablePan
        enableZoom
        enableRotate
        minDistance={12}
        maxDistance={160}
        maxPolarAngle={Math.PI / 2.08}
        target={[centerX, 0, centerZ]}
      />
    </>
  );
}

function ReadOnly3DViewerShell({
  planName,
  totalWidth,
  totalHeight,
  roomHeight,
  wallThickness,
  roomThickness,
  placedRooms,
  wallSegments,
  sunSettings,
  globalWallColor,
  orbitControlsRef,
  isLoading,
  statusMessage,
}) {
  const safeTitle = String(planName || "").trim() || "Saved Floor Plan";
  return (
    <div
      style={{
        height: "100vh",
        minHeight: "100vh",
        width: "100%",
        background: "linear-gradient(180deg, #f8fafc 0%, #eef2f7 100%)",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "14px 18px",
          borderBottom: "1px solid rgba(148, 163, 184, 0.22)",
          background: "rgba(255,255,255,0.88)",
          backdropFilter: "blur(10px)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 18, fontWeight: 700, color: "#0f172a" }}>{safeTitle}</div>
          <div style={{ fontSize: 12, color: "#475569", marginTop: 2 }}>
            Read-only 3D viewer · rotate, zoom, and pan enabled
          </div>
        </div>
        <div style={{ fontSize: 12, color: "#334155", textAlign: "right" }}>
          <div>{Number(totalWidth) || 0} ft × {Number(totalHeight) || 0} ft</div>
          <div style={{ opacity: 0.7 }}>Height: {Number(roomHeight) || 0} ft</div>
        </div>
      </div>

      <div style={{ position: "relative", flex: 1, minHeight: 0, display: "flex" }}>
        <Canvas
          shadows
          style={{ width: "100%", height: "100%", flex: 1 }}
          gl={{ preserveDrawingBuffer: true }}
          camera={{
            position: [
              Math.max(Number(totalWidth) * 0.85, 14),
              Math.max(Number(roomHeight) * 2.2, 16),
              Math.max(Number(totalHeight) * 1.0, 14),
            ],
            fov: 42,
          }}
        >
          <Floor3DScene
            rooms={placedRooms}
            totalWidth={Number(totalWidth)}
            totalHeight={Number(totalHeight)}
            wallThickness={Number(wallThickness)}
            roomHeight={Number(roomHeight)}
            wallSegments={wallSegments}
            selectedFurnitureKey=""
            onFurnitureSelect={undefined}
            sunSettings={sunSettings}
            globalWallColor={globalWallColor}
            orbitControlsRef={orbitControlsRef}
            renderQuality="high"
          />
        </Canvas>

        {isLoading && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(248,250,252,0.72)",
              backdropFilter: "blur(4px)",
            }}
          >
            <div
              style={{
                padding: "14px 18px",
                borderRadius: 14,
                background: "rgba(255,255,255,0.94)",
                border: "1px solid rgba(148,163,184,0.22)",
                boxShadow: "0 18px 38px rgba(15,23,42,0.10)",
                fontSize: 14,
                fontWeight: 600,
                color: "#0f172a",
              }}
            >
              Loading 3D viewer...
            </div>
          </div>
        )}

        {!isLoading && statusMessage && /could not open|no full saved state/i.test(String(statusMessage || "")) && (
          <div
            style={{
              position: "absolute",
              left: 18,
              bottom: 18,
              padding: "10px 12px",
              borderRadius: 12,
              background: "rgba(255,255,255,0.94)",
              border: "1px solid rgba(248,113,113,0.24)",
              color: "#991b1b",
              fontSize: 12,
              maxWidth: 340,
              boxShadow: "0 14px 30px rgba(15,23,42,0.10)",
            }}
          >
            {statusMessage}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── 2D Opening ───────────────────────────────────────────────────────────────

function Opening2D({ room, opening, scale, wallThickness }) {
  const line = getOpeningLineSegment(room, opening);
  if (!line) return null;
  const strokeWidth = Math.max(4, wallThickness * scale);
  const isWindow = opening.type === "window";
  const isCutout = opening.type === "cutout";
  return (
    <line
      x1={line.x1 * scale} y1={line.y1 * scale}
      x2={line.x2 * scale} y2={line.y2 * scale}
      stroke={isWindow ? "#3b82f6" : isCutout ? "#eef4fb" : "#f7f9fc"}
      strokeWidth={strokeWidth + (isWindow ? 0 : 2)}
      strokeDasharray={isWindow ? "10 6" : undefined}
      strokeLinecap="square"
    />
  );
}

// ─── 2D Furniture ─────────────────────────────────────────────────────────────

function Furniture2D({ room, furnitureItem, scale, isSelected = false, onSelect, labelDy = 0 }) {
  const roomX  = Number(room.x) || 0;
  const roomY  = Number(room.y) || 0;
  const localX = Number(furnitureItem.x) || 0;
  const localY = Number(furnitureItem.y) || 0;
  const width  = Number(furnitureItem.width)  || 1;
  const depth  = Number(furnitureItem.depth)  || 1;

  const x = (roomX + localX) * scale;
  const y = (roomY + localY) * scale;
  const w = width * scale;
  const h = depth * scale;

  const cx = x + w / 2;
  const cy = y + h / 2;
  const rotation = Number(furnitureItem.rotation) || 0;

  const isSlab = isKitchenSlab(furnitureItem);
  const hasRec = getFurnitureRecommendationItems(furnitureItem.type).length > 0;

  const nameFontSize = Math.max(4.9, Math.min(7.1, Math.min(w, h) * 0.078));
  const dimFontSize  = Math.max(4.1, Math.min(5.8, Math.min(w, h) * 0.062));
  const labelOffsetY = h >= 42 ? -2 : -0.5;
  const dimOffsetY   = h >= 42 ? 6.5 : 5.5;

  const handleSelect = (e) => {
    if (!hasRec || typeof onSelect !== "function") return;
    e?.stopPropagation?.();
    onSelect(furnitureItem);
  };

  return (
    <g
      transform={`rotate(${rotation}, ${cx}, ${cy})`}
      onClick={handleSelect}
      style={hasRec ? { cursor: "pointer" } : undefined}
    >
      <rect
        x={x} y={y} width={w} height={h} rx="0"
        fill={furnitureItem.color || "#cfd8e3"}
        stroke={isSelected ? "#0f3b72" : isSlab ? "#4f5f74" : "#5b6a81"}
        strokeWidth={isSelected ? "2.4" : isSlab ? "1.8" : "1.4"}
      />
      {isSlab && (
        <line
          x1={x} y1={y}
          x2={furnitureItem.attachedWall === "left" || furnitureItem.attachedWall === "right" ? x : x + w}
          y2={furnitureItem.attachedWall === "top"  || furnitureItem.attachedWall === "bottom" ? y : y + h}
          stroke="#8a98a8" strokeWidth="2"
        />
      )}
      <text x={cx} y={cy + labelOffsetY + labelDy} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: nameFontSize, fontWeight: 600, fill: "#243246", pointerEvents: "none" }}>
        {furnitureItem.type}
      </text>
      <text x={cx} y={cy + dimOffsetY + labelDy} textAnchor="middle" dominantBaseline="middle"
        style={{ fontSize: dimFontSize, fontWeight: 500, fill: "#5b677c", pointerEvents: "none" }}>
        {`${width} ft × ${depth} ft`}
      </text>
      {rotation !== 0 && (
        <text x={cx} y={cy + dimOffsetY + 7 + labelDy} textAnchor="middle" dominantBaseline="middle"
          style={{ fontSize: 4.1, fill: "#8899b0", pointerEvents: "none" }}>
          {`↻ ${rotation}°`}
        </text>
      )}
    </g>
  );
}

// ─── 2D label collision helper ────────────────────────────────────────────────

function computeFurnitureLabelOffsets(furnitureItems, room, scale) {
  if (!furnitureItems || furnitureItems.length < 2) return {};
  const positions = furnitureItems.map((item) => {
    const w = (Number(item.width) || 1) * scale;
    const h = (Number(item.depth) || 1) * scale;
    const cx = (Number(room.x) + (Number(item.x) || 0)) * scale + w / 2;
    const cy = (Number(room.y) + (Number(item.y) || 0)) * scale + h / 2;
    return { id: item.id, cx, cy, dy: 0 };
  });
  const THRESHOLD = 22;
  for (let i = 0; i < positions.length; i++) {
    for (let j = i + 1; j < positions.length; j++) {
      if (
        Math.abs(positions[j].cx - positions[i].cx) < THRESHOLD &&
        Math.abs(positions[j].cy - positions[i].cy) < THRESHOLD
      ) {
        positions[i].dy -= 9;
        positions[j].dy += 9;
      }
    }
  }
  return Object.fromEntries(positions.map((p) => [p.id, p.dy]));
}

// ─── MiniFloorPlan SVG preview ────────────────────────────────────────────────

function MiniFloorPlan({ variant, size = 160 }) {
  if (!variant) return null;
  const rooms = Array.isArray(variant.rooms) ? variant.rooms : [];
  const tw = Number(variant.totalWidth) || 40;
  const th = Number(variant.totalHeight) || 30;
  const pad = 8;
  const scaleX = (size - pad * 2) / tw;
  const scaleY = (size - pad * 2) / th;
  const sc = Math.min(scaleX, scaleY);

  return (
    <svg width={size} height={size} style={{ display: "block", borderRadius: 8, background: "#f8fafc", border: "1px solid rgba(148,163,184,0.18)" }}>
      <rect width={size} height={size} fill="#f0f4f8" />
      <g transform={`translate(${pad}, ${pad})`}>
        <rect x={0} y={0} width={tw * sc} height={th * sc} fill="none" stroke="#94a3b8" strokeWidth={1.5} />
        {rooms.map((room, i) => {
          const rx = (Number(room.x) || 0) * sc;
          const ry = (Number(room.y) || 0) * sc;
          const rw = Math.max(2, (Number(room.width) || 8) * sc);
          const rh = Math.max(2, (Number(room.height) || 8) * sc);
          return (
            <g key={i}>
              <rect x={rx} y={ry} width={rw} height={rh}
                fill={ROOM_COLORS[i % ROOM_COLORS.length]}
                stroke="#7e8da3" strokeWidth={0.8} fillOpacity={0.85} />
              {rw > 18 && rh > 10 && (
                <text x={rx + rw / 2} y={ry + rh / 2} textAnchor="middle" dominantBaseline="middle"
                  style={{ fontSize: Math.min(7, rw / 4), fill: "#1e293b", fontWeight: 600, pointerEvents: "none" }}>
                  {String(room.name || "").slice(0, 8)}
                </text>
              )}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

// ─── Variant Selection Page ───────────────────────────────────────────────────

function VariantSelectionPage({ variants, theme, onSelect, onBack, editorIsEntering = false }) {
  return (
    <div className={`app-shell ${theme === "dark" ? "dark-theme" : "light-theme"}${editorIsEntering ? " app-shell--entering" : ""}`}>
      <section className="top-control-card">
        <div className="top-control-grid">
          <div className="input-card top-input-card">
            <div className="top-input-meta-row">
              <div className="top-input-brand">
                <span className="pill">AI Layout Options</span>
                <div className="top-input-brand-copy">
                  <div className="top-input-title-row">
                    <h1><Sparkles size={20} />Choose Your Layout</h1>
                  </div>
                  <p>We created 3 versions of your floor plan. Pick the one that feels right — you can edit everything after.</p>
                </div>
              </div>
            </div>
          </div>
          <aside className="project-actions-card input-card">
            <button className="primary-btn project-stack-btn" onClick={onBack}>
              <ArrowLeft size={16} />
              Back
            </button>
          </aside>
        </div>
      </section>

      <div style={{ padding: "24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 24 }}>
        {variants.map((variant) => {
          const rooms = Array.isArray(variant.rooms) ? variant.rooms : [];
          const totalArea = rooms.reduce((s, r) => s + (Number(r.width) || 0) * (Number(r.height) || 0), 0);
          return (
            <div key={variant.id} className="input-card" style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                <span className="pill" style={{ fontSize: 12 }}>{variant.label}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <MiniFloorPlan variant={variant} size={200} />
              </div>
              <p style={{ fontSize: 13, opacity: 0.75, margin: 0 }}>{variant.rationale}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {rooms.slice(0, 6).map((room, i) => (
                  <span key={i} className="chatbot-chip" style={{ fontSize: 11, padding: "3px 10px", cursor: "default" }}>
                    {room.name || `Room ${i + 1}`}
                  </span>
                ))}
                {rooms.length > 6 && <span className="chatbot-chip" style={{ fontSize: 11, padding: "3px 10px", cursor: "default" }}>+{rooms.length - 6} more</span>}
              </div>
              <div style={{ fontSize: 12, opacity: 0.6 }}>
                {variant.totalWidth} ft × {variant.totalHeight} ft &nbsp;·&nbsp; {totalArea.toFixed(0)} sq ft total area
              </div>
              <button className="primary-btn" style={{ marginTop: "auto" }} onClick={() => onSelect(variant)}>
                Use This Layout
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

function LandingPage({ theme, onGenerate, onContinueWithout, isGenerating, generationStep, isEntering }) {
  const premiumHighlights = [
    "Precision 2D planning with immersive 3D preview",
    "Room, furniture, and export workflows ready",
    "A polished workspace for faster concept validation",
  ];

  return (
    <div className={`app-shell landing-page landing-page--immersive ${theme === "dark" ? "dark-theme" : "light-theme"}`}>
      <div className="landing-ambient-grid" />
      <div className="landing-ambient-orb landing-ambient-orb--one" />
      <div className="landing-ambient-orb landing-ambient-orb--two" />
      <div className="landing-ambient-orb landing-ambient-orb--three" />
      <div className="landing-ambient-ring landing-ambient-ring--one" />
      <div className="landing-ambient-ring landing-ambient-ring--two" />

      <div className="landing-immersive-shell">
        <section className="landing-immersive-card">
          <div className="landing-immersive-badge-wrap">
  <span className="pill landing-immersive-pill">
    <span className="landing-pill-text">Premium Space Planning Suite</span>
  </span>
</div>

<h1 className="landing-immersive-title">
  <span className="landing-immersive-title-main">Welcome to Floora</span>
  <span className="landing-immersive-title-sub">Your floor planner assistant</span>
</h1>

          <p className="landing-immersive-subtitle">
            From concept to clarity — step into a premium planning workspace designed to make every layout feel clean,
            controlled, and presentation-ready from the very first click.
          </p>

          <div className="landing-immersive-points">
            {premiumHighlights.map((item) => (
              <div key={item} className="landing-immersive-point">
                <span className="landing-immersive-point-dot" />
                <span>{item}</span>
              </div>
            ))}
          </div>

          <div className="landing-immersive-actions">
            <button
              type="button"
              className="primary-btn landing-continue-btn landing-immersive-btn"
              onClick={onContinueWithout}
              disabled={isEntering}
            >
              {isEntering ? <Loader2 size={18} className="landing-btn-spinner" /> : <Home size={18} />}
              {isEntering ? "Opening your workspace..." : "Explore Now"}
            </button>

            {isEntering && (
              <div className="landing-entering-text">
                <span className="landing-entering-line" />
                <span>Preparing your premium workspace...</span>
                <span className="landing-entering-line" />
              </div>
            )}
          </div>
        </section>
      </div>

      {isEntering && (
        <div className="landing-transition-overlay" aria-hidden="true">
          <div className="landing-transition-core">
            <div className="landing-transition-spinner-ring" />
            <div className="landing-transition-spinner-ring landing-transition-spinner-ring--two" />
            <div className="landing-transition-mark" />
          </div>
          <div className="landing-transition-copy">
            <div className="landing-transition-title">Launching your planning workspace</div>
            <div className="landing-transition-subtitle">Loading tools, views, and project controls...</div>
          </div>
        </div>
      )}
    </div>
  );
}
// ─── Furniture Manager Page ───────────────────────────────────────────────────

function FurnitureManagerPage({ rooms, theme, customPresetDimensions, onUpdateCustomPreset, onUpdatePlacedFurniture, onApplyPresetToPlaced, onBack, editorIsEntering = false }) {
  const [activeCategory, setActiveCategory] = useState(PRODUCT_CATEGORIES[0]);

  const presets = FURNITURE_PRESETS[activeCategory] || [];

  const placedCountByType = useMemo(() => {
    const counts = {};
    rooms.forEach((room) => {
      (room.furniture || []).forEach((item) => {
        counts[item.type] = (counts[item.type] || 0) + 1;
      });
    });
    return counts;
  }, [rooms]);

  const placedItems = useMemo(() => {
    return rooms.flatMap((room) =>
      (room.furniture || [])
        .filter((item) =>
          presets.some((p) => p.type === item.type) ||
          item.category === activeCategory
        )
        .map((item) => ({ ...item, roomId: room.id, roomName: room.name }))
    );
  }, [rooms, presets, activeCategory]);

  return (
    <div className={`app-shell ${theme === "dark" ? "dark-theme" : "light-theme"}${editorIsEntering ? " app-shell--entering" : ""}`}>
      <section className="top-control-card">
        <div className="top-control-grid">
          <div className="input-card top-input-card">
            <div className="top-input-meta-row">
              <div className="top-input-brand">
                <span className="pill">Furniture Manager</span>
                <div className="top-input-brand-copy">
                  <div className="top-input-title-row">
                    <h1 style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <Sliders size={20} />
                      Furniture Manager
                    </h1>
                  </div>
                  <p>Edit preset catalog dimensions and manage all placed furniture across rooms.</p>
                </div>
              </div>
            </div>
          </div>
          <aside className="project-actions-card input-card">
            <button className="primary-btn project-stack-btn" onClick={onBack}>
              <ArrowLeft size={16} />
              Back to Planner
            </button>
          </aside>
        </div>
      </section>

      <div style={{ padding: "0 24px 0", display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 0 }}>
        {PRODUCT_CATEGORIES.map((cat) => (
          <button
            key={cat}
            className={`view-toolbar-btn${activeCategory === cat ? " active" : ""}`}
            style={{ textTransform: "capitalize", marginBottom: 8 }}
            onClick={() => setActiveCategory(cat)}
          >
            {cat}
            {(() => {
              const cnt = rooms.flatMap((r) => r.furniture || []).filter((f) =>
                (FURNITURE_PRESETS[cat] || []).some((p) => p.type === f.type)
              ).length;
              return cnt > 0 ? (
                <span style={{ marginLeft: 6, background: "#3b82f6", color: "#fff", borderRadius: 10, padding: "1px 6px", fontSize: 11, fontWeight: 700 }}>
                  {cnt}
                </span>
              ) : null;
            })()}
          </button>
        ))}
      </div>

      <div style={{ padding: "12px 24px 32px", display: "flex", flexDirection: "column", gap: 24 }}>

        <section className="input-card" style={{ padding: 20 }}>
          <div className="section-header compact" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>Preset Catalog — <span style={{ textTransform: "capitalize" }}>{activeCategory}</span></h3>
              <p style={{ margin: 0, opacity: 0.65, fontSize: 13 }}>
                Customize default dimensions. Click "Apply to Placed" to update all matching items in your plan.
              </p>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 }}>
            {presets.map((preset) => {
              const custom = customPresetDimensions[preset.type] || {};
              const currentWidth  = custom.width  ?? preset.width;
              const currentDepth  = custom.depth  ?? preset.depth;
              const currentHeight = custom.height ?? preset.height;
              const placedCount   = placedCountByType[preset.type] || 0;
              const isModified = custom.width !== undefined || custom.depth !== undefined || custom.height !== undefined;

              return (
                <div
                  key={preset.type}
                  className="input-card"
                  style={{ padding: 16, border: isModified ? "1.5px solid #3b82f6" : undefined, position: "relative" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                    <div style={{ width: 16, height: 16, borderRadius: 4, background: preset.color, border: "1px solid #b0b8c4", flexShrink: 0 }} />
                    <strong style={{ fontSize: 13, flex: 1 }}>{preset.type}</strong>
                    {placedCount > 0 && (
                      <span style={{ fontSize: 11, background: "#e8f0fe", color: "#3b5fc0", borderRadius: 8, padding: "2px 8px", fontWeight: 600 }}>
                        {placedCount} placed
                      </span>
                    )}
                    {isModified && (
                      <span style={{ fontSize: 10, background: "#fff3cd", color: "#856404", borderRadius: 8, padding: "2px 6px", fontWeight: 600 }}>
                        modified
                      </span>
                    )}
                  </div>

                  <div className="form-grid two-col" style={{ gap: 10 }}>
                    <div className="field">
                      <label>Width (ft)</label>
                      <input
                        type="number" step="0.5" min="0.5"
                        value={currentWidth}
                        onChange={(e) => onUpdateCustomPreset(preset.type, "width", e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Depth (ft)</label>
                      <input
                        type="number" step="0.5" min="0.5"
                        value={currentDepth}
                        onChange={(e) => onUpdateCustomPreset(preset.type, "depth", e.target.value)}
                      />
                    </div>
                    <div className="field">
                      <label>Height (ft)</label>
                      <input
                        type="number" step="0.5" min="0.5"
                        value={currentHeight}
                        onChange={(e) => onUpdateCustomPreset(preset.type, "height", e.target.value)}
                      />
                    </div>
                    <div className="field" style={{ display: "flex", alignItems: "flex-end" }}>
                      <button
                        type="button"
                        className="secondary-btn"
                        style={{ width: "100%", fontSize: 12 }}
                        disabled={placedCount === 0}
                        title={placedCount === 0 ? "No placed items of this type" : `Update ${placedCount} placed item(s)`}
                        onClick={() =>
                          onApplyPresetToPlaced(preset.type, {
                            width:  currentWidth,
                            depth:  currentDepth,
                            height: currentHeight,
                          })
                        }
                      >
                        Apply to Placed ({placedCount})
                      </button>
                    </div>
                  </div>

                  {isModified && (
                    <button
                      type="button"
                      className="ghost-btn"
                      style={{ marginTop: 8, fontSize: 11, padding: "3px 8px" }}
                      onClick={() => onUpdateCustomPreset(preset.type, "__reset__", null)}
                    >
                      ↺ Reset to default ({preset.width} × {preset.depth} × {preset.height})
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <section className="input-card" style={{ padding: 20 }}>
          <div className="section-header compact" style={{ marginBottom: 16 }}>
            <div>
              <h3 style={{ marginBottom: 4 }}>Placed Furniture — <span style={{ textTransform: "capitalize" }}>{activeCategory}</span></h3>
              <p style={{ margin: 0, opacity: 0.65, fontSize: 13 }}>
                {placedItems.length === 0
                  ? "No furniture of this category is currently placed in any room."
                  : `${placedItems.length} item(s) placed across your rooms. Edit dimensions and rotation directly.`}
              </p>
            </div>
          </div>

          {placedItems.length === 0 ? (
            <div style={{ textAlign: "center", padding: "32px 0", opacity: 0.5, fontSize: 14 }}>
              Add furniture from this category in the main planner to see it here.
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 16 }}>
              {placedItems.map((item) => {
                const slab = isKitchenSlab(item);
                return (
                  <div key={`${item.roomId}-${item.id}`} className="input-card" style={{ padding: 14 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                      <div style={{ width: 12, height: 12, borderRadius: 3, background: item.color || "#ccc", border: "1px solid #b0b8c4", flexShrink: 0 }} />
                      <strong style={{ fontSize: 13, flex: 1 }}>{item.type}</strong>
                      <span style={{ fontSize: 11, opacity: 0.55 }}>in {item.roomName}</span>
                    </div>

                    <div className="form-grid two-col" style={{ gap: 8 }}>
                      <div className="field">
                        <label>Width (ft)</label>
                        <input
                          type="number" step="0.5" min="0.3"
                          value={item.width}
                          onChange={(e) => onUpdatePlacedFurniture(item.roomId, item.id, "width", e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Depth (ft)</label>
                        <input
                          type="number" step="0.5" min="0.3"
                          value={item.depth}
                          onChange={(e) => onUpdatePlacedFurniture(item.roomId, item.id, "depth", e.target.value)}
                        />
                      </div>
                      <div className="field">
                        <label>Height (ft)</label>
                        <input
                          type="number" step="0.5" min="0.3"
                          value={item.height}
                          onChange={(e) => onUpdatePlacedFurniture(item.roomId, item.id, "height", e.target.value)}
                        />
                      </div>
                      {!slab && (
                        <div className="field">
                          <label>Rotation (°)</label>
                          <input
                            type="number" step="15" min="0" max="360"
                            value={item.rotation || 0}
                            onChange={(e) => onUpdatePlacedFurniture(item.roomId, item.id, "rotation", e.target.value)}
                          />
                        </div>
                      )}
                    </div>

                    {!slab && (
                      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
                        {[0, 90, 180, 270].map((deg) => (
                          <button
                            key={deg}
                            type="button"
                            className={`ghost-btn${(item.rotation || 0) === deg ? " active" : ""}`}
                            style={{ flex: 1, fontSize: 11, padding: "4px 0", fontWeight: (item.rotation || 0) === deg ? 700 : 400 }}
                            onClick={() => onUpdatePlacedFurniture(item.roomId, item.id, "rotation", deg)}
                          >
                            {deg}°
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

async function svgElementToPngDataUrl(svgEl, outputWidth = 1600) {
  if (!svgEl) return "";
  const serializer = new XMLSerializer();
  const source = serializer.serializeToString(svgEl);
  const svgBlob = new Blob([source], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });
    const bbox = svgEl.getBoundingClientRect();
    const aspectRatio = bbox.width && bbox.height ? bbox.height / bbox.width : 0.6;
    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = Math.round(outputWidth * aspectRatio);
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/png");
  } finally { URL.revokeObjectURL(url); }
}

function createChatMessage(role, content) {
  return {
    id: typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID() : `chat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    role, content,
  };
}

function getSavedOpenAIApiKey() {
  if (typeof window === "undefined") return "";
  try { return window.localStorage.getItem(FLOOR_PLAN_OPENAI_KEY_STORAGE) || ""; } catch { return ""; }
}

function persistOpenAIApiKey(apiKey) {
  if (typeof window === "undefined" || !apiKey) return;
  try { window.localStorage.setItem(FLOOR_PLAN_OPENAI_KEY_STORAGE, apiKey); } catch {}
}

// ─── Main App ─────────────────────────────────────────────────────────────────

export default function App() {
  // ── App mode ──
  const [appMode, setAppMode] = useState("landing");
  const [editorIsEntering, setEditorIsEntering] = useState(false);
  const [isWelcomeEntering, setIsWelcomeEntering] = useState(false);
  const [generationStep, setGenerationStep] = useState("");
  const [layoutVariants, setLayoutVariants] = useState([]);

  // ── Core plan state ──
  const [planName,          setPlanName]          = useState("My Floor Plan");
  const [totalWidth,        setTotalWidth]        = useState(40);
  const [totalHeight,       setTotalHeight]       = useState(10);
  const [wallThickness,     setWallThickness]     = useState(WALL_THICKNESS_FT);
  const [roomThickness,     setRoomThickness]     = useState(ROOM_THICKNESS_FT);
  const [scale,             setScale]             = useState(DEFAULT_SCALE);
  const [roomHeight,        setRoomHeight]        = useState(DEFAULT_ROOM_HEIGHT);
  const [activeView,        setActiveView]        = useState("2d");
  const [selectedCategory,  setSelectedCategory]  = useState("house");
  const [rooms,             setRooms]             = useState(() => getDefaultRooms(40, 10));
  const [furnitureSelections, setFurnitureSelections] = useState({});
  const [globalWallColor,   setGlobalWallColor]   = useState(DEFAULT_WALL_COLOR);

  // ── Page navigation + custom preset dimensions ──
  const [activePage, setActivePage] = useState("planner"); // "planner" | "furniture-manager"
  const [customPresetDimensions, setCustomPresetDimensions] = useState({});

  // ── Theme ──
  const [theme, setTheme] = useState(() => {
    if (typeof window === "undefined") return "light";
    return window.localStorage.getItem(THEME_STORAGE_KEY) === "dark" ? "dark" : "light";
  });

  // ── Project state ──
  const [savedProjects,        setSavedProjects]        = useState([]);
  const [isProjectModalOpen,   setIsProjectModalOpen]   = useState(false);
  const [currentProjectId,     setCurrentProjectId]     = useState(null);
  const [projectStatusMessage, setProjectStatusMessage] = useState("");
  const [currentProjectPdfUrl, setCurrentProjectPdfUrl] = useState("");
  const isReadOnly3DViewer = useMemo(() => isReadOnlyViewerModeFromUrl(), []);
  const initialProjectIdFromUrl = useMemo(() => getProjectIdFromUrl(), []);
  const shouldForceUrlProjectTo3D = useMemo(
    () => isReadOnly3DViewer || getViewModeFromUrl() === "3d",
    [isReadOnly3DViewer]
  );
  const [expandedRoomIds,      setExpandedRoomIds]      = useState({});
  const [assistantCollapsed,   setAssistantCollapsed]   = useState(() => {
    if (!FEATURE_ASSISTANT_ENABLED) return true;
    if (typeof window === "undefined") return false;
    return window.sessionStorage.getItem(ASSISTANT_COLLAPSED_SESSION_KEY) === "true";
  });
  const [sunControlsCollapsed, setSunControlsCollapsed] = useState(true);
  const [renderQuality, setRenderQuality] = useState("high");
  const [sunSettings, setSunSettings] = useState(() => {
    if (typeof window === "undefined") return DEFAULT_SUN_SETTINGS;
    try {
      const raw = window.sessionStorage.getItem(SUN_SETTINGS_SESSION_KEY);
      return raw ? { ...DEFAULT_SUN_SETTINGS, ...JSON.parse(raw) } : DEFAULT_SUN_SETTINGS;
    } catch {
      return DEFAULT_SUN_SETTINGS;
    }
  });

  // ── Chat ──
  const [chatMessages,  setChatMessages]  = useState(() => [createChatMessage("assistant", "Hi, I can help you navigate the app, create layouts like 1BHK / 2BHK / office / cafe, and apply voice commands.")]);
  const [chatInput,     setChatInput]     = useState("");
  const [isChatbotBusy, setIsChatbotBusy] = useState(false);
  const [isListening,   setIsListening]   = useState(false);

  // ── Upload / render ──
  const [isFloorPlanUploading,  setIsFloorPlanUploading]  = useState(false);
  const [isRenderGenerating,    setIsRenderGenerating]    = useState(false);
  const [isPlanGenerating,      setIsPlanGenerating]      = useState(false);
  const [generatedRenderImage,  setGeneratedRenderImage]  = useState("");
  const [generatedRenderProjectId, setGeneratedRenderProjectId] = useState(null);

  // ── Furniture selection (for recommendations) ──
  const [selectedFurnitureContext, setSelectedFurnitureContext] = useState(null);

  const threeContainerRef      = useRef(null);
  const threeSceneStateRef     = useRef(null);
  const orbitControlsRef       = useRef(null);
  const chatScrollRef          = useRef(null);
  const speechRecognitionRef   = useRef(null);
  const fileUploadInputRef     = useRef(null);

  // ─── Derived state ──────────────────────────────────────────────────────────

  const placedRooms = useMemo(() =>
    rooms.map((room) => normalizeRoom(room, Number(totalWidth), Number(totalHeight), Number(roomHeight))),
    [rooms, totalWidth, totalHeight, roomHeight]
  );

  const wallSegments = useMemo(() =>
    buildWallSegments(placedRooms, Number(totalWidth), Number(totalHeight)),
    [placedRooms, totalWidth, totalHeight]
  );

  const selectedFurnitureDetails = useMemo(() => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) return null;
    if (!selectedFurnitureContext?.roomId || !selectedFurnitureContext?.furnitureId) return null;
    const room      = placedRooms.find((r) => r.id === selectedFurnitureContext.roomId);
    const furniture = room?.furniture?.find((f) => f.id === selectedFurnitureContext.furnitureId);
    if (!room || !furniture) return null;
    return { room, furniture };
  }, [placedRooms, selectedFurnitureContext]);

  const selectedFurnitureRecommendations = useMemo(() => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) return [];
    return selectedFurnitureDetails?.furniture?.type
      ? getFurnitureRecommendationItems(selectedFurnitureDetails.furniture.type)
      : [];
  }, [selectedFurnitureDetails]);

  const selectedFurnitureKey = selectedFurnitureContext
    ? `${selectedFurnitureContext.roomId}-${selectedFurnitureContext.furnitureId}`
    : null;

  const canOpenCurrentPlan = useMemo(() => isValidHttpUrl(currentProjectPdfUrl), [currentProjectPdfUrl]);

  const numericScale         = Math.max(1, Number(scale) || 1);
  const numericWallThickness = Math.max(0.1, Number(wallThickness) || WALL_THICKNESS_FT);
  const numericRoomThickness = Math.max(0.1, Number(roomThickness) || ROOM_THICKNESS_FT);
  const canvasWidth          = Number(totalWidth)  * numericScale;
  const canvasHeight         = Number(totalHeight) * numericScale;
  const svgWidth             = canvasWidth  + 120;
  const svgHeight            = canvasHeight + 120;
  const totalRoomArea        = placedRooms.reduce((sum, r) => sum + Number(r.width) * Number(r.height), 0);
  const totalPlanArea        = Number(totalWidth) * Number(totalHeight);
  const utilization          = totalPlanArea ? ((totalRoomArea / totalPlanArea) * 100).toFixed(1) : 0;

  // ─── Effects ────────────────────────────────────────────────────────────────

  useEffect(() => { refreshSavedProjects(); }, []);

  useEffect(() => {
    let isCancelled = false;

    if (!currentProjectId) {
      setCurrentProjectPdfUrl("");
      return () => {
        isCancelled = true;
      };
    }

    const localMatch = readProjectsFromStorage().find((project) => project.id === currentProjectId);
    const localPdfUrl = localMatch?.data?.pdf_drive_url || localMatch?.data?.pdfDriveUrl || "";
    if (localPdfUrl && isValidHttpUrl(localPdfUrl)) {
      setCurrentProjectPdfUrl(localPdfUrl);
    } else {
      setCurrentProjectPdfUrl("");
    }

    const loadProjectPdfUrl = async () => {
      try {
        const remoteProject = await fetchProjectFromGoogleSheets(currentProjectId);
        if (isCancelled || !remoteProject) return;
        const nextPdfUrl = remoteProject.pdf_drive_url || remoteProject.pdfDriveUrl || "";
        setCurrentProjectPdfUrl(isValidHttpUrl(nextPdfUrl) ? nextPdfUrl : "");
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to load project PDF URL:", error);
          setCurrentProjectPdfUrl("");
        }
      }
    };

    loadProjectPdfUrl();
    return () => {
      isCancelled = true;
    };
  }, [currentProjectId]);

  useEffect(() => {
    if (appMode !== "landing" && appMode !== "editor" && !FEATURE_AI_ENABLED) {
      setGenerationStep("");
      setLayoutVariants([]);
    }
  }, [appMode]);

  useEffect(() => {
    if (appMode !== "editor") return;
    setEditorIsEntering(true);
    const timer = window.setTimeout(() => setEditorIsEntering(false), 700);
    return () => window.clearTimeout(timer);
  }, [appMode]);

  useEffect(() => {
    if (!FEATURE_ASSISTANT_ENABLED) {
      setAssistantCollapsed(true);
      setChatInput("");
      setIsChatbotBusy(false);
      setIsListening(false);
    }
    if (!FEATURE_AI_RENDER_ENABLED) {
      setIsRenderGenerating(false);
    }
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) {
      setSelectedFurnitureContext(null);
    }
  }, []);

  useEffect(() => {
    const projectIdFromUrl = getProjectIdFromUrl();
    if (!projectIdFromUrl) return;
    let isCancelled = false;

    const openProjectFromUrl = async () => {
      const localProjects = readProjectsFromStorage();
      const localMatch = localProjects.find((project) => project.id === projectIdFromUrl);
      if (localMatch?.data) {
        if (isCancelled) return;
        applyProjectState(localMatch.data);
        if (shouldForceUrlProjectTo3D) setActiveView("3d");
        setCurrentProjectId(localMatch.id);
        setCurrentProjectPdfUrl(localMatch.data.pdf_drive_url || localMatch.data.pdfDriveUrl || "");
        setGeneratedRenderImage(localMatch.data.ai_render_image_base64 || "");
        setGeneratedRenderProjectId(localMatch.id);
        setProjectStatusMessage(`Opened "${localMatch.name}" from link.`);
        return;
      }

      try {
        const remoteProject = await fetchProjectFromGoogleSheets(projectIdFromUrl);
        if (isCancelled || !remoteProject) return;
        const rawState = remoteProject.project_state_json || remoteProject.projectStateJson || "";
        if (!rawState) {
          setProjectStatusMessage("Project link found, but no full saved state was available in Google Sheets.");
          return;
        }
        const parsedState = JSON.parse(rawState);
        applyProjectState(parsedState);
        if (shouldForceUrlProjectTo3D) setActiveView("3d");
        setCurrentProjectId(projectIdFromUrl);
        setCurrentProjectPdfUrl(remoteProject.pdf_drive_url || remoteProject.pdfDriveUrl || "");
        setGeneratedRenderImage(parsedState.ai_render_image_base64 || remoteProject.ai_render_image_base64 || "");
        setGeneratedRenderProjectId(projectIdFromUrl);
        setProjectStatusMessage(`Opened project from Google Sheets link.`);
      } catch (error) {
        if (!isCancelled) {
          console.error("Failed to open project from URL:", error);
          setProjectStatusMessage("Could not open the linked project.");
        }
      }
    };

    openProjectFromUrl();
    return () => {
      isCancelled = true;
    };
  }, [shouldForceUrlProjectTo3D]);

  useEffect(() => {
    setExpandedRoomIds((prev) => {
      const next = {};
      rooms.forEach((room) => {
        next[room.id] = Object.prototype.hasOwnProperty.call(prev, room.id) ? prev[room.id] : false;
      });
      return next;
    });
  }, [rooms]);

  useEffect(() => {
    if (!chatScrollRef.current) return;
    chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages, isChatbotBusy]);

  useEffect(() => {
    if (generatedRenderProjectId !== currentProjectId) setGeneratedRenderImage("");
  }, [currentProjectId, generatedRenderProjectId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [theme]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(ASSISTANT_COLLAPSED_SESSION_KEY, assistantCollapsed ? "true" : "false");
  }, [assistantCollapsed]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.sessionStorage.setItem(SUN_SETTINGS_SESSION_KEY, JSON.stringify(sunSettings));
  }, [sunSettings]);

  // ─── Helpers ────────────────────────────────────────────────────────────────

  const waitForViewRender = useCallback(async (view, delayMs = 250) => {
    setActiveView(view);
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, delayMs))));
  }, []);

  const capture2DImage = async () => {
    const svgEl = document.getElementById("floor-plan-svg");
    if (!svgEl) return "";
    return await svgElementToPngDataUrl(svgEl, 1600);
  };

  const capture3DImage = async () => {
    const canvas = threeContainerRef.current?.querySelector("canvas");
    const sceneState = threeSceneStateRef.current;
    if (!canvas || !sceneState?.gl || !sceneState?.scene || !sceneState?.camera) return "";

    const { gl, scene, camera } = sceneState;
    const controls = orbitControlsRef.current || null;
    const centerX = Number(totalWidth) / 2;
    const centerZ = Number(totalHeight) / 2;
    const maxPlanSpan = Math.max(Number(totalWidth) || 0, Number(totalHeight) || 0, 12);
    const topDistance = Math.max((Number(roomHeight) || DEFAULT_ROOM_HEIGHT) * 4, maxPlanSpan * 1.9);

    const prevPosition = camera.position.clone();
    const prevQuaternion = camera.quaternion.clone();
    const prevUp = camera.up.clone();
    const prevZoom = camera.zoom;
    const prevTarget = controls?.target?.clone?.() || null;

    try {
      camera.position.set(centerX, topDistance, centerZ + 0.001);
      camera.up.set(0, 0, -1);
      camera.lookAt(centerX, 0, centerZ);
      camera.updateProjectionMatrix?.();

      if (controls?.target) {
        controls.target.set(centerX, 0, centerZ);
        controls.update?.();
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      gl.render(scene, camera);
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    } finally {
      camera.position.copy(prevPosition);
      camera.quaternion.copy(prevQuaternion);
      camera.up.copy(prevUp);
      camera.zoom = prevZoom;
      camera.updateProjectionMatrix?.();

      if (controls?.target && prevTarget) {
        controls.target.copy(prevTarget);
        controls.update?.();
      }

      gl.render(scene, camera);
    }
  };

  const capture3DAngledImage = async () => {
    const canvas = threeContainerRef.current?.querySelector("canvas");
    const sceneState = threeSceneStateRef.current;
    if (!canvas || !sceneState?.gl || !sceneState?.scene || !sceneState?.camera) return "";

    const { gl, scene, camera } = sceneState;
    const controls = orbitControlsRef.current || null;
    const centerX = Number(totalWidth) / 2;
    const centerZ = Number(totalHeight) / 2;
    const maxPlanSpan = Math.max(Number(totalWidth) || 0, Number(totalHeight) || 0, 12);
    const angledDistance = Math.max((Number(roomHeight) || DEFAULT_ROOM_HEIGHT) * 2.2, maxPlanSpan * 0.95);

    const prevPosition = camera.position.clone();
    const prevQuaternion = camera.quaternion.clone();
    const prevUp = camera.up.clone();
    const prevZoom = camera.zoom;
    const prevTarget = controls?.target?.clone?.() || null;

    try {
      camera.position.set(
        centerX + angledDistance * 0.72,
        angledDistance * 0.95,
        centerZ + angledDistance * 0.42
      );
      camera.up.set(0, 1, 0);
      camera.lookAt(centerX, Math.max(1.2, (Number(roomHeight) || DEFAULT_ROOM_HEIGHT) * 0.32), centerZ);
      camera.updateProjectionMatrix?.();

      if (controls?.target) {
        controls.target.set(centerX, 0, centerZ);
        controls.update?.();
      }

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => window.setTimeout(resolve, 120))));
      gl.render(scene, camera);
      return canvas.toDataURL("image/png");
    } catch {
      return "";
    } finally {
      camera.position.copy(prevPosition);
      camera.quaternion.copy(prevQuaternion);
      camera.up.copy(prevUp);
      camera.zoom = prevZoom;
      camera.updateProjectionMatrix?.();

      if (controls?.target && prevTarget) {
        controls.target.copy(prevTarget);
        controls.update?.();
      }

      gl.render(scene, camera);
    }
  };

  const buildCurrentProjectData = () => ({
    planName,
    pdf_drive_url: currentProjectPdfUrl || "",
    ai_render_image_base64: generatedRenderImage || "",
    totalWidth, totalHeight, wallThickness, roomThickness, scale, roomHeight,
    activeView, selectedCategory,
    rooms, furnitureSelections,
    customPresetDimensions,
    assistantCollapsed: FEATURE_ASSISTANT_ENABLED ? assistantCollapsed : true,
    sunSettings,
    globalWallColor,
  });

  const applyProjectState = (projectState) => {
    const defaults  = getDefaultProjectState();
    const nextState = { ...defaults, ...(projectState || {}) };
    setPlanName(nextState.planName);
    setTotalWidth(Number(nextState.totalWidth)   || defaults.totalWidth);
    setTotalHeight(Number(nextState.totalHeight) || defaults.totalHeight);
    setWallThickness(Number(nextState.wallThickness) || defaults.wallThickness);
    setRoomThickness(Number(nextState.roomThickness) || defaults.roomThickness);
    setScale(Number(nextState.scale)           || defaults.scale);
    setRoomHeight(Number(nextState.roomHeight) || defaults.roomHeight);
    setActiveView(nextState.activeView === "3d" ? "3d" : "2d");
    setSelectedCategory(PRODUCT_CATEGORIES.includes(nextState.selectedCategory) ? nextState.selectedCategory : defaults.selectedCategory);
    const nextRooms = Array.isArray(nextState.rooms) && nextState.rooms.length ? nextState.rooms : defaults.rooms;
    setRooms(nextRooms);
    setExpandedRoomIds(Object.fromEntries(nextRooms.map((room) => [room.id, false])));
    setFurnitureSelections(nextState.furnitureSelections && typeof nextState.furnitureSelections === "object" ? nextState.furnitureSelections : {});
    setCustomPresetDimensions(
      nextState.customPresetDimensions && typeof nextState.customPresetDimensions === "object"
        ? nextState.customPresetDimensions : {}
    );
    setAssistantCollapsed(FEATURE_ASSISTANT_ENABLED ? Boolean(nextState.assistantCollapsed) : true);
    setSunSettings({
      ...DEFAULT_SUN_SETTINGS,
      ...(nextState.sunSettings && typeof nextState.sunSettings === "object" ? nextState.sunSettings : {}),
    });
    setGlobalWallColor(normalizeHexColor(nextState.globalWallColor, DEFAULT_WALL_COLOR));
  };

  const refreshSavedProjects = () => {
    const projects = readProjectsFromStorage().sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
    setSavedProjects(projects);
    return projects;
  };

  const formatProjectTimestamp = (value) => {
    if (!value) return "Saved just now";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Saved just now" : date.toLocaleString();
  };

  const appendChatMessage = (role, content) => setChatMessages((prev) => [...prev, createChatMessage(role, content)]);

  const handleEnterEditorFromWelcome = useCallback(() => {
    if (isWelcomeEntering) return;
    setIsWelcomeEntering(true);
    setGenerationStep("Preparing your premium workspace...");
    window.setTimeout(() => {
      setEditorIsEntering(true);
      setAppMode("editor");
      setIsWelcomeEntering(false);
      setGenerationStep("");
      window.setTimeout(() => setEditorIsEntering(false), 720);
    }, 650);
  }, [isWelcomeEntering]);

  const applyGeneratedPlan = (nextPlan, sourceLabel = "assistant") => {
    if (!nextPlan) return;
    applyProjectState({ ...buildCurrentProjectData(), ...nextPlan, activeView, wallThickness, scale, roomHeight, furnitureSelections: {} });
    setProjectStatusMessage(`Applied ${sourceLabel} layout: ${nextPlan.planName || getFriendlyCategoryName(nextPlan.selectedCategory)}`);
  };

  // ─── Landing page: generate layout with variants ──────────────────────────

  
const handleGenerateLayout = async (prompt) => {
    if (!FEATURE_AI_ENABLED) {
      setAppMode("editor");
      setGenerationStep("");
      setLayoutVariants([]);
      setProjectStatusMessage("AI layout generation is disabled.");
      return;
    }

    setAppMode("generating");

    try {
      setGenerationStep("Understanding your request...");
      await delay(420);

      setGenerationStep("Planning rooms...");
      await delay(320);

      const currentPlanState = buildCurrentProjectData();
      let basePlan = parseRuleBasedPlanCommand(prompt, currentPlanState);

      if (!basePlan) {
        const apiKey = getSavedOpenAIApiKey();
        if (apiKey) {
          try {
            setGenerationStep("Asking AI for the best layout...");
            basePlan = await generatePlanFromOpenAI(apiKey, prompt, currentPlanState);
          } catch (err) {
            console.warn("OpenAI failed, falling back to heuristics:", err);
          }
        }
      }

      if (!basePlan) {
        setGenerationStep("Using built-in templates...");
        await delay(200);

        const lower = String(prompt || "").toLowerCase();
        const dims = extractPlanDimensions(prompt) || {};
        const tw = Number(dims.totalWidth) || 40;
        const th = Number(dims.totalHeight) || 30;
        const shape = classifyShape(tw, th);

        let matched = false;
        for (const { test, fn } of PRESET_MATCHERS) {
          if (test.test(lower)) {
            const preset = fn(tw, th, shape);
            if (preset) {
              const rooms = materializeOpeningsForRooms(fitRoomsToShell(preset.rooms, tw, th));
              basePlan = {
                planName: preset.name,
                selectedCategory: preset.category,
                totalWidth: tw,
                totalHeight: th,
                rooms: normalizeGeneratedRooms(rooms, tw, th, preset.category),
                responseText: `Created a ${preset.name} from your description.`,
              };
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          const preset = presetOffice(tw, th, shape);
          const rooms = materializeOpeningsForRooms(fitRoomsToShell(preset.rooms, tw, th));
          basePlan = {
            planName: "My Floor Plan",
            selectedCategory: "office",
            totalWidth: tw,
            totalHeight: th,
            rooms: normalizeGeneratedRooms(rooms, tw, th, "office"),
            responseText: "Here is a default layout. You can customize it in the editor.",
          };
        }
      }

      setGenerationStep("Creating multiple options...");
      await delay(300);

      const variants = generateSmartVariants(basePlan);
      setLayoutVariants(variants);

      setGenerationStep("Done!");
      await delay(200);

      setAppMode("variant-selection");
    } catch (err) {
      console.error("Layout generation failed:", err);
      setGenerationStep("Something went wrong, switching to editor.");
      await delay(800);
      setAppMode("editor");
    }
  };

  // ─── Custom preset dimension handlers ────────────────────────────────────────

  const handleUpdateCustomPreset = useCallback((furnitureType, key, value) => {
    if (key === "__reset__") {
      setCustomPresetDimensions((prev) => {
        const next = { ...prev };
        delete next[furnitureType];
        return next;
      });
      return;
    }
    setCustomPresetDimensions((prev) => ({
      ...prev,
      [furnitureType]: {
        ...(prev[furnitureType] || {}),
        [key]: Math.max(0.3, Number(value) || 0.3),
      },
    }));
  }, []);

  const applyPresetDimensionsToAllPlaced = useCallback((furnitureType, newDimensions) => {
    setRooms((prev) =>
      prev.map((room) => ({
        ...room,
        furniture: (room.furniture || []).map((item) =>
          item.type === furnitureType
            ? { ...item, width: newDimensions.width, depth: newDimensions.depth, height: newDimensions.height }
            : item
        ),
      }))
    );
  }, []);

  // ─── Furniture selection ─────────────────────────────────────────────────────

  const handleFurnitureSelection = useCallback((room, furnitureItem) => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) {
      setSelectedFurnitureContext(null);
      return;
    }
    if (!room?.id || !furnitureItem?.id) return;
    const recommendationItems = getFurnitureRecommendationItems(furnitureItem.type);
    if (!recommendationItems.length) { setSelectedFurnitureContext(null); return; }
    const nextKey = `${room.id}-${furnitureItem.id}`;
    setSelectedFurnitureContext((prev) => {
      const prevKey = prev ? `${prev.roomId}-${prev.furnitureId}` : null;
      if (prevKey === nextKey) return null;
      return { roomId: room.id, furnitureId: furnitureItem.id };
    });
  }, []);

  const clearSelectedFurniture = useCallback(() => setSelectedFurnitureContext(null), []);

  // ─── Room operations ─────────────────────────────────────────────────────────

  const updateRoom = (id, key, value) =>
    setRooms((prev) => prev.map((room) => room.id === id ? { ...room, [key]: value } : room));

  const toggleRoomExpanded = (roomId) => {
    setExpandedRoomIds((prev) => ({ ...prev, [roomId]: !prev[roomId] }));
  };

  const addRoom = () => {
    const newRoom = createRoom(rooms.length);
    setRooms((prev) => [...prev, newRoom]);
    setExpandedRoomIds((prev) => ({ ...prev, [newRoom.id]: true }));
  };

  const removeRoom = (id) => {
    const remaining = rooms.filter((r) => r.id !== id);
    setRooms(remaining);
    setFurnitureSelections((prev) => { const next = { ...prev }; delete next[id]; return next; });
    setExpandedRoomIds((prev) => { const next = { ...prev }; delete next[id]; return next; });
  };

  const autoArrangeRooms = () => {
    setRooms(fitRoomsInGrid(rooms.map((r) => ({ ...r, width: Number(r.width), height: Number(r.height) })), Number(totalWidth), Number(totalHeight)));
  };

  const resetPlan = () => {
    applyProjectState(getDefaultProjectState());
    setCurrentProjectId(null);
    setCurrentProjectPdfUrl("");
    setGeneratedRenderImage("");
    setGeneratedRenderProjectId(null);
    setProjectStatusMessage("");
    syncProjectIdToUrl("");
  };

  // ─── Door / Window operations ────────────────────────────────────────────────

  const addDoorToRoom = (roomId) =>
    setRooms((prev) => prev.map((room) => room.id === roomId
      ? { ...room, doors: [...(room.doors || []), { wall: "top", offset: 0, width: DEFAULT_DOOR_WIDTH, height: DEFAULT_DOOR_HEIGHT }] }
      : room
    ));

  const addWindowToRoom = (roomId) =>
    setRooms((prev) => prev.map((room) => room.id === roomId
      ? { ...room, windows: [...(room.windows || []), { wall: "top", offset: 0, width: DEFAULT_WINDOW_WIDTH, height: DEFAULT_WINDOW_HEIGHT, sillHeight: DEFAULT_WINDOW_SILL_HEIGHT }] }
      : room
    ));

  const addCutoutToRoom = (roomId) =>
    setRooms((prev) => prev.map((room) => room.id === roomId
      ? { ...room, cutouts: [...(room.cutouts || []), { wall: "top", offset: 0, width: DEFAULT_DOOR_WIDTH, height: DEFAULT_DOOR_HEIGHT }] }
      : room
    ));

  const updateDoor = (roomId, index, key, value) =>
    setRooms((prev) => prev.map((room) => {
      if (room.id !== roomId) return room;
      const next = [...(room.doors || [])];
      next[index] = { ...next[index], [key]: key === "wall" ? value : Number(value) || 0 };
      return { ...room, doors: next };
    }));

  const updateWindow = (roomId, index, key, value) =>
    setRooms((prev) => prev.map((room) => {
      if (room.id !== roomId) return room;
      const next = [...(room.windows || [])];
      next[index] = { ...next[index], [key]: key === "wall" ? value : Number(value) || 0 };
      return { ...room, windows: next };
    }));

  const updateCutout = (roomId, index, key, value) =>
    setRooms((prev) => prev.map((room) => {
      if (room.id !== roomId) return room;
      const next = [...(room.cutouts || [])];
      next[index] = { ...next[index], [key]: key === "wall" ? value : Number(value) || 0 };
      return { ...room, cutouts: next };
    }));

  const removeDoor   = (roomId, index) => setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, doors:   (r.doors   || []).filter((_, i) => i !== index) } : r));
  const removeWindow = (roomId, index) => setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, windows: (r.windows || []).filter((_, i) => i !== index) } : r));
  const removeCutout = (roomId, index) => setRooms((prev) => prev.map((r) => r.id === roomId ? { ...r, cutouts: (r.cutouts || []).filter((_, i) => i !== index) } : r));

  // ─── Furniture operations ─────────────────────────────────────────────────────

  const updateFurniture = (roomId, furnitureId, key, value) => {
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== roomId) return room;
        const nextFurniture = (room.furniture || []).map((item) => {
          if (item.id !== furnitureId) return item;

                    if (key === "width") {
            const newWidth = Math.max(0.3, Number(value) || 0.3);
            if (isKitchenSlab(item)) return { ...item, width: newWidth, slabLength: newWidth };
            if (item.allowOutsideBuilding) return { ...item, width: newWidth };

            const bounds = getFurniturePlacementBounds(item, room, { width: newWidth });

            return {
              ...item,
              width: newWidth,
              x: clamp(Number(item.x) || bounds.minX, bounds.minX, bounds.maxX),
              y: clamp(Number(item.y) || bounds.minY, bounds.minY, bounds.maxY),
            };
          }

                    if (key === "depth") {
            const newDepth = Math.max(0.3, Number(value) || 0.3);
            if (isKitchenSlab(item)) return { ...item, depth: newDepth, slabDepth: newDepth };
            if (item.allowOutsideBuilding) return { ...item, depth: newDepth };

            const bounds = getFurniturePlacementBounds(item, room, { depth: newDepth });

            return {
              ...item,
              depth: newDepth,
              x: clamp(Number(item.x) || bounds.minX, bounds.minX, bounds.maxX),
              y: clamp(Number(item.y) || bounds.minY, bounds.minY, bounds.maxY),
            };
          }

          if (key === "height") {
            return { ...item, height: Math.max(0.3, Number(value) || 0.3) };
          }

                    if (key === "rotation") {
            const rotation = getNormalizedFurnitureRotation(value);
            if (item.allowOutsideBuilding) return { ...item, rotation };

            const bounds = getFurniturePlacementBounds(item, room, { rotation });

            return {
              ...item,
              rotation,
              x: clamp(Number(item.x) || bounds.minX, bounds.minX, bounds.maxX),
              y: clamp(Number(item.y) || bounds.minY, bounds.minY, bounds.maxY),
            };
          }


          if (isKitchenSlab(item)) {
            if (key === "attachedWall") return { ...item, attachedWall: value };
            if (key === "slabLength") {
              const wall = WALL_OPTIONS.includes(item.attachedWall) ? item.attachedWall : "bottom";
              const wallLen = wall === "top" || wall === "bottom" ? Number(room.width) : Number(room.height);
              return { ...item, slabLength: clamp(Number(value) || 1, 1, Math.max(1, wallLen - FURNITURE_WALL_CLEARANCE * 2)) };
            }
            if (key === "offset") {
              const wall = WALL_OPTIONS.includes(item.attachedWall) ? item.attachedWall : "bottom";
              const wallLen = wall === "top" || wall === "bottom" ? Number(room.width) : Number(room.height);
              const currentLen = Number(item.slabLength) || Number(item.width) || 1;
              return { ...item, offset: clamp(Number(value) || 0, 0, Math.max(0, wallLen - currentLen - FURNITURE_WALL_CLEARANCE * 2)) };
            }
            return item;
          }

                    if (key === "x" || key === "y") {
            const numericValue = Number(value) || 0;

            // Skip clamping for items that are allowed outside the building
            if (item.allowOutsideBuilding) {
              return { ...item, [key]: numericValue };
            }

            const bounds = getFurniturePlacementBounds(item, room);

            return {
              ...item,
              [key]: key === "x"
                ? clamp(numericValue, bounds.minX, bounds.maxX)
                : clamp(numericValue, bounds.minY, bounds.maxY),
            };
          }


          return item;
        });
        return { ...room, furniture: nextFurniture };
      })
    );
  };

  const addFurnitureToRoom = (roomId) => {
    const room = rooms.find((r) => r.id === roomId);
    if (!room) return;
    const categoryOptions = getFurnitureOptionsForCategory(selectedCategory);
    if (!categoryOptions.length) return;
    const selectedType = furnitureSelections[roomId] || getDefaultFurnitureSelection(selectedCategory);
    const preset = categoryOptions.find((item) => item.type === selectedType) || categoryOptions[0];

    const customDim = customPresetDimensions[preset.type] || {};
    const effectivePreset = {
      ...preset,
      width:  customDim.width  ?? preset.width,
      depth:  customDim.depth  ?? preset.depth,
      height: customDim.height ?? preset.height,
    };

    const isSlab = String(effectivePreset.type).toLowerCase() === "kitchen slab";
    setRooms((prev) =>
      prev.map((item) =>
        item.id === roomId
          ? {
              ...item,
              furniture: [
                ...(item.furniture || []),
                isSlab
                  ? { id: crypto.randomUUID(), type: effectivePreset.type, category: selectedCategory, width: effectivePreset.width, depth: effectivePreset.depth, height: effectivePreset.height, slabLength: effectivePreset.width, slabDepth: effectivePreset.depth, attachedWall: "bottom", offset: 0, rotation: 0, color: effectivePreset.color }
                  : {
                      id: crypto.randomUUID(), type: effectivePreset.type, category: selectedCategory,
                      width: effectivePreset.width, depth: effectivePreset.depth, height: effectivePreset.height,
                      x: FURNITURE_WALL_CLEARANCE, y: FURNITURE_WALL_CLEARANCE, rotation: 0, color: effectivePreset.color,
                      ...(effectivePreset.allowOutsideBuilding ? { allowOutsideBuilding: true } : {}),
                    },
              ],
            }
          : item
      )
    );
  };

  const removeFurniture = (roomId, furnitureId) =>
    setRooms((prev) => prev.map((room) =>
      room.id === roomId ? { ...room, furniture: (room.furniture || []).filter((item) => item.id !== furnitureId) } : room
    ));

  // ─── Project save / open ─────────────────────────────────────────────────────

  async function fetchProjectFromGoogleSheets(projectId) {
    if (!projectId) return null;
    const url = `${APPS_SCRIPT_URL}?projectId=${encodeURIComponent(projectId)}`;
    const response = await fetch(url, { method: "GET" });
    const rawText = await response.text();
    let result;
    try { result = JSON.parse(rawText); } catch { throw new Error(`Apps Script GET did not return valid JSON: ${rawText}`); }
    if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
    if (!result?.success) throw new Error(result?.message || "Apps Script GET failed.");
    const projects = Array.isArray(result?.projects) ? result.projects : [];
    return projects.find((item) => String(item.project_id || "").trim() === String(projectId).trim()) || null;
  }

  const buildGoogleSheetsPayload = async ({ projectId, safeName, image2D, image3D, image3DAngle }) => {
    const syncedRooms = placedRooms.slice(0, MAX_SYNC_ROOMS);
    const projectState = {
      ...buildCurrentProjectData(),
      planName: safeName,
      currentProjectId: projectId,
      rooms: placedRooms,
    };
    return {
      action: "saveProject",
      projectId,
      planName: safeName,
      savedAt: new Date().toISOString(),
      selectedCategory,
      totalWidth,
      totalHeight,
      wallThickness,
      scale,
      roomHeight,
      planSizeLabel: `${totalWidth} × ${totalHeight}`,
      totalRooms: placedRooms.length,
      totalRoomArea: Number(totalRoomArea.toFixed(2)),
      spaceUtilization: utilization,
      currentProjectId: projectId,
      quotationValue: "",
      quotationNotes: "",
      projectLink: buildProjectShareUrl(projectId),
      interactive3DViewUrl: buildReadOnly3DViewerUrl(projectId),
      projectStateJson: JSON.stringify(projectState),
      image2D,
      image3D,
      image3DAngle,
      ai_render_image_base64: generatedRenderImage || "",
      rooms: syncedRooms.map((room) => ({
        id: room.id || "",
        name: room.name || "",
        x: Number(room.x) || 0,
        y: Number(room.y) || 0,
        width: Number(room.width) || 0,
        height: Number(room.height) || 0,
        color: room.color || "",
        floorTextureId: room.floorTextureId || getDefaultFloorTextureId(),
        floorTileScale: Number(room.floorTileScale) || 1,
        doors: Array.isArray(room.doors) ? room.doors : [],
        windows: Array.isArray(room.windows) ? room.windows : [],
        cutouts: Array.isArray(room.cutouts) ? room.cutouts : [],
        furniture: Array.isArray(room.furniture) ? room.furniture : [],
      })),
    };
  };

  async function syncProjectToGoogleSheets(payload) {
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify(payload),
      redirect: "follow",
    });
    const rawText = await response.text();
    if (!rawText) throw new Error("Apps Script returned an empty response.");
    let result;
    try { result = JSON.parse(rawText); } catch { throw new Error(`Apps Script did not return valid JSON: ${rawText}`); }
    if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
    if (!result?.success) throw new Error(result?.message || "Apps Script returned success: false");
    return result;
  }

  const syncAiRenderToGoogleSheets = async (projectId, aiRenderImage) => {
    if (!FEATURE_AI_RENDER_ENABLED) return null;
    if (!projectId || !aiRenderImage) return null;
    const response = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
        "Accept": "application/json",
      },
      body: JSON.stringify({ action: "updateProjectAiRender", projectId, ai_render_image_base64: aiRenderImage }),
      redirect: "follow",
    });
    const rawText = await response.text();
    if (!rawText) throw new Error("AI render sync returned an empty response.");
    let result;
    try { result = JSON.parse(rawText); } catch { throw new Error(`AI render sync did not return valid JSON: ${rawText}`); }
    if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
    if (!result?.success) throw new Error(result?.message || "AI render sync failed.");
    return result;
  };

  const handleSaveProject = async () => {
    const existingProjects = readProjectsFromStorage();
    const projectId  = currentProjectId || createProjectId();
    const safeName   = String(planName || "").trim() || `Project ${existingProjects.length + 1}`;
    const projectRecord = { id: projectId, name: safeName, updatedAt: new Date().toISOString(), version: 1, data: { ...buildCurrentProjectData(), planName: safeName } };
    const nextProjects = currentProjectId
      ? existingProjects.map((p) => p.id === projectId ? projectRecord : p)
      : [projectRecord, ...existingProjects];
    writeProjectsToStorage(nextProjects);
    setCurrentProjectId(projectId); setPlanName(safeName);
    syncProjectIdToUrl(projectId);
    setSavedProjects(nextProjects.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0)));
    try {
      setProjectStatusMessage(`Saving "${safeName}" locally and syncing to Google Sheets...`);
      const previousView = activeView;
      let image2D = "", image3D = "", image3DAngle = "";
      if (GOOGLE_SHEETS_INCLUDE_CAPTURED_IMAGES) {
        if (previousView !== "2d") await waitForViewRender("2d", 320);
        image2D = await capture2DImage();
        if (previousView !== "3d") await waitForViewRender("3d", 650);
        image3D = await capture3DImage();
        image3DAngle = await capture3DAngledImage();
        if (previousView !== "3d") await waitForViewRender(previousView, 120);
      }
      const syncResult = await syncProjectToGoogleSheets(await buildGoogleSheetsPayload({ projectId: projectRecord.id, safeName, image2D, image3D, image3DAngle }));
      setProjectStatusMessage(syncResult?.warning ? `Saved "${safeName}" locally and synced to Google Sheets with a warning` : `Saved "${safeName}" locally and synced to Google Sheets`);
    } catch (error) {
      console.error("Google Sheets sync failed:", error);
      setProjectStatusMessage(error?.message || `Saved "${safeName}" locally, but Google Sheets sync failed`);
    }
  };

  const handleGeneratePlanDocument = async () => {
    if (isPlanGenerating) return;
    if (!currentProjectId) {
      setProjectStatusMessage("Please save the project first before generating the plan document.");
      return;
    }
    try {
      setIsPlanGenerating(true);
      setProjectStatusMessage("Generating plan PDF from saved project data...");
      const response = await fetch(APPS_SCRIPT_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          action: "generatePlanDocument",
          projectId: currentProjectId,
        }),
        redirect: "follow",
      });
      const rawText = await response.text();
      if (!rawText) throw new Error("Plan document generation returned an empty response.");
      let result;
      try {
        result = JSON.parse(rawText);
      } catch {
        throw new Error(`Plan document generation did not return valid JSON: ${rawText}`);
      }
      if (!response.ok) throw new Error(result?.message || `Request failed with status ${response.status}`);
      if (!result?.success) throw new Error(result?.message || "Plan document generation failed.");

      const pdfUrl = result?.pdf_url || result?.pdfUrl || "";
      const docUrl = result?.doc_url || result?.docUrl || "";
      setCurrentProjectPdfUrl(isValidHttpUrl(pdfUrl) ? pdfUrl : "");
      setProjectStatusMessage(result?.message || "Plan PDF generated successfully.");
      if (pdfUrl && typeof window !== "undefined") {
        window.open(pdfUrl, "_blank", "noopener,noreferrer");
      } else if (docUrl && typeof window !== "undefined") {
        window.open(docUrl, "_blank", "noopener,noreferrer");
      }
    } catch (error) {
      console.error("Plan document generation failed:", error);
      setProjectStatusMessage(error?.message || "Failed to generate the plan document.");
    } finally {
      setIsPlanGenerating(false);
    }
  };

  const handleOpenPlanDocument = () => {
    if (!canOpenCurrentPlan || typeof window === "undefined") return;
    window.open(currentProjectPdfUrl, "_blank", "noopener,noreferrer");
  };

  const handleOpenProjectClick = () => { refreshSavedProjects(); setIsProjectModalOpen(true); setProjectStatusMessage(""); };

  const handleOpenSavedProject = (projectId) => {
    const projects = readProjectsFromStorage();
    const selected = projects.find((p) => p.id === projectId);
    if (!selected?.data) return;
    applyProjectState(selected.data);
    setCurrentProjectId(selected.id);
    setCurrentProjectPdfUrl(selected.data.pdf_drive_url || selected.data.pdfDriveUrl || "");
    setGeneratedRenderImage(selected.data.ai_render_image_base64 || "");
    setGeneratedRenderProjectId(selected.id);
    syncProjectIdToUrl(selected.id);
    setIsProjectModalOpen(false);
    setProjectStatusMessage(`Opened "${selected.name}"`);
  };

  const handleNewProject = () => {
    if (!window.confirm("Start a new project? Unsaved changes may be lost.")) return;
    resetPlan(); setIsProjectModalOpen(false);
  };

  // ─── Upload / AI render ──────────────────────────────────────────────────────

  const handleUploadFloorPlanClick = useCallback(() => {
    if (!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED) return;
    if (!isFloorPlanUploading) fileUploadInputRef.current?.click();
  }, [isFloorPlanUploading]);

  const handleFloorPlanImageSelected = async (event) => {
    const file = event.target.files?.[0]; event.target.value = "";
    if (!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED) {
      setProjectStatusMessage("Upload Floor Plan is disabled.");
      return;
    }
    if (!file) return;
    try {
      setIsFloorPlanUploading(true); setProjectStatusMessage(`Analyzing "${file.name}" with ChatGPT...`);
      const apiKey = getSavedOpenAIApiKey();
      if (!apiKey) throw new Error("OpenAI API key not found in localStorage. Save it under floor-plan-openai-api-key first.");
      persistOpenAIApiKey(apiKey);
      const aiPlan = await analyzeFloorPlanImageWithOpenAI(apiKey, file, buildCurrentProjectData());
      if (!aiPlan || !Array.isArray(aiPlan.rooms) || !aiPlan.rooms.length) throw new Error("ChatGPT could not detect any rooms from this image.");
      applyGeneratedPlan({ ...aiPlan, activeView: "2d" }, "ChatGPT");
      setExpandedRoomIds(Object.fromEntries((aiPlan.rooms || []).map((room) => [room.id, true]))); setActiveView("2d");
      setProjectStatusMessage(`Floor plan uploaded successfully from "${file.name}".`);
    } catch (error) {
      console.error("Floor plan upload failed:", error);
      setProjectStatusMessage(error?.message || "Failed to analyze floor plan image.");
    } finally { setIsFloorPlanUploading(false); }
  };

  const handleGenerateRenderImages = async () => {
    if (!FEATURE_AI_RENDER_ENABLED || !FEATURE_AI_ENABLED) {
      setProjectStatusMessage("AI Render is disabled.");
      return;
    }
    if (isRenderGenerating) return;
    if (!currentProjectId) { setProjectStatusMessage("Please save the project first before generating AI renders."); return; }
    try {
      setIsRenderGenerating(true); setProjectStatusMessage("Generating realistic AI renders...");
      const apiKey = getSavedOpenAIApiKey();
      if (!apiKey) throw new Error("OpenAI API key not found in localStorage.");
      persistOpenAIApiKey(apiKey);
      const previousView = activeView;
      let image2D = "", image3D = "";
      if (previousView !== "2d") await waitForViewRender("2d", 350);
      image2D = await capture2DImage();
      if (previousView !== "3d") await waitForViewRender("3d", 700);
      image3D = await capture3DImage();
      if (previousView !== "3d") await waitForViewRender(previousView, 120);
      const generatedImage = await generatePlanRendersWithOpenAI(apiKey, { planName, selectedCategory, totalWidth, totalHeight, rooms: placedRooms, image2D, image3D });
      setGeneratedRenderImage(generatedImage); setGeneratedRenderProjectId(currentProjectId);
      await syncAiRenderToGoogleSheets(currentProjectId, generatedImage);
      setProjectStatusMessage("AI render generated successfully and synced to Google Sheets.");
    } catch (error) {
      console.error("AI render generation failed:", error);
      setProjectStatusMessage(error?.message || "Failed to generate AI render. Please try again.");
    } finally { setIsRenderGenerating(false); if (activeView !== "3d") setActiveView("3d"); }
  };

  // ─── Voice / Chat ────────────────────────────────────────────────────────────

  const handleStartVoiceInput = () => {
    if (!FEATURE_ASSISTANT_ENABLED || !FEATURE_AI_ENABLED) return;
    const SR = typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null;
    if (!SR) { appendChatMessage("assistant", "Voice input is not supported in this browser."); return; }
    if (isListening && speechRecognitionRef.current) { speechRecognitionRef.current.stop(); return; }
    const recognition = new SR();
    recognition.lang = "en-US"; recognition.interimResults = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => setIsListening(true);
    recognition.onend   = () => setIsListening(false);
    recognition.onerror = () => { setIsListening(false); appendChatMessage("assistant", "Could not capture voice command."); };
    recognition.onresult = (e) => setChatInput(e?.results?.[0]?.[0]?.transcript || "");
    speechRecognitionRef.current = recognition; recognition.start();
  };

  const handleChatSubmit = async (event) => {
    event?.preventDefault?.();
    if (!FEATURE_ASSISTANT_ENABLED || !FEATURE_AI_ENABLED) return;
    const trimmed = String(chatInput || "").trim();
    if (!trimmed || isChatbotBusy) return;
    appendChatMessage("user", trimmed);
    setChatInput("");
    setIsChatbotBusy(true);
    try {
      appendChatMessage("assistant", "Working on a few layout options for you.");
      await handleGenerateLayout(trimmed);
    } catch (error) {
      console.error("Chatbot command failed:", error);
      appendChatMessage("assistant", "I could not prepare layout options. Please try a simpler instruction.");
    } finally {
      setIsChatbotBusy(false);
    }
  };

  const exportSVG = () => {
    const svgEl = document.getElementById("floor-plan-svg");
    if (!svgEl) return;
    const source = new XMLSerializer().serializeToString(svgEl);
    const url = URL.createObjectURL(new Blob([source], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `${planName.replace(/\s+/g, "_").toLowerCase() || "floor-plan"}.svg`;
    link.click(); URL.revokeObjectURL(url);
  };

  // ─── Render helpers ──────────────────────────────────────────────────────────

  const renderFurnitureRecommendations = () => {
    if (!FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED) return null;
    if (!selectedFurnitureDetails || !selectedFurnitureRecommendations.length) return null;
    return (
      <div className="furniture-recommendation-panel">
        <div className="section-header compact furniture-recommendation-header">
          <div>
            <h3>Selected Furniture Recommendations</h3>
            <p>Showing Amazon options for {selectedFurnitureDetails.furniture.type} in {selectedFurnitureDetails.room.name || "Room"}.</p>
          </div>
          <button type="button" className="icon-btn" onClick={clearSelectedFurniture} aria-label="Close recommendations"><X size={16} /></button>
        </div>
        <div className="furniture-recommendation-grid">
          {selectedFurnitureRecommendations.map((product) => (
            <a key={product.id} className="furniture-product-card" href={product.url} target="_blank" rel="noreferrer">
              <div className="furniture-product-image-wrap">
                <img src={resolveAssetPath(product.image)} alt={product.title} className="furniture-recommendation-image" loading="lazy" onError={(e) => { e.currentTarget.src = resolveAssetPath("products/bed-wooden.jpg"); }} />
              </div>
              <div className="furniture-product-body">
                <span className="furniture-product-label">Amazon Option</span>
                <strong>{product.title}</strong>
                <span className="furniture-product-price">{product.price}</span>
                <span className="furniture-product-link">Open on Amazon <ExternalLink size={14} /></span>
              </div>
            </a>
          ))}
        </div>
      </div>
    );
  };

  const furnitureOptions = getFurnitureOptionsForCategory(selectedCategory);

  // ─── Mode routing ─────────────────────────────────────────────────────────────

  // Landing page
  if (appMode === "landing" || appMode === "generating") {
    return (
      <LandingPage
        theme={theme}
        isGenerating={appMode === "generating"}
        generationStep={generationStep}
        isEntering={isWelcomeEntering}
        onGenerate={handleGenerateLayout}
        onContinueWithout={handleEnterEditorFromWelcome}
      />
    );
  }

  // Variant selection
  if (appMode === "variant-selection") {
    return (
      <VariantSelectionPage
        variants={layoutVariants}
        theme={theme}
        onBack={() => setAppMode("editor")}
        editorIsEntering={editorIsEntering}
        onSelect={(variant) => {
          applyGeneratedPlan(variant, "AI");
          setAppMode("editor");
        }}
      />
    );
  }

  // ─── Furniture Manager Page render ───────────────────────────────────────────

  if (activePage === "furniture-manager") {
    return (
      <FurnitureManagerPage
        rooms={rooms}
        theme={theme}
        customPresetDimensions={customPresetDimensions}
        onUpdateCustomPreset={handleUpdateCustomPreset}
        onUpdatePlacedFurniture={updateFurniture}
        onApplyPresetToPlaced={applyPresetDimensionsToAllPlaced}
        onBack={() => setActivePage("planner")}
        editorIsEntering={editorIsEntering}
      />
    );
  }

  const viewerPlacedRooms = placedRooms;
  const viewerWallSegments = wallSegments;
  const isViewerLoading =
    isReadOnly3DViewer &&
    Boolean(initialProjectIdFromUrl) &&
    String(currentProjectId || "").trim() !== String(initialProjectIdFromUrl || "").trim();

  if (isReadOnly3DViewer) {
    return (
      <ReadOnly3DViewerShell
        planName={planName}
        totalWidth={totalWidth}
        totalHeight={totalHeight}
        roomHeight={roomHeight}
        wallThickness={wallThickness}
        placedRooms={viewerPlacedRooms}
        wallSegments={viewerWallSegments}
        sunSettings={sunSettings}
        globalWallColor={globalWallColor}
        orbitControlsRef={orbitControlsRef}
        isLoading={isViewerLoading}
        statusMessage={projectStatusMessage}
      />
    );
  }

  // ─── Main Planner render ─────────────────────────────────────────────────────

  return (
    <div className={`app-shell ${theme === "dark" ? "dark-theme" : "light-theme"}`}>
      <input ref={fileUploadInputRef} type="file" accept="image/png,image/jpeg,image/jpg" style={{ display: "none" }} onChange={handleFloorPlanImageSelected} disabled={!FEATURE_UPLOAD_FLOOR_PLAN_ENABLED || !FEATURE_AI_ENABLED} />

      {/* Project Modal */}
      {isProjectModalOpen && (
        <div className="project-modal-overlay" onClick={() => setIsProjectModalOpen(false)}>
          <div className="project-modal" onClick={(e) => e.stopPropagation()}>
            <div className="project-modal-header">
              <div><h3>Open Project</h3><p>Select a saved project to restore your design.</p></div>
              <button className="icon-btn" onClick={() => setIsProjectModalOpen(false)} aria-label="Close"><X size={16} /></button>
            </div>
            <div className="project-modal-body">
              {savedProjects.length === 0 ? (
                <div className="project-empty-state">No saved projects yet.</div>
              ) : (
                <div className="project-list">
                  {savedProjects.map((project) => (
                    <button key={project.id} className="project-item" onClick={() => handleOpenSavedProject(project.id)}>
                      <div className="project-item-meta">
                        <strong className="project-item-title">{project.name}</strong>
                        <span className="project-item-subtext">{project.data?.rooms?.length || 0} rooms • {project.data?.selectedCategory || "office"} • {formatProjectTimestamp(project.updatedAt)}</span>
                      </div>
                      <span className="project-item-open">Open</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Workspace */}
      <div className="workspace-grid">
        <main className="workspace-main">
          {/* Top Control */}
          <section className="top-control-card">
            <div className="top-control-grid top-control-grid--premium">
              <div className="input-card top-input-card top-input-card--premium">
                <div className="top-toolbar-row top-toolbar-row--header">
                  <div className="project-actions-card project-actions-card--toolbar input-card">
                    <button className="ghost-btn project-stack-btn" onClick={handleNewProject}><FilePlus2 size={14} />New Project</button>
                    <button className="secondary-btn project-stack-btn" onClick={handleOpenProjectClick}><FolderOpen size={14} />Open</button>
                    <button className="primary-btn project-stack-btn" onClick={handleSaveProject}><Save size={14} />Save</button>
                    <button className="secondary-btn project-stack-btn" onClick={() => setActivePage("furniture-manager")}><Sliders size={14} />Furniture Manager</button>
                    <button
                      className="secondary-btn project-stack-btn"
                      onClick={handleGeneratePlanDocument}
                      disabled={isPlanGenerating}
                      title={!currentProjectId ? "Save the project first" : "Generate plan PDF"}
                    >
                      <ExternalLink size={14} />
                      {isPlanGenerating ? "Generating Plan..." : "Generate Plan"}
                    </button>
                    <button
                      className="secondary-btn project-stack-btn open-plan-btn"
                      onClick={handleOpenPlanDocument}
                      disabled={!canOpenCurrentPlan}
                      title={canOpenCurrentPlan ? "Open generated plan PDF" : "No generated plan PDF available for this project yet"}
                    >
                      <FolderOpen size={14} />
                      Open Plan
                    </button>
                    {FEATURE_AI_LANDING_ENABLED && FEATURE_AI_ENABLED && (
                      <button className="ghost-btn project-stack-btn" onClick={() => setAppMode("landing")}>
                        <Sparkles size={14} />
                        AI Landing
                      </button>
                    )}
                  </div>
                </div>

                <div className="top-input-meta-row top-input-meta-row--premium">
                 <div className="top-input-brand">
  <img
    src={resolveAssetPath("pwa-512.png")}
    alt="Floora"
    className="header-brand-logo"
    style={{
      height: 34,
      width: 34,
      objectFit: "contain",
      flexShrink: 0,
      borderRadius: 8,
    }}
  />
  <div className="top-input-brand-copy">
    <div className="top-input-title-row">
      <h1><Home size={16} />Premium Floor Plan Designer</h1>
    </div>
    <p>Build your dream space today and walk through it in 3D instantly</p>
  </div>
</div>

                  <div className="top-input-meta-actions">
                    <div className="top-input-title-controls">
                      <button type="button" className="theme-toggle" onClick={() => setTheme((p) => p === "dark" ? "light" : "dark")} aria-label="Toggle theme">
                        <span className={`theme-toggle-option ${theme === "light" ? "is-active" : ""}`}><Sun size={12} />Light</span>
                        <span className={`theme-toggle-option ${theme === "dark"  ? "is-active" : ""}`}><Moon size={12} />Dark</span>
                      </button>
                    </div>
                    {projectStatusMessage && (
                      <div className="project-status-banner project-status-banner--inline">{projectStatusMessage}</div>
                    )}
                  </div>
                </div>

                <div className="plan-config-shell">
                  <div className="plan-config-group plan-config-group--primary">
                    <div className="field field--compact-plan-name field--span-2"><label>Plan Name</label><input value={planName} onChange={(e) => setPlanName(e.target.value)} /></div>
                    <div className="field field--compact"><label>Total Width (ft)</label><input type="number" value={totalWidth} onChange={(e) => setTotalWidth(Number(e.target.value) || 0)} /></div>
                    <div className="field field--compact"><label>Total Height (ft)</label><input type="number" value={totalHeight} onChange={(e) => setTotalHeight(Number(e.target.value) || 0)} /></div>
                    <div className="field field--compact"><label>Wall Thickness (ft)</label><input type="number" step="0.1" value={wallThickness} onChange={(e) => setWallThickness(Number(e.target.value) || 0)} /></div>
                    <div className="field field--compact"><label>Room Thickness (ft)</label><input type="number" step="0.1" value={roomThickness} onChange={(e) => setRoomThickness(Number(e.target.value) || 0)} /></div>

                    <div className="field field--compact"><label>Scale (px / ft)</label><input type="number" value={scale} onChange={(e) => setScale(Number(e.target.value) || 1)} /></div>
                  </div>

                  <div className="plan-config-group plan-config-group--secondary">
                    <div className="field field--compact"><label>3D Wall Height (ft)</label><input type="number" value={roomHeight} onChange={(e) => setRoomHeight(Number(e.target.value) || 10)} /></div>
                    <div className="field field--compact">
                      <label>Product Category</label>
                      <select value={selectedCategory} onChange={(e) => setSelectedCategory(e.target.value)}>
                        {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="field field--compact field--color-inline">
                      <label><PaintBucket size={12} style={{ marginRight: 6, verticalAlign: "middle" }} />Wall Color</label>
                      <input
                        type="color"
                        value={globalWallColor}
                        onChange={(e) => setGlobalWallColor(e.target.value)}
                        className="wall-color-input"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </section>
          {/* Stats */}
          <section className="preview-stats-row">
            <div className="summary-box stat-box"><span>Plan Size</span><strong>{totalWidth} × {totalHeight}</strong></div>
            <div className="summary-box stat-box"><span>Total Rooms</span><strong>{placedRooms.length}</strong></div>
            <div className="summary-box stat-box"><span>Room Area</span><strong>{totalRoomArea.toFixed(0)} sq ft</strong></div>
            <div className="summary-box stat-box"><span>Space Utilization</span><strong>{utilization}%</strong></div>
          </section>

          <div
            className={`workspace-content-grid${!FEATURE_ASSISTANT_ENABLED ? " workspace-content-grid--full" : ""}`}
            style={FEATURE_ASSISTANT_ENABLED && assistantCollapsed ? { display: "flex", gap: 0 } : undefined}
          >
            {/* Preview column */}
            <div className="workspace-preview-column" style={FEATURE_ASSISTANT_ENABLED && assistantCollapsed ? { flex: 1, minWidth: 0 } : undefined}>
              {/* 2D View */}
              {activeView === "2d" && (
                <section className="preview-card preview-card--dominant">
                  <div className="section-header section-header--preview">
                    <h2>2D Floor Plan</h2>
                    <div className="preview-toolbar">
                      {FEATURE_UPLOAD_FLOOR_PLAN_ENABLED && FEATURE_AI_ENABLED && (
                        <button className="view-toolbar-btn upload-floor-plan-btn" onClick={handleUploadFloorPlanClick} disabled={isFloorPlanUploading}>
                          {isFloorPlanUploading ? "Uploading..." : "Upload Floor Plan"}
                        </button>
                      )}
                      <button className={`view-toolbar-btn${activeView === "2d" ? " active" : ""}`} onClick={() => setActiveView("2d")}>2D</button>
                      <button className={`view-toolbar-btn${activeView === "3d" ? " active" : ""}`} onClick={() => setActiveView("3d")}>3D</button>
                      <button className="view-toolbar-btn view-toolbar-btn--dark" onClick={exportSVG}>Export SVG</button>
                    </div>
                  </div>

                  <div className="svg-wrap svg-wrap--dominant" onClick={clearSelectedFurniture}>
                    <svg id="floor-plan-svg" viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%">
                      <defs>
                        <pattern id="smallGrid" width="10" height="10" patternUnits="userSpaceOnUse">
                          <path d="M 10 0 L 0 0 0 10" fill="none" stroke="#dbe3ec" strokeWidth="1" />
                        </pattern>
                        <pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">
                          <rect width="50" height="50" fill="url(#smallGrid)" />
                          <path d="M 50 0 L 0 0 0 50" fill="none" stroke="#bdd0e8" strokeWidth="1" />
                        </pattern>
                        {placedRooms.map((room) => {
                          const textureMeta = getFloorTextureById(room.floorTextureId);
                          const tileScale = Math.max(0.25, Math.min(4, Number(room.floorTileScale) || 1));
                          const patternWidth = Math.max(8, Number(textureMeta.tileWidth || 1) * numericScale * tileScale);
                          const patternHeight = Math.max(8, Number(textureMeta.tileHeight || 1) * numericScale * tileScale);
                          const patternId = `floor-pattern-${String(room.id).replace(/[^a-zA-Z0-9_-]/g, "")}`;
                          return (
                            <pattern key={patternId} id={patternId} width={patternWidth} height={patternHeight} patternUnits="userSpaceOnUse">
                              <image
                                href={resolveAssetPath(textureMeta.image)}
                                x="0"
                                y="0"
                                width={patternWidth}
                                height={patternHeight}
                                preserveAspectRatio="none"
                              />
                            </pattern>
                          );
                        })}
                      </defs>
                      <rect width={svgWidth} height={svgHeight} fill="#ffffff" />
                      <g transform="translate(60,60)">
                        <rect width={canvasWidth} height={canvasHeight} fill="url(#grid)" />
                        <rect x={0} y={0} width={canvasWidth} height={canvasHeight} fill="none" stroke="#5f6f86" strokeWidth={Math.max(3, numericWallThickness * numericScale)} />

                        {placedRooms.map((room) => {
                          const x = room.x * numericScale, y = room.y * numericScale;
                          const w = room.width * numericScale, h = room.height * numericScale;
                          return (
                            <g key={room.id}>
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill={`url(#floor-pattern-${String(room.id).replace(/[^a-zA-Z0-9_-]/g, "")})`}
                                opacity={0.24}
                              />
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill={room.color || "#f8fbff"}
                                opacity={0.82}
                              />
                              <rect
                                x={x}
                                y={y}
                                width={w}
                                height={h}
                                fill="none"
                                stroke={globalWallColor}
                                 strokeWidth={Math.max(2, numericRoomThickness * numericScale)}

                              />
                            </g>
                          );
                        })}

                        {placedRooms.map((room) => {
                          const { doors, windows, cutouts } = getRoomOpenings(room, Number(roomHeight));
                          return (
                            <g key={`openings-${room.id}`}>
                              {doors.map((door, idx) => <Opening2D key={`door-${room.id}-${idx}`} room={room} opening={door} scale={numericScale} wallThickness={numericWallThickness} />)}
                              {windows.map((win, idx) => <Opening2D key={`win-${room.id}-${idx}`} room={room} opening={win} scale={numericScale} wallThickness={numericWallThickness} />)}
                              {cutouts.map((cutout, idx) => <Opening2D key={`cutout-${room.id}-${idx}`} room={room} opening={cutout} scale={numericScale} wallThickness={numericWallThickness} />)}
                            </g>
                          );
                        })}

                        {placedRooms.map((room) => {
                          const furnitureLabelOffsets = computeFurnitureLabelOffsets(room.furniture || [], room, numericScale);
                          return (
                            <g key={`furniture-${room.id}`}>
                              {(room.furniture || []).map((item) => (
                                <Furniture2D key={item.id} room={room} furnitureItem={item} scale={numericScale}
                                  labelDy={furnitureLabelOffsets[item.id] || 0}
                                  isSelected={selectedFurnitureKey === `${room.id}-${item.id}`}
                                  onSelect={(sel) => handleFurnitureSelection(room, sel)} />
                              ))}
                            </g>
                          );
                        })}

                        {placedRooms.map((room) => {
                          const x = room.x * numericScale, y = room.y * numericScale;
                          const w = room.width * numericScale, h = room.height * numericScale;
                          const nfs = Math.max(4.2, Math.min(5.6, Math.min(w, h) * 0.052));
                          const dfs = Math.max(3.5, Math.min(4.6, Math.min(w, h) * 0.041));
                          const roomSizeText = `${room.width} ft × ${room.height} ft`;
                          const estimatedLabelWidth = Math.max(54, room.name.length * nfs * 0.62, roomSizeText.length * dfs * 0.58) + 16;
                          const labelBoxHeight = 18;
                          const labelCenterX = x + w / 2;
                          const labelTopY = y + h + 8;
                          return (
                            <g key={`labels-${room.id}`}>
                              <rect
                                x={labelCenterX - estimatedLabelWidth / 2}
                                y={labelTopY}
                                width={estimatedLabelWidth}
                                height={labelBoxHeight}
                                rx={7}
                                fill="rgba(255,255,255,0.92)"
                                stroke="rgba(143,160,184,0.42)"
                                strokeWidth="0.7"
                              />
                              <text x={labelCenterX} y={labelTopY + 7.0} textAnchor="middle" style={{ fontSize: nfs, fontWeight: 700, fill: "#172033", opacity: 0.88, pointerEvents: "none" }}>{room.name}</text>
                              <text x={labelCenterX} y={labelTopY + 13.3} textAnchor="middle" style={{ fontSize: dfs, fill: "#56637a", opacity: 0.92, pointerEvents: "none" }}>{roomSizeText}</text>
                            </g>
                          );
                        })}

                        <text x={canvasWidth / 2} y={-18} textAnchor="middle" style={{ fontSize: 7, fontWeight: 600, fill: "#324257", opacity: 0.88, letterSpacing: "0.2px" }}>Width: {totalWidth} ft</text>
                        <text x={-18} y={canvasHeight / 2} textAnchor="middle" transform={`rotate(-90, -18, ${canvasHeight / 2})`} style={{ fontSize: 7, fontWeight: 600, fill: "#324257", opacity: 0.88, letterSpacing: "0.2px" }}>Height: {totalHeight} ft</text>
                      </g>
                    </svg>
                  </div>

                  {renderFurnitureRecommendations()}
                </section>
              )}

              {/* 3D View */}
              {activeView === "3d" && (
                <section className="preview-card preview-card--dominant">
                  <div className="section-header section-header--preview">
                    <h2>3D Floor Plan</h2>
                    <div className="preview-toolbar">
                      {FEATURE_UPLOAD_FLOOR_PLAN_ENABLED && FEATURE_AI_ENABLED && (
                        <button className="view-toolbar-btn upload-floor-plan-btn" onClick={handleUploadFloorPlanClick} disabled={isFloorPlanUploading}>
                          {isFloorPlanUploading ? "Uploading..." : "Upload Floor Plan"}
                        </button>
                      )}
                      <button className={`view-toolbar-btn${activeView === "2d" ? " active" : ""}`} onClick={() => setActiveView("2d")}>2D</button>
                      <button className={`view-toolbar-btn${activeView === "3d" ? " active" : ""}`} onClick={() => setActiveView("3d")}>3D</button>
                      <div className="quality-toggle-group">
                        <button className={`view-toolbar-btn${renderQuality === "low" ? " active" : ""}`} onClick={() => setRenderQuality("low")}>Low Quality</button>
                        <button className={`view-toolbar-btn${renderQuality === "high" ? " active" : ""}`} onClick={() => setRenderQuality("high")}>High Quality</button>
                      </div>
                      <button className="view-toolbar-btn view-toolbar-btn--dark" onClick={exportSVG}>Export SVG</button>
                      {FEATURE_AI_RENDER_ENABLED && FEATURE_AI_ENABLED && (
                        <button
                          className="view-toolbar-btn view-toolbar-btn--dark ai-render-btn"
                          onClick={handleGenerateRenderImages}
                          disabled={!currentProjectId || isRenderGenerating}
                          title={!currentProjectId ? "Save the project first" : "Generate realistic AI renders"}
                        >
                          {isRenderGenerating ? <><Loader2 size={16} className="spin-icon" />Rendering...</> : <><ImageIcon size={16} />AI Render</>}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="three-wrap three-wrap--dominant" ref={threeContainerRef}>
                    {renderQuality === "high" && (sunControlsCollapsed ? (
                      <button
                        type="button"
                        title="Sun / Light Controls"
                        onClick={() => setSunControlsCollapsed(false)}
                        style={{
                          position: "absolute", top: 14, right: 14, zIndex: 4,
                          width: 38, height: 38, borderRadius: "50%",
                          background: theme === "dark" ? "rgba(16,24,39,0.86)" : "rgba(255,255,255,0.92)",
                          backdropFilter: "blur(10px)",
                          boxShadow: "0 4px 14px rgba(15,23,42,0.18)",
                          border: theme === "dark" ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(148,163,184,0.18)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                          cursor: "pointer",
                        }}
                      >
                        <Sun size={17} style={{ opacity: 0.75 }} />
                      </button>
                    ) : (
                      <div
                        style={{
                          position: "absolute", top: 14, right: 14, zIndex: 4,
                          width: 280, padding: 14, borderRadius: 14,
                          background: theme === "dark" ? "rgba(16,24,39,0.86)" : "rgba(255,255,255,0.92)",
                          backdropFilter: "blur(10px)",
                          boxShadow: "0 12px 30px rgba(15,23,42,0.16)",
                          border: theme === "dark" ? "1px solid rgba(148,163,184,0.22)" : "1px solid rgba(148,163,184,0.18)",
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                          <Sun size={16} />
                          <strong style={{ fontSize: 13 }}>Sun / Light Controls</strong>
                          <button
                            type="button"
                            className="icon-btn"
                            style={{ marginLeft: "auto", padding: 2 }}
                            onClick={() => setSunControlsCollapsed(true)}
                            aria-label="Collapse sun controls"
                          >
                            <X size={14} />
                          </button>
                        </div>
                        {[
                          { key: "azimuth", label: `Azimuth — ${Math.round(sunSettings.azimuth)}°`, min: 0, max: 360, step: 1 },
                          { key: "elevation", label: `Elevation — ${Math.round(sunSettings.elevation)}°`, min: 5, max: 85, step: 1 },
                          { key: "intensity", label: `Intensity — ${Number(sunSettings.intensity).toFixed(1)}`, min: 0.2, max: 4.0, step: 0.1 },
                          { key: "ambientIntensity", label: `Ambient Fill — ${Number(sunSettings.ambientIntensity).toFixed(1)}`, min: 0.1, max: 1.2, step: 0.1 },
                        ].map((control) => (
                          <div key={control.key} style={{ marginBottom: 10 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.8, marginBottom: 4 }}>{control.label}</div>
                            <input
                              type="range"
                              min={control.min} max={control.max} step={control.step}
                              value={sunSettings[control.key]}
                              onChange={(e) => setSunSettings((prev) => ({ ...prev, [control.key]: Number(e.target.value) }))}
                              style={{ width: "100%", accentColor: "#f59e0b" }}
                            />
                          </div>
                        ))}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ fontSize: 11, fontWeight: 600, minWidth: 66 }}>Sun Tone</label>
                          <input
                            type="color"
                            value={sunSettings.color}
                            onChange={(e) => setSunSettings((prev) => ({ ...prev, color: e.target.value }))}
                            style={{ width: 42, height: 30, border: "none", background: "transparent", padding: 0 }}
                          />
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ marginLeft: "auto", fontSize: 11, padding: "4px 8px" }}
                            onClick={() => setSunSettings(DEFAULT_SUN_SETTINGS)}
                          >
                            Reset
                          </button>
                        </div>
                      </div>
                    ))}
                    <Canvas
                      shadows={renderQuality === "high"}
                      dpr={renderQuality === "high" ? [1, 2] : 1}
                      onPointerMissed={clearSelectedFurniture}
                      gl={{ preserveDrawingBuffer: true, antialias: renderQuality === "high", powerPreference: renderQuality === "high" ? "high-performance" : "default" }}
                      onCreated={({ gl, scene, camera }) => { threeSceneStateRef.current = { gl, scene, camera }; }}
                      camera={{ position: [Math.max(Number(totalWidth) * 0.85, 14), Math.max(Number(roomHeight) * 2.2, 16), Math.max(Number(totalHeight) * 1.0, 14)], fov: 42 }}>
                      <Floor3DScene rooms={placedRooms} totalWidth={Number(totalWidth)} totalHeight={Number(totalHeight)}
                        wallThickness={Number(wallThickness)} roomThickness={Number(roomThickness)} roomHeight={Number(roomHeight)} wallSegments={wallSegments}
                        selectedFurnitureKey={selectedFurnitureKey} onFurnitureSelect={handleFurnitureSelection}
                        sunSettings={sunSettings} globalWallColor={globalWallColor} orbitControlsRef={orbitControlsRef} renderQuality={renderQuality} />
                    </Canvas>
                    {FEATURE_AI_RENDER_ENABLED && isRenderGenerating && (
                      <div className="ai-render-overlay">
                        <div className="ai-render-loader-card">
                          <Loader2 size={22} className="spin-icon" />
                          <strong>Generating realistic render...</strong>
                          <span>Please wait while ChatGPT creates multiple camera-angle visuals.</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {renderFurnitureRecommendations()}

                  {FEATURE_AI_RENDER_ENABLED && generatedRenderImage && generatedRenderProjectId === currentProjectId && (
                    <div className="ai-render-result-card">
                      <div className="section-header compact"><h3><ImageIcon size={16} />AI Generated Realistic Render</h3></div>
                      <div className="ai-render-result-image-wrap">
                        <img src={generatedRenderImage} alt={`${planName} AI realistic render`} className="ai-render-result-image" />
                      </div>
                    </div>
                  )}
                </section>
              )}
            </div>

            {/* Chat — fully collapses to narrow strip when closed */}
            {FEATURE_ASSISTANT_ENABLED && (assistantCollapsed ? (
              <div
                title="Open Floor Plan Assistant"
                onClick={() => setAssistantCollapsed(false)}
                style={{
                  width: 28, flexShrink: 0, display: "flex", flexDirection: "column",
                  alignItems: "center", justifyContent: "center", gap: 8,
                  cursor: "pointer", borderLeft: "1px solid rgba(148,163,184,0.2)",
                  padding: "12px 0", userSelect: "none",
                }}
              >
                <MessageSquare size={14} style={{ opacity: 0.45 }} />
                <span style={{ writingMode: "vertical-rl", transform: "rotate(180deg)", fontSize: 11, opacity: 0.45, letterSpacing: "0.04em" }}>
                  Assistant
                </span>
              </div>
            ) : (
              <aside className="chatbot-card input-card">
                <div className="section-header chatbot-header">
                  <div className="chatbot-header-copy">
                    <h2><MessageSquare size={16} />Floor Plan Assistant</h2>
                    <p>Ask for layouts, guidance, or use voice commands.</p>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className="chatbot-badge"><Sparkles size={14} />Phase 1 + 2</span>
                    <button
                      type="button"
                      className="icon-btn"
                      aria-label="Collapse assistant"
                      onClick={() => setAssistantCollapsed(true)}
                    >
                      <ChevronUp size={16} />
                    </button>
                  </div>
                </div>
                <div className="chatbot-quick-actions">
                  {["Create a 2BHK in 40 by 30 feet", "Create an office layout 32 by 24", "Create a cafe layout"].map((prompt) => (
                    <button key={prompt} type="button" className="chatbot-chip" onClick={() => setChatInput(prompt)}>{prompt}</button>
                  ))}
                </div>
                <div className="chatbot-messages" ref={chatScrollRef}>
                  {chatMessages.map((msg) => (
                    <div key={msg.id} className={`chatbot-message chatbot-message--${msg.role}`}>
                      <div className="chatbot-message-icon">{msg.role === "assistant" ? <Bot size={14} /> : <span>You</span>}</div>
                      <div className="chatbot-message-bubble">{msg.content}</div>
                    </div>
                  ))}
                  {isChatbotBusy && (
                    <div className="chatbot-message chatbot-message--assistant">
                      <div className="chatbot-message-icon"><Bot size={14} /></div>
                      <div className="chatbot-message-bubble">Working on your layout...</div>
                    </div>
                  )}
                </div>
                <form className="chatbot-form" onSubmit={handleChatSubmit}>
                  <textarea value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Try: Create a 2BHK, create an office layout, or ask how to use the app." rows={4} />
                  <div className="chatbot-form-actions">
                    <button type="button" className={`secondary-btn chatbot-voice-btn${isListening ? " is-listening" : ""}`} onClick={handleStartVoiceInput}>
                      <Mic size={16} />{isListening ? "Listening..." : "Voice"}
                    </button>
                    <button type="submit" className="primary-btn" disabled={isChatbotBusy}><Send size={16} />Apply</button>
                  </div>
                </form>
              </aside>
            ))}
          </div>
        </main>

        {/* Rooms Sidebar */}
        <aside className="rooms-sidebar input-card">
          <div className="section-header rooms-sidebar-header">
            <h2>Rooms</h2>
            <div className="header-actions rooms-sidebar-actions">
              <button className="ghost-btn" onClick={resetPlan}><RotateCcw size={16} />Reset</button>
              {FEATURE_AUTO_ARRANGE_ENABLED && (
                <button className="ghost-btn" onClick={autoArrangeRooms}><RotateCw size={16} />Auto-Arrange</button>
              )}
              <button className="primary-btn" onClick={addRoom}><Plus size={16} />New Room</button>
            </div>
          </div>

          <div className="room-list room-list--sidebar">
            {rooms.map((room, index) => {
              const roomFurnitureSelection = furnitureSelections[room.id] || getDefaultFurnitureSelection(selectedCategory);
              const isExpanded = expandedRoomIds[room.id] !== false;

              return (
                <div className={`room-card accordion-room-card${isExpanded ? " expanded" : " collapsed"}`} key={room.id}>
                  <button type="button" className="room-accordion-trigger" onClick={() => toggleRoomExpanded(room.id)}>
                    <div className="room-accordion-title-wrap">
                      <span className="room-accordion-arrow">{isExpanded ? "▾" : "▸"}</span>
                      <span className="room-accordion-title">{room.name || `Room ${index + 1}`}</span>
                    </div>
                    <span className="room-accordion-meta">{room.width} × {room.height}</span>
                  </button>

                  {isExpanded && (
                    <div className="room-accordion-content">
                      <div className="room-card-header room-card-header--inner">
                        <span>Room {index + 1}</span>
                        <button className="icon-btn" onClick={() => removeRoom(room.id)} disabled={rooms.length === 1}><Trash2 size={16} /></button>
                      </div>

                      <div className="form-grid one-col">
                        <div className="field"><label>Name</label><input value={room.name} onChange={(e) => updateRoom(room.id, "name", e.target.value)} /></div>
                      </div>
                      <div className="form-grid two-col">
                        <div className="field"><label>Width (ft)</label><input type="number" value={room.width} onChange={(e) => updateRoom(room.id, "width", Number(e.target.value) || 0)} /></div>
                        <div className="field"><label>Height (ft)</label><input type="number" value={room.height} onChange={(e) => updateRoom(room.id, "height", Number(e.target.value) || 0)} /></div>
                      </div>
                      <div className="form-grid two-col">
                        <div className="field"><label>X Position (ft)</label><input type="number" value={room.x} onChange={(e) => updateRoom(room.id, "x", Number(e.target.value) || 0)} /></div>
                        <div className="field"><label>Y Position (ft)</label><input type="number" value={room.y} onChange={(e) => updateRoom(room.id, "y", Number(e.target.value) || 0)} /></div>
                      </div>

                      <div className="section-header compact">
                        <h3>Floor / Tiles</h3>
                      </div>
                      <div
                        className="opening-card"
                        style={{
                          display: "grid",
                          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                          gap: 10,
                        }}
                      >
                        {FLOOR_TEXTURE_LIBRARY.map((floor) => {
                          const isActive = (room.floorTextureId || getDefaultFloorTextureId()) === floor.id;
                          return (
                            <button
                              key={floor.id}
                              type="button"
                              onClick={() => updateRoom(room.id, "floorTextureId", floor.id)}
                              style={{
                                textAlign: "left",
                                padding: 8,
                                borderRadius: 12,
                                border: isActive ? "2px solid #3b82f6" : "1px solid rgba(148,163,184,0.25)",
                                background: "transparent",
                                cursor: "pointer",
                              }}
                            >
                              <div
                                style={{
                                  height: 64,
                                  borderRadius: 8,
                                  marginBottom: 8,
                                  backgroundImage: `url(${resolveAssetPath(floor.image)})`,
                                  backgroundSize: "cover",
                                  backgroundPosition: "center",
                                  border: "1px solid rgba(148,163,184,0.18)",
                                }}
                              />
                              <div style={{ fontSize: 12, fontWeight: 700 }}>{floor.name}</div>
                              <div style={{ fontSize: 11, opacity: 0.7 }}>{floor.category}</div>
                            </button>
                          );
                        })}
                      </div>

                      {/* Tile size slider */}
                      <div style={{ marginTop: 10, padding: "10px 12px", background: "rgba(59,130,246,0.05)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.12)" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                          <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, margin: 0 }}>
                            Tile Size — {Number(room.floorTileScale || 1).toFixed(2)}×
                          </label>
                          <button
                            type="button"
                            className="ghost-btn"
                            style={{ padding: "2px 8px", fontSize: 11 }}
                            onClick={() => updateRoom(room.id, "floorTileScale", 1)}
                          >
                            Reset
                          </button>
                        </div>
                        <input
                          type="range"
                          min="0.25" max="4" step="0.25"
                          value={room.floorTileScale || 1}
                          onChange={(e) => updateRoom(room.id, "floorTileScale", Number(e.target.value))}
                          style={{ width: "100%", accentColor: "#3b82f6" }}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, opacity: 0.55, marginTop: 2 }}>
                          <span>0.25× small</span><span>1×</span><span>4× large</span>
                        </div>
                      </div>

                      {/* Doors */}
                      <div className="section-header compact">
                        <h3>Doors</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addDoorToRoom(room.id)}><Plus size={16} />Add Door</button></div>
                      </div>
                      {(room.doors || []).map((door, doorIndex) => (
                        <div className="opening-card" key={`door-${doorIndex}`}>
                          <div className="room-card-header">
                            <span>Door {doorIndex + 1}</span>
                            <button type="button" className="icon-btn" onClick={() => removeDoor(room.id, doorIndex)}><Trash2 size={16} /></button>
                          </div>
                          <div className="form-grid two-col">
                            <div className="field"><label>Wall</label><select value={door.wall} onChange={(e) => updateDoor(room.id, doorIndex, "wall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div className="field"><label>Offset (ft)</label><input type="number" value={door.offset} onChange={(e) => updateDoor(room.id, doorIndex, "offset", e.target.value)} /></div>
                            <div className="field"><label>Width (ft)</label><input type="number" value={door.width} onChange={(e) => updateDoor(room.id, doorIndex, "width", e.target.value)} /></div>
                            <div className="field"><label>Height (ft)</label><input type="number" value={door.height} onChange={(e) => updateDoor(room.id, doorIndex, "height", e.target.value)} /></div>
                          </div>
                        </div>
                      ))}

                      {/* Windows */}
                      <div className="section-header compact">
                        <h3>Windows</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addWindowToRoom(room.id)}><Plus size={16} />Add Window</button></div>
                      </div>
                      {(room.windows || []).map((win, winIndex) => (
                        <div className="opening-card" key={`win-${winIndex}`}>
                          <div className="room-card-header">
                            <span>Window {winIndex + 1}</span>
                            <button type="button" className="icon-btn" onClick={() => removeWindow(room.id, winIndex)}><Trash2 size={16} /></button>
                          </div>
                          <div className="form-grid two-col">
                            <div className="field"><label>Wall</label><select value={win.wall} onChange={(e) => updateWindow(room.id, winIndex, "wall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div className="field"><label>Offset (ft)</label><input type="number" value={win.offset} onChange={(e) => updateWindow(room.id, winIndex, "offset", e.target.value)} /></div>
                            <div className="field"><label>Width (ft)</label><input type="number" value={win.width} onChange={(e) => updateWindow(room.id, winIndex, "width", e.target.value)} /></div>
                            <div className="field"><label>Height (ft)</label><input type="number" value={win.height} onChange={(e) => updateWindow(room.id, winIndex, "height", e.target.value)} /></div>
                            <div className="field field--span-2"><label>Sill Height (ft)</label><input type="number" value={win.sillHeight} onChange={(e) => updateWindow(room.id, winIndex, "sillHeight", e.target.value)} /></div>
                          </div>
                        </div>
                      ))}

                      {/* Cutouts */}
                      <div className="section-header compact">
                        <h3>Cutouts</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addCutoutToRoom(room.id)}><Plus size={16} />Add Cutout</button></div>
                      </div>
                      {(room.cutouts || []).map((cutout, cutoutIndex) => (
                        <div className="opening-card" key={`cutout-${cutoutIndex}`}>
                          <div className="room-card-header">
                            <span>Cutout {cutoutIndex + 1}</span>
                            <button type="button" className="icon-btn" onClick={() => removeCutout(room.id, cutoutIndex)}><Trash2 size={16} /></button>
                          </div>
                          <div className="form-grid two-col">
                            <div className="field"><label>Wall</label><select value={cutout.wall} onChange={(e) => updateCutout(room.id, cutoutIndex, "wall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                            <div className="field"><label>Offset (ft)</label><input type="number" value={cutout.offset} onChange={(e) => updateCutout(room.id, cutoutIndex, "offset", e.target.value)} /></div>
                            <div className="field"><label>Width (ft)</label><input type="number" value={cutout.width} onChange={(e) => updateCutout(room.id, cutoutIndex, "width", e.target.value)} /></div>
                            <div className="field"><label>Height (ft)</label><input type="number" value={cutout.height} onChange={(e) => updateCutout(room.id, cutoutIndex, "height", e.target.value)} /></div>
                          </div>
                        </div>
                      ))}

                      {/* Furniture */}
                      <div className="section-header compact furniture-section-header">
                        <h3><Sofa size={16} />Furniture</h3>
                        <div className="header-actions"><button type="button" className="secondary-btn" onClick={() => addFurnitureToRoom(room.id)}><Plus size={16} />Add Furniture</button></div>
                      </div>

                      <div className="opening-card furniture-panel">
                        <div className="form-grid one-col">
                          <div className="field">
                            <label>Furniture Type</label>
                            <select value={roomFurnitureSelection} onChange={(e) => setFurnitureSelections((prev) => ({ ...prev, [room.id]: e.target.value }))}>
                              {furnitureOptions.map((item) => <option key={item.type} value={item.type}>{item.type}</option>)}
                            </select>
                          </div>
                        </div>

                        {(room.furniture || []).map((item) => {
                          const slab = isKitchenSlab(item);
                          const itemRotation = Number(item.rotation) || 0;

                          return (
                            <div className="furniture-card" key={item.id}>
                              <div className="room-card-header">
                                <div className="furniture-meta">
                                  <strong>{item.type}</strong>
                                  <span>{slab ? `${item.attachedWall || "bottom"} wall attached` : `${item.width} ft × ${item.depth} ft`}</span>
                                </div>
                                <button type="button" className="icon-btn" onClick={() => removeFurniture(room.id, item.id)}><Trash2 size={16} /></button>
                              </div>

                              {!slab ? (
                                <>
                                  <div className="form-grid two-col">
                                    <div className="field"><label>X Position (ft)</label><input type="number" value={item.x} onChange={(e) => updateFurniture(room.id, item.id, "x", e.target.value)} /></div>
                                    <div className="field"><label>Y Position (ft)</label><input type="number" value={item.y} onChange={(e) => updateFurniture(room.id, item.id, "y", e.target.value)} /></div>
                                  </div>
                                  <div className="form-grid three-col">
                                    <div className="field"><label>Width (ft)</label><input type="number" value={item.width} onChange={(e) => updateFurniture(room.id, item.id, "width", e.target.value)} /></div>
                                    <div className="field"><label>Depth (ft)</label><input type="number" value={item.depth} onChange={(e) => updateFurniture(room.id, item.id, "depth", e.target.value)} /></div>
                                    <div className="field"><label>Height (ft)</label><input type="number" value={item.height} onChange={(e) => updateFurniture(room.id, item.id, "height", e.target.value)} /></div>
                                  </div>

                                  {/* Rotation control */}
                                  <div style={{ marginTop: 8, padding: "10px 12px", background: "rgba(59,130,246,0.06)", borderRadius: 8, border: "1px solid rgba(59,130,246,0.15)" }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                                      <label style={{ fontSize: 12, fontWeight: 600, opacity: 0.75, margin: 0 }}>
                                        Rotation — {itemRotation}°
                                      </label>
                                      <button
                                        type="button"
                                        className="ghost-btn"
                                        style={{ padding: "2px 8px", fontSize: 11 }}
                                        onClick={() => updateFurniture(room.id, item.id, "rotation", 0)}
                                        title="Reset rotation"
                                      >
                                        Reset
                                      </button>
                                    </div>
                                    <input
                                      type="range"
                                      min="0" max="360" step="5"
                                      value={itemRotation}
                                      style={{ width: "100%", marginBottom: 8, accentColor: "#3b82f6" }}
                                      onChange={(e) => updateFurniture(room.id, item.id, "rotation", e.target.value)}
                                    />
                                    <div style={{ display: "flex", gap: 4 }}>
                                      {[0, 90, 180, 270].map((deg) => (
                                        <button
                                          key={deg}
                                          type="button"
                                          className={`ghost-btn${itemRotation === deg ? " active" : ""}`}
                                          style={{ flex: 1, fontSize: 11, padding: "3px 0", fontWeight: itemRotation === deg ? 700 : 400 }}
                                          onClick={() => updateFurniture(room.id, item.id, "rotation", deg)}
                                        >
                                          {deg}°
                                        </button>
                                      ))}
                                      <button
                                        type="button"
                                        className="ghost-btn"
                                        style={{ flex: 1, fontSize: 11, padding: "3px 0" }}
                                        title="Rotate +45°"
                                        onClick={() => updateFurniture(room.id, item.id, "rotation", (itemRotation + 45) % 360)}
                                      >
                                        <RotateCw size={12} />
                                      </button>
                                    </div>
                                  </div>
                                </>
                              ) : (
                                <div className="form-grid two-col">
                                  <div className="field"><label>Wall</label><select value={item.attachedWall || "bottom"} onChange={(e) => updateFurniture(room.id, item.id, "attachedWall", e.target.value)}>{WALL_OPTIONS.map((w) => <option key={w} value={w}>{w}</option>)}</select></div>
                                  <div className="field"><label>Length (ft)</label><input type="number" value={item.slabLength || item.width} onChange={(e) => updateFurniture(room.id, item.id, "slabLength", e.target.value)} /></div>
                                  <div className="field field--span-2"><label>Offset (ft)</label><input type="number" value={item.offset || 0} onChange={(e) => updateFurniture(room.id, item.id, "offset", e.target.value)} /></div>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>
      </div>
    </div>
  );
}
