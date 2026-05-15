> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T5-forgejo-actions-templates.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md                                   ← you are here
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

### Task 5: Forgejo Actions templates

**Goal:** A `.forgejo/workflows/ci.yml` per stack that runs the same gate suite. Forgejo Actions is largely Drone+gitea_actions compatible; the syntax mostly mirrors GitHub Actions.

**Files:**

- Create: `packages/templates/stacks/node-ts/.forgejo/workflows/ci.yml`
- Create: `packages/templates/stacks/python/.forgejo/workflows/ci.yml`
- Create: `packages/templates/stacks/go/.forgejo/workflows/ci.yml`

- [ ] **Step 1: Author node-ts forgejo CI**

```yaml
name: CI
on: [push, pull_request]

jobs:
  quality:
    runs-on: docker
    container:
      image: node:22-bookworm
    steps:
      - uses: actions/checkout@v4
        with: { fetch-depth: 0 }
      - run: npm ci
      - run: npx prettier --check .
      - run: npx eslint . --max-warnings=0
      - run: npx tsc --noEmit
      - run: npx vitest run --coverage
      - run: npm audit --audit-level=high || true # forgejo: warn-only by default
      - name: gitleaks
        run: |
          curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz | tar -xz
          ./gitleaks detect --no-banner --redact --source .
```

- [ ] **Step 2: Author python and go variants** (similar shape — install python/go runtime, run the stack's gate commands)

- [ ] **Step 3: Commit**

```bash
git add packages/templates/
git commit -m "ci: forgejo workflow templates per stack"
```

---
