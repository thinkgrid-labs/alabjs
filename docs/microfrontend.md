---
title: Microfrontends
description: First-class microfrontend support in AlabJS — native ESM + import maps, no Module Federation runtime required.
---

AlabJS implements microfrontends using **native browser ESM + import maps** — no webpack/rspack runtime, no `__webpack_require__`, no extra dependencies. Each remote app exposes standard ES modules; the host app resolves them at runtime through a `<script type="importmap">` injected by the framework.

This approach works natively in every modern browser and Node.js 18+. Because it's built on web standards, it is fully compatible with Vite 8 + Rolldown.

## Concepts

| Term | Meaning |
|---|---|
| **Host** | The app that consumes remote components |
| **Remote** | The app that exposes components |
| `federation.name` | Namespace for this app's exposed modules |
| `federation.exposes` | Components/modules this app publishes |
| `federation.remotes` | Remote apps this app consumes |

## Configuration

Create `alabjs.config.ts` in your project root and export a config with `defineConfig`:

```ts
// alabjs.config.ts
import { defineConfig } from "alabjs";

export default defineConfig({
  federation: {
    // This app's namespace (used in the /_alabjs/remotes/<name>/ URL)
    name: "marketing",

    // Expose these components to any remote host
    exposes: {
      "HeroBanner": "./app/components/HeroBanner",
      "NavBar":     "./app/components/NavBar",
    },

    // Consume components from these remote apps
    remotes: {
      "Dashboard": "https://dashboard.internal.example.com",
    },

    // Extra packages to treat as shared singletons (react/react-dom automatic)
    shared: ["date-fns"],
  },
});
```

## Exposing components (remote app)

Any React component can be exposed — no special wrapper needed:

```tsx
// app/components/HeroBanner.tsx
export default function HeroBanner({ headline }: { headline: string }) {
  return <section><h1>{headline}</h1></section>;
}
```

After `alab build`, AlabJS produces:

```
.alabjs/dist/client/
  _alabjs/
    remotes/
      marketing/
        HeroBanner.js   ← standalone ESM, react externalized
        NavBar.js
    vendor/
      react.js          ← shared React singleton for the host
      react-dom.js
      …
    federation-manifest.json
```

The manifest is served at `/_alabjs/federation-manifest.json` and lists what's available:

```json
{
  "name": "marketing",
  "exposes": {
    "HeroBanner": "/_alabjs/remotes/marketing/HeroBanner.js",
    "NavBar":     "/_alabjs/remotes/marketing/NavBar.js"
  }
}
```

## Consuming remote components (host app)

Use `useFederatedComponent` from `alabjs/client`. The specifier format is `"<RemoteName>/<ExposedName>"`:

```tsx
// app/page.tsx
import { useFederatedComponent } from "alabjs/client";
import { Suspense } from "react";

// Resolved at runtime via the host's import map — zero bundler overhead.
const RemoteHero = useFederatedComponent("Dashboard/HeroBanner");

export default function HomePage() {
  return (
    <main>
      <Suspense fallback={<div>Loading…</div>}>
        <RemoteHero headline="Welcome" />
      </Suspense>
    </main>
  );
}
```

AlabJS automatically injects this into the page's `<head>` when `federation.remotes` is configured:

```html
<script type="importmap">
{
  "imports": {
    "Dashboard/": "https://dashboard.internal.example.com/_alabjs/remotes/Dashboard/",
    "react":            "/_alabjs/vendor/react.js",
    "react/jsx-runtime": "/_alabjs/vendor/react-jsx-runtime.js",
    "react-dom":        "/_alabjs/vendor/react-dom.js",
    "react-dom/client": "/_alabjs/vendor/react-dom-client.js"
  }
}
</script>
```

The trailing-slash scope means any `"Dashboard/*"` specifier resolves to the correct remote file — no manifest fetch or runtime routing required.

## React as a shared singleton

Remote modules externalize `react` and `react-dom`. The host's import map points both to `/_alabjs/vendor/react.js` (a build artifact from the host), so **host and remote share the exact same React instance**. This is required for hooks and context to work across boundaries.

In dev mode (`alab dev`), React is provided by Vite's module graph and the import map only includes remote scope entries — no `/_alabjs/vendor/` files are needed in development.

## Monorepo setup

In a pnpm workspace you can run multiple apps locally:

```bash
# terminal 1 — remote app
alab dev --cwd apps/dashboard --port 3001

# terminal 2 — host app (consumes the remote)
alab dev --cwd apps/marketing --port 3000
```

Host config:

```ts
// apps/marketing/alabjs.config.ts
export default defineConfig({
  federation: {
    name: "marketing",
    remotes: {
      "Dashboard": "http://localhost:3001",
    },
  },
});
```

## How it works

```
Browser loads host page
  │
  ├─ <script type="importmap"> { "Dashboard/": "http://…" }
  │
  ├─ <script type="module" src="/@alabjs/client">
  │     └─ React hydrates the page
  │
  └─ useFederatedComponent("Dashboard/Widget")
       └─ React.lazy(() => import("Dashboard/Widget"))
            └─ Browser resolves via import map
                 → GET http://dashboard.example.com/_alabjs/remotes/Dashboard/Widget.js
                      └─ ESM module with react externalized
                           └─ `import "react"` resolved via import map
                                → /_alabjs/vendor/react.js  ← host's copy
```

## Limitations in v0.x

- **SSR of remote components** is not yet supported. Remote components render client-side only (wrapped in `<Suspense>`). Full SSR federation is planned for v1.0.
- **Hot reloading** across app boundaries in dev mode requires restarting the consuming app after changes to the remote.
- **CORS**: Remote apps must serve `/_alabjs/remotes/` with `access-control-allow-origin: *` (AlabJS does this automatically via its static file middleware).
