/**
 * Alab i18n — locale routing with zero runtime overhead.
 *
 * Locale is detected once per request (from URL prefix → cookie → Accept-Language)
 * and injected into a React context. Pages are served at `/:locale/path`.
 *
 * @example
 * ```ts
 * // i18n.ts (project root)
 * import { createI18nConfig } from "alabjs/i18n";
 *
 * export const i18n = createI18nConfig({
 *   locales: ["en", "fil", "es"],
 *   defaultLocale: "en",
 * });
 * ```
 *
 * ```ts
 * // middleware.ts — redirect bare paths to locale prefix
 * import { i18n } from "./i18n.js";
 * import { redirect } from "alabjs/middleware";
 *
 * export async function middleware(req: Request) {
 *   const locale = i18n.detectLocale(req);
 *   const { pathname } = new URL(req.url);
 *
 *   // Already has a locale prefix — pass through
 *   if (i18n.hasLocalePrefix(pathname)) return;
 *
 *   // Redirect /about → /en/about
 *   return redirect(`/${locale}${pathname}`);
 * }
 * ```
 *
 * ```tsx
 * // app/[locale]/layout.tsx
 * import { LocaleProvider } from "alabjs/i18n";
 *
 * export default function LocaleLayout({ params, children }) {
 *   return <LocaleProvider locale={params.locale}>{children}</LocaleProvider>;
 * }
 * ```
 */

import { createContext, useContext, type ReactNode } from "react";

// ─── Config ───────────────────────────────────────────────────────────────────

export interface I18nConfig {
  /** All supported locale codes, e.g. `["en", "fil", "es"]`. */
  locales: string[];
  /** Locale used when no match is found. Must be in `locales`. */
  defaultLocale: string;
}

export interface I18nInstance extends I18nConfig {
  /**
   * Detect the best locale for an incoming request.
   *
   * Priority order:
   * 1. URL pathname prefix (`/en/`, `/fil/`)
   * 2. `locale` cookie
   * 3. `Accept-Language` header (first matching locale)
   * 4. `defaultLocale`
   */
  detectLocale(req: Request): string;
  /** Return true if the pathname already starts with a supported locale prefix. */
  hasLocalePrefix(pathname: string): boolean;
  /**
   * Strip the locale prefix from a pathname.
   * `/en/about` → `/about`, `/about` → `/about`
   */
  stripLocale(pathname: string): string;
  /**
   * Build a locale-prefixed path.
   * `localePath("fil", "/about")` → `/fil/about`
   */
  localePath(locale: string, path: string): string;
}

/**
 * Create an i18n configuration instance.
 *
 * @example
 * ```ts
 * export const i18n = createI18nConfig({ locales: ["en", "fil"], defaultLocale: "en" });
 * ```
 */
export function createI18nConfig(config: I18nConfig): I18nInstance {
  const { locales, defaultLocale } = config;

  if (!locales.includes(defaultLocale)) {
    throw new Error(`[alabjs/i18n] defaultLocale "${defaultLocale}" must be in the locales array`);
  }

  const localeSet = new Set(locales);

  function detectLocale(req: Request): string {
    const url = new URL(req.url);

    // 1. URL prefix
    const firstSegment = url.pathname.split("/")[1] ?? "";
    if (localeSet.has(firstSegment)) return firstSegment;

    // 2. Cookie
    const cookieHeader = req.headers.get("cookie") ?? "";
    const localeCookie = parseCookieLocale(cookieHeader, locales);
    if (localeCookie) return localeCookie;

    // 3. Accept-Language
    const acceptLang = req.headers.get("accept-language") ?? "";
    const detected = parseAcceptLanguage(acceptLang, locales);
    if (detected) return detected;

    return defaultLocale;
  }

  function hasLocalePrefix(pathname: string): boolean {
    const first = pathname.split("/")[1] ?? "";
    return localeSet.has(first);
  }

  function stripLocale(pathname: string): string {
    const first = pathname.split("/")[1] ?? "";
    if (localeSet.has(first)) {
      return pathname.slice(first.length + 1) || "/";
    }
    return pathname;
  }

  function localePath(locale: string, path: string): string {
    const clean = path.startsWith("/") ? path : `/${path}`;
    return `/${locale}${clean}`;
  }

  return { locales, defaultLocale, detectLocale, hasLocalePrefix, stripLocale, localePath };
}

