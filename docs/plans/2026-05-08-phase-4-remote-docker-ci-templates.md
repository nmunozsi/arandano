# arandano Phase 4 — Remote Homelab Docker + CI Workflow Templates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the orchestrator dispatch tasks to a remote Docker daemon over SSH, so a developer's laptop can drive workers running on the homelab Ubuntu/Docker-Compose box. Ship CI workflow templates per forge (GitHub Actions, Forgejo Actions, GitLab CI) selectable at `arandano init` time. Add a setup guide that walks a brand-new user from "fresh laptop + fresh homelab" to a green PR.

**Architecture:** dockerode supports `Host` + ssh agent forwarding via `DOCKER_HOST=ssh://user@host`. We pass the URL through from `executor.docker.host` in config to the dockerode constructor. The CLI grows `arandano init --forge=<github|forgejo|gitlab>` which selects which CI workflow file to copy. A new `docs/setup-guide.md` documents the full path.

**Tech Stack:** Adds `ssh2` (transitively from dockerode) for the SSH transport. Adds workflow templates per forge.

**Reference spec:** `arandano-design.md` §13.1 (`executor.docker.host`), §15.4 (CI templates), §24 Phase 4.

**Scope deferrals:**

- K8s executor — Phase 5.
- Daemon mode — Phase 6.

---

## File Structure

```
arandano/
├── packages/executors-docker/src/
│   ├── client.ts                       extend: parse ssh:// url, configure dockerode
│   └── __tests__/client.test.ts        new: parse url helper
├── packages/templates/stacks/
│   ├── node-ts/.github/workflows/ci.yml          (existing)
│   ├── node-ts/.forgejo/workflows/ci.yml         new
│   ├── node-ts/.gitlab-ci.yml                    new
│   ├── python/{.github/workflows/ci.yml,.forgejo/workflows/ci.yml,.gitlab-ci.yml}
│   └── go/{.github/workflows/ci.yml,.forgejo/workflows/ci.yml,.gitlab-ci.yml}
├── packages/cli/src/commands/init.ts   extend: --forge flag selects workflow files
└── docs/
    └── setup-guide.md                   new
```

---

### Task 1: Parse the docker host URL (TDD)

**Goal:** A pure helper that converts `executor.docker.host` (a string like `ssh://nico@homelab.local`, `unix:///var/run/docker.sock`, or omitted) into the dockerode constructor options.

**Files:**

- Create: `packages/executors-docker/src/parseDockerHost.ts`
- Create: `packages/executors-docker/src/__tests__/parseDockerHost.test.ts`

- [ ] **Step 1: Write the failing tests**

`packages/executors-docker/src/__tests__/parseDockerHost.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseDockerHost } from '../parseDockerHost.js';

describe('parseDockerHost', () => {
  it('returns local-socket options when host is undefined', () => {
    const o = parseDockerHost(undefined);
    expect(o).toEqual({});
  });

  it('parses ssh://user@host', () => {
    const o = parseDockerHost('ssh://nico@homelab.local');
    expect(o.protocol).toBe('ssh');
    expect(o.host).toBe('homelab.local');
    expect(o.username).toBe('nico');
    expect(o.port).toBe(22);
  });

  it('parses ssh://user@host:port', () => {
    const o = parseDockerHost('ssh://nico@homelab.local:2222');
    expect(o.port).toBe(2222);
  });

  it('parses tcp://host:port', () => {
    const o = parseDockerHost('tcp://homelab.local:2375');
    expect(o.protocol).toBe('http');
    expect(o.host).toBe('homelab.local');
    expect(o.port).toBe(2375);
  });

  it('parses unix:///path', () => {
    const o = parseDockerHost('unix:///var/run/docker.sock');
    expect(o.socketPath).toBe('/var/run/docker.sock');
  });

  it('rejects unsupported schemes', () => {
    expect(() => parseDockerHost('https://x')).toThrow(/scheme/);
  });
});
```

- [ ] **Step 2: Run the tests**

```bash
npm test -- parseDockerHost
```

Expected: fail.

- [ ] **Step 3: Implement `parseDockerHost.ts`**

