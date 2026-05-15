> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T6-gitlab-ci-templates.md`
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
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md                                         ← you are here
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

### Task 6: GitLab CI templates

**Files:**

- Create: `packages/templates/stacks/node-ts/.gitlab-ci.yml`
- Create: `packages/templates/stacks/python/.gitlab-ci.yml`
- Create: `packages/templates/stacks/go/.gitlab-ci.yml`

- [ ] **Step 1: Author node-ts `.gitlab-ci.yml`**

```yaml
default:
  image: node:22-bookworm

stages: [quality]

variables:
  GIT_DEPTH: 0

quality:
  stage: quality
  script:
    - npm ci
    - npx prettier --check .
    - npx eslint . --max-warnings=0
    - npx tsc --noEmit
    - npx vitest run --coverage
    - npm audit --audit-level=high
    - curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.18.0/gitleaks_8.18.0_linux_x64.tar.gz | tar -xz
    - ./gitleaks detect --no-banner --redact --source .
  coverage: '/Lines\s*:\s*([0-9.]+)%/'
```

- [ ] **Step 2: Author python and go `.gitlab-ci.yml`**

(Use `python:3.12-bookworm` and `golang:1.23-bookworm` images respectively.)

- [ ] **Step 3: Commit**

```bash
git add packages/templates/
git commit -m "ci: gitlab CI templates per stack"
```

---
