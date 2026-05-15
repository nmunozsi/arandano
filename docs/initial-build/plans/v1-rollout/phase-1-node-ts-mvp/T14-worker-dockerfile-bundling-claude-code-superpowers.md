> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T14-worker-dockerfile-bundling-claude-code-superpowers.md`
>
> **Folder structure:**
>
> ```
> phase-1-node-ts-mvp/
> ├── phase.md
> ├── T1-static-template-files-for-the-node-ts-stack.md
> ├── T2-scaffold-writer.md
> ├── T3-arandano-init-command.md
> ├── T4-run-folder-layout-helpers.md
> ├── T5-container-spec-builder.md
> ├── T6-dockerexecutor-wiring.md
> ├── T7-single-task-orchestrator.md
> ├── T8-arandano-run-command.md
> ├── T9-worker-task-reader.md
> ├── T10-worker-git-helpers.md
> ├── T11-worker-quality-gate-runners.md
> ├── T12-worker-invoke-claude-code.md
> ├── T13-worker-driver-result-writer.md
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md          ← you are here
> ├── T15-worker-release-workflow-publishing-to-ghcr.md
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 14: Worker — Dockerfile bundling Claude Code + superpowers

**Goal:** Replace the Phase 0 placeholder Dockerfile with a real one that installs `git`, `gh`, `node`, the lib helper, the Claude Code CLI, and the superpowers plugin.

**Files:**

- Modify: `Dockerfile`
- Modify: `entrypoint.sh`

- [x] **Step 1: Rewrite `Dockerfile`**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl jq gh \
 && rm -rf /var/lib/apt/lists/*

FROM base AS lib-build
WORKDIR /worker/lib
COPY lib/package.json lib/package-lock.json* ./
RUN npm ci
COPY lib/ ./
RUN npm run build

FROM base AS runtime
WORKDIR /opt/worker
COPY --from=lib-build /worker/lib/dist ./lib/dist
COPY --from=lib-build /worker/lib/node_modules ./lib/node_modules
COPY --from=lib-build /worker/lib/package.json ./lib/package.json

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# superpowers plugin (baked in)
RUN mkdir -p /home/worker/.claude/plugins \
 && git clone --depth=1 https://github.com/obra/superpowers.git /home/worker/.claude/plugins/superpowers

# non-root user
RUN useradd -m -u 1000 worker && chown -R worker:worker /home/worker
USER worker

COPY --chown=worker:worker entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
```

- [x] **Step 2: Rewrite `entrypoint.sh`**

```sh
#!/usr/bin/env sh
set -eu

: "${ARANDANO_TASK_ID:?ARANDANO_TASK_ID required}"
exec node /opt/worker/lib/dist/driver.js
```

- [x] **Step 3: Build and smoke-test the image**

```bash
docker build -t arandano-worker:dev .
docker run --rm \
  -e ARANDANO_TASK_ID=T_SMOKE \
  -e ARANDANO_TASK_MD=missing \
  -e ARANDANO_ROLE_MD=missing \
  -e ARANDANO_CLI=echo \
  -e ARANDANO_MODEL=x \
  -e ARANDANO_TDD=relaxed \
  -e ARANDANO_RUN_FOLDER=2026-05-08T19-30Z-T_SMOKE \
  -e ARANDANO_QUALITY_JSON='{"format":"skip","lint":"skip","typecheck":"skip","test":"skip","coverage":{"min":0,"delta":"any"},"security":"skip","commit_msg":"skip","reviewer_required":false}' \
  arandano-worker:dev || true
```

Expected: image builds; the run errors with "missing" because we passed bogus paths — that's OK. The point is the bin starts.

- [x] **Step 4: Commit and push**

```bash
git add Dockerfile entrypoint.sh
git commit -m "feat: bundle claude-code + superpowers in worker image"
git push
```

---
