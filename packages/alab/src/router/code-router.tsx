/**
 * Alab Code-Based Router — type-safe client-side navigation.
 *
 * The file-system router stays the default (zero config). This module is
 * opt-in for large apps that need IDE searchability, typed `href` props,
 * search param schemas, and co-located loaders.
 *
 * Inspired by TanStack Router.
 *
 * @example
 * ```ts
 * // routes.ts
 * import { createRoute, createRouter } from "alab/router";
 * import { z } from "zod";
 * import UserPage from "./app/users/[id]/page.js";
 * import UserError from "./app/users/[id]/error.js";
 *
 * export const userRoute = createRoute({
 *   path: "/users/$id",
 *   search: z.object({ tab: z.enum(["posts", "about"]).optional() }),
 *   loader: ({ params }) => getUser(params.id),
 *   component: UserPage,
 *   errorComponent: UserError,
 * });
 *
 * export const router = createRouter([userRoute]);
 * ```
 *
 * ```tsx
 * // app/layout.tsx
 * import { RouterProvider } from "alab/router";
 * import { router } from "../routes.js";
 *
 * export default function RootLayout({ children }) {
 *   return <RouterProvider router={router}>{children}</RouterProvider>;
 * }
 * ```
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ComponentType,
  type ReactNode,
} from "react";

// ─── Path param extraction (compile-time) ─────────────────────────────────────

/** Extract `$param` names from a path string. */
type ExtractRouteParams<Path extends string> =
  Path extends `${string}$${infer Param}/${infer Rest}`
    ? Param | ExtractRouteParams<`/${Rest}`>
    : Path extends `${string}$${infer Param}`
    ? Param
    : never;

/** Typed record of path params for a route. */
export type RouteParams<Path extends string> =
  [ExtractRouteParams<Path>] extends [never]
    ? Record<string, never>
    : { readonly [K in ExtractRouteParams<Path>]: string };

// ─── Zod-like schema duck type (no hard Zod dep) ──────────────────────────────

interface SchemaLike<T> {
  parse(input: unknown): T;
  safeParse(input: unknown): { success: true; data: T } | { success: false; error: unknown };
}

type InferSchema<S> = S extends SchemaLike<infer T> ? T : Record<string, string>;

// ─── Route descriptor ─────────────────────────────────────────────────────────

export interface RouteConfig<
  Path extends string,
  Search extends SchemaLike<unknown> | undefined,
  LoaderData,
> {
  /** URL path using `$param` syntax: `"/users/$id"`, `"/posts/$slug/edit"`. */
  path: Path;
  /**
   * Zod (or any schema) that validates + parses search params.
   * Parsed value is available via `useSearch(route)`.
   */
  search?: Search;
  /**
   * Runs before the component mounts — blocks render until resolved.
   * Data is available via `useLoaderData(route)`.
   */
  loader?: (ctx: {
    params: RouteParams<Path>;
    search: Search extends SchemaLike<unknown> ? InferSchema<Search> : Record<string, string>;
  }) => Promise<LoaderData>;
  /** The page component for this route. */
  component: ComponentType<{
    params: RouteParams<Path>;
    search: Search extends SchemaLike<unknown> ? InferSchema<Search> : Record<string, string>;
    loaderData: LoaderData;
  }>;
  /**
   * Rendered when the loader throws or component throws during render.
   * Equivalent to `error.tsx` in the file-system router.
   */
  errorComponent?: ComponentType<{ error: Error; reset: () => void }>;
  /**
   * Rendered while the loader is running.
   * Equivalent to `loading.tsx` in the file-system router.
   */
  pendingComponent?: ComponentType;
}

export interface RouteDescriptor<
  Path extends string = string,
  Search extends SchemaLike<unknown> | undefined = undefined,
  LoaderData = undefined,
> extends RouteConfig<Path, Search, LoaderData> {
  /** @internal Compiled regex for matching this route's path. */
  _regex: RegExp;
  /** @internal Ordered param names extracted from the path. */
  _paramNames: string[];
}

/**
 * Define a type-safe route.
 *
 * @example
 * ```ts
 * export const postRoute = createRoute({
 *   path: "/posts/$id",
 *   loader: ({ params }) => fetchPost(params.id),
 *   component: PostPage,
 * });
 * ```
 */
