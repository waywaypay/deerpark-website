# syntax=docker/dockerfile:1.7
#
# Build + runtime image for @workspace/api-server.
# Runs from repo root so the pnpm workspace resolves correctly.
#
# Build:   docker build -t deerpark-api .
# Run:     docker run -p 8080:8080 -e DATABASE_URL=... deerpark-api

FROM node:22-slim AS build
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

# --- install layer ---------------------------------------------------------
# Copy workspace roots + every package.json first for cache stability.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json .npmrc ./
COPY tsconfig.base.json tsconfig.json ./
COPY scripts/package.json ./scripts/
COPY lib/api-client-react/package.json ./lib/api-client-react/
COPY lib/api-spec/package.json ./lib/api-spec/
COPY lib/api-zod/package.json ./lib/api-zod/
COPY lib/db/package.json ./lib/db/
COPY artifacts/api-server/package.json ./artifacts/api-server/
COPY artifacts/deerpark-web/package.json ./artifacts/deerpark-web/
COPY artifacts/mockup-sandbox/package.json ./artifacts/mockup-sandbox/

# Install only the api-server dependency graph.
RUN --mount=type=cache,id=pnpm,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter '@workspace/api-server...'

# --- source + build layer --------------------------------------------------
COPY scripts ./scripts
COPY lib ./lib
COPY artifacts/api-server ./artifacts/api-server

# The @workspace/db composite project emits .d.ts consumed via project refs.
RUN pnpm --filter @workspace/db exec tsc --build
# esbuild bundles the Express server into dist/.
RUN pnpm --filter @workspace/api-server run build

# --- runtime image ---------------------------------------------------------
FROM node:22-slim AS runtime
ENV NODE_ENV=production
ENV PORT=8080
WORKDIR /app

# esbuild produces a standalone bundle (with the pino transport workers next to it),
# so we only need the dist directory at runtime.
COPY --from=build /app/artifacts/api-server/dist ./dist

EXPOSE 8080
CMD ["node", "--enable-source-maps", "./dist/index.mjs"]
