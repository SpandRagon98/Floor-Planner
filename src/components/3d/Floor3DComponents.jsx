import React, { useState, useEffect, useMemo } from "react";
import { OrbitControls, Grid, Text as DreiText } from "@react-three/drei";
import * as THREE from "three";
import {
  DEFAULT_DOOR_WIDTH,
  DEFAULT_DOOR_HEIGHT,
  DEFAULT_WINDOW_WIDTH,
  DEFAULT_WINDOW_HEIGHT,
  DEFAULT_WINDOW_SILL_HEIGHT,
  DEFAULT_WALL_COLOR,
  WALL_THICKNESS_FT,
  ROOM_THICKNESS_FT,
  DEFAULT_ROOM_HEIGHT,
  DEFAULT_SUN_SETTINGS,
  FEATURE_FURNITURE_RECOMMENDATIONS_ENABLED,
} from "../../constants/config";
import { clamp, subtractRanges, getSunPosition } from "../../utils/math";
import { getSegmentOpenings, getOpeningLineSegment } from "../../utils/geometry";
import { getRoomOpenings } from "../../utils/normalization";
import { getFurnitureRecommendationItems } from "../../utils/furniture";
import { getFloorTextureById } from "../../utils/textures";
import { resolveAssetPath } from "../../utils/assets";
import { loadSharedTexture, getCachedTexture } from "../../utils/textureCache";

// ─── 3D Wall ─────────────────────────────────────────────────────────────────

function WallMesh({ segment, wallThickness, height, rooms, globalWallColor, structureMode = "solid", xrayOpacity = 0.35 }) {
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
  // Structure view modes. Materials are declared per-mesh (R3F creates a fresh
  // instance for each), so toggling these props never mutates a shared
  // material — switching back to "solid" restores the original look exactly.
  const isXray = structureMode === "xray";
  const isWire = structureMode === "wireframe";
  const solidShadows = !isXray && !isWire;

  return (
    <group>
      {bands.map((band, index) => {
        const position = isVertical
          ? [x1, (band.bandBottom + band.bandTop) / 2, (band.start + band.end) / 2]
          : [(band.start + band.end) / 2, (band.bandBottom + band.bandTop) / 2, y1];
        const args = isVertical
          ? [wallThickness, band.bandHeight, band.partLength]
          : [band.partLength, band.bandHeight, wallThickness];
        return (
          <mesh key={index} castShadow={solidShadows} receiveShadow={solidShadows} position={position} renderOrder={isXray ? 2 : 0}>
            <boxGeometry args={args} />
            <meshStandardMaterial
              color={wallColor}
              roughness={0.9}
              metalness={0.02}
              transparent={isXray}
              opacity={isXray ? xrayOpacity : 1}
              depthWrite={!isXray}
              wireframe={isWire}
            />
          </mesh>
        );
      })}
    </group>
  );
}

