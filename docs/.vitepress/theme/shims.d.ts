declare module "*.vue" {
  import type { DefineComponent } from "vue";
  const component: DefineComponent;
  export default component;
}

declare module "*.css" {
  const styles: Record<string, string>;
  export default styles;
}
