use serde::{Deserialize, Serialize};

/// What kind of route file this is.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RouteKind {
    /// A React page component (`*.page.tsx` / `page.tsx`)
    Page,
    /// A server-only data/action file (`*.server.ts`)
    Server,
    /// A layout file (`layout.tsx`)
    Layout,
    /// A catch-all error boundary (`error.tsx`)
    Error,
    /// A loading skeleton (`loading.tsx`)
    Loading,
    /// An HTTP API route handler (`route.ts` / `route.tsx`)
    Api,
    /// A live component (`*.live.tsx` / `*.live.ts` or `"use live"` directive)
    Live,
}

/// A single entry in the route manifest.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Route {
    /// URL path pattern, e.g. `/users/[id]`
    pub path: String,
    /// Absolute filesystem path to the file.
    pub file: String,
    /// What kind of route this is.
    pub kind: RouteKind,
    /// Whether SSR is enabled for this route.
    /// Defaults to false (CSR) unless `export const ssr = true` is detected.
    pub ssr: bool,
    /// Dynamic path segments extracted from the filename, e.g. `["id"]`
    pub params: Vec<String>,
}

/// The complete route manifest for an Alab app.
#[derive(Debug, Serialize, Deserialize)]
pub struct RouteManifest {
    pub routes: Vec<Route>,
}
