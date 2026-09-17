FROM node:24.19.0-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
COPY web ./web
COPY scripts/build-web.mjs ./scripts/build-web.mjs
RUN npm run build && npm prune --omit=dev

FROM node:24.19.0-bookworm-slim
ENV NODE_ENV=production DATABASE_PATH=/app/data/bot.sqlite
WORKDIR /app
RUN mkdir /app/data && chown node:node /app/data
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json LICENSE THIRD_PARTY_NOTICES.md ./
USER node
VOLUME /app/data
CMD ["node", "dist/index.js"]
