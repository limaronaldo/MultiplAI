# Build stage - use node for pnpm install
FROM node:20-slim AS builder

# Install pnpm
RUN npm install -g pnpm@9.14.2

WORKDIR /app

# Copy workspace config files
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./

# Copy shared package
COPY packages/shared/package.json ./packages/shared/
COPY packages/shared/src ./packages/shared/src

# Copy api package
COPY packages/api/package.json ./packages/api/

# Install dependencies with pnpm (handles workspaces correctly)
RUN pnpm install --frozen-lockfile

# Copy api source
COPY packages/api/src ./packages/api/src
COPY packages/api/prompts ./packages/api/prompts

# Production stage - use bun for runtime
FROM oven/bun:1-slim

# Install Node.js and npm for validation commands (npx tsc)
RUN apt-get update && apt-get install -y \
    nodejs \
    npm \
    curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/packages/api/node_modules ./packages/api/node_modules
COPY --from=builder /app/packages/api/src ./packages/api/src
COPY --from=builder /app/packages/api/prompts ./packages/api/prompts
COPY --from=builder /app/packages/api/package.json ./packages/api/
COPY --from=builder /app/package.json ./

WORKDIR /app/packages/api

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Run with bun
CMD ["bun", "run", "src/index.ts"]
