# Buildr Force – ein Container: gebaute PWA + API (ein Prozess). Hinweis: in der Entwicklungsumgebung nicht gebaut/getestet (kein Docker-Daemon).
FROM node:22-slim AS build
ENV CI=true
RUN corepack enable
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile && pnpm --filter @buildr/web build

FROM node:22-slim
RUN corepack enable
WORKDIR /app
COPY --from=build /app /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data \
    WEB_DIST=/app/apps/web/dist
RUN mkdir -p /data && chown node:node /data
VOLUME /data
EXPOSE 3000
USER node
CMD ["pnpm", "--filter", "@buildr/server", "start"]
