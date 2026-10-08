# MF Project Control - one container serves the API and the web app.
FROM node:22-slim AS web
WORKDIR /build/app
COPY app/package*.json ./
RUN npm ci
COPY app/ ./
RUN npx expo export --platform web

FROM node:22-slim
WORKDIR /srv
COPY server/package*.json server/
RUN cd server && npm ci --omit=dev
COPY server/ server/
COPY --from=web /build/app/dist app/dist
ENV NODE_ENV=production PORT=10000 DATA_DIR=/data
VOLUME /data
EXPOSE 10000
WORKDIR /srv/server
CMD ["node", "src/server.js"]
