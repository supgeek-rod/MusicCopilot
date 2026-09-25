/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 应用版本号，vite.config.ts 注入（取自 package.json） */
  readonly VITE_APP_VERSION: string
}

/** 构建信息，vite.config.ts 经 define 注入（src/build-info.json，scripts/gen-build-info.mjs 生成） */
declare const __BUILD_INFO__: {
  /** git 短 hash；无 git 环境降级为 'dev'（此时运行时版本检测禁用） */
  hash: string
  /** 构建时间 ISO 字符串；降级时为空串 */
  time: string
  /** 构建时工作区是否有未提交改动 */
  dirty: boolean
}
