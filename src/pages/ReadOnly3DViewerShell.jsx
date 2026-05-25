import React from "react";
import { Canvas } from "@react-three/fiber";
import { Floor3DScene } from "../components/3d/Floor3DComponents";

export default function ReadOnly3DViewerShell({
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
