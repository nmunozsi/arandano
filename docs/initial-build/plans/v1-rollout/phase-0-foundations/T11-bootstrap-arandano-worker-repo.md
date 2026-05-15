> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T11-bootstrap-arandano-worker-repo.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md                             ← you are here
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 11: Bootstrap `arandano-worker` repo

**Goal:** A second GitHub repo exists with the same OSS scaffolding plus a Dockerfile skeleton, an entrypoint placeholder, and a small Node helper package shape. CI is green on first push (it just builds the placeholder image and runs the placeholder test).

**Files:**

- Create (in a sibling working directory `../arandano-worker/`): `LICENSE`, `README.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`, `.gitignore`, `Dockerfile`, `entrypoint.sh`, `lib/package.json`, `lib/tsconfig.json`, `lib/src/index.ts`, `lib/src/__tests__/smoke.test.ts`, `.github/workflows/ci.yml`

- [x] **Step 1: Create the repo on GitHub**

```bash
gh repo create nmunozsi/arandano-worker \
  --public \
  --license MIT \
  --description "OCI image for arandano coding-agent workers — sandcastle + superpowers + quality gates"
```

- [x] **Step 2: Clone it as a sibling of `arandano/`**

```bash
cd ..
gh repo clone nmunozsi/arandano-worker
cd arandano-worker
```

- [x] **Step 3: Add the same OSS files as Task 1** (LICENSE may already exist from `--license MIT` — keep it; otherwise paste the MIT template).

Adapt `README.md` for the worker:

```markdown
# arandano-worker

> OCI image that runs a single arandano task in isolation.

This image bundles [sandcastle](https://github.com/mattpocock/sandcastle), [superpowers](https://github.com/obra/superpowers), and a small Node helper that enforces TDD and quality gates before opening a PR. It's launched by the [arandano](https://github.com/nmunozsi/arandano) CLI; you probably don't run it directly.

## Status

Pre-alpha. See the [arandano design doc](https://github.com/nmunozsi/arandano/blob/main/arandano-design.md) §15 for the worker's preflight contract.

## License

MIT.
```

`CONTRIBUTING.md` and `CODE_OF_CONDUCT.md` mirror Task 1 with worker-flavored wording.

- [x] **Step 4: Create `Dockerfile` (multi-stage skeleton)**

```dockerfile
# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS base
WORKDIR /worker

FROM base AS deps
COPY lib/package.json lib/package-lock.json* ./lib/
RUN cd lib && npm ci

FROM base AS build
COPY --from=deps /worker/lib/node_modules ./lib/node_modules
COPY lib ./lib
RUN cd lib && npm run build

FROM base AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates curl jq \
 && rm -rf /var/lib/apt/lists/*

# Phase 1 installs sandcastle CLI, claude-code, and the superpowers plugin here.
COPY --from=build /worker/lib/dist ./lib/dist
COPY --from=build /worker/lib/node_modules ./lib/node_modules
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

WORKDIR /workspace
ENTRYPOINT ["/entrypoint.sh"]
```

- [x] **Step 5: Create `entrypoint.sh` placeholder**

```sh
#!/usr/bin/env sh
set -eu

echo "arandano-worker: placeholder entrypoint (Phase 0)"
echo "  ARANDANO_TASK_ID=${ARANDANO_TASK_ID:-<unset>}"
echo "  workdir=$(pwd)"

# Phase 1 will replace this with the real task driver.
exit 0
```

- [x] **Step 6: Create `lib/` Node helper skeleton**

`lib/package.json`:

```json
{
  "name": "@arandano-worker/lib",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "private": true,
  "scripts": {
    "build": "tsup src/index.ts --format esm --dts --target node22 --clean",
    "test": "vitest run",
    "typecheck": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "tsup": "^8.2.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

`lib/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**"]
}
```

`lib/src/index.ts`:

```ts
export const WORKER_VERSION = '0.0.0';
```

`lib/src/__tests__/smoke.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { WORKER_VERSION } from '../index.js';

describe('arandano-worker lib', () => {
  it('exports a version string', () => {
    expect(WORKER_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
```

- [x] **Step 7: Install and verify**

```bash
cd lib && npm install && npm run build && npm test && cd ..
docker build -t arandano-worker:dev .
```

Expected: build succeeds; running it prints the placeholder message:

```bash
docker run --rm arandano-worker:dev
```

- [x] **Step 8: Add CI workflow**

`.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

permissions:
  contents: read

jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '22' }
      - run: cd lib && npm install && npm test && npm run build
      - uses: docker/setup-buildx-action@v3
      - run: docker build -t arandano-worker:ci .
      - run: docker run --rm arandano-worker:ci
```

- [x] **Step 9: Commit and push**

```bash
git add .
git commit -m "chore: bootstrap arandano-worker repo with Dockerfile skeleton and lib/ helper"
git push -u origin main
```

Watch CI:

```bash
gh run watch --exit-status
```

Expected: green.

---
