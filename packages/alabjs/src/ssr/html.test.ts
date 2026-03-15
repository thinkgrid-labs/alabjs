import { describe, it, expect } from "vitest";
import { htmlShellBefore, htmlShellAfter } from "./html.js";

describe("htmlShellBefore", () => {
  const baseOpts = {
    metadata: {},
    paramsJson: "{}",
    searchParamsJson: "{}",
    routeFile: "app/page.tsx",
    ssr: false,
  };

  it("produces valid HTML doctype and structure", () => {
    const html = htmlShellBefore(baseOpts);
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="UTF-8" />');
    expect(html).toContain('<div id="alabjs-root">');
  });

  it("includes alabjs-route meta tag", () => {
    const html = htmlShellBefore(baseOpts);
    expect(html).toContain('<meta name="alabjs-route" content="app/page.tsx" />');
  });

  it("includes alabjs-ssr meta tag set to false", () => {
    const html = htmlShellBefore(baseOpts);
    expect(html).toContain('<meta name="alabjs-ssr" content="false" />');
  });

  it("includes alabjs-ssr meta tag set to true", () => {
    const html = htmlShellBefore({ ...baseOpts, ssr: true });
    expect(html).toContain('<meta name="alabjs-ssr" content="true" />');
  });

  it("embeds params JSON", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      paramsJson: '{"id":"42"}',
    });
    expect(html).toContain('<meta name="alabjs-params" content="{&quot;id&quot;:&quot;42&quot;}" />');
  });

  it("includes title tag when metadata has title", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: { title: "My Page" },
    });
    expect(html).toContain("<title>My Page</title>");
  });

  it("escapes HTML in title", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: { title: "<script>alert(1)</script>" },
    });
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
  });

  it("includes description meta tag", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: { description: "A test page" },
    });
    expect(html).toContain('<meta name="description" content="A test page" />');
  });

  it("includes canonical link", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: { canonical: "https://example.com/page" },
    });
    expect(html).toContain('<link rel="canonical" href="https://example.com/page" />');
  });

  it("includes robots meta tag", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: { robots: "noindex, nofollow" },
    });
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  it("includes theme-color meta tag", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: { themeColor: "#ff6600" },
    });
    expect(html).toContain('<meta name="theme-color" content="#ff6600" />');
  });

  it("includes Open Graph tags", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: {
        og: {
          title: "OG Title",
          description: "OG Desc",
          image: "https://example.com/og.png",
          url: "https://example.com",
          type: "website",
          siteName: "Example",
        },
      },
    });
    expect(html).toContain('<meta property="og:title" content="OG Title" />');
    expect(html).toContain('<meta property="og:description" content="OG Desc" />');
    expect(html).toContain('<meta property="og:image" content="https://example.com/og.png" />');
    expect(html).toContain('<meta property="og:url" content="https://example.com" />');
    expect(html).toContain('<meta property="og:type" content="website" />');
    expect(html).toContain('<meta property="og:site_name" content="Example" />');
  });

  it("includes Twitter Card tags", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: {
        twitter: {
          card: "summary_large_image",
          title: "TW Title",
          description: "TW Desc",
          image: "https://example.com/tw.png",
          creator: "@alabjs",
        },
      },
    });
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(html).toContain('<meta name="twitter:title" content="TW Title" />');
    expect(html).toContain('<meta name="twitter:creator" content="@alabjs" />');
  });

  it("includes extra meta tags", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      metadata: {
        extra: [
          { name: "author", content: "AlabJS Team" },
          { property: "article:author", content: "https://example.com" },
        ],
      },
    });
    expect(html).toContain('name="author"');
    expect(html).toContain('content="AlabJS Team"');
    expect(html).toContain('property="article:author"');
  });

  it("includes layouts meta tag when provided", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      layoutsJson: '["app/layout.tsx"]',
    });
    expect(html).toContain('name="alabjs-layouts"');
  });

  it("includes loading meta tag when provided", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      loadingFile: "app/loading.tsx",
    });
    expect(html).toContain('<meta name="alabjs-loading" content="app/loading.tsx" />');
  });

  it("includes headExtra content", () => {
    const html = htmlShellBefore({
      ...baseOpts,
      headExtra: '<meta name="csrf-token" content="abc123" />',
    });
    expect(html).toContain('<meta name="csrf-token" content="abc123" />');
  });

  it("includes globals.css link", () => {
    const html = htmlShellBefore(baseOpts);
    expect(html).toContain('<link rel="stylesheet" href="/app/globals.css" />');
  });
});

describe("htmlShellAfter", () => {
  it("closes the alabjs-root div and body/html", () => {
    const html = htmlShellAfter({});
    expect(html).toContain("</div>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  it("includes the client script tag", () => {
    const html = htmlShellAfter({});
    expect(html).toContain('<script type="module" src="/@alabjs/client">');
  });

  it("includes nonce when provided", () => {
    const html = htmlShellAfter({ nonce: "abc123" });
    expect(html).toContain('nonce="abc123"');
  });

  it("escapes quotes in nonce", () => {
    const html = htmlShellAfter({ nonce: 'test"nonce' });
    expect(html).toContain("&quot;");
  });
});
