/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ALAB_PUBLIC_SITE_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