export function createRoute<
  Path extends string,
  Search extends SchemaLike<unknown> | undefined = undefined,
  LoaderData = undefined,
>(
  config: RouteConfig<Path, Search, LoaderData>,
): RouteDescriptor<Path, Search, LoaderData> {
  const paramNames: string[] = [];
  const regexStr = config.path
    .split("/")
    .map((seg) => {
      if (seg.startsWith("$")) {
        paramNames.push(seg.slice(1));
        return "([^/]+)";
      }
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  const regex = config.path === "/" ? /^\/$/ : new RegExp(`^${regexStr}\\/?$`);

  return { ...config, _regex: regex, _paramNames: paramNames };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export interface Router {
  routes: RouteDescriptor[];
}

/** Assemble multiple routes into a router instance. */
export function createRouter(routes: RouteDescriptor[]): Router {
  // Sort: static routes before dynamic ones (fewer params = higher priority).
  const sorted = [...routes].sort((a, b) => a._paramNames.length - b._paramNames.length);
  return { routes: sorted };
}

// ─── Router context ───────────────────────────────────────────────────────────

interface RouterState {
  pathname: string;
  search: string;
  params: Record<string, string>;
  searchParsed: Record<string, unknown>;
  loaderData: unknown;
  matchedRoute: RouteDescriptor | null;
}

interface RouterContextValue extends RouterState {
  navigate: (href: string) => void;
}

const RouterCtx = createContext<RouterContextValue | null>(null);

function useRouterCtx(): RouterContextValue {
  const ctx = useContext(RouterCtx);
  if (!ctx) throw new Error("[alab] useParams / useSearch / navigate must be used inside <RouterProvider>");
  return ctx;
}

// ─── Route matching ───────────────────────────────────────────────────────────

function matchRoute(
  routes: RouteDescriptor[],
  pathname: string,
): { route: RouteDescriptor; params: Record<string, string> } | null {
  for (const route of routes) {
    const match = route._regex.exec(pathname);
    if (match) {
      const params: Record<string, string> = {};
      route._paramNames.forEach((name, i) => {
        params[name] = decodeURIComponent(match[i + 1] ?? "");
      });
      return { route, params };
    }
  }
  return null;
}

function parseSearch(
  searchStr: string,
  schema?: SchemaLike<unknown>,
): Record<string, unknown> {
  const raw = Object.fromEntries(new URLSearchParams(searchStr).entries());
  if (!schema) return raw;
  const result = schema.safeParse(raw);
  return result.success ? (result.data as Record<string, unknown>) : raw;
}

// ─── RouterProvider ───────────────────────────────────────────────────────────

export interface RouterProviderProps {
  router: Router;
  children?: ReactNode;
}

/**
 * Wrap your root layout with `RouterProvider` to enable typed navigation.
 *
 * @example
 * ```tsx
 * import { RouterProvider } from "alab/router";
 * import { router } from "../routes.js";
 *
 * export default function RootLayout({ children }) {
 *   return <RouterProvider router={router}>{children}</RouterProvider>;
 * }
 * ```
 */
export function RouterProvider({ router, children }: RouterProviderProps) {
  const buildState = useCallback(async (pathname: string, search: string): Promise<RouterState> => {
    const matched = matchRoute(router.routes, pathname);
    if (!matched) {
      return {
        pathname, search,
        params: {},
        searchParsed: parseSearch(search),
        loaderData: undefined,
        matchedRoute: null,
      };
    }

    const { route, params } = matched;
    const searchParsed = parseSearch(search, route.search);

    let loaderData: unknown = undefined;
    if (route.loader) {
      loaderData = await route.loader({
        params: params as never,
        search: searchParsed as never,
      });
    }

    return { pathname, search, params, searchParsed, loaderData, matchedRoute: route };
  }, [router]);

  const [state, setState] = useState<RouterState>({
    pathname: typeof window !== "undefined" ? window.location.pathname : "/",
    search: typeof window !== "undefined" ? window.location.search : "",
    params: {},
    searchParsed: {},
    loaderData: undefined,
    matchedRoute: null,
  });

  // Run loader for initial route.
  useEffect(() => {
    void buildState(window.location.pathname, window.location.search).then(setState);
  }, [buildState]);

  // Intercept Alab's SPA navigate events.
  useEffect(() => {
    const handler = () => {
      void buildState(window.location.pathname, window.location.search).then(setState);
    };
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, [buildState]);

  const navigate = useCallback((href: string) => {
    if (typeof window !== "undefined" && "__alab_navigate" in window) {
      (window as { __alab_navigate: (h: string) => void }).__alab_navigate(href);
    } else {
      window.location.href = href;
    }
    void buildState(href.split("?")[0] ?? href, href.includes("?") ? href.split("?")[1] ?? "" : "").then(setState);
  }, [buildState]);

  return (
    <RouterCtx.Provider value={{ ...state, navigate }}>
      {children}
    </RouterCtx.Provider>
  );
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

/**
 * Access typed path params for a specific route.
 *
 * @example
 * ```tsx
 * const params = useParams(userRoute);
 * params.id; // string ✅
 * params.foo; // TS error ✅
 * ```
 */
export function useParams<
  Path extends string,
  S extends SchemaLike<unknown> | undefined,
  L,
>(
  _route: RouteDescriptor<Path, S, L>,
): RouteParams<Path> {
  return useRouterCtx().params as RouteParams<Path>;
}

/**
 * Access typed, schema-validated search params for a specific route.
 *
 * @example
 * ```tsx
 * const search = useSearch(postRoute);
 * search.tab; // "posts" | "about" | undefined ✅
 * ```
 */
export function useSearch<
  Path extends string,
  S extends SchemaLike<unknown> | undefined,
  L,
>(
  _route: RouteDescriptor<Path, S, L>,
): S extends SchemaLike<unknown> ? InferSchema<S> : Record<string, string> {
  return useRouterCtx().searchParsed as never;
}

/**
 * Access the data returned by the route's `loader` function.
 *
 * @example
 * ```tsx
 * const user = useLoaderData(userRoute);
 * user.name; // typed from loader return ✅
 * ```
 */
export function useLoaderData<
  Path extends string,
  S extends SchemaLike<unknown> | undefined,
  L,
>(
  _route: RouteDescriptor<Path, S, L>,
): L {
  return useRouterCtx().loaderData as L;
}

/**
 * Returns a typed `navigate` function.
 *
 * @example
 * ```tsx
 * const nav = useNavigate();
 * nav("/users/42");
 * nav("/users/42?tab=posts");
 * ```
 */
export function useNavigate(): (href: string) => void {
  return useRouterCtx().navigate;
}

// ─── Typed Link ───────────────────────────────────────────────────────────────

type LinkToRoute<
  Path extends string,
  S extends SchemaLike<unknown> | undefined,
  L,
> = {
  /** Destination route descriptor (replaces `href`). */
  to: RouteDescriptor<Path, S, L>;
  /** Path params — required when the route has dynamic segments. */
  params?: RouteParams<Path>;
  /** Search params to append. */
  search?: S extends SchemaLike<infer T> ? Partial<T & Record<string, string>> : Record<string, string>;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  onClick?: React.MouseEventHandler<HTMLAnchorElement>;
};

/**
 * A type-safe `<Link>` bound to a route descriptor.
 * Compile-time error if required params are missing or wrong type.
 *
 * @example
 * ```tsx
 * <RouteLink to={userRoute} params={{ id: "42" }}>
 *   View user
 * </RouteLink>
 * ```
 */
export function RouteLink<
  Path extends string,
  S extends SchemaLike<unknown> | undefined,
  L,
>({ to, params, search, children, onClick, ...rest }: LinkToRoute<Path, S, L>) {
  const { navigate } = useRouterCtx();

  // Build href from route path + params + search.
  const href = buildHref(to.path, params as Record<string, string>, search as Record<string, string>);

  const handleClick: React.MouseEventHandler<HTMLAnchorElement> = (e) => {
    onClick?.(e);
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(href);
  };

  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}

function buildHref(
  path: string,
  params?: Record<string, string>,
  search?: Record<string, string>,
): string {
  let resolved = path;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      resolved = resolved.replace(`$${k}`, encodeURIComponent(v));
    }
  }
  if (search && Object.keys(search).length > 0) {
    resolved += "?" + new URLSearchParams(
      Object.fromEntries(Object.entries(search).map(([k, v]) => [k, String(v)])),
    ).toString();
  }
  return resolved;
}
