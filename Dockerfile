# syntax=docker/dockerfile:1.7
# ChisaCode daemon 容器化模板（pnpm workspace）。
# 仅构建 daemon 运行所需的 packages/server 及其依赖（highlight/relay/protocol/client）。
# app/desktop/cli 与本镜像无关，由 .dockerignore 排除以减少上下文体积。

FROM node:22-alpine AS base

ENV PNPM_HOME=/pnpm
ENV PATH="$PNPM_HOME:$PATH"

# corepack 按根 package.json 的 packageManager 字段激活锁定版本的 pnpm。
RUN corepack enable

WORKDIR /app

# 先复制 workspace 清单与全部 package.json，最大化 pnpm install 缓存命中。
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY packages/highlight/package.json packages/highlight/
COPY packages/relay/package.json packages/relay/
COPY packages/protocol/package.json packages/protocol/
COPY packages/client/package.json packages/client/
COPY packages/server/package.json packages/server/
# 以下 package.json 仍需复制以保持 workspace 解析完整；其源码会被 .dockerignore 排除后续构建步骤。
COPY packages/app/package.json packages/app/
COPY packages/desktop/package.json packages/desktop/
COPY packages/cli/package.json packages/cli/
COPY packages/expo-two-way-audio/package.json packages/expo-two-way-audio/
COPY patches patches

# git 供 postinstall 补丁脚本与 prepare（lefthook）使用；python3/make/g++ 供
# node-pty / better-sqlite3 等原生模块在 musl 上无预编译产物时编译。
# .dockerignore 排除了 .git，init 一个空仓库让 prepare 脚本正常工作。
RUN apk add --no-cache git python3 make g++ && git init

FROM base AS build

# 根 postinstall（postinstall-patches.mjs）与 prepare（lefthook install）所需文件；
# lefthook 需要 git 仓库（base 阶段已 git init）与配置文件。
COPY scripts/postinstall-patches.mjs scripts/
COPY lefthook.yml ./

# 复制构建所需源码（.dockerignore 已排除无关包的源码）。
COPY packages/highlight packages/highlight
COPY packages/relay packages/relay
COPY packages/protocol packages/protocol
COPY packages/client packages/client
COPY packages/server packages/server

# 安装 server 子树全部依赖（含 devDeps：typescript/tsgo 等构建工具）。
RUN pnpm --filter @chisacode/server... install --frozen-lockfile

# 依赖拓扑序构建：highlight -> relay -> protocol -> client -> server。
RUN pnpm -r --filter @chisacode/server... run build

# pnpm deploy 生成自包含的生产目录：仅 prod deps、workspace 依赖实体化、
# 原生模块（node-pty/better-sqlite3，allowBuilds 白名单内）postinstall 照常执行。
# --legacy：仓库未启用 inject-workspace-packages（本地开发需要符号链接即时生效）。
RUN pnpm --filter @chisacode/server deploy --legacy --prod /deploy

# 运行阶段：/deploy 即为完整 server 包（package.json + dist + node_modules）。
FROM node:22-alpine AS runtime

WORKDIR /app

ENV NODE_ENV=production \
    CHISACODE_HOME=/data \
    CHISACODE_LISTEN=0.0.0.0:6767

# node:22-alpine 自带 node 用户（uid 1000）。以非 root 运行。
RUN mkdir -p /data && chown -R node:node /app /data

COPY --from=build --chown=node:node /deploy ./

USER node

EXPOSE 6767

VOLUME ["/data"]

# Health probe: daemon exposes GET /api/health (unauthenticated).
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://127.0.0.1:6767/api/health || exit 1

# 入口对应 packages/server package.json 的 `start` 脚本：supervisor-entrypoint.js
# deploy 后 /app 即 server 包根目录。
CMD ["node", "dist/scripts/supervisor-entrypoint.js"]
