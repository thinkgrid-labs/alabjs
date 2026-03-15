#!/usr/bin/env node
/**
 * create-alab — scaffold a new Alab project
 *
 * Usage:
 *   npx create-alab@latest my-app
 *   npx create-alab@latest my-app --template dashboard
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { parseArgs } from "node:util";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    template: { type: "string", short: "t", default: "basic" },
  },
});

const projectName = positionals[0] ?? "my-alab-app";
const template = (values.template as string) ?? "basic";
const targetDir = resolve(process.cwd(), projectName);

console.log(`\n  alab  creating ${projectName} (template: ${template})\n`);

await mkdir(targetDir, { recursive: true });
await mkdir(join(targetDir, "app"), { recursive: true });
await mkdir(join(targetDir, "app", "users", "[id]"), { recursive: true });
await mkdir(join(targetDir, "public"), { recursive: true });

// ─── package.json ──────────────────────────────────────────────────────────────
await writeFile(
  join(targetDir, "package.json"),
  JSON.stringify(
    {
      name: projectName,
      private: true,
      version: "0.1.0",
      type: "module",
      scripts: {
        dev: "alab dev",
        build: "alab build",
        start: "alab start",
      },
      dependencies: {
        alab: "^0.1.0",
        react: "^19.1.0",
        "react-dom": "^19.1.0",
        tailwindcss: "^4.0.0",
        "@tailwindcss/vite": "^4.0.0",
      },
      devDependencies: {
        "@types/react": "^19.1.0",
        "@types/react-dom": "^19.1.0",
        typescript: "^5.8.0",
      },
      engines: {
        node: ">=22",
      },
    },
    null,
    2,
  ),
);

// ─── tsconfig.json ─────────────────────────────────────────────────────────────
await writeFile(
  join(targetDir, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        lib: ["ES2022", "DOM", "DOM.Iterable"],
        module: "ESNext",
        moduleResolution: "Bundler",
        jsx: "react-jsx",
        strict: true,
        exactOptionalPropertyTypes: true,
        noUncheckedIndexedAccess: true,
        noImplicitOverride: true,
        noImplicitReturns: true,
        isolatedModules: true,
        verbatimModuleSyntax: true,
        skipLibCheck: true,
      },
      include: ["app/**/*"],
    },
    null,
    2,
  ),
);

// ─── app/globals.css ──────────────────────────────────────────────────────────
// Tailwind CSS v4 — @tailwindcss/vite auto-discovers utility classes, no config file needed.
await writeFile(
  join(targetDir, "app", "globals.css"),
  `@import "tailwindcss";\n`,
);

// ─── app/page.tsx — root page ──────────────────────────────────────────────────
await writeFile(
  join(targetDir, "app", "page.tsx"),
  `import type { PageMetadata } from "alab";

export const metadata: PageMetadata = {
  title: "Alab App",
  description: "Built with Alab — the blazing-fast React framework.",
};

export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold tracking-tight">Welcome to Alab</h1>
      <p className="mt-4 text-lg text-gray-600">
        Edit <code className="font-mono bg-gray-100 px-1 rounded">app/page.tsx</code> to get started.
      </p>
    </main>
  );
}
`,
);

// ─── Example server function + typed page ──────────────────────────────────────
await writeFile(
  join(targetDir, "app", "users", "[id]", "page.server.ts"),
  `import { defineServerFn } from "alab/server";

export const getUser = defineServerFn(async ({ params }) => {
  // Replace with your real data source
  return { id: params["id"] ?? "", name: \`User \${params["id"] ?? ""}\` };
});
`,
);

await writeFile(
  join(targetDir, "app", "users", "[id]", "page.tsx"),
  `import type { AlabPage } from "alab";
import type { getUser } from "./page.server";
import { useServerData } from "alab/client";

const UserPage: AlabPage<"/users/[id]"> = ({ params }) => {
  // Type-safe: useServerData infers the return type from getUser
  const user = useServerData<typeof getUser>("getUser", params);
  return (
    <main className="p-8">
      <h1 className="text-2xl font-bold">{user.name}</h1>
      <p className="text-gray-500">id: {user.id}</p>
    </main>
  );
};

export default UserPage;
`,
);

// ─── .gitignore ────────────────────────────────────────────────────────────────
await writeFile(
  join(targetDir, ".gitignore"),
  "node_modules/\n.alab/\ndist/\n.DS_Store\n",
);

console.log(`  done! Next steps:\n`);
console.log(`    cd ${projectName}`);
console.log(`    pnpm install`);
console.log(`    pnpm dev\n`);
