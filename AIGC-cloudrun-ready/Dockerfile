FROM node:22-alpine

RUN apk add --no-cache tzdata

ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3001 \
    PERSISTENCE_DRIVER=cloudbase \
    REQUIRE_SHARED_PERSISTENCE=true \
    TZ=Asia/Shanghai

WORKDIR /app

COPY --chown=node:node package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY --chown=node:node backend ./backend

USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || '3001') + '/healthz').then((response) => { if (!response.ok) process.exit(1); }).catch(() => process.exit(1));"

CMD ["node", "backend/server.js"]