function RoomFloor3D({ room, isLowQuality = false, structureMode = "solid", xrayOpacity = 0.35 }) {
  const textureMeta = getFloorTextureById(room.floorTextureId);
  const resolvedTexturePath = useMemo(() => resolveAssetPath(textureMeta.image), [textureMeta.image]);
  // Seed from the shared cache so texture switches never flash the fallback color.
  const [baseTexture, setBaseTexture] = useState(() => getCachedTexture(resolvedTexturePath));

  useEffect(() => {
    let isCancelled = false;
    const cached = getCachedTexture(resolvedTexturePath);
    if (cached) {
      setBaseTexture(cached);
      return undefined;
    }
    loadSharedTexture(resolvedTexturePath)
      .then((texture) => { if (!isCancelled) setBaseTexture(texture); })
      .catch(() => { if (!isCancelled) setBaseTexture(null); });
    return () => {
      isCancelled = true;
    };
  }, [resolvedTexturePath]);

  const preparedTexture = useMemo(() => {
    if (!baseTexture) return null;
    const next = baseTexture.clone();
    next.wrapS = THREE.RepeatWrapping;
    next.wrapT = THREE.RepeatWrapping;
    const tileScale = Math.max(0.25, Math.min(4, Number(room.floorTileScale) || 1));
    const tileWidth = Math.max(0.1, Number(textureMeta.tileWidth) || 1) * tileScale;
    const tileHeight = Math.max(0.1, Number(textureMeta.tileHeight) || 1) * tileScale;
    next.repeat.set(
      Math.max(0.05, (Number(room.width) || 1) / tileWidth),
      Math.max(0.05, (Number(room.height) || 1) / tileHeight)
    );
    next.anisotropy = isLowQuality ? 1 : 8;
    next.needsUpdate = true;
    return next;
  }, [baseTexture, room.width, room.height, textureMeta.tileWidth, textureMeta.tileHeight, room.floorTileScale, isLowQuality]);

  useEffect(() => () => {
    preparedTexture?.dispose?.();
  }, [preparedTexture]);

  // Floor planes count as structure: wireframe strips the texture map (lines
  // with a photo map look broken), X-Ray keeps the map but goes translucent so
  // lower floors show through in stacked views. Both are prop-driven, so
  // returning to "solid" restores the textured material untouched.
  const isXray = structureMode === "xray";
  const isWire = structureMode === "wireframe";

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[Number(room.x) + Number(room.width) / 2, 0.03, Number(room.y) + Number(room.height) / 2]}
      receiveShadow={!isLowQuality && !isXray && !isWire}
    >
      <planeGeometry args={[Math.max(Number(room.width) - 0.12, 0.2), Math.max(Number(room.height) - 0.12, 0.2)]} />
      <meshStandardMaterial
        map={isWire ? null : (preparedTexture || null)}
        color={!isWire && preparedTexture ? "#ffffff" : (room.color || "#ffffff")}
        roughness={isLowQuality ? 0.96 : 0.82}
        metalness={isLowQuality ? 0.01 : 0.04}
        transparent={isXray}
        opacity={isXray ? Math.max(xrayOpacity, 0.25) : 1}
        depthWrite={!isXray}
        wireframe={isWire}
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

const FLOOR_SLAB_THICKNESS = 0.55;

