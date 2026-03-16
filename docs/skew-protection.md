---
title: Skew Protection
description: AlabJS stamps a build ID at compile time and automatically hard-reloads clients that are running stale JS bundles.
---

Skew protection prevents users from running a stale JavaScript bundle after you deploy a new version. Without it, a user who loaded the page before your deploy could trigger navigation requests that the new server doesn't understand — causing silent failures, blank screens, or broken hydration.

AlabJS handles this automatically. No configuration required.

## How it works

### Build time

Every `alab build` writes a stable build ID to `.alabjs/dist/BUILD_ID` using a three-level strategy:

1. **Git short SHA** — deterministic, human-readable, zero CPU cost. Used when the build runs inside a git repository.
2. **Rust FNV-1a hash** of the route manifest — content-addressed, no git required. Used in CI environments without git history.
3. **Base-36 timestamp** — last resort fallback for all other cases.

The build ID is also injected into every HTML response as:

```html
<meta name="alabjs-build-id" content="a3f9c12e" />
```

### Runtime — server side

On every page response, AlabJS sets:

```
X-Alab-Build-ID: a3f9c12e
```

When a client sends a navigation request with an older build ID, the server sets:

```
X-Alab-Revalidate: 1
```

### Runtime — client side

The AlabJS client reads the `alabjs-build-id` meta tag at page load and stores it as `currentBuildId`. On every client-side navigation (`__alabjs_navigate`):

1. The request includes `x-alab-build-id: <currentBuildId>`.
2. If the response has `x-alab-revalidate: 1` → hard reload to the destination.
3. If the fetched page's `alabjs-build-id` meta differs from `currentBuildId` → hard reload.

The two-layer check ensures detection works even when a CDN strips custom response headers.

## Development mode

In `alab dev`, the build ID is a per-session timestamp (`dev-<base36>`). It changes every time you restart the dev server, so hot reloads never interfere with skew detection logic.

## What "hard reload" means

A hard reload is `window.location.href = href` — a full browser navigation that discards the current JS bundle and downloads fresh assets for the new page. This is invisible to users if the destination page loads quickly (which it will, because you just deployed).

## Zero configuration

Skew protection is always on in production. There is no opt-out flag and no config required. It runs entirely within the AlabJS runtime — no Vercel, no Cloudflare Worker, no special hosting required.

## Build ID in the response

You can inspect the build ID on any response:

```sh
curl -I https://yoursite.com/ | grep x-alab-build-id
# x-alab-build-id: a3f9c12e
```

And in the HTML source:

```html
<meta name="alabjs-build-id" content="a3f9c12e" />
```

## Rust FNV-1a hash

When git is not available, AlabJS uses a pure-Rust FNV-1a 64-bit hash of the compiled route manifest, implemented in the `@alabjs/compiler` napi binary. The hash is deterministic for a given build output — the same source code always produces the same build ID, making deployments reproducible.
