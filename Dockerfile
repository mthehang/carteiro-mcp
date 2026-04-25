# syntax=docker/dockerfile:1.7

# ---------- Builder ----------
FROM node:22-bookworm-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json* ./
RUN npm install --include=dev

COPY tsconfig.json biome.json ./
COPY src ./src
RUN npm run build

# ---------- Runtime ----------
FROM node:22-bookworm-slim AS runtime
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/data

RUN groupadd -r carteiro && useradd -r -g carteiro -u 1001 -d /app carteiro \
    && mkdir -p /data /media \
    && chown -R carteiro:carteiro /data /media /app

COPY --chown=carteiro:carteiro package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

COPY --chown=carteiro:carteiro --from=builder /app/dist ./dist
COPY --chown=carteiro:carteiro src/db/schema.sql ./dist/db/schema.sql
COPY --chown=carteiro:carteiro src/admin/ui.html ./dist/admin/ui.html

USER carteiro

VOLUME ["/data", "/media"]

EXPOSE 3000 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD node -e "fetch('http://localhost:'+(process.env.HTTP_PORT||3000)+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "dist/index.js"]
