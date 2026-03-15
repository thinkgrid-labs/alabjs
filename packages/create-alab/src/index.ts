#!/usr/bin/env node
/**
 * create-alab — scaffold a new Alab project
 *
 * Usage:
 *   npx create-alab@latest my-app
 *   npx create-alab@latest my-app --template dashboard
 */
import { mkdir, writeFile, copyFile } from "node:fs/promises";
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

// package.json
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
      },
    },
    null,
    2,
  ),
);

// tsconfig.json
await writeFile(
  join(targetDir, "tsconfig.json"),
  JSON.stringify(
    {
      compilerOptions: {
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        jsx: "react-jsx",
        strict: true,
        paths: { "alab/*": ["./node_modules/alab/dist/*"] },
      },
      include: ["app/**/*"],
    },
    null,
    2,
  ),
);

// app/page.tsx — root page
await writeFile(
  join(targetDir, "app", "page.tsx"),
  `export default function HomePage() {
  return (
    <main>
      <h1>Welcome to Alab</h1>
      <p>Edit <code>app/page.tsx</code> to get started.</p>
    </main>
  );
}
`,
);

// app/layout.tsx
await writeFile(
  join(targetDir, "app", "layout.tsx"),
  `import { AlabProvider } from "alab/client";
import type { ReactNode } from "react";

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Alab App</title>
      </head>
      <body>
        <AlabProvider>{children}</AlabProvider>
      </body>
    </html>
  );
}
`,
);

// Example server function + page
await writeFile(
  join(targetDir, "app", "users", "[id]", "page.server.ts"),
  `import { defineServerFn } from "alab/server";

export const getUser = defineServerFn(async ({ params }) => {
  // Replace with your real data source
  return { id: params.id, name: \`User \${params.id}\` };
});
`,
);

await writeFile(
  join(targetDir, "app", "users", "[id]", "page.tsx"),
  `import { useServerData } from "alab/client";

export default function UserPage({ params }: { params: { id: string } }) {
  const user = useServerData<{ id: string; name: string }>("getUser", params);
  return <h1>{user.name}</h1>;
}
`,
);

// .gitignore
await writeFile(
  join(targetDir, ".gitignore"),
  "node_modules/\n.alab/\ndist/\n.DS_Store\n",
);

console.log(`  done! Next steps:\n`);
console.log(`    cd ${projectName}`);
console.log(`    pnpm install`);
console.log(`    pnpm dev\n`);
