# Halo - B/S Architecture Web Server
# Multi-stage build for production deployment

# ========================================
# Stage 1: Build Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Install build tools for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files and patches
COPY package.json package-lock.json* ./
COPY patches ./patches

# Install ALL dependencies (devDependencies needed for vite, typescript, tailwindcss, etc.)
RUN npm ci --ignore-scripts && npx patch-package

# Copy config files needed for frontend build
COPY vite.config.ts tsconfig.json tsconfig.web.json tsconfig.server.json ./
COPY postcss.config.cjs tailwind.config.cjs ./
COPY src/web ./src/web
COPY src/shared ./src/shared
COPY public ./public

# Build frontend
RUN npm run build:client

# ========================================
# Stage 2: Build Server
# ========================================
FROM node:20-alpine AS server-builder

WORKDIR /app

# Install build tools for native modules
RUN apk add --no-cache python3 make g++

# Copy package files and patches
COPY package.json package-lock.json* ./
COPY patches ./patches

# Install ALL dependencies (devDependencies needed for TypeScript)
RUN npm ci --ignore-scripts && npx patch-package

# Copy config files needed for server build
COPY tsconfig.json tsconfig.web.json tsconfig.server.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared

# Build server
RUN npm run build:server

# ========================================
# Stage 3: Production Image
# ========================================
FROM node:20-alpine AS production

WORKDIR /app

# Install build tools for native modules (better-sqlite3, bcrypt)
RUN apk add --no-cache python3 make g++

# Copy package files and patches
COPY package.json package-lock.json* ./
COPY patches ./patches

# Install production dependencies only, then apply patches
RUN npm ci --omit=dev --ignore-scripts \
    && npx --yes patch-package \
    && npm rebuild better-sqlite3

# Remove build tools to reduce image size
RUN apk del python3 make g++

# Copy built assets from builders
COPY --from=frontend-builder /app/dist/client ./dist/client
COPY --from=server-builder /app/dist/server ./dist/server

# Create data directory
RUN mkdir -p /data/halo

# Set environment variables
ENV NODE_ENV=production
ENV HALO_DATA_DIR=/data/halo
ENV HALO_PORT=3000
ENV HALO_HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run server
CMD ["node", "dist/server/index.js"]
