/**
 * Live component stub generator.
 *
 * When the Vite plugin encounters a `"use live"` file (or a `*.live.tsx` file)
 * during a CLIENT build, it replaces the entire module with a stub that:
 *
 *   1. Renders the server-provided initial HTML (already in the DOM via SSR, or
 *      fetched from `/_alabjs/live/:id` on first mount in CSR pages).
 *   2. Opens an SSE connection to `/_alabjs/live/:id?props=<base64>` and swaps
 *      the component's DOM node when new HTML arrives.
 *
 * The actual component code (which may contain DB calls, secrets, heavy deps)
 * never ships to the browser.
 */

const VIRTUAL_LIVE_CLIENT_ID = "/@alabjs/live-client";

/**
 * Generate the client stub for a live component module.
 *
 * @param moduleId   - Stable hash ID used as the SSE channel (e.g. `"a3f8c1d2"`)
 * @param exportNames - Named exports from the original module (usually just `["default"]`)
 */
export function generateLiveComponentStub(
  moduleId: string,
  exportNames: string[],
): string {
  const hasDefault = exportNames.includes("default");

  const lines: string[] = [
    `import { LiveMount } from ${JSON.stringify(VIRTUAL_LIVE_CLIENT_ID)};`,
    "",
  ];

  // Re-export the default as a LiveMount wrapper.
  // Props are forwarded so the server receives the same input.
  if (hasDefault) {
    lines.push(
      `export default function LiveComponent(props) {`,
      `  return LiveMount({ id: ${JSON.stringify(moduleId)}, props });`,
      `}`,
      "",
    );
  }

  // Any named exports besides `default` that are NOT live-config exports
  // (liveInterval, liveTags) are stripped — they are server-only.
  // Export them as undefined so destructured imports don't break.
  const serverOnlyExports = exportNames.filter(
    (n) => n !== "default" && n !== "liveInterval" && n !== "liveTags",
  );
  for (const name of serverOnlyExports) {
    lines.push(`export const ${name} = undefined; // stripped: server-only`);
  }

  lines.push(`// alabjs: live module — server code stripped from client bundle`);
  return lines.join("\n");
}

/**
 * The virtual `/@alabjs/live-client` module source.
 *
 * This is the only JavaScript that ships to the browser for the live update
 * path. It is intentionally minimal (~1.5 kb minified):
 *
 *   - `LiveMount(id, props)` — renders a placeholder div, subscribes to SSE,
 *     swaps innerHTML on each `data:` event, reconnects with backoff.
 *
 * React is used only for the initial mount and to expose the component API.
 * All subsequent updates bypass React entirely — they are raw DOM swaps.
 */
export function generateLiveClientRuntime(): string {
  return `
import { createElement, useEffect, useRef } from "react";

const RECONNECT_DELAYS = [500, 1000, 2000, 5000, 10000, 30000];

/**
 * LiveMount — client runtime for "use live" components.
 *
 * On mount:
 *   1. Checks if the server already rendered HTML into the placeholder
 *      (SSR pages: the div has children from the initial render).
 *   2. Opens an SSE connection to /_alabjs/live/:id?props=<base64>.
 *   3. On each "data:" event, replaces innerHTML with the new fragment.
 *   4. On disconnect, reconnects with exponential backoff.
 *
 * @param id    - Stable component ID (hash of the module path).
 * @param props - Component props forwarded to the server renderer.
 */
export function LiveMount({ id, props }) {
  const ref = useRef(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;

    let attempt = 0;
    let es = null;
    let dead = false;

    const propsParam = encodeURIComponent(
      btoa(JSON.stringify(props ?? {}))
    );

    function connect(lastEventId) {
      if (dead) return;
      let url = "/_alabjs/live/" + id + "?props=" + propsParam;
      if (lastEventId) url += "&lastEventId=" + encodeURIComponent(lastEventId);

      es = new EventSource(url);

      es.onmessage = (e) => {
        attempt = 0; // reset backoff on successful message
        if (node && e.data) {
          node.innerHTML = e.data;
        }
      };

      // Named "event: error" — server pushed a render error message.
      // Log it to the console and show a placeholder; do NOT reconnect
      // (the server will keep the connection alive and push a fix later).
      es.addEventListener("error", (e) => {
        if (e.data) {
          console.error("[alabjs/live] server render error:", e.data);
          if (node) {
            node.innerHTML =
              '<div style="color:#f87171;font-size:12px;padding:8px;border:1px solid #f87171;border-radius:4px">' +
              "Live component render error — check the server console." +
              "</div>";
          }
        }
      });

      es.onerror = () => {
        es.close();
        if (dead) return;
        const delay = RECONNECT_DELAYS[Math.min(attempt, RECONNECT_DELAYS.length - 1)];
        attempt++;
        setTimeout(() => connect(null), delay);
      };
    }

    connect(null);

    return () => {
      dead = true;
      es?.close();
    };
  }, [id]); // props changes are intentionally not in deps — server re-renders on interval/tag

  return createElement("div", {
    ref,
    "data-live-id": id,
    "data-live-props": JSON.stringify(props ?? {}),
    suppressHydrationWarning: true,
  });
}
`.trimStart();
}

/**
 * Generate the SERVER-BUILD wrapper for a live component.
 *
 * In SSR pages, the server must emit the same `<div data-live-id="...">` wrapper
 * that `LiveMount` renders on the client, so React hydration doesn't error on a
 * structural mismatch. The actual component is rendered inside the wrapper div —
 * the client uses `suppressHydrationWarning` to preserve those children until
 * the first SSE event arrives.
 *
 * @param moduleId  - Stable 16-char ID (same value used by the client stub).
 * @param actualId  - Virtual import path for the real component (`<path>?live-actual`).
 */
export function generateLiveServerWrapper(moduleId: string, actualId: string): string {
  return [
    `import _LiveImpl from ${JSON.stringify(actualId)};`,
    `import { createElement as _h } from "react";`,
    `export default function _LiveWrapper(props) {`,
    `  return _h("div", {`,
    `    "data-live-id": ${JSON.stringify(moduleId)},`,
    `    "data-live-props": JSON.stringify(props ?? {}),`,
    `    suppressHydrationWarning: true,`,
    `  }, _h(_LiveImpl, props));`,
    `}`,
    `export * from ${JSON.stringify(actualId)};`,
    ``,
  ].join("\n");
}
