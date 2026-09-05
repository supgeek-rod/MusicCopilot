import { fileURLToPath, URL } from 'node:url'
import fs from 'node:fs'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig, loadEnv } from 'vite'

// 开发代理目标：优先读 public/config.json 里的 devProxyTarget / baseUrl，
// 方便在 dev 下也用运行时配置文件切换后端，避免改构建配置。
function readDevProxyTarget(): string {
  try {
    const raw = fs.readFileSync(
      fileURLToPath(new URL('./public/config.json', import.meta.url)),
      'utf-8',
    )
    const cfg = JSON.parse(raw) as { devProxyTarget?: string; baseUrl?: string }
    return cfg.devProxyTarget || cfg.baseUrl || 'http://192.168.31.170:8096'
  } catch {
    return 'http://192.168.31.170:8096'
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [vue(), tailwindcss()],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      port: 5173,
      proxy: {
        '/api': {
          target: env.VITE_DEV_PROXY_TARGET || readDevProxyTarget(),
          changeOrigin: true,
        },
      },
    },
  }
})
