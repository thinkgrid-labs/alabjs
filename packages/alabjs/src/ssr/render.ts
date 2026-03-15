import { createElement, type ComponentType } from "react";
import { renderToPipeableStream } from "react-dom/server";
import { Writable } from "node:stream";
import type { ServerResponse } from "node:http";
import { htmlShellBefore, htmlShellAfter, type HtmlShellOptions } from "./html.js";
import type { PageMetadata } from "../types/index.js";

export interface RenderOptions {
  /** The React page component. */
  Page: ComponentType<{ params: Record<string, string>; searchParams: Record<string, string> }>;
  /** Layout components to wrap the page, ordered outermost → innermost. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  layouts?: ComponentType<any>[];
  /** Parsed route params (e.g. `{ id: "123" }`). */
  params: Record<string, string>;
  /** Parsed query params. */
  searchParams: Record<string, string>;
  /** Metadata exported by the page module (`export const metadata = ...`). */
  metadata?: PageMetadata;
  /** Relative path to the page module, embedded in the HTML for client hydration. */
  routeFile: string;
  /** JSON array of layout file paths for client-side hydration. */
  layoutsJson?: string;
  /** Relative path to nearest loading.tsx, for client Suspense fallback. */
  loadingFile?: string | undefined;
  /** Whether SSR is enabled for this route. */
  ssr: boolean;
  /** Extra HTML to inject into <head> (Vite injects its HMR tags here in dev). */
  headExtra?: string;
  /** CSP nonce (optional). */
  nonce?: string;
}

/**
 * Render a page component to a streaming HTTP response using React 19's
 * `renderToPipeableStream`. The HTML shell is split at the `<div id="alab-root">`
 * boundary: the opening fragment is flushed before React begins streaming, and
 * the closing fragment is appended when the stream finishes.
 */
export function renderToResponse(res: ServerResponse, opts: RenderOptions): void {
  const {
    Page,
    layouts = [],
    params,
    searchParams,
    metadata = {},
    routeFile,
    layoutsJson,
    loadingFile,
    ssr,
    headExtra,
    nonce,
  } = opts;

  const shellOpts: HtmlShellOptions = {
    metadata,
    paramsJson: JSON.stringify(params),
    searchParamsJson: JSON.stringify(searchParams),
    routeFile,
    layoutsJson,
    loadingFile,
    ssr,
    headExtra,
    nonce,
  };

  const before = htmlShellBefore(shellOpts);
  const after = htmlShellAfter({ nonce });

  // Build element tree: Page wrapped by layouts outermost→innermost
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pageEl = createElement(Page, { params, searchParams }) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rootEl: any = layouts.length
    ? layouts.reduceRight((child, Layout) => createElement(Layout, {}, child), pageEl)
    : pageEl;

  let didError = false;
  let headersSent = false;

  const { pipe, abort } = renderToPipeableStream(
    rootEl,
    {
      onShellReady() {
        if (headersSent) return;
        headersSent = true;

        res.statusCode = didError ? 500 : 200;
        res.setHeader("content-type", "text/html; charset=utf-8");
        res.write(before);

        // Wrap the Node.js response in a Writable that appends the closing
        // shell fragment once React finishes streaming.
        const writable = new Writable({
          write(chunk: Buffer, _enc, cb) {
            res.write(chunk, cb);
          },
          final(cb) {
            res.write(after);
            res.end();
            cb();
          },
        });

        pipe(writable);
      },

      onShellError(err) {
        // React couldn't render even the shell boundary — send a plain error page.
        if (!headersSent) {
          headersSent = true;
          res.statusCode = 500;
          res.setHeader("content-type", "text/plain; charset=utf-8");
          const msg = err instanceof Error ? err.message : String(err);
          res.end(`[alabjs] SSR shell error in ${routeFile}: ${msg}`);
        }
        console.error(`[alabjs] SSR shell error in ${routeFile}:`, err);
      },

      onError(err) {
        didError = true;
        console.error(`[alabjs] SSR component error in ${routeFile}:`, err);
      },
    },
  );

  // Abort the stream if the client disconnects early.
  res.on("close", () => {
    if (!res.writableEnded) abort();
  });
}

/**
 * Render a page component to a full HTML string.
 * Used in dev mode when streaming is not needed (faster iteration).
 */
export async function renderToString(
  Page: ComponentType<{ params: Record<string, string>; searchParams: Record<string, string> }>,
  params: Record<string, string>,
  searchParams: Record<string, string>,
): Promise<string> {
  const { renderToString: reactRenderToString } = await import("react-dom/server");
  return reactRenderToString(createElement(Page, { params, searchParams }));
}
