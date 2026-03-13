# Halo - B/S Architecture Web Server
# Multi-stage build for production deployment

# ========================================
# Stage 1: Build Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci --only=production

# Copy source code
COPY vite.config.ts tsconfig.json tsconfig.server.json ./
COPY src/renderer ./src/renderer
COPY src/shared ./src/shared
COPY public ./public

# Build frontend
RUN npm run build:client

# ========================================
# Stage 2: Build Server
# ========================================
FROM node:20-alpine AS server-builder

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies (including devDependencies for TypeScript)
RUN npm ci

# Copy source code
COPY vite.config.ts tsconfig.json tsconfig.server.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared

# Build server
RUN npm run build:server

# ========================================
# Stage 3: Production Image
# ========================================
FROM node:20-alpine AS production

WORKDIR /app

# Install production dependencies only
COPY package.json package-lock.json* ./
RUN npm ci --only=production

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
