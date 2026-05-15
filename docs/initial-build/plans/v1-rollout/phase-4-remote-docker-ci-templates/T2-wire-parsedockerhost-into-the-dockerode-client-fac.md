> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T2-wire-parsedockerhost-into-the-dockerode-client-fac.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md          ← you are here
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

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
