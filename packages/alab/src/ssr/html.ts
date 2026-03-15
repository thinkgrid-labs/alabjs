import type { PageMetadata } from "../types/index.js";

export interface HtmlShellOptions {
  metadata: PageMetadata;
  /** Serialised params JSON string to embed in the page for client hydration. */
  paramsJson: string;
  /** Serialised search-params JSON string. */
  searchParamsJson: string;
  /** Relative path to the page module (e.g. `app/users/[id]/page.tsx`). */
  routeFile: string;
  /** Whether SSR is enabled for this route. */
  ssr: boolean;
  /** Extra content injected into <head> (used by Vite to insert HMR scripts). */
  headExtra?: string | undefined;
  /** Nonce for CSP inline scripts (optional). */
  nonce?: string | undefined;
}

/** Build the opening HTML fragment — everything up to and including `<div id="alab-root">`. */
export function htmlShellBefore(opts: HtmlShellOptions): string {
  const {
    metadata,
    paramsJson,
    searchParamsJson,
    routeFile,
    ssr,
    headExtra = "",
  } = opts;

  const titleTag = metadata.title
    ? `<title>${escHtml(metadata.title)}</title>`
    : "";

  const descTag = metadata.description
    ? `<meta name="description" content="${escAttr(metadata.description)}" />`
    : "";

  const canonicalTag = metadata.canonical
    ? `<link rel="canonical" href="${escAttr(metadata.canonical)}" />`
    : "";

  const robotsTag = metadata.robots
    ? `<meta name="robots" content="${escAttr(metadata.robots)}" />`
    : "";

  const themeColorTag = metadata.themeColor
    ? `<meta name="theme-color" content="${escAttr(metadata.themeColor)}" />`
    : "";

  const ogTags = metadata.og ? buildOgTags(metadata.og) : "";
  const twitterTags = metadata.twitter ? buildTwitterTags(metadata.twitter) : "";
  const extraTags = metadata.extra ? buildExtraTags(metadata.extra) : "";

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    ${titleTag}
    ${descTag}
    ${canonicalTag}
    ${robotsTag}
    ${themeColorTag}
    ${ogTags}
    ${twitterTags}
    ${extraTags}
    <meta name="alab-route" content="${escAttr(routeFile)}" />
    <meta name="alab-ssr" content="${ssr ? "true" : "false"}" />
    <meta name="alab-params" content="${escAttr(paramsJson)}" />
    <meta name="alab-search-params" content="${escAttr(searchParamsJson)}" />
    ${headExtra}
  </head>
  <body>
    <div id="alab-root">`;
}

/** Build the closing HTML fragment — everything after the SSR content. */
export function htmlShellAfter(opts: { nonce?: string | undefined }): string {
  const nonceAttr = opts.nonce ? ` nonce="${escAttr(opts.nonce)}"` : "";
  return `</div>
    <script type="module" src="/@alab/client"${nonceAttr}></script>
  </body>
</html>`;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;");
}

function buildOgTags(og: NonNullable<PageMetadata["og"]>): string {
  const tags: string[] = [];
  if (og.title) tags.push(`<meta property="og:title" content="${escAttr(og.title)}" />`);
  if (og.description) tags.push(`<meta property="og:description" content="${escAttr(og.description)}" />`);
  if (og.image) tags.push(`<meta property="og:image" content="${escAttr(og.image)}" />`);
  if (og.url) tags.push(`<meta property="og:url" content="${escAttr(og.url)}" />`);
  if (og.type) tags.push(`<meta property="og:type" content="${escAttr(og.type)}" />`);
  if (og.siteName) tags.push(`<meta property="og:site_name" content="${escAttr(og.siteName)}" />`);
  return tags.join("\n    ");
}

function buildTwitterTags(tw: NonNullable<PageMetadata["twitter"]>): string {
  const tags: string[] = [];
  if (tw.card) tags.push(`<meta name="twitter:card" content="${escAttr(tw.card)}" />`);
  if (tw.title) tags.push(`<meta name="twitter:title" content="${escAttr(tw.title)}" />`);
  if (tw.description) tags.push(`<meta name="twitter:description" content="${escAttr(tw.description)}" />`);
  if (tw.image) tags.push(`<meta name="twitter:image" content="${escAttr(tw.image)}" />`);
  if (tw.creator) tags.push(`<meta name="twitter:creator" content="${escAttr(tw.creator)}" />`);
  return tags.join("\n    ");
}

function buildExtraTags(extra: NonNullable<PageMetadata["extra"]>): string {
  return extra
    .map((attrs) => {
      const attrStr = Object.entries(attrs)
        .map(([k, v]) => `${k}="${escAttr(v)}"`)
        .join(" ");
      return `<meta ${attrStr} />`;
    })
    .join("\n    ");
}
