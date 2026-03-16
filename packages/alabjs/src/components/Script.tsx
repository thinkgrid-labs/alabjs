import { useEffect, type HTMLAttributes, type ReactNode } from "react";

/** Props shared by both external-src and inline-children variants. */
interface ScriptBaseProps extends Omit<HTMLAttributes<HTMLScriptElement>, "src"> {
  /**
   * Loading strategy:
   * - `"beforeInteractive"` — injected into `<head>` during SSR; blocks page rendering.
   *   Use only for scripts that must run before the page is interactive (e.g., analytics init).
   * - `"afterInteractive"` (default) — loaded after the page becomes interactive via a
   *   dynamically appended `<script>` tag. Best for tag managers, chat widgets, etc.
   * - `"lazyOnload"` — deferred until the browser is idle (`requestIdleCallback`).
   *   Best for low-priority scripts like A/B testing, heatmaps, social embeds.
   */
  strategy?: "beforeInteractive" | "afterInteractive" | "lazyOnload";
  /** Called once the script has loaded successfully (external scripts only). */
  onLoad?: () => void;
  /** Called if the script fails to load (external scripts only). */
  onError?: () => void;
}

/** External script variant — `src` is required and `children` must be absent. */
interface ExternalScriptProps extends ScriptBaseProps {
  /** URL of the external script to load. */
  src: string;
  children?: never;
}

/** Inline script variant — `children` contains the script body; `src` must be absent. */
interface InlineScriptProps extends ScriptBaseProps {
  src?: never;
  children: ReactNode;
}

export type ScriptProps = ExternalScriptProps | InlineScriptProps;

/**
 * Load a third-party script with strategy control.
 *
 * @example
 * ```tsx
 * // Analytics — load after page is interactive
 * <Script src="https://analytics.example.com/script.js" strategy="afterInteractive" />
 *
 * // Chat widget — load when browser is idle
 * <Script
 *   src="https://cdn.example.com/chat.js"
 *   strategy="lazyOnload"
 *   onLoad={() => console.log("Chat ready")}
 * />
 * ```
 */
export function Script({
  src,
  strategy = "afterInteractive",
  onLoad,
  onError,
  children,
  ...rest
}: ScriptProps) {
  // ── Inline script: render <script>{children}</script> directly ──────────────
  // Inline scripts have no loading strategy — they are always rendered as-is.
  // For SSR (beforeInteractive) they land in the HTML stream; for client
  // renders they are injected once via useEffect.
  if (!src) {
    if (strategy === "beforeInteractive") {
      if (typeof window !== "undefined") return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <script {...(rest as any)}>{children}</script>;
    }
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
      const el = document.createElement("script");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      if (typeof children === "string") el.textContent = children;
      for (const [k, v] of Object.entries(rest)) {
        if (typeof v === "string") el.setAttribute(k, v);
      }
      document.head.appendChild(el);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return null;
  }

  // ── External script ─────────────────────────────────────────────────────────

  // `beforeInteractive` is handled at SSR time by rendering a real <script> tag.
  // The component returns null on the client to avoid duplicate injection.
  if (strategy === "beforeInteractive") {
    // On the server this renders into the HTML stream; on the client we skip it
    // because the script is already in the <head> from SSR.
    if (typeof window !== "undefined") return null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return <script src={src} {...(rest as any)} />;
  }

  // eslint-disable-next-line react-hooks/rules-of-hooks
  useEffect(() => {
    // Skip during SSR (useEffect only runs in the browser).
    const load = () => {
      if (document.querySelector(`script[src="${CSS.escape(src)}"]`)) {
        // Already loaded by a previous render — fire onLoad immediately.
        onLoad?.();
        return;
      }

      const el = document.createElement("script");
      el.src = src;
      el.async = true;
      if (onLoad) el.addEventListener("load", onLoad, { once: true });
      if (onError) el.addEventListener("error", onError, { once: true });

      // Copy through any extra data-* or other HTML attributes.
      for (const [k, v] of Object.entries(rest)) {
        if (typeof v === "string") el.setAttribute(k, v);
      }

      document.head.appendChild(el);
    };

    if (strategy === "lazyOnload") {
      if ("requestIdleCallback" in window) {
        const id = requestIdleCallback(load);
        return () => cancelIdleCallback(id);
      }
      // Fallback for browsers without requestIdleCallback (Safari < 16.4).
      const t = setTimeout(load, 200);
      return () => clearTimeout(t);
    }

    // "afterInteractive" — load immediately in useEffect (after hydration).
    load();
    return undefined;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src, strategy]);

  // No DOM output — the <script> is appended imperatively.
  return null;
}
