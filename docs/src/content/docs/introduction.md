---
title: Introduction
description: What Alab JS is, why it exists, and when to use it.
sidebar:
  order: 1
---

# Introduction

**Alab JS** is an open-source, full-stack React framework designed around one idea: the right defaults should be the easy defaults.

Every Alab JS app starts at 95+ Lighthouse, has security headers set, streams real HTML from the server, and compiles with a Rust-powered compiler — without writing a single line of configuration.

## The Core Idea

Most React frameworks give you tools and leave configuration up to you. You choose when to SSR, which caching strategy to use, how to set security headers, and how to optimize images. Get any of it wrong and your app is slow, insecure, or penalized by search engines.

Alab inverts this. The framework makes the correct choice by default. You opt out of behaviors you don't need — not opt in to the ones you do.

| Default behavior | What it means |
|---|---|
| CSR by default, SSR opt-in | Pages render on the client unless you add `export const ssr = true`. Opt-in SSR keeps client pages fast for interactive apps. |
| Security headers on every response | `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` — set automatically. |
| CSRF protection | All non-GET server function calls require a valid token. Zero configuration. |
| Tailwind CSS v4 included | Start writing utility classes. No PostCSS, no Tailwind config. |
| Code splitting | Each route is its own JS chunk. Users only download what they need. |
| Image optimization | `<Image>` converts to WebP, generates `srcset`, lazy-loads by default. |
| Auto sitemap | `/sitemap.xml` is generated from the route manifest. No plugin needed. |

## When to Use Alab

Alab is a great fit for:

- **Full-stack React apps** that need server-rendered pages, API routes, and a database
- **Content sites and blogs** that need SEO, fast loads, and a great Lighthouse score
- **SPAs** that want a clean build pipeline without custom Vite config
- **Apps with strict security requirements** that need headers, CSRF, and boundary enforcement
- **Teams migrating from other frameworks** who want typed server functions without `"use client"` magic

## TypeScript Only

Alab does not support plain JavaScript. Every file in an Alab project is TypeScript.

This is a deliberate design choice, not a limitation. Server function return types flow directly into client components through `import type`. The Rust compiler uses TypeScript's syntax to enforce server/client boundaries and perform dead-code elimination. Without TypeScript, neither works.

If you are migrating an existing JavaScript project, rename your files to `.ts` and `.tsx`. The compiler handles the rest.
