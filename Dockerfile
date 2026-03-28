# Hello - B/S Architecture Web Server
# Multi-stage build for production deployment

# ========================================
# Stage 1: Build Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /app

# 替换为中科大或阿里云镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories

# Install build tools for native modules (better-sqlite3, bcrypt, @node-rs/bcrypt)
RUN apk add --no-cache python3 make g++ rust cargo

# Copy package files and patches
COPY package.json package-lock.json* ./
COPY patches ./patches

# Install ALL dependencies (devDependencies needed for vite, typescript, tailwindcss, etc.)
#RUN npm ci --ignore-scripts && npx patch-package
RUN npm install --registry=https://registry.npmmirror.com --ignore-scripts && npx patch-package

# Copy config files needed for frontend build
COPY vite.config.ts tsconfig.json tsconfig.web.json tsconfig.server.json ./
COPY postcss.config.cjs tailwind.config.cjs ./
COPY src/web ./src/web
COPY src/shared ./src/shared
COPY src/worker ./src/worker

# Build frontend
RUN CI=true npm run build:client

# ========================================
# Stage 2: Build Server
# ========================================
FROM node:20-alpine AS server-builder

WORKDIR /app

# 替换为中科大或阿里云镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
# Install build tools for native modules
RUN apk add --no-cache python3 make g++ rust cargo

# Copy package files and patches
COPY package.json package-lock.json* ./
COPY patches ./patches

# Install ALL dependencies (devDependencies needed for TypeScript)
#RUN npm ci --ignore-scripts && npx patch-package
RUN npm install --registry=https://registry.npmmirror.com --ignore-scripts && npx patch-package

# Copy config files needed for server build
COPY tsconfig.json tsconfig.web.json tsconfig.server.json ./
COPY src/server ./src/server
COPY src/shared ./src/shared
COPY src/worker ./src/worker

# Copy scripts needed for build
COPY scripts ./scripts

# Build server
RUN npm run build:server

# ========================================
# Stage 3: Production Image
# ========================================
FROM node:20-alpine AS production

WORKDIR /app

# 替换为中科大或阿里云镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
# Install build tools for native modules, curl for health check, and additional utilities
RUN apk add --no-cache python3 make g++ rust cargo curl git jq openssh-client

# Copy package files and patches
COPY package.json package-lock.json* ./
COPY patches ./patches

# Install production dependencies only, then apply patches
# RUN npm ci --omit=dev --ignore-scripts \
RUN npm install --registry=https://registry.npmmirror.com --omit=dev --ignore-scripts \
    && npx --yes patch-package \
    && npm rebuild better-sqlite3 \
    && npm rebuild @node-rs/bcrypt

# Remove build tools to reduce image size
RUN apk del python3 make g++ rust cargo

# Copy built assets from builders
COPY --from=frontend-builder /app/dist/client ./dist/client
COPY --from=server-builder /app/dist/server ./dist/server
COPY --from=server-builder /app/dist/shared ./dist/shared

# Create data directory and config directory
RUN mkdir -p /data/hello /app/config

# Create non-root user
RUN addgroup -g 1001 hello && adduser -S -u 1001 -G hello hello

# Set ownership of app directory
RUN chown -R hello:hello /app /data/hello

# Set environment variables
ENV NODE_ENV=production
ENV HALO_DATA_DIR=/data/hello
ENV HALO_CONFIG_DIR=/app/config
ENV HALO_PORT=3000
ENV HALO_HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Switch to non-root user
USER hello

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run server
CMD ["node", "dist/server/index.js"]
