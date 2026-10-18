# syntax=docker/dockerfile:1.7
# 多阶段构建：build 阶段装依赖并构建 web 与 server，runtime 阶段只保留生产依赖与产物。

FROM node:24-bookworm-slim AS build
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml VERSION ./
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
COPY apps/e2e/package.json apps/e2e/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm --filter @cangze/web build \
  && pnpm --filter @cangze/server build \
  && pnpm --filter @cangze/server deploy --prod --legacy /out \
  && cp -r apps/server/dist /out/dist \
  && cp -r apps/web/dist /out/public \
  && cp VERSION LICENSE /out/

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
  CANGZE_DATA_DIR=/data \
  CANGZE_PORT=38417
WORKDIR /app
COPY --from=build /out /app
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 38417
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=5 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:38417/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "--enable-source-maps", "dist/main.js"]
