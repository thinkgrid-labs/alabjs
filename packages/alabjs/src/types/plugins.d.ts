declare module "alabjs-vite-plugin" {
  export function alabPlugin(options?: { mode?: "dev" | "build" }): import("vite").Plugin[];
}
