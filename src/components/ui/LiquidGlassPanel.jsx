import React, { useRef } from "react";
import { useLiquidGlass } from "../../hooks/useLiquidGlass";

/**
 * Drop-in replacement for a styled <div>/<section>/etc. that gets real
 * Apple-style liquid glass refraction when `enabled` is true.
 *
 * The "material" (translucent background, inner highlight, border, shadow)
 * stays in App.css on `className` — this component only wires up the optics
 * (SVG displacement filter via backdrop-filter).
 *
 * Usage:
 *   <LiquidGlassPanel
 *     as="section"
 *     enabled={uiSettings.glassMode}
 *     className="floor-bar input-card"
 *     options={{ scale: -90 }}
 *   >
 *     ...content...
 *   </LiquidGlassPanel>
 */
export default function LiquidGlassPanel({
  as: Tag = "div",
  enabled = false,
  options,
  className = "",
  children,
  ...rest
}) {
  const ref = useRef(null);
  useLiquidGlass(ref, enabled, options);
  return (
    <Tag ref={ref} className={className} {...rest}>
      {children}
    </Tag>
  );
}
