> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T1-parse-the-docker-host-url.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md                                   ← you are here
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

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
