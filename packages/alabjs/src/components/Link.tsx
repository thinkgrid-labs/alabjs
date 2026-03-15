import type { AnchorHTMLAttributes, MouseEvent } from "react";

export interface LinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  href: string;
  /** Prefetch the target page on hover (default: true). */
  prefetch?: boolean;
}

declare global {
  interface Window {
    __alabjs_navigate?: (href: string) => Promise<void>;
  }
}

/**
 * Client-side navigation link for AlabJS.
 *
 * Intercepts same-origin clicks and swaps the page content without a full
 * browser reload. Falls back to a standard `<a>` navigation when JavaScript
 * is unavailable or when the user holds a modifier key (Cmd/Ctrl/Shift/Alt).
 *
 * On hover (with `prefetch`, default true), the target page is fetched in the
 * background so the browser caches it before the user clicks.
 */
export function Link({ href, children, prefetch = true, onClick, ...rest }: LinkProps) {
  const isSameOrigin = (url: string): boolean => {
    if (url.startsWith("/")) return true;
    try {
      return new URL(url).origin === window.location.origin;
    } catch {
      return false;
    }
  };

  const handleClick = async (e: MouseEvent<HTMLAnchorElement>) => {
    // Let the browser handle modifier-key clicks (open in new tab etc.)
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (!isSameOrigin(href)) return;

    e.preventDefault();
    onClick?.(e);

    if (typeof window.__alabjs_navigate === "function") {
      await window.__alabjs_navigate(href);
    } else {
      window.location.href = href;
    }
  };

  const handleMouseEnter = prefetch
    ? () => {
        if (typeof window.__alabjs_navigate === "function") {
          // Fire-and-forget; browser caches the response automatically.
          fetch(href, { priority: "low" } as RequestInit).catch(() => {});
        }
      }
    : undefined;

  return (
    <a href={href} onClick={handleClick} onMouseEnter={handleMouseEnter} {...rest}>
      {children}
    </a>
  );
}
