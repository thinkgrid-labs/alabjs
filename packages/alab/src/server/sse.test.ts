import { describe, it, expect } from "vitest";
import { defineSSEHandler, type SSEEvent } from "./sse.js";

describe("defineSSEHandler", () => {
  it("returns a function", () => {
    const handler = defineSSEHandler(async function* () {});
    expect(typeof handler).toBe("function");
  });

  it("returns a Response with correct SSE headers", () => {
    const handler = defineSSEHandler(async function* () {});
    const req = new Request("http://localhost/api/events");
    const res = handler(req);

    expect(res).toBeInstanceOf(Response);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("no-cache, no-transform");
    expect(res.headers.get("connection")).toBe("keep-alive");
    expect(res.headers.get("x-accel-buffering")).toBe("no");
  });

  it("streams SSE events with correct wire format", async () => {
    const handler = defineSSEHandler(async function* () {
      yield { event: "price", data: { ticker: "BTC", price: 42000 }, id: "1" } as SSEEvent;
      yield { data: "plain message" } as SSEEvent;
    });

    const req = new Request("http://localhost/api/events");
    const res = handler(req);
    const text = await res.text();

    // Should start with the connection comment
    expect(text).toContain(": connected\n\n");
    // Named event
    expect(text).toContain("event: price\n");
    expect(text).toContain("id: 1\n");
    expect(text).toContain('data: {"ticker":"BTC","price":42000}\n');
    // Default message event
    expect(text).toContain('data: "plain message"\n');
  });

  it("handles events with retry field", async () => {
    const handler = defineSSEHandler(async function* () {
      yield { data: "reconnect", retry: 5000 } as SSEEvent;
    });

    const req = new Request("http://localhost/api/events");
    const res = handler(req);
    const text = await res.text();

    expect(text).toContain("retry: 5000\n");
  });

  it("handles null data (ping frames)", async () => {
    const handler = defineSSEHandler(async function* () {
      yield { event: "ping", data: null } as SSEEvent;
    });

    const req = new Request("http://localhost/api/events");
    const res = handler(req);
    const text = await res.text();

    expect(text).toContain("event: ping\n");
    expect(text).toContain("data: \n");
  });

  it("closes stream cleanly when generator throws", async () => {
    const handler = defineSSEHandler(async function* () {
      yield { data: "before error" } as SSEEvent;
      throw new Error("stream error");
    });

    const req = new Request("http://localhost/api/events");
    const res = handler(req);
    // Should not throw — error is caught internally
    const text = await res.text();
    expect(text).toContain(': connected');
    expect(text).toContain('data: "before error"');
  });
});
