import { describe, it, expect } from "vitest";
import { csrfMetaTag } from "./csrf.js";

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
