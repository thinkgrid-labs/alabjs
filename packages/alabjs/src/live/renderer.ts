/**
 * Server-side HTML fragment renderer for live components.
 *
 * Uses `renderToStaticMarkup` (not `renderToPipeableStream`) because:
 *   - The SSE update path does a raw DOM swap — no React hydration needed.
 *   - Synchronous output fits the push model.
 *   - No `data-reactroot` attributes in the fragment (smaller payload).
 */

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * Render a live component to an HTML fragment string.
 *
 * @param modulePath - Absolute path to the compiled `.live.js` module.
 * @param props      - Props to pass to the component (from the SSE query string).
 * @returns          - Raw HTML string (no wrapping element).
 */
export async function renderLiveFragment(
  modulePath: string,
  props: unknown,
): Promise<string> {
  // Dynamic import — Node's module cache means repeated calls for the same
  // module path are effectively free after the first load.
  const mod = await import(modulePath) as { default?: unknown };
  const Component = mod.default;

  if (typeof Component !== "function") {
    throw new Error(
      `[alabjs] live component at ${modulePath} has no default export`,
    );
  }

  // renderToStaticMarkup handles async components (React 19+).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const html = renderToStaticMarkup(createElement(Component as any, props as any));
  return html;
}

/**
 * FNV-1a 64-bit content hash of an HTML string.
 * Used to suppress no-op SSE pushes when the rendered output hasn't changed.
 */
export function hashFragment(html: string): string {
  const FNV_OFFSET = 14_695_981_039_346_656_037n;
  const FNV_PRIME = 1_099_511_628_211n;
  let hash = FNV_OFFSET;
  for (let i = 0; i < html.length; i++) {
    hash ^= BigInt(html.charCodeAt(i));
    hash = BigInt.asUintN(64, hash * FNV_PRIME);
  }
  return hash.toString(16).padStart(16, "0");
}
