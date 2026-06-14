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
# Stage 2.5: Build Understand-Anything
# ========================================
FROM node:22.22.3-alpine AS understand-builder

WORKDIR /build

RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
RUN apk add --no-cache python3 make g++ rust cargo unzip
RUN corepack enable && corepack prepare pnpm@10.6.2 --activate

COPY docker/Understand-Anything-main.zip .
RUN unzip Understand-Anything-main.zip && rm Understand-Anything-main.zip

WORKDIR /build/Understand-Anything-main

RUN pnpm config set registry https://registry.npmmirror.com
RUN pnpm install --frozen-lockfile
RUN pnpm run build

# ========================================
# Stage 3: Production Image
# ========================================
FROM node:20-alpine AS production

WORKDIR /app

# 替换为中科大或阿里云镜像源
RUN sed -i 's/dl-cdn.alpinelinux.org/mirrors.ustc.edu.cn/g' /etc/apk/repositories
# Install build tools for native modules, curl for health check, bash, and additional utilities
RUN apk add --no-cache bash python3 make g++ rust cargo curl git jq openssh-client

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

# Copy Understand-Anything plugin
COPY --from=understand-builder /build/Understand-Anything-main/understand-anything-plugin \
    /app/understand-anything/understand-anything-plugin

# Patch dashboard skill: fix port to 5183 and host to 0.0.0.0
RUN sed -i 's|npx vite --host 127.0.0.1|npx vite --host 0.0.0.0 --port 5183|' \
    /app/understand-anything/understand-anything-plugin/skills/understand-dashboard/SKILL.md

# Copy built assets from builders
COPY --from=frontend-builder /app/dist/client ./dist/client
COPY --from=server-builder /app/dist/server ./dist/server
COPY --from=server-builder /app/dist/shared ./dist/shared

# Create data directory and config directory
RUN mkdir -p /data/hello /app/config

# Create non-root user (also creates /home/hello)
RUN addgroup -g 1001 hello && adduser -S -u 1001 -G hello hello

# Plugin root symlink (for dashboard skill fallback via ~/.understand-anything-plugin)
RUN ln -sf /app/understand-anything/understand-anything-plugin /home/hello/.understand-anything-plugin

# Skills symlinks into user-level skills directory for SDK discovery
RUN mkdir -p /data/hello/claude-config/skills && \
    for skill in understand understand-chat understand-dashboard understand-diff \
                 understand-domain understand-explain understand-knowledge understand-onboard; do \
      ln -sf /app/understand-anything/understand-anything-plugin/skills/$skill \
             /data/hello/claude-config/skills/$skill; \
    done

# Copy startup script
COPY docker/start.sh /app/start.sh
RUN chmod +x /app/start.sh

# Set ownership of app directory
RUN chown -R hello:hello /app /data/hello /home/hello/.understand-anything-plugin

# Set environment variables
ENV NODE_ENV=production
ENV HELLO_DATA_DIR=/data/hello
ENV HELLO_CONFIG_DIR=/app/config
ENV HELLO_PORT=3000
ENV HELLO_HOST=0.0.0.0

# Expose port
EXPOSE 3000

# Switch to non-root user
USER hello

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Run startup script
CMD ["/app/start.sh"]
