import { createRequire } from 'node:module'
import Fastify from 'fastify'
import { loadConfig } from './config.js'
import { dbFilePath, openDb } from './db.js'
import { loadEnv } from './env.js'
import { JobRunner } from './jobs.js'
import { configureHttpProxy } from './genres.js'
import { registerRoutes, type Ctx } from './routes.js'
import { configureServerAuth } from './sources.js'

const env = loadEnv()
// 音源后端鉴权：凭证非空时，server/ 返回 403 会自动登录重试（M1 起接口要求 sqmusic 头）
configureServerAuth(env.serverUsername, env.serverPassword)
// 流派源（Deezer/Last.fm）外部请求代理：大陆直连不可达时经代理出口（A2）
configureHttpProxy(env.httpProxy)
const require = createRequire(import.meta.url)
const { version } = require('../package.json') as { version: string }

const db = openDb(dbFilePath(env.dataDir))
const runner = new JobRunner(env, db, () => loadConfig(db))

const app = Fastify({
  logger: { level: process.env.MC_LOG_LEVEL ?? 'info' },
})

// 可选共享 token 鉴权（MC_SCRAPER_TOKEN 非空时启用）
if (env.token !== '') {
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers['x-mc-token'] !== env.token) {
      return reply.code(401).send({ error: '无效或缺失 x-mc-token' })
    }
  })
}

const ctx: Ctx = { env, db, runner, version }
app.register(async (scope) => registerRoutes(scope, ctx), { prefix: '/mc/api' })

// 模板路由 `/`（不在 /mc/api 下）不受 token 钩子限制，仅作存活探测
app.get('/healthz', async () => ({ ok: true, version }))

const stop = async (): Promise<void> => {
  await app.close()
  process.exit(0)
}
process.on('SIGINT', () => void stop())
process.on('SIGTERM', () => void stop())

app
  .listen({ port: env.port, host: '0.0.0.0' })
  .then(() => app.log.info(`scraper ready: http://0.0.0.0:${env.port}/mc/api/status (music=${env.musicDir})`))
  .catch((err) => {
    app.log.error(err)
    process.exit(1)
  })