```ts
export interface DockerHostOptions {
  protocol?: 'ssh' | 'http' | 'https';
  host?: string;
  port?: number;
  username?: string;
  socketPath?: string;
}

export function parseDockerHost(raw: string | undefined): DockerHostOptions {
  if (!raw) return {};

  if (raw.startsWith('unix://')) {
    return { socketPath: raw.slice('unix://'.length) };
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`invalid DOCKER_HOST: ${raw}`);
  }

  if (url.protocol === 'ssh:') {
    return {
      protocol: 'ssh',
      host: url.hostname,
      port: url.port ? Number(url.port) : 22,
      username: url.username || undefined,
    };
  }

  if (url.protocol === 'tcp:') {
    return {
      protocol: 'http',
      host: url.hostname,
      port: url.port ? Number(url.port) : 2375,
    };
  }

  throw new Error(`unsupported docker host scheme: ${url.protocol}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm test -- parseDockerHost
```

- [ ] **Step 5: Commit**

```bash
git add packages/executors-docker/src/parseDockerHost.ts packages/executors-docker/src/__tests__/parseDockerHost.test.ts
git commit -m "feat(executors-docker): parseDockerHost helper for ssh/tcp/unix URLs"
```

---

### Task 2: Wire `parseDockerHost` into the dockerode client factory

**Goal:** `defaultClient(host?)` returns a dockerode client configured for the given host; SSH uses agent forwarding (`SSH_AUTH_SOCK`).

**Files:**

- Modify: `packages/executors-docker/src/client.ts`
- Modify: `packages/executors-docker/src/DockerExecutor.ts`
- Modify: `packages/executors-docker/src/__tests__/DockerExecutor.test.ts`

- [ ] **Step 1: Update `client.ts`**

```ts
import Docker from 'dockerode';
import { parseDockerHost } from './parseDockerHost.js';

export interface DockerClient {
  createContainer(opts: unknown): Promise<{
    id: string;
    start(): Promise<void>;
    wait(): Promise<{ StatusCode: number }>;
    stop(opts?: { t: number }): Promise<void>;
    remove(opts?: { force: boolean }): Promise<void>;
    logs(opts: {
      stdout: boolean;
      stderr: boolean;
      follow: boolean;
    }): Promise<NodeJS.ReadableStream>;
  }>;
}

export function defaultClient(host?: string): DockerClient {
  const opts = parseDockerHost(host);
  const d = new Docker(opts as never);
  return d as unknown as DockerClient;
}
```

- [ ] **Step 2: Update `DockerExecutor` to pass host through**

In `DockerExecutor.ts`:

```ts
export interface DockerExecutorOpts {
  image: string;
  projectRoot: string;
  host?: string;             // new
  client?: DockerClient;
  hostEnv?: Record<string, string | undefined>;
  now?: () => Date;
}

constructor(opts: DockerExecutorOpts) {
  this.opts = {
    client: opts.client ?? defaultClient(opts.host),
    hostEnv: process.env as never,
    now: () => new Date(),
    ...opts,
  };
}
```

- [ ] **Step 3: Update CLI `run.ts` to pass `executor.docker.host`**

```ts
const executor = new DockerExecutor({
  image: cfg.executor.docker.image,
  host: cfg.executor.docker.host,
  projectRoot,
});
```

- [ ] **Step 4: Add a test that the host is forwarded to dockerode**

In `DockerExecutor.test.ts`, add a test that constructs `new DockerExecutor({ image, projectRoot, host: 'ssh://nico@homelab' })` with a stubbed dockerode that captures its constructor args. (You'll need to use `vi.mock('dockerode', ...)` for this; place it at the top of the file.)

```ts
import { vi } from 'vitest';
const dockerCtor = vi.fn(function (this: unknown, _opts: unknown) {
  return {} as unknown;
});
vi.mock('dockerode', () => ({ default: dockerCtor }));
// ... later:
it('passes ssh host through to dockerode', async () => {
  const _ = new DockerExecutor({ image: 'x', projectRoot: '/r', host: 'ssh://nico@h' });
  expect(dockerCtor).toHaveBeenCalledWith(
    expect.objectContaining({ protocol: 'ssh', host: 'h', username: 'nico' }),
  );
});
```

- [ ] **Step 5: Run tests, commit**

```bash
npm test
git add packages/executors-docker/ packages/cli/
git commit -m "feat(executors-docker): support remote docker via DOCKER_HOST-style url"
```

---

### Task 3: Setup guide — local laptop driving homelab Docker

**Goal:** A `docs/setup-guide.md` walking the user from a fresh state to a green PR via remote docker. The guide is the spec for "what does the remote path actually need."

**Files:**

- Create: `docs/setup-guide.md`

- [ ] **Step 1: Write the guide**

`docs/setup-guide.md`:

````markdown
# arandano setup guide

## Prerequisites

- Linux/macOS/WSL laptop, Node 22, `gh`, `git`.
- A homelab box reachable over SSH with Docker installed and your user in the `docker` group.
- One LLM API key (e.g. `ANTHROPIC_API_KEY`).

## 1 — Install the CLI

```bash
npm install -g @arandano/cli
arandano --version
```
````

## 2 — Verify SSH + Docker on the homelab

From your laptop:

```bash
ssh nico@homelab.local 'docker info'
```

If that prints daemon info, you're good. If not, fix SSH first.

## 3 — Initialize a project

```bash
mkdir my-app && cd my-app
git init
arandano init --stack=node-ts --name=my-app \
  --worker-image=ghcr.io/nmunozsi/arandano-worker:latest
