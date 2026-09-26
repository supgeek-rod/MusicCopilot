# 构建阶段
FROM node:lts-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# 契约类型在 web/ 构建上下文之外：compose/CI 经 additional_contexts 注入命名上下文 contract
# （tsconfig paths 指向 ../packages/api-contract/index.d.ts，即容器内 /packages/api-contract/）
COPY --from=contract index.d.ts /packages/api-contract/index.d.ts
RUN npm run build

# 运行阶段：nginx 托管前端静态文件，并把 /api 反代到后端（同源访问，无需后端开启 CORS）
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY docker/nginx-default.conf.template /etc/nginx/templates/default.conf.template
COPY docker/generate-config.sh /docker-entrypoint.d/40-generate-config.sh
RUN chmod +x /docker-entrypoint.d/40-generate-config.sh
EXPOSE 80
