FROM node:20.12.2-alpine AS builder
WORKDIR /usr/src
COPY . .
RUN npm install -g pnpm@10.30.3
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
