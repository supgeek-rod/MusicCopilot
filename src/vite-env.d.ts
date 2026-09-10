/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 应用版本号，vite.config.ts 注入（取自 package.json） */
  readonly VITE_APP_VERSION: string
}
