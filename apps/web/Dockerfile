# =============================================================================
# WEB UI DOCKERFILE
# Production-grade Bun/Node.js container
# =============================================================================

FROM oven/bun:1-alpine as builder

WORKDIR /app

# Copy package files
COPY package.json bun.lockb* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build if needed (currently runs directly)
# RUN bun run build

# =============================================================================
# PRODUCTION IMAGE
# =============================================================================
FROM oven/bun:1-alpine

WORKDIR /app

# Create non-root user
RUN addgroup -S aiops && adduser -S aiops -G aiops

# Copy from builder
COPY --from=builder --chown=aiops:aiops /app /app

# Switch to non-root user
USER aiops

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ || exit 1

# Expose port
EXPOSE 3000

# Run the server
CMD ["bun", "run", "src/server.ts"]