// Renders one floor level's full content (room floors, labels, furniture,
// walls, doors, windows). Positioned by the parent group at its stack height.
function FloorLevel3D({
  floor,
  level,
  wallHeight,
  wt,
  rt,
  selectedFurnitureKey,
  onFurnitureSelect,
  globalWallColor,
  isLowQuality,
  structureMode = "solid",
  xrayOpacity = 0.35,
}) {
  const rooms = floor.placedRooms || floor.rooms || [];
  const wallSegments = floor.wallSegments || [];
  const isXray = structureMode === "xray";
  const isWire = structureMode === "wireframe";
  const solidShadows = !isLowQuality && !isXray && !isWire;

  return (
    <group>
      {rooms.map((room) => {
        const x = Number(room.x) || 0;
        const z = Number(room.y) || 0;
        const w = Math.max(Number(room.width) || 0, 0.2);
        const d = Math.max(Number(room.height) || 0, 0.2);
        return (
          <group key={room.id}>
            {level > 0 && (
              <mesh castShadow={solidShadows} receiveShadow={solidShadows} position={[x + w / 2, -FLOOR_SLAB_THICKNESS / 2, z + d / 2]} renderOrder={isXray ? 2 : 0}>
                <boxGeometry args={[w, FLOOR_SLAB_THICKNESS, d]} />
                <meshStandardMaterial
                  color="#c9d2dd"
                  roughness={0.9}
                  metalness={0.03}
                  transparent={isXray}
                  opacity={isXray ? xrayOpacity : 1}
                  depthWrite={!isXray}
                  wireframe={isWire}
                />
              </mesh>
            )}
            <RoomFloor3D room={room} isLowQuality={isLowQuality} structureMode={structureMode} xrayOpacity={xrayOpacity} />
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

      {wallSegments.map((segment, index) => (
        <WallMesh
          key={index}
          segment={segment}
          wallThickness={segment.type === "outer" ? wt : rt}
          height={wallHeight}
          rooms={rooms}
          globalWallColor={globalWallColor}
          structureMode={structureMode}
          xrayOpacity={xrayOpacity}
        />
      ))}

      {rooms.map((room) => {
        const { doors, windows } = getRoomOpenings(room, wallHeight);
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
    </group>
  );
}

// Thin accent frame marking the active floor level when several floors are shown.
function ActiveFloorFrame({ totalWidth, totalHeight, color }) {
  const bar = 0.14;
  return (
    <group>
      <mesh position={[totalWidth / 2, 0.02, -bar / 2]}>
        <boxGeometry args={[totalWidth + bar * 2, 0.06, bar]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <mesh position={[totalWidth / 2, 0.02, totalHeight + bar / 2]}>
        <boxGeometry args={[totalWidth + bar * 2, 0.06, bar]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <mesh position={[-bar / 2, 0.02, totalHeight / 2]}>
        <boxGeometry args={[bar, 0.06, totalHeight]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
      <mesh position={[totalWidth + bar / 2, 0.02, totalHeight / 2]}>
        <boxGeometry args={[bar, 0.06, totalHeight]} />
        <meshBasicMaterial color={color} transparent opacity={0.9} />
      </mesh>
    </group>
  );
}

function Floor3DScene({
  rooms,
  floors,
  activeFloorId,
  accentColor = "#2563eb",
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
  structureMode = "solid",
  xrayOpacity = 0.35,
}) {
  const centerX = totalWidth / 2;
  const centerZ = totalHeight / 2;
  const wt = Math.max(0.22, Number(wallThickness) || WALL_THICKNESS_FT);
  const rt = Math.max(0.12, Number(roomThickness) || ROOM_THICKNESS_FT);
  const h = Math.max(8, Number(roomHeight) || DEFAULT_ROOM_HEIGHT);
  const safeSun = { ...DEFAULT_SUN_SETTINGS, ...(sunSettings || {}) };
  const shadowCamExtent = Math.max(totalWidth, totalHeight) * 2;
  const isLowQuality = renderQuality === "low";

  // Accept either the new multi-floor prop or the legacy single-floor props.
  const floorsToRender = Array.isArray(floors) && floors.length
    ? floors
    : [{ id: "legacy-floor", level: 0, placedRooms: rooms || [], wallSegments: wallSegments || [] }];
  const levelHeight = h + FLOOR_SLAB_THICKNESS;
  const stackTop = floorsToRender.length * levelHeight;
  const sunPos = getSunPosition(
    safeSun.azimuth,
    safeSun.elevation,
    Math.max(totalWidth, totalHeight, stackTop) * 1.8,
    centerX,
    centerZ
  );
  const showActiveFrame = floorsToRender.length > 1;

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
      {/* Land / buildable plot area — grid surface only, no enclosing walls */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[centerX, -0.02, centerZ]} receiveShadow>
        <planeGeometry args={[totalWidth, totalHeight]} />
        <meshStandardMaterial color="#e7ebf0" roughness={0.93} metalness={0.04} />
      </mesh>

      {floorsToRender.map((floor, index) => {
        const level = Number.isFinite(Number(floor.level)) ? Number(floor.level) : index;
        const baseY = level * levelHeight;
        return (
          <group key={floor.id || index} position={[0, baseY, 0]}>
            {showActiveFrame && floor.id === activeFloorId && (
              <ActiveFloorFrame totalWidth={totalWidth} totalHeight={totalHeight} color={accentColor} />
            )}
            {floorsToRender.length > 1 && (
              <DreiText
                position={[-1.6, 1.2, -1.2]}
                fontSize={0.72}
                color={floor.id === activeFloorId ? accentColor : "#64748b"}
                anchorX="right"
                anchorY="middle"
              >
                {floor.name || `Level ${level + 1}`}
              </DreiText>
            )}
            <FloorLevel3D
              floor={floor}
              level={level}
              wallHeight={h}
              wt={wt}
              rt={rt}
              selectedFurnitureKey={selectedFurnitureKey}
              onFurnitureSelect={onFurnitureSelect}
              globalWallColor={globalWallColor}
              isLowQuality={isLowQuality}
              structureMode={structureMode}
              xrayOpacity={xrayOpacity}
            />
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
        maxDistance={200}
        maxPolarAngle={Math.PI / 2.08}
        target={[centerX, Math.min(stackTop * 0.28, h), centerZ]}
      />
    </>
  );
}

export { Floor3DScene };
