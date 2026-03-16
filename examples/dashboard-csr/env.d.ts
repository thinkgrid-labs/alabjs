/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly ALAB_PUBLIC_APP_NAME?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
