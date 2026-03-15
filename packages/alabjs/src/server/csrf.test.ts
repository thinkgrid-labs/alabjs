import { describe, it, expect, afterEach } from "vitest";
import { createApp, defineEventHandler, toWebHandler } from "h3";
import { csrfMiddleware, setCsrfCookie, csrfMetaTag, CSRF_COOKIE, CSRF_HEADER } from "./csrf.js";

// ─── csrfMetaTag ─────────────────────────────────────────────────────────────

describe("csrfMetaTag", () => {
  it("generates a meta tag with the token", () => {
    const html = csrfMetaTag("abc-123");
    expect(html).toBe('<meta name="csrf-token" content="abc-123" />');
  });

  it("escapes double quotes in the token", () => {
    const html = csrfMetaTag('token"with"quotes');
    expect(html).toContain("&quot;");
    expect(html).not.toContain('content="token"');
  });

  it("handles empty token", () => {
    const html = csrfMetaTag("");
    expect(html).toBe('<meta name="csrf-token" content="" />');
  });

  it("handles UUID-style tokens", () => {
    const html = csrfMetaTag("550e8400-e29b-41d4-a716-446655440000");
    expect(html).toContain("550e8400-e29b-41d4-a716-446655440000");
  });
});

// ─── csrfMiddleware ───────────────────────────────────────────────────────────

describe("csrfMiddleware", () => {
  const savedEnv = process.env["NODE_ENV"];

  afterEach(() => {
    process.env["NODE_ENV"] = savedEnv;
  });

  function makeHandler() {
    const app = createApp();
    app.use(csrfMiddleware());
    app.use(defineEventHandler(() => "ok"));
    return toWebHandler(app);
  }

  const TOKEN = "550e8400-e29b-41d4-a716-446655440000";

  // Safe methods pass without any token

  it("allows GET without token in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(new Request("http://localhost/"));
    expect(res.status).toBe(200);
  });

  it("allows HEAD without token in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(new Request("http://localhost/", { method: "HEAD" }));
    expect(res.status).toBe(200);
  });

  it("allows OPTIONS without token in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(new Request("http://localhost/", { method: "OPTIONS" }));
    expect(res.status).toBe(200);
  });

  // Valid POST

  it("allows POST with matching cookie and header in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          cookie: `${CSRF_COOKIE}=${TOKEN}`,
          [CSRF_HEADER]: TOKEN,
        },
      }),
    );
    expect(res.status).toBe(200);
  });

  // Missing token cases → 403

  it("rejects POST with no cookie and no header in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(new Request("http://localhost/", { method: "POST" }));
    expect(res.status).toBe(403);
  });

  it("rejects POST with cookie but no header in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(
      new Request("http://localhost/", {
        method: "POST",
        headers: { cookie: `${CSRF_COOKIE}=${TOKEN}` },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects POST with header but no cookie in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(
      new Request("http://localhost/", {
        method: "POST",
        headers: { [CSRF_HEADER]: TOKEN },
      }),
    );
    expect(res.status).toBe(403);
  });

  it("rejects POST with mismatched cookie and header in production", async () => {
    process.env["NODE_ENV"] = "production";
    const res = await makeHandler()(
      new Request("http://localhost/", {
        method: "POST",
        headers: {
          cookie: `${CSRF_COOKIE}=token-a`,
          [CSRF_HEADER]: "token-b",
        },
      }),
    );
    expect(res.status).toBe(403);
  });

  // Non-production bypasses CSRF check

  it("allows POST without token in development mode", async () => {
    process.env["NODE_ENV"] = "development";
    const res = await makeHandler()(new Request("http://localhost/", { method: "POST" }));
    expect(res.status).toBe(200);
  });

  it("allows POST without token when NODE_ENV is unset", async () => {
    delete process.env["NODE_ENV"];
    const res = await makeHandler()(new Request("http://localhost/", { method: "POST" }));
    expect(res.status).toBe(200);
  });
});

// ─── setCsrfCookie ────────────────────────────────────────────────────────────

describe("setCsrfCookie", () => {
  function makeSetCookieHandler() {
    const app = createApp();
    app.use(
      defineEventHandler((event) => {
        const token = setCsrfCookie(event);
        return { token };
      }),
    );
    return toWebHandler(app);
  }

  it("sets a UUID token in the Set-Cookie header", async () => {
    const res = await makeSetCookieHandler()(new Request("http://localhost/"));
    const setCookieHeader = res.headers.get("set-cookie") ?? "";
    expect(setCookieHeader).toMatch(/alab-csrf=[0-9a-f-]{36}/);
  });

  it("returns the generated token in the response", async () => {
    const res = await makeSetCookieHandler()(new Request("http://localhost/"));
    const body = (await res.json()) as { token: string };
    expect(body.token).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it("reuses an existing cookie token instead of generating a new one", async () => {
    const existingToken = "existing-csrf-token-value";
    const res = await makeSetCookieHandler()(
      new Request("http://localhost/", {
        headers: { cookie: `${CSRF_COOKIE}=${existingToken}` },
      }),
    );
    const body = (await res.json()) as { token: string };
    expect(body.token).toBe(existingToken);
  });

  it("does not set HttpOnly on the cookie (must be readable by JS)", async () => {
    const res = await makeSetCookieHandler()(new Request("http://localhost/"));
    const setCookieHeader = (res.headers.get("set-cookie") ?? "").toLowerCase();
    expect(setCookieHeader).not.toContain("httponly");
  });

  it("sets SameSite=Strict on the cookie", async () => {
    const res = await makeSetCookieHandler()(new Request("http://localhost/"));
    const setCookieHeader = (res.headers.get("set-cookie") ?? "").toLowerCase();
    expect(setCookieHeader).toContain("samesite=strict");
  });

  it("sets path=/ on the cookie", async () => {
    const res = await makeSetCookieHandler()(new Request("http://localhost/"));
    const setCookieHeader = (res.headers.get("set-cookie") ?? "").toLowerCase();
    expect(setCookieHeader).toContain("path=/");
  });
});
