/**
 * Alab test utilities — zero setup required.
 *
 * @example
 * ```ts
 * import { renderPage, mockServerFn } from "alabjs/test";
 * import { getUser } from "./app/users/[id]/page.server.js";
 *
 * mockServerFn(getUser, { id: "1", name: "Alice" });
 * const { html, status } = await renderPage("/users/1");
 * expect(html).toContain("Alice");
 * ```
 */

import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import type { ServerFn } from "../types/index.js";

// ─── mockServerFn ─────────────────────────────────────────────────────────────

/** Registry of mocked server functions — keyed by function name. */
const _mocks = new Map<string, unknown>();

/**
 * Mock a `defineServerFn` function for the duration of a test.
 *
 * The mock is applied globally for the current test process. Use
 * `clearMocks()` in `afterEach` if you need isolation between tests,
 * or rely on Vitest's built-in mock isolation.
 *
 * @example
 * ```ts
 * import { getUser } from "./page.server.js";
 * mockServerFn(getUser, { id: "1", name: "Alice", email: "alice@example.com" });
 * ```
 */
export function mockServerFn<T extends ServerFn<any, any, any>>(
  fn: T,
  returnValue: T extends ServerFn<any, infer O, any> ? O : never,
): void {
  _mocks.set((fn as unknown as { name: string }).name, returnValue);
}

/**
 * Mock a server function with a custom handler (for dynamic responses).
 *
 * @example
 * ```ts
 * mockServerFnWith(getUser, async ({ params }) => {
 *   if (params.id === "1") return { name: "Alice" };
 *   throw new Error("Not found");
 * });
 * ```
 */
export function mockServerFnWith<T extends ServerFn<any, any, any>>(
  fn: T,
  handler: T extends ServerFn<infer I, infer O, any>
    ? (ctx: { params: Record<string, string> }, input: I) => Promise<O>
    : never,
): void {
  _mocks.set((fn as unknown as { name: string }).name, handler);
}

/** Remove all server function mocks. Call in `afterEach` for test isolation. */
export function clearMocks(): void {
  _mocks.clear();
}

/** @internal Used by Alab's dev server to resolve mocked functions in tests. */
export function _getMock(fnName: string): unknown | undefined {
  return _mocks.get(fnName);
}

// ─── renderPage ───────────────────────────────────────────────────────────────

export interface RenderPageResult {
  /** Full HTML string including the Alab shell. */
  html: string;
  /** HTTP status code (200, 404, 500, etc.). */
  status: number;
  /** Whether the render threw an error. */
  error: Error | null;
}

export interface RenderPageOptions {
  /**
   * Params to inject — useful when the route path has dynamic segments.
   * @example `{ id: "42" }` for `/users/[id]`
   */
  params?: Record<string, string>;
  /** Search params to inject. */
  searchParams?: Record<string, string>;
  /**
   * Request headers forwarded to middleware and server functions.
   */
  headers?: Record<string, string>;
}

/**
 * Render a page component to an HTML string for integration testing.
 *
 * Automatically applies any `mockServerFn` mocks registered before this call.
 * Does not start an HTTP server — renders entirely in-process.
 *
 * @example
 * ```ts
 * const { html, status } = await renderPage("/users/1", { params: { id: "1" } });
 * expect(status).toBe(200);
 * expect(html).toContain('<h1>Alice</h1>');
 * ```
 */
export async function renderPage(
  path: string,
  options: RenderPageOptions = {},
): Promise<RenderPageResult> {
  const { params = {}, searchParams = {} } = options;

  // Dynamically resolve the page module from the file-system.
  // In test environments, Vitest handles module resolution via the Vite plugin.
  const appDir = new URL("../../app", import.meta.url).pathname;

  // Convert URL path to a candidate file path.
  // e.g. "/users/1" → try "app/users/[id]/page.tsx" based on path segments.
  const segments = path.split("/").filter(Boolean);
  const candidates = buildCandidatePaths(appDir, segments, params);

  let PageComponent: ComponentType<{ params: Record<string, string>; searchParams: Record<string, string> }> | null = null;

  for (const candidate of candidates) {
    try {
      const mod = await import(candidate) as { default?: unknown };
      if (typeof mod.default === "function") {
        PageComponent = mod.default as unknown as typeof PageComponent;
        break;
      }
    } catch {
      // Try next candidate.
    }
  }

  if (!PageComponent) {
    return { html: "", status: 404, error: new Error(`[alabjs/test] No page found for path: ${path}`) };
  }

  try {
    const html = renderToString(createElement(PageComponent, { params, searchParams }));
    return { html, status: 200, error: null };
  } catch (err) {
    return {
      html: "",
      status: 500,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

/**
 * Render a specific component to HTML (lower-level than `renderPage`).
 *
 * @example
 * ```ts
 * import UserPage from "./app/users/[id]/page.js";
 * const { html } = await renderComponent(UserPage, { params: { id: "1" }, searchParams: {} });
 * ```
 */
export async function renderComponent<P extends Record<string, unknown>>(
  Component: ComponentType<P>,
  props: P,
): Promise<RenderPageResult> {
  try {
    const html = renderToString(createElement(Component, props));
    return { html, status: 200, error: null };
  } catch (err) {
    return {
      html: "",
      status: 500,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildCandidatePaths(
  appDir: string,
  segments: string[],
  params: Record<string, string>,
): string[] {
  const paramValues = Object.values(params);
  const candidates: string[] = [];

  // Try resolving dynamic segments in reverse (known params replace segments).
  const resolvedSegments = segments.map((seg) => {
    // If this segment matches a known param value, try both [param] and the value.
    const matchingParam = paramValues.find((v) => v === seg);
    return matchingParam ? `[${Object.keys(params).find((k) => params[k] === matchingParam) ?? seg}]` : seg;
  });

  const extensions = [".tsx", ".ts", ".jsx", ".js"];
  for (const ext of extensions) {
    candidates.push(`${appDir}/${resolvedSegments.join("/")}/page${ext}`);
    candidates.push(`${appDir}/${segments.join("/")}/page${ext}`);
  }

  return candidates;
}
