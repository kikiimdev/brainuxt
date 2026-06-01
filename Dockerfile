# ---------- Build stage ----------
FROM oven/bun:1.3.14 AS build

WORKDIR /app

# Copy dependency manifests first to leverage Docker layer caching
COPY package.json bun.lock ./

# Install development dependencies cleanly
RUN bun install --frozen-lockfile

# Copy the remaining application source tree files
COPY . .

# Compile the production app (respects the 'bun' nitro preset configuration)
RUN bun run build


# ---------- Runtime stage ----------
FROM oven/bun:1.3.14 AS runtime

# Set essential production flags
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000

WORKDIR /app

# 🎯 CRITICAL: Copy package configuration definitions so the 
# runtime step recognizes your global imports and dependencies
COPY package.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.output ./.output

# Runtime configuration environment variables
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV APP_URL=http://localhost:3000
ENV MIMO_API_KEY=""

EXPOSE 3000

# Native Bun runtime startup command execution entry hook mapping parameter
CMD ["bun", "run", ".output/server/index.mjs"]