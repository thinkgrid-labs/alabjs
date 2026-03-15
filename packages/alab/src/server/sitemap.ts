import type { Route } from "../router/manifest.js";

/**
 * Generate a `/sitemap.xml` from the route manifest.
 *
 * Only static page routes are included — dynamic routes (containing `[param]`)
 * cannot be enumerated without knowing all possible param values.
 */
export function generateSitemap(routes: Route[], baseUrl: string): string {
  const base = baseUrl.replace(/\/$/, "");

  const urls = routes
    .filter((r) => r.kind === "page" && !r.path.includes("["))
    .map((r) => {
      const loc = r.path === "/" ? base + "/" : base + r.path;
      return `  <url>\n    <loc>${escXml(loc)}</loc>\n    <changefreq>weekly</changefreq>\n  </url>`;
    })
    .join("\n");

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function escXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
