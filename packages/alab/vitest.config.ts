import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: [
        "src/server/cache.ts",
        "src/server/sitemap.ts",
        "src/server/sse.ts",
        "src/server/middleware.ts",
        "src/server/csrf.ts",
        "src/server/index.ts",
        "src/ssr/html.ts",
        "src/signals/index.ts",
        "src/ssr/router-dev.ts",
        "src/router/code-router.tsx",
        "src/i18n/index.tsx",
        "src/client/hooks.ts",
      ],
      thresholds: {
        branches: 80,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
