import { defineConfig } from "vitepress";

export default defineConfig({
  title: "🔥 AlabJS",
  description: "The blazing-fast React framework with a Rust core.",
  base: "/alabjs/",

  ignoreDeadLinks: [/^http:\/\/localhost/],

  head: [
    ["meta", { name: "og:title", content: "AlabJS — React framework with a Rust core" }],
    ["meta", { name: "og:description", content: "Full-stack React framework. 95+ Lighthouse out of the box. Rust compiler, zero config." }],
    ["meta", { name: "og:type", content: "website" }],
    ["link", { rel: "preconnect", href: "https://fonts.googleapis.com" }],
    ["link", { rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" }],
    [
      "link",
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Outfit:wght@600;700;800&display=swap",
      },
    ],
  ],

  themeConfig: {
    siteTitle: "🔥 AlabJS",

    nav: [
      { text: "Guide", link: "/installation" },
      { text: "Reference", link: "/reference/cli" },
      { text: "GitHub", link: "https://github.com/thinkgrid-labs/alabjs" },
    ],

    sidebar: [
      {
        text: "Getting Started",
        items: [
          { text: "Introduction", link: "/introduction" },
          { text: "Installation", link: "/installation" },
          { text: "Project Structure", link: "/project-structure" },
        ],
      },
      {
        text: "Core Concepts",
        items: [
          { text: "Routing", link: "/routing" },
          { text: "Server Functions", link: "/server-functions" },
          { text: "SSR & CSR", link: "/ssr-csr" },
          { text: "Data Fetching", link: "/data-fetching" },
          { text: "Mutations", link: "/mutations" },
        ],
      },
      {
        text: "Components",
        items: [
          { text: "Image", link: "/image" },
          { text: "Link", link: "/link" },
          { text: "Script", link: "/script" },
        ],
      },
      {
        text: "Reference",
        items: [
          { text: "Signals", link: "/reference/signals" },
          { text: "Internationalisation", link: "/reference/i18n" },
          { text: "Server-Sent Events", link: "/reference/sse" },
          { text: "Offline & Sync", link: "/reference/offline" },
          { text: "Cache & ISR", link: "/reference/cache" },
          { text: "Testing", link: "/reference/testing" },
          { text: "CLI", link: "/reference/cli" },
        ],
      },
      {
        text: "Guides",
        items: [
          { text: "Building a SPA", link: "/guides/spa" },
          { text: "Full-stack SEO", link: "/guides/fullstack-seo" },
        ],
      },
      {
        text: "Deployment",
        items: [
          { text: "Self-hosted Node.js", link: "/deployment/node" },
          { text: "Cloudflare Workers", link: "/deployment/cloudflare" },
        ],
      },
    ],

    socialLinks: [
      { icon: "github", link: "https://github.com/thinkgrid-labs/alabjs" },
    ],

    footer: {
      message: "Released under the MIT License.",
      copyright: "Copyright © ThinkGrid Labs",
    },

    search: {
      provider: "local",
    },

    editLink: {
      pattern: "https://github.com/thinkgrid-labs/alabjs/edit/main/docs/:path",
      text: "Edit this page on GitHub",
    },
  },
});
