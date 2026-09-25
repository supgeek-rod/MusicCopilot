# 自建后端（第 5 期）：php:8.4-cli-alpine 自带 pdo_sqlite/mbstring/openssl/curl，无需额外编译扩展。
# 多阶段：vendor 依赖层与代码分离，依赖不变时缓存命中。
FROM php:8.4-cli-alpine AS vendor
COPY --from=composer:2 /usr/bin/composer /usr/bin/composer
WORKDIR /app
COPY composer.json composer.lock ./
# 大陆部署（fnOS NAS）拉包走阿里镜像；海外可用，无碍。
# --no-scripts：vendor 阶段没有 artisan（post-autoload-dump 需要），脚本在运行时容器内无需预生成
RUN composer config -g repos.packagist composer https://mirrors.aliyun.com/composer/ \
    && composer install --no-dev --no-scripts --no-interaction --prefer-dist --no-progress

FROM php:8.4-cli-alpine
WORKDIR /app
COPY --from=vendor /app/vendor ./vendor
COPY . .
# pcntl：queue:work 的 SIGTERM 优雅收尾与 --timeout（pcntl_alarm）依赖此扩展，官方 cli-alpine 镜像默认不编译。
# apk 源切 NJU 镜像：大陆直连官方 cdn 不稳定（实测 EOF 中断）
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.nju.edu.cn/g' /etc/apk/repositories \
    && apk add --no-cache --virtual .build-deps $PHPIZE_DEPS \
    && docker-php-ext-install pcntl \
    && apk del .build-deps
RUN chmod +x docker/entrypoint.sh
# 下载落盘目录（部署时挂卷指向 fnOS 音乐库目录）
ENV MC_DOWNLOAD_DIR=/data/downloads
VOLUME ["/data"]
EXPOSE 17017
ENTRYPOINT ["docker/entrypoint.sh"]
# API 进程；entrypoint 会同时拉起队列 worker 自愈循环（同容器分进程）
CMD ["php", "artisan", "serve", "--host=0.0.0.0", "--port=17017"]