// ─── React context ────────────────────────────────────────────────────────────

const LocaleCtx = createContext<string>("en");

export interface LocaleProviderProps {
  locale: string;
  children: ReactNode;
}

/**
 * Provide the current locale to all child components.
 * Place this in your `app/[locale]/layout.tsx`.
 *
 * @example
 * ```tsx
 * export default function LocaleLayout({ params, children }) {
 *   return <LocaleProvider locale={params.locale}>{children}</LocaleProvider>;
 * }
 * ```
 */
export function LocaleProvider({ locale, children }: LocaleProviderProps) {
  return <LocaleCtx.Provider value={locale}>{children}</LocaleCtx.Provider>;
}

/**
 * Read the current locale from context.
 * Must be used inside a `<LocaleProvider>`.
 *
 * @example
 * ```tsx
 * const locale = useLocale(); // "en" | "fil" | "es"
 * ```
 */
export function useLocale(): string {
  return useContext(LocaleCtx);
}

// ─── Locale-aware Link ────────────────────────────────────────────────────────

import type { AnchorHTMLAttributes } from "react";

export interface LocaleLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /**
   * Override the locale for this link. Defaults to the current locale from context.
   * Pass `false` to emit the href with no locale prefix.
   */
  locale?: string | false;
}

/**
 * A `<Link>`-compatible anchor that automatically prefixes the `href` with
 * the current (or specified) locale.
 *
 * @example
 * ```tsx
 * // Current locale is "en"
 * <LocaleLink href="/about">About</LocaleLink>
 * // renders: <a href="/en/about">About</a>
 *
 * // Switch to Filipino
 * <LocaleLink href="/about" locale="fil">Filipino</LocaleLink>
 * // renders: <a href="/fil/about">Filipino</a>
 * ```
 */
export function LocaleLink({ href, locale, children, onClick, ...rest }: LocaleLinkProps) {
  const currentLocale = useLocale();
  const targetLocale = locale === false ? null : (locale ?? currentLocale);

  const resolvedHref = targetLocale ? `/${targetLocale}${href.startsWith("/") ? href : `/${href}`}` : href;

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (typeof window !== "undefined" && "__alab_navigate" in window) {
      (window as { __alab_navigate: (h: string) => void }).__alab_navigate(resolvedHref);
    } else {
      window.location.href = resolvedHref;
    }
  };

  return <a href={resolvedHref} onClick={handleClick} {...rest}>{children}</a>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseCookieLocale(cookieHeader: string, locales: string[]): string | null {
  for (const part of cookieHeader.split(";")) {
    const [key, val] = part.trim().split("=");
    if (key?.trim() === "locale" && val && locales.includes(val.trim())) {
      return val.trim();
    }
  }
  return null;
}

function parseAcceptLanguage(header: string, locales: string[]): string | null {
  // Parse "en-US,en;q=0.9,fil;q=0.8" → [["en-US", 1], ["en", 0.9], ["fil", 0.8]]
  const entries = header
    .split(",")
    .map((part) => {
      const [lang, q] = part.trim().split(";q=");
      return { lang: lang?.trim() ?? "", q: parseFloat(q ?? "1") };
    })
    .sort((a, b) => b.q - a.q);

  for (const { lang } of entries) {
    // Exact match first (e.g. "fil")
    if (locales.includes(lang)) return lang;
    // Language-only match (e.g. "en" matches "en-US")
    const base = lang.split("-")[0] ?? "";
    const match = locales.find((l) => l === base || l.startsWith(base + "-"));
    if (match) return match;
  }
  return null;
}
