# jira-collector — single-image self-host build
#
# better-sqlite3 needs native compile (python3, make, g++) at install time.
# Final runtime keeps those installed since the addon was built against
# the alpine libc; trying to strip them out breaks `require('better-sqlite3')`.

FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache python3 make g++ tini

# Install deps separately so the layer can be cached across code changes.
COPY package.json package-lock.json ./
RUN npm ci

# Copy the rest of the source and build the Next.js production bundle.
COPY . .

# APP_ENCRYPTION_KEY must be set at runtime — provide a build-only placeholder
# so the bootstrap script doesn't fail during `npm run build`.
ENV NODE_ENV=production
RUN APP_ENCRYPTION_KEY=BUILD_ONLY_PLACEHOLDER_NOT_USED_AT_RUNTIME \
    npm run db:generate \
    && npm run build

# Drizzle migrations run on container start, against the volume-mounted DB.
ENV DATABASE_FILE=/data/app.db
VOLUME ["/data"]

EXPOSE 3000

# Use tini so SIGTERM is forwarded cleanly to Next.js when `docker stop` runs.
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["sh", "-c", "npx tsx scripts/migrate.ts && node node_modules/next/dist/bin/next start -H 0.0.0.0 -p 3000"]
