import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig, loadEnv, type Connect, type Plugin } from 'vite'

const DEFAULT_PROXY_TARGET = 'http://192.168.31.31:8096'

/**
 * 运行配置统一以 MC_ 前缀变量提供（.env 文件或真实环境变量，后者优先）。
 * 应用侧不感知来源：启动时仍 fetch /config.json（见 stores/app.ts）。
 */
function mcEnv(env: Record<string, string>, key: string): string | undefined {
  const value = process.env[key] ?? env[key]
  return value === undefined ? undefined : value.trim()
}

/** 应用运行时配置，与 config.json 同构。
 *  baseUrl 恒为空串（同源）：后端地址 MC_API_BASE_URL 只供服务端转发层使用
 *  （dev/preview 的 Vite 代理、Docker 的 nginx），浏览器直连后端可用设置面板按设备覆盖。 */
function buildAppConfig(env: Record<string, string>) {
  const autoLoginRaw = mcEnv(env, 'MC_AUTO_LOGIN')
  return {
    baseUrl: '',
    username: mcEnv(env, 'MC_USERNAME') ?? '',
    password: mcEnv(env, 'MC_PASSWORD') ?? '',
    autoLogin: autoLoginRaw === undefined ? true : autoLoginRaw.toLowerCase() !== 'false',
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
function runtimeConfigPlugin(env: Record<string, string>): Plugin {
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
      res.end(JSON.stringify(buildAppConfig(env), null, 2))
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
      const cfg = buildAppConfig(env)
      if (!cfg.username) return
      fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify(cfg, null, 2))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // 后端地址：dev/preview 的 Vite 代理与 Docker nginx 共用同一个变量
  const proxyTarget =
    mcEnv(env, 'MC_API_BASE_URL') || DEFAULT_PROXY_TARGET
  // 反向代理 / 域名访问 dev、preview 时需放行 Host（逗号分隔，如 MC_ALLOWED_HOSTS=a.com,b.com）
  const allowedHosts = (mcEnv(env, 'MC_ALLOWED_HOSTS') ?? '')
    .split(/[,\s]+/)
    .filter((h) => h.length > 0)
  return {
    plugins: [
      vue(),
      tailwindcss(),
      runtimeConfigPlugin(env),
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
          navigateFallbackDenylist: [/^\/api\//, /\/config\.json$/],
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
    server: {
      port: 5173,
      ...(allowedHosts.length ? { allowedHosts } : {}),
      proxy: {
        '/api': {
          target: proxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      ...(allowedHosts.length ? { allowedHosts } : {}),
    },
  }
})
