# Integrate Understand-Anything into Halo Docker Image

**Date**: 2026-06-14
**Status**: Approved

## Overview

Integrate [Understand-Anything](https://github.com/Egonex-AI/Understand-Anything) (U-A) into the hello-halo Docker build so that all 8 U-A skills are available inside the container at runtime, with zero additional downloads or installations.

## Architecture

```
/app/
├── dist/                              # hello-halo built assets (unchanged)
├── start.sh                           # startup script (unchanged)
├── node_modules/                      # hello-halo production deps (unchanged)
└── understand-anything/
    └── understand-anything-plugin/
        ├── packages/core/dist/        # built core engine (tree-sitter etc.)
        ├── packages/dashboard/        # dashboard with pre-installed node_modules
        ├── agents/*.md                # agent prompt files
        ├── skills/                    # 8 skill directories (SKILL.md)
        └── node_modules/              # pnpm-installed dependencies

/home/hello/
└── .understand-anything-plugin -> /app/understand-anything/understand-anything-plugin
                              (symlink for plugin root discovery)

/data/hello/claude-config/skills/      # user-level skill directory (SDK discovers here)
├── understand -> /app/.../skills/understand                      (symlink)
├── understand-chat -> /app/.../skills/understand-chat            (symlink)
├── understand-dashboard -> /app/.../skills/understand-dashboard  (symlink)
├── understand-diff -> /app/.../skills/understand-diff            (symlink)
├── understand-domain -> /app/.../skills/understand-domain        (symlink)
├── understand-explain -> /app/.../skills/understand-explain      (symlink)
├── understand-knowledge -> /app/.../skills/understand-knowledge  (symlink)
└── understand-onboard -> /app/.../skills/understand-onboard      (symlink)
```

## Docker Build

### New Stage: `understand-builder`

Inserted between `server-builder` and `production`:

```dockerfile
FROM node:20-alpine AS understand-builder

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
```

### Production Stage Additions

After existing production steps:

```dockerfile
# Copy U-A plugin
COPY --from=understand-builder /build/Understand-Anything-main/understand-anything-plugin \
    /app/understand-anything/understand-anything-plugin

# Patch dashboard skill: fix port to 5183 and host to 0.0.0.0
RUN sed -i 's|npx vite --host 127.0.0.1|npx vite --host 0.0.0.0 --port 5183|' \
    /app/understand-anything/understand-anything-plugin/skills/understand-dashboard/SKILL.md

# Plugin root symlink (resolved by dashboard skill fallback)
RUN ln -sf /app/understand-anything/understand-anything-plugin /home/hello/.understand-anything-plugin

# Skills symlinks (for SDK's 'user' settingSource)
RUN mkdir -p /data/hello/claude-config/skills && \
    for skill in understand understand-chat understand-dashboard understand-diff \
                 understand-domain understand-explain understand-knowledge understand-onboard; do \
      ln -sf /app/understand-anything/understand-anything-plugin/skills/$skill \
             /data/hello/claude-config/skills/$skill; \
    done

RUN chown -R hello:hello /data/hello/claude-config
```

Note: Build tools (`python3 make g++ rust cargo`) are removed by the existing `RUN apk del ...` in the production stage after all native modules are compiled.

## Skill Loading

The Claude Agent SDK discovers skills via `settingSources: ['user', 'project']` (configured in `sdk-config.ts`). In the Docker container:

- `user` → `/data/hello/claude-config/skills/*/SKILL.md` (symlinked from U-A skills)
- `project` → `$CWD/.claude/skills/` (existing projects can add U-A skills locally)

## Dashboard

- Runs as standalone Vite dev server on **port 5183**
- Pre-installed: all dashboard dependencies are in `node_modules/` at build time
- The `/understand-dashboard` skill starts the server via `npx vite --host 0.0.0.0 --port 5183`
- `docker-compose.yml` needs port mapping for 5183

## Plugin Root Discovery

The dashboard skill resolves the plugin root by checking `~/.understand-anything-plugin` (symlinked to `/app/understand-anything/understand-anything-plugin`). Other skills (understand, understand-chat, etc.) use the knowledge graph at `.understand-anything/` and agent prompts from the same plugin root.

## Files Changed

| File | Change |
|------|--------|
| `docker/Dockerfile` | Add `understand-builder` stage + production additions |
| `docker/docker-compose.yml` | Add port 5183 mapping for dashboard |
| `docker/Understand-Anything-main.zip` | New: pre-downloaded U-A repo |

## Build & Run

```bash
# Build (self-contained, no code changes to hello-halo)
./build.sh

# Run (expose dashboard port)
docker run --name hello --rm -p 3000:3000 -p 5183:5183 \
  -v ./config:/app/config hello-server:1.4
```
