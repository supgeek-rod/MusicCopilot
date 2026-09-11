import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'

/**
 * 运行配置统一以 MC_ 前缀变量提供（.env 文件或真实环境变量，后者优先）。
 * 应用侧不感知来源：启动时仍 fetch /config.json（见 stores/app.ts）。
 */
function mcEnv(env: Record<string, string>, key: string): string | undefined {
  const value = process.env[key] ?? env[key]
  return value === undefined ? undefined : value.trim()
}

function requireMcApiBaseUrl(env: Record<string, string>): string {
  const value = mcEnv(env, 'MC_API_BASE_URL')
  if (!value) {
    throw new Error(
      '缺少 MC_API_BASE_URL（Vite 将把 /api 反代到该地址）。请复制 .env.example 为 .env 并填写后端地址。',
    )
  }
  return value
}

/** 应用运行时配置，与 config.json 同构。
 *  baseUrl 恒为空串（同源）：后端地址 MC_API_BASE_URL 只供服务端转发层使用
 *  （dev/preview 的 Vite 代理、Docker 的 nginx），浏览器直连后端可用设置面板按设备覆盖。
 *  proxyTarget 为信息性字段：把转发目标带给浏览器，供设置面板展示。
 *  fnos 块为飞牛音乐库接入配置（未配置 MC_FNOS_BASE_URL 时 enabled=false）。 */
function buildAppConfig(env: Record<string, string>, proxyTarget = '') {
  const autoLoginRaw = mcEnv(env, 'MC_AUTO_LOGIN')
  const fnosAutoLoginRaw = mcEnv(env, 'MC_FNOS_AUTO_LOGIN')
  const fnosBaseUrl = mcEnv(env, 'MC_FNOS_BASE_URL') ?? ''
  const scraperBaseUrl = mcEnv(env, 'MC_SCRAPER_BASE_URL') ?? ''
  return {
    baseUrl: '',
    username: mcEnv(env, 'MC_API_USERNAME') ?? '',
    password: mcEnv(env, 'MC_API_PASSWORD') ?? '',
    autoLogin: autoLoginRaw === undefined ? true : autoLoginRaw.toLowerCase() !== 'false',
    proxyTarget,
    fnos: {
      enabled: Boolean(fnosBaseUrl),
      username: mcEnv(env, 'MC_FNOS_USERNAME') ?? '',
      password: mcEnv(env, 'MC_FNOS_PASSWORD') ?? '',
      autoLogin: fnosAutoLoginRaw === undefined ? true : fnosAutoLoginRaw.toLowerCase() !== 'false',
      proxyTarget: fnosBaseUrl,
    },
    scraper: {
      enabled: Boolean(scraperBaseUrl),
      token: mcEnv(env, 'MC_SCRAPER_TOKEN') ?? '',
      proxyTarget: scraperBaseUrl,
    },
  }
}

/**
 * dev / preview 下虚拟提供 /config.json（应用仍照常 fetch 运行时配置）；
 * build 时把配置落盘到 dist/config.json，保持「构建产物可直接改配置」的能力。
 * 未配置任何 MC_ 变量时不落盘（Docker 场景由容器入口脚本在运行时生成）。
 *
 * 注意必须前置注册：Vite 的 html fallback 对 Accept 为通配符的 /config.json
 * 也会重写到 index.html，后置中间件永远轮不到。真实文件（public/ 或 dist/ 下的
 * config.json）通过 existsSync 检查放行给静态服务，保持「真实文件优先」——
 * 该机制仅服务于手动放置/编辑的部署配置；设置面板的连接配置只写浏览器存储，
 * 不会生成这个文件。
 */
function runtimeConfigPlugin(
  env: Record<string, string>,
  proxyTarget: string,
  buildInfo: { hash: string; time: string; dirty: boolean },
): Plugin {
  let root = process.cwd()
  let outDir = 'dist'
  const makeServeConfig =
    (realFile: string): Connect.NextHandleFunction =>
    (req, res, next) => {
      const url = (req.url ?? '').split('?')[0]
      if (url !== '/config.json') return next()
      if (fs.existsSync(realFile)) return next()
      res.setHeader('Content-Type', 'application/json; charset=utf-8')
      res.setHeader('Cache-Control', 'no-store')
      res.end(JSON.stringify(buildAppConfig(env, proxyTarget), null, 2))
    }
  return {
    name: 'mc-runtime-config',
    configResolved(resolved) {
      root = resolved.root
      outDir = path.resolve(resolved.root, resolved.build.outDir)
    },
    configureServer(server) {
      server.middlewares.use(makeServeConfig(path.resolve(root, 'public', 'config.json')))
    },
    configurePreviewServer(server) {
      server.middlewares.use(makeServeConfig(path.resolve(outDir, 'config.json')))
    },
    closeBundle() {
      const cfg = buildAppConfig(env, proxyTarget)
      if (cfg.username) {
        fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify(cfg, null, 2))
      }
      // 版本指纹无条件写入（与后端配置无关）：供前端 versionCheck 比对发现新构建。
      // 无 hash 文件名、构建后写入，天然不进 SW precache（glob 只含 js/css/html）；
      // nginx 对它 no-cache，前端带时间戳请求。
      fs.writeFileSync(
        path.join(outDir, 'version.json'),
        JSON.stringify({ hash: buildInfo.hash, time: buildInfo.time }, null, 2),
      )
    },
  }
}