git add . && git commit -m "chore: arandano scaffold"
```

## 4 — Point arandano at your homelab

Edit `.arandano/config.yaml`:

```yaml
executor:
  backend: docker
  docker:
    host: ssh://nico@homelab.local
    image: ghcr.io/nmunozsi/arandano-worker:latest
    workdir: /workspace
    plugins_mount: baked-in
    env_pass:
      - GH_TOKEN
      - ANTHROPIC_API_KEY
```

## 5 — Make sure the homelab can pull the image

From your laptop:

```bash
ssh nico@homelab.local 'docker pull ghcr.io/nmunozsi/arandano-worker:latest'
```

## 6 — Doctor

```bash
arandano doctor
```

All four checks should pass.

## 7 — First task

Write `.arandano/tasks/$(date +%Y-%m-%d)-hello/T1-add-greet.md` (use the template from the project README). Then:

```bash
export GH_TOKEN="$(gh auth token)"
export ANTHROPIC_API_KEY=...
arandano run T1
```

Watch the logs. When it finishes, run `arandano status` — you should see one task `completed` with a PR URL.

## Troubleshooting

| Symptom                                              | Cause / fix                                                      |
| ---------------------------------------------------- | ---------------------------------------------------------------- |
| `dial unix /var/run/docker.sock: connection refused` | Docker host URL is empty; set `executor.docker.host`.            |
| `Permission denied (publickey)`                      | `ssh-add ~/.ssh/<key>` first; arandano uses agent forwarding.    |
| `pull access denied`                                 | Image is private. Make `arandano-worker` package public on ghcr. |
| Worker container exits 1 immediately                 | Check `journal.md` in `.arandano/runs/<run>/`.                   |

````

- [ ] **Step 2: Smoke-test the guide**

Open a fresh shell, follow it step-by-step on your real homelab. Whatever step trips you up, fix the doc.

- [ ] **Step 3: Commit**

```bash
git add docs/setup-guide.md
git commit -m "docs: setup guide for laptop + homelab over SSH"
````

---

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

### Task 7: `arandano init --forge=<...>` selection

**Goal:** The `init` command now accepts `--forge=github|forgejo|gitlab` and copies only the matching workflow files (omitting the others).

**Files:**

- Modify: `packages/templates/src/scaffold.ts`
- Modify: `packages/cli/src/commands/init.ts`
- Modify: tests

- [ ] **Step 1: Extend `ScaffoldOpts` with `forge`**

```ts
export interface ScaffoldOpts {
  stack: 'node-ts' | 'python' | 'go';
  forge: 'github' | 'forgejo' | 'gitlab' | 'none';
  // ... rest unchanged
}
```

- [ ] **Step 2: Skip workflow files for non-selected forges**

Inside `scaffold()`, before copying each file:

