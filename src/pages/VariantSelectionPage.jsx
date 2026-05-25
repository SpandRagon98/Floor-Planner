import React from "react";
import { ArrowLeft, Sparkles } from "lucide-react";
import { ROOM_COLORS } from "../constants/presets";

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

export default function VariantSelectionPage({ variants, theme, onSelect, onBack, editorIsEntering = false }) {
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
