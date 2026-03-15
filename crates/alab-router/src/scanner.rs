use std::path::Path;

use regex::Regex;
use walkdir::WalkDir;

use crate::manifest::{Route, RouteKind, RouteManifest};

/// Walk the `app_dir` and build a `RouteManifest` from the file tree.
///
/// Convention:
/// - `page.tsx` or `*.page.tsx`  → Page route
/// - `*.server.ts` / `*.server.tsx` → Server route
/// - `layout.tsx` → Layout
/// - `error.tsx` → Error boundary
/// - `loading.tsx` → Loading skeleton
///
/// Dynamic segments use the `[param]` bracket convention in directory names.
pub fn scan_routes(app_dir: &str) -> RouteManifest {
    let base = Path::new(app_dir);
    let mut routes = Vec::new();

    for entry in WalkDir::new(app_dir)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
    {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }

        let Some(ext) = path.extension().and_then(|e| e.to_str()) else {
            continue;
        };

        // Alab is TypeScript-only. Plain .js / .jsx files are not recognized.
        if !matches!(ext, "ts" | "tsx") {
            continue;
        }

        let file_name = path.file_name().unwrap().to_str().unwrap();
        let kind = classify_file(file_name);

        let Some(kind) = kind else { continue };

        let rel = path.strip_prefix(base).unwrap_or(path);
        let url_path = file_to_url_path(rel);
        let params = extract_params(&url_path);

        routes.push(Route {
            path: url_path,
            file: path.to_string_lossy().into_owned(),
            kind,
            ssr: false, // SSR opt-in detected at build time by Node.js layer
            params,
        });
    }

    // Sort: layouts first, then pages, then server, then error/loading
    routes.sort_by_key(|r| match r.kind {
        RouteKind::Layout => 0,
        RouteKind::Page => 1,
        RouteKind::Server => 2,
        RouteKind::Error => 3,
        RouteKind::Loading => 4,
    });

    RouteManifest { routes }
}

fn classify_file(name: &str) -> Option<RouteKind> {
    if name == "page.tsx" || name.ends_with(".page.tsx") {
        Some(RouteKind::Page)
    } else if name.ends_with(".server.ts") || name.ends_with(".server.tsx") {
        Some(RouteKind::Server)
    } else if name == "layout.tsx" {
        Some(RouteKind::Layout)
    } else if name == "error.tsx" {
        Some(RouteKind::Error)
    } else if name == "loading.tsx" {
        Some(RouteKind::Loading)
    } else {
        None
    }
}

/// Convert a relative filesystem path to a URL path.
///
/// `users/[id]/page.tsx` → `/users/[id]`
fn file_to_url_path(rel: &Path) -> String {
    let mut parts: Vec<&str> = rel
        .components()
        .filter_map(|c| {
            if let std::path::Component::Normal(s) = c {
                Some(s.to_str().unwrap_or(""))
            } else {
                None
            }
        })
        .collect();

    // Remove the filename (last part) — the directory IS the route segment
    if let Some(last) = parts.last() {
        if is_route_filename(last) {
            parts.pop();
        }
    }

    if parts.is_empty() {
        return "/".to_string();
    }

    format!("/{}", parts.join("/"))
}

fn is_route_filename(name: &str) -> bool {
    matches!(name, "page.tsx" | "layout.tsx" | "error.tsx" | "loading.tsx")
        || name.ends_with(".page.tsx")
        || name.ends_with(".server.ts")
        || name.ends_with(".server.tsx")
}

/// Extract dynamic param names from a URL path like `/users/[id]/posts/[slug]`.
fn extract_params(path: &str) -> Vec<String> {
    let re = Regex::new(r"\[([^\]]+)\]").unwrap();
    re.captures_iter(path)
        .map(|c| c[1].to_string())
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extracts_dynamic_params() {
        let path = "/users/[id]";
        let params = extract_params(path);
        assert_eq!(params, vec!["id"]);
    }

    #[test]
    fn extracts_multiple_params() {
        let params = extract_params("/teams/[team]/posts/[slug]");
        assert_eq!(params, vec!["team", "slug"]);
    }

    #[test]
    fn file_to_url_path_converts_correctly() {
        let cases = [
            ("page.tsx", "/"),
            ("users/page.tsx", "/users"),
            ("users/[id]/page.tsx", "/users/[id]"),
        ];
        for (input, expected) in cases {
            let result = file_to_url_path(Path::new(input));
            assert_eq!(result, expected, "failed for {input}");
        }
    }
}
