/**
 * Alab SSE — Server-Sent Events for API routes.
 *
 * `defineSSEHandler` wraps an async generator into a standard `Response` that
 * streams SSE to the browser. Drop it into any `route.ts` as the `GET` export.
 *
 * @example
 * ```ts
 * // app/api/prices/route.ts
 * import { defineSSEHandler } from "alabjs/server";
 *
 * export const GET = defineSSEHandler(async function* (req) {
 *   const url = new URL(req.url);
 *   const ticker = url.searchParams.get("ticker") ?? "BTC";
 *
 *   for (let i = 0; i < 100; i++) {
 *     yield { event: "price", data: { ticker, price: Math.random() * 1000 }, id: String(i) };
 *     await new Promise((r) => setTimeout(r, 1000));
 *   }
 *
 *   // Signal the client the stream is done
 *   yield { event: "done", data: null };
 * });
 * ```
 */

// ─── SSE event shape ──────────────────────────────────────────────────────────

export interface SSEEvent<T = unknown> {
  /** Named event type. Defaults to `"message"` when omitted. */
  event?: string;
  /** Payload — serialised to JSON automatically. Pass `null` for ping frames. */
  data: T;
  /** Optional event ID for `lastEventId` reconnect support. */
  id?: string;
  /** Retry hint in milliseconds (sent as `retry:` field). */
  retry?: number;
}

// ─── Serialise one event to the SSE wire format ───────────────────────────────

function encodeEvent(evt: SSEEvent): string {
  let frame = "";
  if (evt.id !== undefined) frame += `id: ${evt.id}\n`;
  if (evt.event) frame += `event: ${evt.event}\n`;
  if (evt.retry !== undefined) frame += `retry: ${evt.retry}\n`;
  frame += `data: ${evt.data === null ? "" : JSON.stringify(evt.data)}\n`;
  frame += "\n"; // blank line terminates the event
  return frame;
}

// ─── defineSSEHandler ─────────────────────────────────────────────────────────

type SSEGenerator<T> = (req: Request) => AsyncGenerator<SSEEvent<T>>;

/**
 * Wrap an async generator into an SSE-streaming `GET` handler.
 *
 * The returned function is a standard `(req: Request) => Response` that is
 * directly usable as `export const GET` in an `app/.../ route.ts`.
 *
 * The generator can `yield` as many events as needed. When it returns (or
 * throws), the stream is closed. The client can reconnect automatically via
 * the browser's native `EventSource` retry behaviour.
 *
 * @example
 * ```ts
 * export const GET = defineSSEHandler(async function* (req) {
 *   while (true) {
 *     yield { data: { time: Date.now() } };
 *     await new Promise((r) => setTimeout(r, 2000));
 *   }
 * });
 * ```
 */
export function defineSSEHandler<T = unknown>(
  generator: SSEGenerator<T>,
): (req: Request) => Response {
  return (req: Request): Response => {
    const encoder = new TextEncoder();

    const body = new ReadableStream({
      async start(controller) {
        // Send an initial comment to flush the connection through proxies / nginx
        controller.enqueue(encoder.encode(": connected\n\n"));

        try {
          for await (const evt of generator(req)) {
            controller.enqueue(encoder.encode(encodeEvent(evt as SSEEvent)));
          }
        } catch {
          // Generator threw — close stream cleanly so the client can retry
        } finally {
          controller.close();
        }
      },
    });

    return new Response(body, {
      status: 200,
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "connection": "keep-alive",
        // Disable nginx / Cloudflare buffering
        "x-accel-buffering": "no",
      },
    });
  };
}
