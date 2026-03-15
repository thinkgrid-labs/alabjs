import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  // Set site + base to match your GitHub Pages URL.
  // If the repo name is "alab", Pages serves at https://<org>.github.io/alab/
  site: "https://thinkgrid-labs.github.io",
  base: "/alabjs",
  integrations: [
    starlight({
      title: "🔥 AlabJS",
      customCss: ["./src/styles/custom.css"],
      description: "The blazing-fast React framework with a Rust core.",
      social: {
        github: "https://github.com/alab-framework/alab",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "" },
            { label: "Installation", slug: "installation" },
            { label: "Project Structure", slug: "project-structure" },
          ],
        },
        {
          label: "Core Concepts",
          items: [
            { label: "Routing", slug: "routing" },
            { label: "Server Functions", slug: "server-functions" },
            { label: "SSR & CSR", slug: "ssr-csr" },
            { label: "Data Fetching", slug: "data-fetching" },
            { label: "Mutations", slug: "mutations" },
          ],
        },
        {
          label: "Components",
          items: [
            { label: "Image", slug: "image" },
            { label: "Link", slug: "link" },
            { label: "Script", slug: "script" },
          ],
        },
        {
          label: "Reference",
          items: [
            { label: "Signals", slug: "reference/signals" },
            { label: "Internationalisation", slug: "reference/i18n" },
            { label: "Server-Sent Events", slug: "reference/sse" },
            { label: "Offline & Sync", slug: "reference/offline" },
            { label: "Cache & ISR", slug: "reference/cache" },
            { label: "Testing", slug: "reference/testing" },
            { label: "CLI", slug: "reference/cli" },
          ],
        },
        {
          label: "Guides",
          items: [
            { label: "Building a SPA", slug: "guides/spa" },
            { label: "Full-stack SEO", slug: "guides/fullstack-seo" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { label: "Self-hosted Node.js", slug: "deployment/node" },
            { label: "Cloudflare Workers", slug: "deployment/cloudflare" },
          ],
        },
      ],
    }),
  ],
});
