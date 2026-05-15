> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T4-github-actions-templates-per-stack.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md                          ← you are here
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

### Task 4: GitHub Actions templates per stack (already partly exist — refine)

**Goal:** Three robust GitHub Actions workflows (one per stack) shipped in `packages/templates/stacks/<stack>/.github/workflows/ci.yml`, all running the same gates the worker preflight runs.

- [ ] **Step 1: Audit each existing `ci.yml`**

Already present from Phase 1/2. Confirm each runs:

- format check
- lint
- typecheck (where applicable)
- tests (with coverage)
- security scan
- gitleaks
- comment coverage delta on PR (use `coverage-delta-action` or compare against `main`)

- [ ] **Step 2: Add coverage-delta job to node-ts/.github/workflows/ci.yml**

Append:

```yaml
coverage-delta:
  runs-on: ubuntu-latest
  if: github.event_name == 'pull_request'
  steps:
    - uses: actions/checkout@v4
      with: { fetch-depth: 0 }
    - uses: actions/setup-node@v4
      with: { node-version-file: .nvmrc, cache: npm }
    - run: npm ci
    - name: cov head
      run: npx vitest run --coverage && cp coverage/coverage-summary.json /tmp/head.json
    - name: cov base
      run: |
        git checkout ${{ github.base_ref }}
        npm ci
        npx vitest run --coverage
        cp coverage/coverage-summary.json /tmp/base.json
    - name: compare
      run: |
        node -e "
          const h = require('/tmp/head.json').total.lines.pct;
          const b = require('/tmp/base.json').total.lines.pct;
          const d = (h - b).toFixed(2);
          console.log('delta=' + d);
          if (d < 0) process.exit(1);
        "
```

(Add equivalents for python and go.)

- [ ] **Step 3: Commit**

```bash
git add packages/templates/
git commit -m "ci: coverage-delta job in stack CI templates"
```

---
