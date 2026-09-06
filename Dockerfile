FROM node:20.12.2-alpine AS builder
WORKDIR /usr/src
COPY . .
RUN npm install -g pnpm@10.30.3
# better-sqlite3 的预编译二进制托管在 GitHub Releases，国内直连常超时。
# 构建阶段拿不到 compose 的 environment（那只在运行时生效），必然直连，
# 一旦超时 prebuild-install 就退回 node-gyp 源码编译，而 alpine 不带 python3。
# 装上工具链作为兜底：拿到预编译包时用不上，拿不到时也不会再让整个构建挂掉。
RUN apk add --no-cache python3 make g++
RUN pnpm install
RUN pnpm run build

FROM node:20.12.2-alpine
WORKDIR /usr/app
COPY --from=builder /usr/src/dist/output ./output
RUN npm install --no-audit --no-fund undici@6.21.3
RUN node -e "const p=require('undici/package.json'); if (p.version !== '6.21.3') process.exit(1)"
ENV HOST=0.0.0.0 PORT=4444 NODE_ENV=production
EXPOSE $PORT
CMD ["node", "output/server/index.mjs"]
