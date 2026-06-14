# Integrate Understand-Anything Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add Understand-Anything skills to the hello-halo Docker image so all 8 skills are available at runtime without extra downloads.

**Architecture:** Add a new `understand-builder` Docker stage that extracts a pre-downloaded zip of the Understand-Anything repo, installs pnpm deps, builds the TypeScript packages, then copies the built plugin into the production stage with symlinks for skill discovery.

**Tech Stack:** Docker multi-stage build, Alpine Linux, pnpm, tree-sitter (native modules)

**Design Doc:** `.opencode/plans/2026-06-14-integrate-understand-anything-design.md`

---

### Task 1: Update Dockerfile — Add understand-builder stage

**Files:**
- Modify: `docker/Dockerfile` (insert after Stage 2 `server-builder`, before Stage 3 `production`)

**Step 1: Read current Dockerfile to confirm insertion point**

Run: `Get-Content docker/Dockerfile`
Expected: Confirm the file structure matches the design doc

**Step 2: Add understand-builder stage**

Insert after line 66 (`# ========================================` before Stage 3):

```dockerfile
# ========================================
# Stage 2.5: Build Understand-Anything
# ========================================
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

**Step 3: Verify insertion**

Run: `Select-String -Pattern "understand-builder" docker/Dockerfile`
Expected: Shows the new stage name

**Step 4: Commit**

```bash
git add docker/Dockerfile
git commit -m "build: add understand-builder stage for Understand-Anything"
```

---

### Task 2: Update Dockerfile — Add production stage steps

**Files:**
- Modify: `docker/Dockerfile` (add steps before `USER hello`)

**Step 1: Find insertion point**

Read the last section of the production stage (lines 90-122)

Insert after line 91 (`RUN apk del python3 make g++ rust cargo`) and before line 93 (`COPY --from=frontend-builder`):

```dockerfile
# Copy Understand-Anything plugin
COPY --from=understand-builder /build/Understand-Anything-main/understand-anything-plugin \
    /app/understand-anything/understand-anything-plugin

# Patch dashboard skill: fix port to 5183 and host to 0.0.0.0
RUN sed -i 's|npx vite --host 127.0.0.1|npx vite --host 0.0.0.0 --port 5183|' \
    /app/understand-anything/understand-anything-plugin/skills/understand-dashboard/SKILL.md

# Plugin root symlink (for dashboard skill fallback resolution)
RUN ln -sf /app/understand-anything/understand-anything-plugin /home/hello/.understand-anything-plugin

# Skills symlinks into user-level skills directory
RUN mkdir -p /data/hello/claude-config/skills && \
    for skill in understand understand-chat understand-dashboard understand-diff \
                 understand-domain understand-explain understand-knowledge understand-onboard; do \
      ln -sf /app/understand-anything/understand-anything-plugin/skills/$skill \
             /data/hello/claude-config/skills/$skill; \
    done

RUN chown -R hello:hello /data/hello/claude-config
```

Note: The `COPY` commands from builders (`COPY --from=frontend-builder`, `COPY --from=server-builder`) should come after the U-A COPY. Ensure proper ordering.

**Step 2: Verify**

Run: `Select-String -Pattern "understand-anything" docker/Dockerfile`
Expected: Shows all new lines

**Step 3: Commit**

```bash
git add docker/Dockerfile
git commit -m "build: add U-A plugin copy, symlinks, and port config to production stage"
```

---

### Task 3: Add Understand-Anything-main.zip

**Note:** File already exists at `docker/Understand-Anything-main.zip`. Verify it's not gitignored.

**Step 1: Check git status**

```bash
git status docker/Understand-Anything-main.zip
```

**Step 2: Commit if not already tracked**

```bash
git add docker/Understand-Anything-main.zip
git commit -m "chore: add Understand-Anything repo archive (main branch)"
```

---

### Task 4: Update docker-compose.yml (optional)

**Files:**
- Modify: `docker/docker-compose.yml` (add port 5183)

**Step 1: Read current docker-compose.yml**

Read `docker/docker-compose.yml`

**Step 2: Add port mapping**

Add `- "5183:5183"` to the ports section.

**Step 3: Commit**

```bash
git add docker/docker-compose.yml
git commit -m "chore: add dashboard port 5183 to docker-compose"
```

---

### Task 5: Verify the build

**Step 1: Run the build**

```bash
./build.sh
```

Expected: Build succeeds. `understand-builder` stage compiles tree-sitter native modules, production stage copies plugin + creates symlinks.

**Step 2: Quick smoke test**

Run a container and verify:
```bash
docker run --rm -it --entrypoint /bin/sh hello-server:1.4 -c "
  ls -la /data/hello/claude-config/skills/ && \
  ls -la /home/hello/.understand-anything-plugin && \
  ls /app/understand-anything/understand-anything-plugin/packages/core/dist/
"
```

Expected:
- `/data/hello/claude-config/skills/` shows all 8 symlinked skills
- `/home/hello/.understand-anything-plugin` is a symlink
- `packages/core/dist/` exists (built TypeScript)
