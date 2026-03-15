---
title: Image Component
description: Optimised images with Rust-powered WebP conversion.
---

The `<Image>` component automatically converts images to WebP, generates a responsive `srcset`, and supports blur-up placeholders — all powered by the Alab Rust core (no `sharp` dependency).

## Basic usage

```tsx
import { Image } from "alab/components";

<Image src="/hero.jpg" alt="Hero" width={1200} height={600} />
```

## LCP images

Mark the above-the-fold image as the LCP element to set `loading="eager"` and `fetchpriority="high"`:

```tsx
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} priority />
```

## Blur-up placeholder

Generate a tiny Base64 placeholder on the server for an instant-load feel:

```ts
// In a server function:
import { defineServerFn } from "alab/server";
import { generateBlurPlaceholder } from "alab/components";

export const getHero = defineServerFn(async (_, { publicDir }) => {
  const blur = await generateBlurPlaceholder("/hero.jpg", publicDir);
  return { blur };
});
```

```tsx
// In the page:
<Image src="/hero.jpg" alt="Hero" width={1200} height={600} blurDataURL={blur} />
```

## Props

| Prop | Type | Description |
|------|------|-------------|
| `src` | `string` | Path relative to `/public` or absolute URL |
| `alt` | `string` | Alt text (required) |
| `width` | `number` | Intrinsic width in px |
| `height` | `number` | Intrinsic height in px |
| `sizes` | `string` | `sizes` attribute (default: `${width}px`) |
| `priority` | `boolean` | LCP image — sets eager loading |
| `quality` | `number` | 1–100, default 80 |
| `blurDataURL` | `string` | Base64 blur placeholder |
| `className` | `string` | Additional class names |

## How it works

Images are served from `/_alab/image?src=...&w=...&q=...&fmt=webp`. The Rust napi binding decodes, resizes, and encodes the image on a blocking thread pool — the Node.js event loop is never blocked.
