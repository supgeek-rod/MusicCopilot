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

/** 应用运行时配置，与 config.json 同构 */
function buildAppConfig(env: Record<string, string>) {
  const autoLoginRaw = mcEnv(env, 'MC_AUTO_LOGIN')
  return {
    baseUrl: mcEnv(env, 'MC_API_BASE_URL') ?? '',
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
 * config.json）通过 existsSync 检查放行给静态服务，保持「真实文件优先」。
 */
/**
 * POST /config.json：设置面板「保存并重连」把连接配置落盘为真实文件
 * （dev 写 public/config.json，preview 写 dist/config.json），写完后
 * 「真实文件优先」逻辑自动改为服务该文件 —— 所有访问本服务的设备共用一份配置。
 * 仅接受三个字符串字段；静态生产部署没有该端点，前端会降级为下载文件。
 */
const makeWriteConfig =
  (realFile: string): Connect.NextHandleFunction =>
  (req, res, next) => {
    const url = (req.url ?? '').split('?')[0]
    if (url !== '/config.json' || req.method !== 'POST') return next()
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > 8192) {
        res.statusCode = 413
        res.end()
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('error', () => {
      res.statusCode = 400
      res.end()
    })
    req.on('end', () => {
      try {
        const raw = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') as Record<string, unknown>
        const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
        const cfg = {
          baseUrl: str(raw.baseUrl),
          username: str(raw.username),
          password: typeof raw.password === 'string' ? raw.password : '',
        }
        fs.writeFileSync(realFile, `${JSON.stringify(cfg, null, 2)}\n`)
        res.statusCode = 204
        res.end()
      } catch {
        res.statusCode = 400
        res.end()
      }
    })
  }

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
      server.middlewares.use(makeWriteConfig(path.resolve(root, 'public', 'config.json')))
      server.middlewares.use(makeServeConfig(path.resolve(root, 'public', 'config.json')))
    },
    configurePreviewServer(server) {
      server.middlewares.use(makeWriteConfig(path.resolve(outDir, 'config.json')))
      server.middlewares.use(makeServeConfig(path.resolve(outDir, 'config.json')))
    },
    closeBundle() {
      const cfg = buildAppConfig(env)
      if (!cfg.baseUrl && !cfg.username) return
      fs.writeFileSync(path.join(outDir, 'config.json'), JSON.stringify(cfg, null, 2))
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxyTarget =
    mcEnv(env, 'MC_DEV_PROXY_TARGET') || mcEnv(env, 'MC_API_BASE_URL') || DEFAULT_PROXY_TARGET
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
