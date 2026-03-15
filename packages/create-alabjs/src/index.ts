#!/usr/bin/env node
/**
 * create-alab — scaffold a new Alab project
 *
 * Usage:
 *   npx create-alab@latest my-app
 *   npx create-alab@latest my-app --template dashboard
 *   npx create-alab@latest my-app --template blog
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

// ─── shared files (same across all templates) ──────────────────────────────────

async function writeSharedFiles(dir: string) {
  await writeFile(
    join(dir, "package.json"),
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

  await writeFile(
    join(dir, "tsconfig.json"),
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

  await writeFile(join(dir, ".gitignore"), "node_modules/\n.alabjs/\ndist/\n.DS_Store\n");
  await writeFile(join(dir, "app", "globals.css"), `@import "tailwindcss";\n`);
}

// ─── basic template ────────────────────────────────────────────────────────────

async function scaffoldBasic(dir: string) {
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "app"), { recursive: true });
  await mkdir(join(dir, "app", "users", "[id]"), { recursive: true });
  await mkdir(join(dir, "public"), { recursive: true });

  await writeSharedFiles(dir);

  await writeFile(
    join(dir, "app", "page.tsx"),
    `import type { PageMetadata } from "alabjs";

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

  await writeFile(
    join(dir, "app", "users", "[id]", "page.server.ts"),
    `import { defineServerFn } from "alabjs/server";

export const getUser = defineServerFn(async ({ params }) => {
  // Replace with your real data source
  return { id: params["id"] ?? "", name: \`User \${params["id"] ?? ""}\` };
});
`,
  );

  await writeFile(
    join(dir, "app", "users", "[id]", "page.tsx"),
    `import type { AlabPage } from "alabjs";
import type { getUser } from "./page.server";
import { useServerData } from "alabjs/client";

const UserPage: AlabPage<"/users/[id]"> = ({ params }) => {
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
}

// ─── dashboard template ────────────────────────────────────────────────────────

async function scaffoldDashboard(dir: string) {
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "app"), { recursive: true });
  await mkdir(join(dir, "app", "analytics"), { recursive: true });
  await mkdir(join(dir, "app", "settings"), { recursive: true });
  await mkdir(join(dir, "public"), { recursive: true });

  await writeSharedFiles(dir);

  await writeFile(
    join(dir, "app", "layout.tsx"),
    `import type { ReactNode } from "react";

export function Layout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen">
      <nav className="w-64 bg-gray-900 text-white flex flex-col p-6 gap-2">
        <span className="text-xl font-bold mb-6">Dashboard</span>
        <a href="/" className="px-3 py-2 rounded hover:bg-gray-700 transition-colors">
          Overview
        </a>
        <a href="/analytics" className="px-3 py-2 rounded hover:bg-gray-700 transition-colors">
          Analytics
        </a>
        <a href="/settings" className="px-3 py-2 rounded hover:bg-gray-700 transition-colors">
          Settings
        </a>
      </nav>
      <main className="flex-1 p-8 bg-gray-50">{children}</main>
    </div>
  );
}
`,
  );

  await writeFile(
    join(dir, "app", "page.tsx"),
    `import type { PageMetadata } from "alabjs";
import { Layout } from "./layout";

export const metadata: PageMetadata = {
  title: "Dashboard",
  description: "Dashboard overview.",
};

export default function DashboardPage() {
  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-8">Overview</h1>
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wide">Total Users</p>
          <p className="text-4xl font-bold mt-2">1,284</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wide">Revenue</p>
          <p className="text-4xl font-bold mt-2">$48,320</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wide">Active Sessions</p>
          <p className="text-4xl font-bold mt-2">342</p>
        </div>
        <div className="bg-white rounded-xl shadow p-6">
          <p className="text-sm text-gray-500 uppercase tracking-wide">Conversion Rate</p>
          <p className="text-4xl font-bold mt-2">3.6%</p>
        </div>
      </div>
    </Layout>
  );
}
`,
  );

  await writeFile(
    join(dir, "app", "analytics", "page.tsx"),
    `import type { PageMetadata } from "alabjs";
import { Layout } from "../layout";

export const metadata: PageMetadata = {
  title: "Analytics",
  description: "Analytics overview.",
};

export default function AnalyticsPage() {
  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-8">Analytics</h1>
      <p className="text-gray-500">Charts and analytics data will appear here.</p>
    </Layout>
  );
}
`,
  );

  await writeFile(
    join(dir, "app", "settings", "page.tsx"),
    `import type { PageMetadata } from "alabjs";
import { Layout } from "../layout";

export const metadata: PageMetadata = {
  title: "Settings",
  description: "Application settings.",
};

export default function SettingsPage() {
  return (
    <Layout>
      <h1 className="text-3xl font-bold mb-8">Settings</h1>
      <p className="text-gray-500">Application settings will appear here.</p>
    </Layout>
  );
}
`,
  );
}

// ─── blog template ─────────────────────────────────────────────────────────────

async function scaffoldBlog(dir: string) {
  await mkdir(dir, { recursive: true });
  await mkdir(join(dir, "app"), { recursive: true });
  await mkdir(join(dir, "app", "posts", "[slug]"), { recursive: true });
  await mkdir(join(dir, "public"), { recursive: true });

  await writeSharedFiles(dir);

  await writeFile(
    join(dir, "app", "page.tsx"),
    `import type { PageMetadata } from "alabjs";

export const metadata: PageMetadata = {
  title: "Blog",
  description: "Latest posts.",
};

const posts = [
  { slug: "hello-world", title: "Hello World", excerpt: "Welcome to the blog.", date: "2026-01-01" },
  { slug: "getting-started", title: "Getting Started with Alab", excerpt: "Learn how to build fast apps with Alab.", date: "2026-02-14" },
  { slug: "server-functions", title: "Server Functions Deep Dive", excerpt: "Type-safe server logic without API boilerplate.", date: "2026-03-01" },
];

export default function BlogListPage() {
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-10">Blog</h1>
      <ul className="flex flex-col gap-8">
        {posts.map((post) => (
          <li key={post.slug}>
            <a href={\`/posts/\${post.slug}\`} className="group block">
              <p className="text-sm text-gray-400 mb-1">{post.date}</p>
              <h2 className="text-2xl font-semibold group-hover:text-blue-600 transition-colors">{post.title}</h2>
              <p className="mt-2 text-gray-600">{post.excerpt}</p>
            </a>
          </li>
        ))}
      </ul>
    </main>
  );
}
`,
  );

  await writeFile(
    join(dir, "app", "posts", "[slug]", "page.server.ts"),
    `import { defineServerFn } from "alabjs/server";

const posts = [
  { slug: "hello-world", title: "Hello World", content: "Welcome to the blog. This is your first post.", date: "2026-01-01" },
  { slug: "getting-started", title: "Getting Started with Alab", content: "Alab makes it easy to build fast, type-safe React apps.", date: "2026-02-14" },
  { slug: "server-functions", title: "Server Functions Deep Dive", content: "Server functions let you write server-only logic with full type safety on the client.", date: "2026-03-01" },
];

export const getPost = defineServerFn(async ({ params }) => {
  const post = posts.find((p) => p.slug === params["slug"]);
  if (!post) throw new Error(\`Post not found: \${params["slug"] ?? ""}\`);
  return post;
});
`,
  );

  await writeFile(
    join(dir, "app", "posts", "[slug]", "page.tsx"),
    `import type { AlabPage } from "alabjs";
import type { getPost } from "./page.server";
import { useServerData } from "alabjs/client";

export const ssr = true;

const PostPage: AlabPage<"/posts/[slug]"> = ({ params }) => {
  const post = useServerData<typeof getPost>("getPost", params);
  return (
    <main className="max-w-2xl mx-auto px-4 py-12">
      <p className="text-sm text-gray-400 mb-2">{post.date}</p>
      <h1 className="text-4xl font-bold mb-6">{post.title}</h1>
      <p className="text-lg text-gray-700 leading-relaxed">{post.content}</p>
    </main>
  );
};

export default PostPage;
`,
  );
}

// ─── run ───────────────────────────────────────────────────────────────────────

if (template === "dashboard") {
  await scaffoldDashboard(targetDir);
} else if (template === "blog") {
  await scaffoldBlog(targetDir);
} else {
  await scaffoldBasic(targetDir);
}

console.log(`  done! Next steps:\n`);
console.log(`    cd ${projectName}`);
console.log(`    pnpm install`);
console.log(`    pnpm dev\n`);
