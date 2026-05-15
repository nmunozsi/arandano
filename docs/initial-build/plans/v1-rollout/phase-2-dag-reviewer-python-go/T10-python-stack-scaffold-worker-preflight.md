> **Location:** `docs/initial-build/plans/v1-rollout/phase-2-dag-reviewer-python-go/T10-python-stack-scaffold-worker-preflight.md`
>
> **Folder structure:**
>
> ```
> phase-2-dag-reviewer-python-go/
> ├── phase.md
> ├── T0-close-phase-1-s-deferred-e2e-gap.md
> ├── T1-dag-construction-and-ready-batch-selection.md
> ├── T2-plan-loader.md
> ├── T3-orchestrator-class-drives-a-plan-to-completion.md
> ├── T4-synthetic-reviewer-task-generator.md
> ├── T5-reviewer-driver-inside-the-worker.md
> ├── T6-arandano-run-plan-slug-accepts-a-whole-plan.md
> ├── T7-arandano-status-command.md
> ├── T8-arandano-retry-arandano-cleanup-arandano-doctor.md
> ├── T9-arandano-memory-promote-and-arandano-issue-command.md
> ├── T10-python-stack-scaffold-worker-preflight.md                     ← you are here
> ├── T11-go-stack-scaffold-worker-preflight.md
> └── T12-end-to-end-batched-run-on-the-node-ts-toy.md
> ```

### Task 10: Python stack scaffold + worker preflight

**Goal:** `arandano init --stack=python` produces a Python project with full quality config. Worker has matching gate runners.

**Files:**

- Create: `packages/templates/stacks/python/` (mirror node-ts structure with python tools)
- Modify: `packages/templates/src/scaffold.ts` (no changes — it already loops generic file lists)
- Modify: `packages/cli/src/commands/init.ts` (allow `--stack=python`)
- Create: `arandano-worker/lib/src/gates/python/{format,lint,typecheck,test,coverage,security}.ts`
- Modify: `arandano-worker/lib/src/driver.ts` (detect stack and pick gate set)

- [x] **Step 1: Create the Python template files**

`packages/templates/stacks/python/AGENTS.md.tpl` — like Node-TS but with Python in the tech stack.

`pyproject.toml.tpl`:

```toml
[project]
name = "{{name}}"
version = "0.0.0"
requires-python = ">=3.12"

[tool.ruff]
line-length = 100

[tool.ruff.lint]
select = ["E", "F", "I", "N", "UP", "S", "B", "A"]

[tool.mypy]
strict = true
python_version = "3.12"

[tool.pytest.ini_options]
addopts = "--cov=src --cov-report=term-missing --cov-fail-under=80"
testpaths = ["tests"]
```

`.commitlintrc.cjs` — same as node-ts.

`.github/workflows/ci.yml`:

```yaml
name: CI
on: { push: { branches: [main] }, pull_request: {} }
permissions: { contents: read }
jobs:
  quality:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-python@v5
        with: { python-version: '3.12' }
      - run: pip install -e '.[dev]' ruff mypy pytest pytest-cov pip-audit
      - run: ruff format --check .
      - run: ruff check .
      - run: mypy src
      - run: pytest
      - run: pip-audit
      - uses: gitleaks/gitleaks-action@v2
        env: { GITHUB_TOKEN: '${{ secrets.GITHUB_TOKEN }}' }
```

`.arandano/config.yaml.tpl` — set `stack: python` and `roles.coder.cli: claude-code`.

`src/CONTEXT.md` — note: tests live in `tests/test_<module>.py`, run with `pytest`.

(Mirror the rest of the Node-TS files: roles, planning, docs, ops.)

- [x] **Step 2: Update `init.ts` to accept python**

Replace the Phase 1 guard:

```ts
if (!isSupportedStack(flags.stack)) throw new Error(`unsupported stack: ${flags.stack}`);
if (!['node-ts', 'python'].includes(flags.stack)) {
  throw new Error(`stack ${flags.stack} not supported until Phase 2`);
}
await scaffold({ stack: flags.stack as 'node-ts' | 'python' /* ... */ });
```

Also widen the type of `ScaffoldOpts['stack']` to `'node-ts' | 'python'`.

- [x] **Step 3: Implement Python gate runners**

`lib/src/gates/python/format.ts`:

```ts
import { runShell } from '../_shell.js';
export const formatGate = (cwd: string) =>
  runShell({ cmd: 'ruff', args: ['format', '--check', '.'], cwd });
```

Similarly: `lint` (`ruff check .`), `typecheck` (`mypy src`), `test` (`pytest`), `coverage` (`pytest --cov=src --cov-fail-under=80`), `security` (`pip-audit`).

- [x] **Step 4: Update worker `driver.ts` to read stack from `.arandano/config.yaml`**

```ts
import yaml from 'yaml';
import { readFile } from 'node:fs/promises';

const cfg = yaml.parse(await readFile(join(workspace, '.arandano', 'config.yaml'), 'utf8')) as {
  project: { stack: 'node-ts' | 'python' | 'go' };
};
const stack = cfg.project.stack;

const gateMap = {
  'node-ts': await import('./gates/index.js'),
  python: await import('./gates/python/index.js'),
  go: await import('./gates/go/index.js'),
};
const gates = gateMap[stack];
```

Then use `gates.formatGate`, etc., in the `runGates({ gates: { ... } })` call.

- [ ] **Step 5: Add a Python toy under `arandano-examples/python-cli-toy/` and run end-to-end** ⏸ **deferred — needs Docker**

```bash
cd ../arandano-examples
mkdir python-cli-toy && cd python-cli-toy
node ../../arandano/packages/cli/dist/bin.js init --stack=python --name=python-cli-toy --worker-image=ghcr.io/nmunozsi/arandano-worker:0.0.0
# add task MD; run; verify PR opens
```

- [x] **Step 6: Commit** (arandano: ee8fe3b, arandano-worker: d9a1d40)

---
