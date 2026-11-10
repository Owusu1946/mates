# syntax=docker/dockerfile:1
# LiveKit's Node.js agent template: LiveKit Cloud builds this when you run `lk agent deploy`.

ARG NODE_VERSION=24
FROM node:${NODE_VERSION}-slim AS base

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV HOME="/app"

# The LiveKit SDK's native core reads the system trust store, which the slim image doesn't ship.
RUN apt-get update -qq && apt-get install --no-install-recommends -y ca-certificates && rm -rf /var/lib/apt/lists/*
RUN npm install -g pnpm@10

FROM base AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
# Model files (the turn detector) are downloaded at build time, before the source, so code-only changes reuse the layer.
RUN npx livekit-agents download-files
COPY . .
RUN pnpm prune --prod

FROM base
ARG UID=10001
RUN adduser --disabled-password --gecos "" --home "/app" --shell "/sbin/nologin" --uid "${UID}" appuser
WORKDIR /app
COPY --from=build --chown=appuser:appuser /app /app
USER appuser
ENV NODE_ENV=production
# Node as PID 1, so SIGTERM reaches the worker and calls in progress can finish.
CMD [ "node", "src/main.ts", "start" ]
