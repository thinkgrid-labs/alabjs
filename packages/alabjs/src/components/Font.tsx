/**
 * Font — self-hosted web font loader.
 *
 * In development this renders preconnect + Google Fonts stylesheet links so
 * fonts load immediately with `font-display: swap`.
 *
 * In production (`alab build`) the build step downloads the font files to
 * `public/_fonts/` and generates self-hosted `@font-face` CSS, so no
 * third-party network request is made at runtime.
 *
 * Usage (inside a layout or page `<head>`-equivalent):
 * ```tsx
 * import { Font } from "alabjs/components";
 *
 * // Single family
 * <Font family="Inter" weights={[400, 500, 700]} />
 *
 * // Multiple families
 * <Font family="Inter" weights={[400, 700]} />
 * <Font family="Fira Code" weights={[400]} subsets={["latin"]} />
 * ```
 */

export interface FontProps {
  /**
   * Google Fonts family name, exactly as it appears on fonts.google.com.
   * e.g. `"Inter"`, `"Roboto"`, `"Fira Code"`
   */
  family: string;
  /**
   * Font weights to load. Defaults to `[400]`.
   * Numeric weights (100–900). Pass `[400, 700]` for regular + bold.
   */
  weights?: number[];
  /**
   * Unicode subsets to include. Defaults to `["latin"]`.
   * Adding extra subsets (e.g. `"latin-ext"`, `"cyrillic"`) increases file size.
   */
  subsets?: string[];
  /**
   * CSS `font-display` value. Defaults to `"swap"` which prevents invisible
   * text during font load (FOIT → FOUT is a better user experience).
   */
  display?: "auto" | "block" | "swap" | "fallback" | "optional";
  /**
   * Whether to load italic variants in addition to the requested weights.
   * Defaults to `false`.
   */
  italic?: boolean;
}

/**
 * Build the Google Fonts v2 URL for the requested family + weights.
 * Format: fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap
 */
function buildGoogleFontsUrl(props: FontProps): string {
  const {
    family,
    weights = [400],
    subsets = ["latin"],
    display = "swap",
    italic = false,
  } = props;

  const encodedFamily = family.replace(/ /g, "+");

  // Google Fonts v2 axis syntax: "ital,wght@0,400;0,700;1,400;1,700"
  const axes: string[] = [];
  const sortedWeights = [...weights].sort((a, b) => a - b);

  if (italic) {
    for (const w of sortedWeights) axes.push(`0,${w}`);
    for (const w of sortedWeights) axes.push(`1,${w}`);
    const axisTag = `ital,wght@${axes.join(";")}`;
    return `https://fonts.googleapis.com/css2?family=${encodedFamily}:${axisTag}&display=${display}&subset=${subsets.join(",")}`;
  }

  const wghtValues = sortedWeights.join(";");
  return `https://fonts.googleapis.com/css2?family=${encodedFamily}:wght@${wghtValues}&display=${display}&subset=${subsets.join(",")}`;
}

/**
 * Renders the `<link>` tags needed to load a Google Font.
 *
 * Only active in development (Vite dev server). In production (`alab build`),
 * the build step self-hosts the font files, so this component renders nothing.
 * Gating on `import.meta.env.DEV` ensures the server and client always agree:
 * both render the links in dev, both render nothing in production — preventing
 * a hydration mismatch that occurs when the server loads the pre-built dist
 * (where `import.meta.env.DEV` is `false`) while the client gets live Vite
 * processing (where it is `true`).
 */
export function Font(props: FontProps) {
  // Return nothing in production — self-hosted fonts are injected by the build.
  // This must be checked before building the URL so the server and client
  // always produce identical output (both null in prod, both links in dev).
  if (!import.meta.env.DEV) return null;

  const href = buildGoogleFontsUrl(props);

  return (
    <>
      {/* Speed up the Google Fonts connection. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      {/* The actual font stylesheet — renders server-side, no layout shift. */}
      <link rel="stylesheet" href={href} />
    </>
  );
}
