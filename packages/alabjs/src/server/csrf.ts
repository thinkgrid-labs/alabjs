import { timingSafeEqual } from "node:crypto";
import {
  defineEventHandler,
  getCookie,
  getHeader,
  setCookie,
  createError,
  type H3Event,
} from "h3";

export const CSRF_COOKIE = "alab-csrf";
export const CSRF_HEADER = "x-csrf-token";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * CSRF protection middleware using the Double Submit Cookie pattern.
 *
 * - Safe methods (GET, HEAD, OPTIONS) are always allowed.
 * - Mutating requests must include an `x-csrf-token` header whose value
 *   matches the `alab-csrf` cookie set by `setCsrfCookie()`.
 * - The cookie is `SameSite=Strict` (first line of defence). The header
 *   check is a second layer that prevents attacks from subdomains.
 * - Disabled in development (NODE_ENV !== "production") for DX.
 */
export function csrfMiddleware() {
  return defineEventHandler((event) => {
    // Skip in development — avoid friction during local iteration.
    if (process.env["NODE_ENV"] !== "production") return;

    const method = event.method.toUpperCase();
    if (SAFE_METHODS.has(method)) return;

    const cookieToken = getCookie(event, CSRF_COOKIE);
    const headerToken = getHeader(event, CSRF_HEADER);

    const tokensMatch =
      !!cookieToken &&
      !!headerToken &&
      cookieToken.length === headerToken.length &&
      timingSafeEqual(Buffer.from(cookieToken), Buffer.from(headerToken));

    if (!tokensMatch) {
      throw createError({
        statusCode: 403,
        message: "CSRF token mismatch. Include the x-csrf-token header.",
      });
    }
  });
}

/**
 * Set a CSRF cookie on the response and return the generated token.
 * Call this on every GET page response so the client always has a fresh token.
 *
 * The cookie is intentionally NOT HttpOnly so JavaScript can read and send
 * it as the `x-csrf-token` request header.
 */
export function setCsrfCookie(event: H3Event): string {
  const existing = getCookie(event, CSRF_COOKIE);
  if (existing) return existing;

  const token = crypto.randomUUID();
  setCookie(event, CSRF_COOKIE, token, {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env["NODE_ENV"] === "production",
    path: "/",
    maxAge: 60 * 60 * 24, // 24 hours
  });
  return token;
}

/**
 * Inject the CSRF token as a `<meta name="csrf-token">` tag into
 * the HTML shell so client code can read it without a separate request.
 */
export function csrfMetaTag(token: string): string {
  return `<meta name="csrf-token" content="${token.replace(/"/g, "&quot;")}" />`;
}
