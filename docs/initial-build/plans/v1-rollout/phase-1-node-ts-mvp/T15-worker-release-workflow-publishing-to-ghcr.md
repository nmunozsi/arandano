> **Location:** `docs/initial-build/plans/v1-rollout/phase-1-node-ts-mvp/T15-worker-release-workflow-publishing-to-ghcr.md`
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
> ├── T14-worker-dockerfile-bundling-claude-code-superpowers.md
> ├── T15-worker-release-workflow-publishing-to-ghcr.md                  ← you are here
> └── T16-end-to-end-smoke-test-in-arandano-examples.md
> ```

### Task 15: Worker — release workflow publishing to ghcr

**Goal:** A GitHub Actions workflow that builds and pushes `ghcr.io/nmunozsi/arandano-worker:<sha>` and `:0.0.0` on push to `main`.

**Files:**

- Modify: `.github/workflows/release.yml` (replace placeholder)

- [x] **Step 1: Write the workflow**

```yaml
name: Release worker image

on:
  push:
    branches: [main]
  workflow_dispatch:

permissions:
  contents: read
  packages: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/metadata-action@v5
        id: meta
        with:
          images: ghcr.io/${{ github.repository }}
          tags: |
            type=sha
            type=raw,value=0.0.0,enable={{is_default_branch}}
            type=raw,value=latest,enable={{is_default_branch}}
      - uses: docker/build-push-action@v6
        with:
          context: .
          push: true
          tags: ${{ steps.meta.outputs.tags }}
          labels: ${{ steps.meta.outputs.labels }}
```

- [x] **Step 2: Commit and push**

```bash
git add .github/workflows/release.yml
git commit -m "ci: publish worker image to ghcr on push to main"
git push
```

Expected: action runs; `ghcr.io/nmunozsi/arandano-worker:0.0.0` and `:latest` exist.

- [x] **Step 3: Make the package public**

In the GitHub UI, navigate to the package and set visibility to public. (Or `gh api -X PATCH /user/packages/container/arandano-worker --field visibility=public`.)

---
