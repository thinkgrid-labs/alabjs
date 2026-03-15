/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createI18nConfig,
  LocaleProvider,
  useLocale,
} from "./index.js";

// ─── createI18nConfig ─────────────────────────────────────────────────────────

describe("createI18nConfig", () => {
  it("creates a config with the given locales and default", () => {
    const i18n = createI18nConfig({ locales: ["en", "fil"], defaultLocale: "en" });
    expect(i18n.locales).toEqual(["en", "fil"]);
    expect(i18n.defaultLocale).toBe("en");
  });

  it("throws if defaultLocale is not in locales", () => {
    expect(() =>
      createI18nConfig({ locales: ["en"], defaultLocale: "fil" }),
    ).toThrow('[alabjs/i18n] defaultLocale "fil" must be in the locales array');
  });
});

// ─── detectLocale ─────────────────────────────────────────────────────────────

describe("detectLocale", () => {
  const i18n = createI18nConfig({
    locales: ["en", "fil", "es"],
    defaultLocale: "en",
  });

  it("detects locale from URL prefix", () => {
    const req = new Request("http://localhost/fil/about");
    expect(i18n.detectLocale(req)).toBe("fil");
  });

  it("detects locale from cookie", () => {
    const req = new Request("http://localhost/about", {
      headers: { cookie: "locale=es" },
    });
    expect(i18n.detectLocale(req)).toBe("es");
  });

  it("detects locale from Accept-Language header", () => {
    const req = new Request("http://localhost/about", {
      headers: { "accept-language": "fil;q=0.9,en;q=0.8" },
    });
    expect(i18n.detectLocale(req)).toBe("fil");
  });

  it("falls back to defaultLocale when nothing matches", () => {
    const req = new Request("http://localhost/about", {
      headers: { "accept-language": "ja;q=0.9,zh;q=0.8" },
    });
    expect(i18n.detectLocale(req)).toBe("en");
  });

  it("URL prefix takes precedence over cookie", () => {
    const req = new Request("http://localhost/es/page", {
      headers: { cookie: "locale=fil" },
    });
    expect(i18n.detectLocale(req)).toBe("es");
  });

  it("cookie takes precedence over Accept-Language", () => {
    const req = new Request("http://localhost/page", {
      headers: {
        cookie: "locale=fil",
        "accept-language": "es;q=0.9",
      },
    });
    expect(i18n.detectLocale(req)).toBe("fil");
  });

  it("ignores unknown cookie locale", () => {
    const req = new Request("http://localhost/page", {
      headers: { cookie: "locale=ja" },
    });
    expect(i18n.detectLocale(req)).toBe("en");
  });

  it("handles Accept-Language with language subtag matching", () => {
    const req = new Request("http://localhost/page", {
      headers: { "accept-language": "en-US,en;q=0.9" },
    });
    expect(i18n.detectLocale(req)).toBe("en");
  });
});

// ─── hasLocalePrefix ──────────────────────────────────────────────────────────

describe("hasLocalePrefix", () => {
  const i18n = createI18nConfig({
    locales: ["en", "fil"],
    defaultLocale: "en",
  });

  it("returns true for paths with locale prefix", () => {
    expect(i18n.hasLocalePrefix("/en/about")).toBe(true);
    expect(i18n.hasLocalePrefix("/fil/page")).toBe(true);
  });

  it("returns false for paths without locale prefix", () => {
    expect(i18n.hasLocalePrefix("/about")).toBe(false);
    expect(i18n.hasLocalePrefix("/")).toBe(false);
  });
});

// ─── stripLocale ──────────────────────────────────────────────────────────────

describe("stripLocale", () => {
  const i18n = createI18nConfig({
    locales: ["en", "fil"],
    defaultLocale: "en",
  });

  it("strips locale prefix", () => {
    expect(i18n.stripLocale("/en/about")).toBe("/about");
    expect(i18n.stripLocale("/fil/page")).toBe("/page");
  });

  it("returns / for locale-only path", () => {
    expect(i18n.stripLocale("/en")).toBe("/");
  });

  it("returns original path when no locale prefix", () => {
    expect(i18n.stripLocale("/about")).toBe("/about");
  });
});

// ─── localePath ───────────────────────────────────────────────────────────────

describe("localePath", () => {
  const i18n = createI18nConfig({ locales: ["en", "fil"], defaultLocale: "en" });

  it("prefixes path with locale", () => {
    expect(i18n.localePath("fil", "/about")).toBe("/fil/about");
  });

  it("handles path without leading slash", () => {
    expect(i18n.localePath("en", "about")).toBe("/en/about");
  });
});

// ─── LocaleProvider + useLocale ───────────────────────────────────────────────

describe("LocaleProvider + useLocale", () => {
  function LocaleDisplay() {
    const locale = useLocale();
    return createElement("span", null, locale);
  }

  it("provides locale to children via context", () => {
    const html = renderToString(
      createElement(LocaleProvider, { locale: "fil", children: createElement(LocaleDisplay) })
    );
    expect(html).toContain("fil");
  });

  it("defaults to en when no provider", () => {
    const html = renderToString(createElement(LocaleDisplay));
    expect(html).toContain("en");
  });
});
