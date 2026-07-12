# syntax=docker/dockerfile:1
# Mnemosyne — the automaton container. Multi-stage → a slim runtime image that runs
# the Next.js standalone server. The whole app+website+API in one image; secrets +
# the sealed codex live OUTSIDE the image (host volume + env_file), so a rebuild never
# touches operator state. Reference: docs/handoffs/04-automaton-blueprint.md.

# ---- deps: resolve node_modules from the lockfile (cached layer) --------------------
FROM node:20-alpine AS deps
WORKDIR /app
# libc compat for native modules (libsodium-wrappers, future better-sqlite3).
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# ---- build: compile the Next standalone output -------------------------------------
FROM node:20-alpine AS build
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# next build --webpack, output: "standalone" (see next.config.ts). Pulls the pinned
# @ancientpantheon/* constructors from the deps layer and bundles the client chunks.
RUN npm run build

# ---- runtime: just the standalone server + static + public -------------------------
FROM node:20-alpine AS runtime
WORKDIR /app
RUN apk add --no-cache libc6-compat \
  && addgroup -g 1001 -S nodejs \
  && adduser -S nextjs -u 1001
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3005 \
    HOSTNAME=0.0.0.0
# The standalone bundle traces its own minimal node_modules + server.js.
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
# The sealed-codex data dir is a MOUNTED VOLUME (see docker-compose). Create the
# mountpoint owned by the runtime user so the app can write the sealed files.
RUN mkdir -p /app/data && chown -R nextjs:nodejs /app/data
USER nextjs
EXPOSE 3005
# server.js reads env from the process (compose passes env_file). Next standalone
# does NOT auto-load .env files — that's intentional; secrets come from the env_file.
CMD ["node", "server.js"]
