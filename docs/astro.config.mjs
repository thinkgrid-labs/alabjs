import { defineConfig } from "astro/config";
import starlight from "@astrojs/starlight";

export default defineConfig({
  integrations: [
    starlight({
      title: "Alab",
      description: "The blazing-fast React framework with a Rust core.",
      logo: {
        alt: "Alab",
        replacesTitle: false,
      },
      social: {
        github: "https://github.com/alab-framework/alab",
      },
      sidebar: [
        {
          label: "Getting Started",
          items: [
            { label: "Introduction", slug: "introduction" },
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
          ],
        },
        {
          label: "Components",
          items: [
            { label: "Image", slug: "image" },
          ],
        },
        {
          label: "Deployment",
          items: [
            { label: "Self-hosted Node.js", slug: "deployment/node" },
          ],
        },
      ],
    }),
  ],
});