export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 后端地址只来自环境：dev/preview 必填（与 Docker 入口脚本一致）；build 可不填，
  // 由容器启动时注入。不在源码里写死局域网 IP。
  const proxyTarget =
    command === 'serve' ? requireMcApiBaseUrl(env) : (mcEnv(env, 'MC_API_BASE_URL') ?? '')
  // 反向代理 / 域名访问 dev、preview 时需放行 Host（逗号分隔，如 MC_ALLOWED_HOSTS=a.com,b.com）
  const allowedHosts = (mcEnv(env, 'MC_ALLOWED_HOSTS') ?? '')
    .split(/[,\s]+/)
    .filter((h) => h.length > 0)
  const apiProxy = proxyTarget
    ? { '/api': { target: proxyTarget, changeOrigin: true } }
    : undefined
  // 飞牛音乐库反代（可选）：/fnos/* → fnOS 网关，剥掉 /fnos 前缀
  const fnosProxyTarget = mcEnv(env, 'MC_FNOS_BASE_URL') ?? ''
  const fnosProxy = fnosProxyTarget
    ? {
        '/fnos': {
          target: fnosProxyTarget,
          changeOrigin: true,
          rewrite: (p: string) => p.replace(/^\/fnos/, ''),
        },
      }
    : undefined
  // 刮削工具反代（可选）：/mc/* → scraper 工具（路由自带 /mc 前缀，不 rewrite）
  const scraperProxyTarget = mcEnv(env, 'MC_SCRAPER_BASE_URL') ?? ''
  const scraperProxy = scraperProxyTarget
    ? {
        '/mc': {
          target: scraperProxyTarget,
          changeOrigin: true,
        },
      }
    : undefined
  // 版权信息页展示的版本号，取自 package.json；经 VITE_ 环境变量暴露给 import.meta.env
  const appVersion = (JSON.parse(fs.readFileSync('package.json', 'utf-8')) as { version: string })
    .version
  process.env.VITE_APP_VERSION = appVersion
  // 构建信息（git hash/时间/dirty），由 scripts/gen-build-info.mjs 在 build 前生成到
  // src/build-info.json；文件缺失（未跑前置脚本、无 git）时降级 dev，仅禁用版本检测
  let buildInfo: { hash: string; time: string; dirty: boolean } = {
    hash: 'dev',
    time: '',
    dirty: false,
  }
  try {
    buildInfo = JSON.parse(fs.readFileSync('src/build-info.json', 'utf-8'))
  } catch {
    // 保持降级值
  }
  // 本地 dev/preview 端口取 .env 的 MC_PORT（与 Docker 对外端口共用一个变量；
  // 未配置或非法值回退 5173）。端口被占用时 Vite 默认自动 +1，不设 strictPort。
  const mcPortRaw = Number(mcEnv(env, 'MC_PORT'))
  const localPort = Number.isInteger(mcPortRaw) && mcPortRaw > 0 ? mcPortRaw : 5173
  return {
    define: {
      __BUILD_INFO__: JSON.stringify(buildInfo),
    },
    plugins: [
      vue(),
      tailwindcss(),
      runtimeConfigPlugin(env, proxyTarget, buildInfo),
      // PWA：autoUpdate 静默更新；/api 与 config.json 永不入缓存（后者容器内运行时生成）
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
        manifest: {
          name: 'MusicCopilot',
          short_name: 'MusicCopilot',
          description: '音乐搜索、试听与下载客户端',
          lang: 'zh-CN',
          theme_color: '#7c3aed',
          background_color: '#ffffff',
          display: 'standalone',
          start_url: '/',
          icons: [
            { src: 'pwa-192.png', sizes: '192x192', type: 'image/png' },
            { src: 'pwa-512.png', sizes: '512x512', type: 'image/png' },
            { src: 'pwa-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
        workbox: {
          navigateFallback: 'index.html',
          navigateFallbackDenylist: [/^\/api\//, /^\/fnos\//, /^\/mc\//, /\/config\.json$/, /\/version\.json$/],
          runtimeCaching: [
            {
              // 专辑/歌手封面等图片：SWR 缓存（含外链 CDN），限额防膨胀
              urlPattern: ({ request }) => request.destination === 'image',
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'mc-images',
                expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 14 },
              },
            },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    // 路由级静态 import 是既定约束（见 AGENTS.md），不拆懒加载；
    // 用 vendor 分包改善缓存命中与首屏解析（改动业务代码时框架 chunk 不失效）
    build: {
      rolldownOptions: {
        output: {
          advancedChunks: {
            groups: [
              { name: 'vue', test: /node_modules[\\/](vue|vue-router|pinia|@vue)[\\/]/ },
              { name: 'reka-ui', test: /node_modules[\\/](reka-ui|@lucide)[\\/]/ },
              { name: 'axios', test: /node_modules[\\/](axios|vue-sonner|@vueuse)[\\/]/ },
            ],
          },
        },
      },
    },
    server: {
      port: localPort,
      ...(allowedHosts.length ? { allowedHosts } : {}),
      ...(apiProxy || fnosProxy || scraperProxy
        ? { proxy: { ...apiProxy, ...fnosProxy, ...scraperProxy } }
        : {}),
    },
    preview: {
      port: localPort,
      ...(allowedHosts.length ? { allowedHosts } : {}),
      ...(apiProxy || fnosProxy || scraperProxy
        ? { proxy: { ...apiProxy, ...fnosProxy, ...scraperProxy } }
        : {}),
    },
  }
})
