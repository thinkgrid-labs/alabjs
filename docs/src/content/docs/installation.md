---
title: Installation
description: How to create a new Alab project.
---

## Requirements

- Node.js ≥ 22
- pnpm (recommended) or npm

## Create a new project

```bash
npx create-alab@latest my-app
# or with a template:
npx create-alab@latest my-app --template dashboard
npx create-alab@latest my-app --template blog
```

### Templates

| Template | Description |
|----------|-------------|
| `basic` (default) | Home page + `/users/[id]` server function example |
| `dashboard` | Multi-page dashboard with sidebar layout |
| `blog` | Blog with SSR post pages |

## Manual installation

```bash
mkdir my-app && cd my-app
pnpm init
pnpm add alab react react-dom tailwindcss @tailwindcss/vite
pnpm add -D @types/react @types/react-dom typescript
```
