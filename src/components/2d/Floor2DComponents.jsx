import React from "react";
import { getOpeningLineSegment } from "../../utils/geometry";
import { isKitchenSlab, getFurnitureRecommendationItems } from "../../utils/furniture";

export { Opening2D, Furniture2D, computeFurnitureLabelOffsets };

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
