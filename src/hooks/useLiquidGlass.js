import { useEffect, useRef } from "react";
import { liquidGlass } from "../lib/liquidGlass";

/**
 * Applies real liquid-glass refraction to a DOM node while `enabled` is true,
 * and cleanly tears it down (or never applies it) otherwise.
 *
 * `options` is read fresh each time the effect re-applies (when `enabled`
 * flips true, or the ref's element identity changes) via a ref, not on every
 * render — so passing a new object literal from JSX each render is fine and
 * won't cause the filter to rebuild or flicker.
 *
 * @param {React.RefObject<Element>} elementRef
 * @param {boolean} enabled
 * @param {object} [options] liquidGlass() options — see liquidGlass.esm.js
 */
export function useLiquidGlass(elementRef, enabled, options) {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const el = elementRef.current;
    if (!el || !enabled) return undefined;

    const controller = liquidGlass(el, optionsRef.current);
    return () => controller.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elementRef, enabled]);
}
