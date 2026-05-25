import React, { useState, useMemo } from "react";
import { Sliders, ArrowLeft } from "lucide-react";
import { PRODUCT_CATEGORIES, FURNITURE_PRESETS } from "../constants/presets";
import { isKitchenSlab } from "../utils/furniture";

export default function FurnitureManagerPage({ rooms, theme, customPresetDimensions, onUpdateCustomPreset, onUpdatePlacedFurniture, onApplyPresetToPlaced, onBack, editorIsEntering = false }) {
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
