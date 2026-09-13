# MusicCopilot 元数据刮削工具：多阶段构建（tsc 编译 → 纯 JS 运行时）。
# 运行时无原生依赖（fastify / music-metadata / taglib-wasm / zod 均为纯 JS/WASM），
# node:24-alpine 单镜像覆盖 amd64/arm64；node:sqlite 为 Node 24 内置模块。
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production \
    MC_MUSIC_DIR=/music \
    MC_DATA_DIR=/data \
    MC_PORT=8098
WORKDIR /app
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist

# /music：NAS 音乐目录（读写）；/data：SQLite（曲目索引/任务/配置/忽略清单）
RUN mkdir -p /music /data
VOLUME /music /data
EXPOSE 8098

# NAS 挂载目录属主各异，默认 root 保证读写可用；如需降权可在 compose 里加 user: "1000:1000"
# （同时需保证音乐目录对该 uid 可写）。接口可用 MC_SCRAPER_TOKEN 做共享 token 鉴权。
CMD ["node", "dist/index.js"]
