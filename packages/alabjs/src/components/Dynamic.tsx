/**
 * Alab PPR — Partial Prerendering support.
 *
 * Pages that export `export const ppr = true` get their static HTML shell
 * pre-rendered at build time and stored in `.alabjs/ppr-cache/`. At runtime,
 * the shell is served instantly (CDN-cacheable) while `<Dynamic>` sections
 * fill in per-request via React's Suspense streaming or client-side hydration.
 *
 * ## How it works
 *
 * During the **build-time static render** (pre-render pass):
 *   • `PPRShellProvider` sets the PPR context to `true`.
 *   • `<Dynamic>` sees the context and renders only its `fallback` inside a
 *     `data-ppr-hole` marker — children are omitted entirely.
 *   • The resulting HTML is the "static shell": complete page minus dynamic parts.
 *
 * At **runtime**:
 *   • `PPRShellProvider` is never rendered → context defaults to `false`.
 *   • `<Dynamic>` behaves as a plain `<Suspense>` boundary, streaming children
 *     as their async work resolves.
 *
 * ## Usage
 *
 * ```tsx
 * // app/posts/[id]/page.tsx
 * import { Dynamic } from "alabjs/components";
 *
 * export const ppr = true;
 *
 * export default function PostPage({ params }: { params: { id: string } }) {
 *   return (
 *     <article>
 *       <h1>Post {params.id}</h1>
 *       <Dynamic id="sidebar" fallback={<SidebarSkeleton />}>
 *         <PersonalisedSidebar userId={userId} />
 *       </Dynamic>
 *     </article>
 *   );
 * }
 * ```
 */

import { Suspense, createContext, useContext, type ReactNode } from "react";

// ─── PPR shell context ─────────────────────────────────────────────────────────

/**
 * When `true`, `<Dynamic>` renders only its `fallback` placeholder.
 * Set exclusively by `PPRShellProvider` during build-time pre-renders.
 */
const PPRShellCtx = createContext(false);

/**
 * @internal
 * Wrap the root element with this during build-time PPR pre-rendering so that
 * every `<Dynamic>` in the tree emits a stable `data-ppr-hole` placeholder
 * instead of its children.
 *
 * Do **not** use this at runtime — it is an implementation detail of
 * `preRenderPPRShell` in `src/ssr/ppr.ts`.
 */
export function PPRShellProvider({ children }: { children: ReactNode }) {
  return <PPRShellCtx.Provider value={true}>{children}</PPRShellCtx.Provider>;
}

// ─── Dynamic component ────────────────────────────────────────────────────────

export interface DynamicProps {
  /**
   * Unique identifier for this dynamic section within the page.
   *
   * Used to correlate the placeholder emitted in the static shell with the
   * live content streamed at runtime. **Must be stable across renders** —
   * treat it like a React key: short, descriptive, no dynamic values.
   *
   * @example "sidebar", "user-nav", "related-posts"
   */
  id: string;
  /** Per-request dynamic content. Never rendered in the pre-built static shell. */
  children: ReactNode;
  /**
   * Shown in the pre-built static shell **and** as the React Suspense fallback
   * while the dynamic content is streaming in.
   *
   * Keep this lightweight — it is inlined into every CDN-cached response.
   */
  fallback?: ReactNode;
}

/**
 * Marks a subtree as **dynamic** (per-request) within a PPR page.
 *
 * - **Build time** (static shell pre-render): renders `fallback` inside a
 *   `<div data-ppr-hole="{id}">` marker. Children are not rendered.
 * - **Runtime** (SSR + hydration): acts as a `<Suspense>` boundary. Children
 *   stream in as their async work resolves; `fallback` is shown meanwhile.
 *
 * The `display: contents` style on the wrapper div means it has no visual
 * footprint — it exists only as a DOM anchor for Alab's PPR machinery.
 */
export function Dynamic({ id, children, fallback = null }: DynamicProps) {
  const isShell = useContext(PPRShellCtx);

  const holeWrapper = (content: ReactNode) => (
    <div data-ppr-hole={id} style={{ display: "contents" }}>
      {content}
    </div>
  );

  if (isShell) {
    // Build-time pre-render: emit only the placeholder + fallback.
    // Children are intentionally omitted — they contain per-request logic.
    return holeWrapper(fallback);
  }

  // Runtime: standard Suspense boundary.
  // The hole wrapper on the fallback preserves the DOM anchor so client-side
  // hydration can match it to the pre-rendered shell.
  return (
    <Suspense fallback={holeWrapper(fallback)}>
      {children}
    </Suspense>
  );
}
