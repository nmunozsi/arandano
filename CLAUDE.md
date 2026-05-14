# arandano — Working Rules for Claude

## What this project is

**arandano** is a CLI tool (`arandano run <task-id>`) that dispatches software tasks to a Docker-based AI worker. The worker runs Claude Code inside a container, writes code using TDD, runs a full quality gate suite, and opens a GitHub PR. This monorepo holds the CLI + core orchestration; the worker image lives in a separate repo (`arandano-worker`).

**Repos:**

- `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano` — this monorepo (CLI, core, executor, templates, skills)
- `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-worker` — worker image source; push to `main` to rebuild `ghcr.io/nmunozsi/arandano-worker:latest` via GitHub Actions
- `C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano-examples` — example projects; `node-ts-toy` is a standalone git repo at `https://github.com/nmunozsi/node-ts-toy`

---

## Monorepo structure

```
packages/
  cli/               oclif 4 commands — entry point is packages/cli/dist/bin.js
  core/              orchestrator, DAG, state store, types
  executors-docker/  dockerode wrapper — DockerExecutor
  templates/         scaffold templates (.tpl files for anything with {{tokens}})
  skills/            superpowers skill definitions
```

Build: `npm run build` (root runs `npm run -ws build --if-present`).
Test: `npm test` (vitest, runs all packages).
The active branch is `feat/phase-2`; `main` is the push target (branch merges to main via PRs in practice, but direct push is used during active development).

---

## Worker image

**Never `docker push` manually** — the `release.yml` workflow in `nmunozsi/arandano-worker` builds and pushes `ghcr.io/nmunozsi/arandano-worker:latest` on every push to `main`. To ship a worker change:

1. Edit files in `arandano-worker/lib/src/`
2. `cd arandano-worker/lib && npm run build` (tsup, ESM, target node22)
3. Commit and push to `arandano-worker` main
4. Watch `gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 1`
5. Re-run the CLI test once the workflow completes

**Build command** (must include all three entry points):

```
tsup src/index.ts src/driver.ts src/start.ts --format esm --dts --target node22 --clean
```

---

## Key invariants — do not break these

### CLI exit codes

Use `process.exit(code)` — **not** `this.exit(code)`. oclif 4's `exit()` takes no arguments. Every command must call `process.exit` for non-zero exits.

### Template files

Any file under `packages/templates/stacks/` that contains `{{name}}`, `{{license}}`, `{{worker_image}}`, or `{{contact_email}}` **must** end in `.tpl`. The scaffold writer at `packages/templates/src/scaffold.ts` strips the suffix at write time. Files that are `.tpl`'d won't confuse root-level tooling (ESLint, TypeScript, etc.).

### State store writes

Always route state writes through `store.update((state) => { ... })` — never mutate after `store.read()`. The `StateStore.update` signature takes a callback, not a patch object.

### Type imports

`RunState` lives in `packages/core/src/types/state.ts`. Import from `'../types/state.js'`, **not** from `'../state/store.js'` — `store.ts` does not export it.

### Worker env vars

`containerSpec.ts` sets these on every container:
`ARANDANO_TASK_ID`, `ARANDANO_TASK_MD`, `ARANDANO_ROLE_MD`, `ARANDANO_CLI`, `ARANDANO_MODEL`, `ARANDANO_TDD`, `ARANDANO_RUN_FOLDER`, `ARANDANO_QUALITY_JSON`, `ARANDANO_CONTEXT_PATHS`, plus any in `task.envPass`.

### Worker user

The Dockerfile creates `worker` at UID **1001** (node image already owns 1000). `containerSpec.ts` must set `User: '1001:1001'`.

---

## Lessons learned from e2e debugging (Task 0, 2026-05-12/13)

These are real failures that cost hours. Don't repeat them.

### Worker startup

- **`import.meta.url` self-invocation guard doesn't fire with tsup code-splitting.** Use the dedicated `start.ts` entry point that calls `main()` and catches crashes — never rely on the guard in `driver.ts`.
- **The worker always enters on the agent branch from a prior failed run.** At startup, `driver.ts` reads `default_branch` from `config.yaml` and runs `git checkout <defaultBranch>` before doing anything else. Without this, `currentBranch()` returns the stale agent branch and the run fails immediately.

