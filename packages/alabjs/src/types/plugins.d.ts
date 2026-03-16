declare module "alabjs-vite-plugin" {
  export function alabPlugin(options?: { mode?: "dev" | "build" }): import("vite").Plugin[];
}

// Augment ImportMeta so `import.meta.env.DEV` (injected by Vite at build time)
// is recognised by TypeScript when compiling alabjs component source files.
// Vite replaces `import.meta.env.DEV` with a literal boolean at bundle time;
// this declaration just provides the compile-time type so TS does not error.
interface ImportMeta {
  readonly env: {
    /** `true` in Vite dev server, `false` in production builds. */
    readonly DEV: boolean;
    readonly PROD: boolean;
    readonly SSR: boolean;
    readonly MODE: string;
    readonly BASE_URL: string;
    readonly [key: string]: unknown;
  };
}
