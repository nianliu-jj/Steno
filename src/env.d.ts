/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string;
  readonly VITE_BASE_URL: string;
  readonly VITE_SOURCE_MAP?: string;
  readonly VITE_DEVTOOLS_LAUNCH_EDITOR?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const BUILD_TIME: string;
