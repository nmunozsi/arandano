> **Location:** `docs/initial-build/plans/v1-rollout/phase-0-foundations/T2-npm-workspace-typescript-base-build.md`
>
> **Folder structure:**
>
> ```
> phase-0-foundations/
> ├── phase.md
> ├── T1-initialize-the-arandano-monorepo-with-oss-bootstra.md
> ├── T2-npm-workspace-typescript-base-build.md                         ← you are here
> ├── T3-self-hosting-quality-gates.md
> ├── T4-ci-workflow.md
> ├── T5-scaffold-arandano-core-with-one-passing-smoke-test.md
> ├── T6-define-core-types-in-arandano-core.md
> ├── T7-implement-task-md-parser.md
> ├── T8-implement-config-loader.md
> ├── T9-implement-run-state-store.md
> ├── T10-scaffold-remaining-packages.md
> ├── T11-bootstrap-arandano-worker-repo.md
> └── T12-bootstrap-arandano-examples-repo.md
> ```

### Task 2: npm workspace + TypeScript base build

**Goal:** A buildable monorepo. `npm ci && npm run build` succeeds; tsup produces dist/ for every package.

**Files:**

- Create: `package.json` (workspace root)
- Create: `tsconfig.base.json`
- Create: `tsup.config.ts`
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/tsup.config.ts`
- Create: `packages/core/src/index.ts`

- [x] **Step 1: Create root `package.json`**

```json
{
  "name": "arandano-monorepo",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=22" },
  "workspaces": ["packages/*"],
  "scripts": {
    "build": "npm run -ws build --if-present",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "eslint . --max-warnings=0",
    "lint:fix": "eslint . --fix",
    "format": "prettier --check .",
    "format:fix": "prettier --write .",
    "typecheck": "tsc -b",
    "coverage": "vitest run --coverage",
    "audit": "npm audit --audit-level=high",
    "secrets": "gitleaks detect --no-banner --redact",
    "prepare": "husky"
  },
  "devDependencies": {
    "@types/node": "^22.5.0",
    "@vitest/coverage-v8": "^1.6.0",
    "tsup": "^8.2.0",
    "typescript": "^5.5.0",
    "vitest": "^1.6.0"
  }
}
```

- [x] **Step 2: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  }
}
```

- [x] **Step 3: Create root `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80, functions: 80, branches: 75, statements: 80 },
    },
  },
});
```

- [x] **Step 4: Create `packages/core/package.json`**

```json
{
  "name": "@arandano/core",
  "version": "0.0.0",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "exports": {
    ".": {
      "types": "./dist/index.d.ts",
      "import": "./dist/index.js"
    }
  },
  "files": ["dist", "README.md"],
  "scripts": {
    "build": "tsup",
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json --noEmit"
  },
  "dependencies": {
    "gray-matter": "^4.0.3",
    "yaml": "^2.5.0",
    "zod": "^3.23.0"
  },
  "publishConfig": { "access": "public" }
}
```

- [x] **Step 5: Create `packages/core/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src"
  },
  "include": ["src/**/*"],
  "exclude": ["src/__tests__/**"]
}
```

- [x] **Step 6: Create `packages/core/tsup.config.ts`**

```ts
import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  sourcemap: true,
  clean: true,
  target: 'node22',
});
```

- [x] **Step 7: Create `packages/core/src/index.ts` placeholder**

```ts
export const VERSION = '0.0.0';
```

- [x] **Step 8: Install and verify build**

```bash
npm ci
npm run build
```

Expected: `npm ci` succeeds; `npm run build` produces `packages/core/dist/index.js` and `index.d.ts`.

- [x] **Step 9: Commit**

```bash
git add package.json tsconfig.base.json vitest.config.ts packages/core/
git commit -m "build: scaffold npm workspace and tsup build for @arandano/core"
```

---
