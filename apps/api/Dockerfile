# The Cooper API. Built from the repo root so pnpm sees the whole workspace,
# but only the API and its dependencies are installed.
FROM node:22-bookworm-slim

WORKDIR /app
RUN corepack enable

COPY . .
RUN pnpm install --frozen-lockfile --filter @expojet/api...

ENV NODE_ENV=production
EXPOSE 3000
CMD ["pnpm", "--filter", "@expojet/api", "start"]
