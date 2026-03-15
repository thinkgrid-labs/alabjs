declare module "alab-vite-plugin" {
  export function alabPlugin(options?: { mode?: "dev" | "build" }): import("vite").Plugin[];
}
