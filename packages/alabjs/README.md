# AlabJS

> Full-stack React framework powered by a Rust compiler.

[![npm version](https://img.shields.io/npm/v/alabjs)](https://www.npmjs.com/package/alabjs)
[![license](https://img.shields.io/npm/l/alabjs)](https://github.com/thinkgrid-labs/alabjs/blob/main/LICENSE)

## Features

- **Rust compiler** — oxc-powered transform pipeline, faster than any JS toolchain
- **Streaming SSR** — `renderToPipeableStream` with shell/content split out of the box
- **Server functions** — `defineServerFn` with Zod validation, caching, and typed fetch stubs
- **Signals** — SolidJS-inspired fine-grained reactivity via `useSyncExternalStore`
- **File-based routing** — TanStack Router-inspired with typed params and loaders
- **ISR** — stale-while-revalidate with on-demand revalidation via `POST /_alabjs/revalidate`
- **i18n** — URL prefix → cookie → Accept-Language detection chain
- **Offline support** — service worker queue with `useOfflineMutations`
- **Zero config** — Tailwind 4, TypeScript, and HMR ready from `create-alabjs`

## Install

```bash
npx create-alabjs@latest my-app
cd my-app
pnpm install && pnpm dev
```

## CLI

```bash
alab dev          # Dev server with HMR
alab build        # Production build (Vite + Rolldown)
alab start        # Start production H3 server
alab ssg          # Pre-render static routes to HTML
alab test         # Run tests with Vitest
alab info         # Print route manifest and server functions
```

## Documentation

[alabjs.dev](https://thinkgrid-labs.github.io/alabjs/)

## License

MIT © [ThinkGrid Labs](https://github.com/thinkgrid-labs)
