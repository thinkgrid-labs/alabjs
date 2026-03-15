export type RouteKind = "page" | "server" | "layout" | "error" | "loading";

export interface Route {
  path: string;
  file: string;
  kind: RouteKind;
  ssr: boolean;
  params: string[];
}

export interface RouteManifest {
  routes: Route[];
}