```ts
const FORGE_PATHS: Record<string, string[]> = {
  github: ['.github/workflows/'],
  forgejo: ['.forgejo/workflows/'],
  gitlab: ['.gitlab-ci.yml'],
};
function shouldSkipForForge(rel: string, selectedForge: string): boolean {
  for (const [forge, prefixes] of Object.entries(FORGE_PATHS)) {
    if (forge === selectedForge) continue;
    for (const p of prefixes) {
      if (rel.startsWith(p)) return true;
    }
  }
  return false;
}
```

In the file-copy loop, `if (shouldSkipForForge(rel, opts.forge)) continue;`.

- [ ] **Step 3: Tests**

In `scaffold.test.ts`, add:

```ts
it('omits forgejo and gitlab files when forge=github', async () => {
  await scaffold({ /* ... */ forge: 'github' });
  await expect(stat(join(dir, '.github', 'workflows', 'ci.yml'))).resolves.toBeDefined();
  await expect(stat(join(dir, '.forgejo'))).rejects.toThrow();
  await expect(stat(join(dir, '.gitlab-ci.yml'))).rejects.toThrow();
});

it('omits github and gitlab files when forge=forgejo', async () => {
  /* ... */
});
it('omits github and forgejo when forge=gitlab', async () => {
  /* ... */
});
```

- [ ] **Step 4: Update `init.ts`**

Add the flag:

```ts
'forge': Flags.string({ default: 'github', options: ['github', 'forgejo', 'gitlab', 'none'] }),
```

Forward it to `scaffold()`.

- [ ] **Step 5: Run tests, commit**

```bash
npm test
git add packages/templates/ packages/cli/
git commit -m "feat(cli): arandano init --forge selects per-forge CI workflow"
```

---

### Task 8: End-to-end smoke against the real homelab

**Goal:** Run a task on the `node-ts-toy` from your laptop, dispatched to the homelab Docker daemon over SSH. Verify a PR opens.

- [ ] **Step 1: Update `arandano-examples/node-ts-toy/.arandano/config.yaml`**

Set `executor.docker.host: ssh://<your-user>@<your-homelab-host>`.

- [ ] **Step 2: Verify SSH agent forwarding works**

```bash
ssh-add -L                       # confirms a key is loaded
ssh <homelab> 'docker version'   # confirms remote docker is reachable
```

- [ ] **Step 3: Run a task**

```bash
cd arandano-examples/node-ts-toy
node ../../arandano/packages/cli/dist/bin.js run T1
```

Expected: container starts on the homelab (verify via `ssh <homelab> 'docker ps'`); PR opens. The bind mount mounts the laptop's project root via SSHFS (or `rsync` fallback if SSHFS is not configured — see open question below).

- [ ] **Step 4: If the bind mount approach doesn't work over SSH, switch to `tar` upload**

The bind mount strategy from Phase 1 assumes the daemon and the bind path are co-located. Over SSH, they're not. Two options:

- **Option A (preferred):** Upload the project as a tarball into a named volume, run the container with the volume mounted. After the run, `tar` it back out. Requires worker to write back to the volume.
- **Option B:** Use `git push` to a temporary worktree on the homelab (not the user's `origin`), execute against that, then `git fetch` back the new branch.

Pick one. Code change is in `DockerExecutor.start()` — when `host` indicates SSH, route through the alternative volume strategy.

- [ ] **Step 5: Document the chosen approach in `docs/setup-guide.md`**

- [ ] **Step 6: Commit**

```bash
# in arandano
git add packages/executors-docker/ docs/
git commit -m "feat(executors-docker): SSH-friendly project transport via tar volume"
```

---

## Phase 4 done — exit criteria

- [ ] `executor.docker.host: ssh://...` dispatches workers to a remote homelab daemon
- [ ] `arandano init --forge=github|forgejo|gitlab` picks the right workflow files
- [ ] All three forge templates exercise the full gate suite
- [ ] `docs/setup-guide.md` walks a new user from zero to green PR over SSH
- [ ] At least one end-to-end run against the homelab is documented in the examples README

After this, the next plan covers **Phase 5 — Kubernetes executor (Helm chart for the homelab cluster)**.