### Git in the container

- **The workspace is a bind-mount from Windows via Docker Desktop (WSL2).** The `.git` directory must be in the mounted path — never mount a subdirectory of a git repo and expect git to work. `node-ts-toy` must be its own standalone git repo, not a subfolder of `arandano-examples`.
- **`git` refuses bind-mounted directories without `safe.directory`.** `containerSpec.ts` injects `GIT_CONFIG_COUNT=1 / GIT_CONFIG_KEY_0=safe.directory / GIT_CONFIG_VALUE_0=<workdir>` into every container.
- **SSH is not installed in the worker image.** If the git remote is `git@github.com:...`, all pushes fail with `cannot run ssh`. The entrypoint runs `git config --global url."https://github.com/".insteadOf "git@github.com:"` to rewrite SSH remotes to HTTPS.
- **`gh auth setup-git` must run before any `git push`.** The entrypoint runs it when `GH_TOKEN` is set. This makes git use the `gh` credential helper for HTTPS authentication.
- **`git branch -D` fails on the currently checked-out branch.** `createBranch` handles this by checking out `baseBranch` first, then deleting, then recreating.

### Claude Code in the container

- **`claude --print` without `--dangerously-skip-permissions` silently skips all file writes.** The worker passes `--dangerously-skip-permissions` to every `invokeCli` call. Without it, Claude exits 0 but writes nothing.
- **The model must be passed explicitly.** `ARANDANO_MODEL` is set in the container but was not forwarded to `claude`. Always pass `--model <model>` in the `invokeCli` args.
- **Claude's output is buffered in `invokeCli` and not streamed.** A first 2000 chars of output are logged after the CLI exits so failures are visible in the container log stream.

### Quality gates

- **`npm install` must run before gates (and before Claude).** Without `node_modules`, `eslint`, `vitest`, and `prettier` fail even with `npx` because they import local packages (e.g., `typescript-eslint`). `driver.ts` runs a stack-aware install (`npm install` / `pip install -r requirements.txt` / `go mod download`) right after branch creation.
- **`npx prettier --check .` checks ALL files, not just changed ones.** Markdown task files with wrong formatting will fail the format gate. Run `npx prettier --write .` on task files before committing them to the example repo.
- **ESLint `projectService: true` rejects files outside `tsconfig.json`'s `include`.** Root-level config files (`eslint.config.js`, `vitest.config.ts`, `.commitlintrc.cjs`) are not in `src/**/*`. Add `allowDefaultProject: ['*.js','*.cjs','*.mjs','*.ts']` to `parserOptions`.

### Worker image distribution

- **Never use personal `GH_TOKEN` for `docker push` to GHCR.** The token scope for `gh auth` is often `read:packages` only. Instead, push code to `arandano-worker` main and let the `release.yml` GitHub Actions workflow push the image — it uses `GITHUB_TOKEN` which always has `write:packages`.

### TDD mode precedence

Task frontmatter `tdd:` overrides the role-level setting in `config.yaml`. The priority in `runOne.ts` is: `taskMd.frontmatter.tdd ?? role.tdd ?? 'strict'`. If a task has `tdd: strict` in its frontmatter, changing `config.yaml` alone won't help.

---

## Running the CLI locally

From `arandano-examples/node-ts-toy` (or any project with a `.arandano/config.yaml`):

```powershell
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run T1
node "C:\Users\nmuno\OneDrive\Documentos\Frutas\arandano\packages\cli\dist\bin.js" run --plan 2026-05-11-three-helpers
```

Required env vars: `ANTHROPIC_API_KEY`, `GH_TOKEN` (with `repo` scope for PR creation).

---

## node-ts-toy example project rules

The `node-ts-toy` repo at `https://github.com/nmunozsi/node-ts-toy` is the canonical test target. When modifying it:

- It must be its own standalone git repo (not a subdir of `arandano-examples`)
- All files must pass `npx prettier --check .` before committing — task markdown files included
- `package.json` must exist with vitest, prettier, and typescript-eslint as devDependencies
- Agent branches (`agent/*`) left by failed runs can be deleted; the worker recreates them automatically
- Task IDs must be unique across all plan folders — use T4/T5/T6 for three-helpers, not T1/T2/T3
