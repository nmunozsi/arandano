> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T7-remoteclient-and-cli-remote-flag.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md
> ├── T1-extract-staterepository-interface.md
> ├── T2-sqlite-state-store.md
> ├── T3-auth-middleware.md
> ├── T4-http-api-surface.md
> ├── T5-orchestratorpool-in-flight-run-tracking.md
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md                      ← you are here
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 7: `RemoteClient` and CLI `--remote` flag

**Goal:** When `--remote http://...` is set on any subcommand, the CLI HTTPs the daemon instead of running in-process.

**Files:**

- Create: `packages/cli/src/remote/RemoteClient.ts`
- Create: `packages/cli/src/remote/__tests__/RemoteClient.test.ts`
- Modify: `packages/cli/src/commands/{run,status,cancel}.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { RemoteClient } from '../RemoteClient.js';

describe('RemoteClient', () => {
  it('passes Authorization header on every call', async () => {
    let seen = '';
    const orig = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      seen = String((init as { headers?: Record<string, string> }).headers?.authorization ?? '');
      return new Response(JSON.stringify({ tasks: {} }), { status: 200 });
    };
    try {
      const c = new RemoteClient({ baseUrl: 'http://x', token: 'abc' });
      await c.state('/p');
      expect(seen).toBe('Bearer abc');
    } finally {
      globalThis.fetch = orig;
    }
  });
});
```

- [ ] **Step 2: Implement `RemoteClient.ts`**

```ts
export interface RemoteClientOpts {
  baseUrl: string;
  token: string;
}

export class RemoteClient {
  constructor(private readonly opts: RemoteClientOpts) {}

  private async req<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await fetch(`${this.opts.baseUrl}${path}`, {
      ...init,
      headers: {
        ...(init?.headers ?? {}),
        authorization: `Bearer ${this.opts.token}`,
        'content-type': 'application/json',
      },
    });
    if (!res.ok) throw new Error(`${path} failed: ${res.status}`);
    return (await res.json()) as T;
  }

  state(projectRoot: string) {
    return this.req<{ tasks: Record<string, { status: string }> }>(
      `/v1/state?projectRoot=${encodeURIComponent(projectRoot)}`,
    );
  }
  startRun(body: { projectRoot: string; planSlug?: string; taskId?: string }) {
    return this.req<{ runId: string }>('/v1/runs', { method: 'POST', body: JSON.stringify(body) });
  }
  pollRun(runId: string) {
    return this.req<{
      status: string;
      summary?: { completed: string[]; failed: string[]; skipped: string[] };
    }>(`/v1/runs/${runId}`);
  }
}
```

- [ ] **Step 3: Wire `--remote` into commands**

In `run.ts`:

```ts
static override flags = {
  plan: Flags.string({ description: '...' }),
  remote: Flags.string({ description: 'http://daemon:8080 — dispatch via daemon' }),
};

async run(): Promise<void> {
  const { args, flags } = await this.parse(Run);
  if (flags.remote) {
    const token = process.env.ARANDANO_TOKEN;
    if (!token) throw new Error('ARANDANO_TOKEN required when using --remote');
    const client = new RemoteClient({ baseUrl: flags.remote, token });
    const { runId } = await client.startRun({ projectRoot: process.cwd(), planSlug: flags.plan, taskId: args.taskId });
    this.log(`run started: ${runId}`);
    let status = await client.pollRun(runId);
    while (status.status === 'pending') {
      await new Promise((r) => setTimeout(r, 3000));
      status = await client.pollRun(runId);
    }
    this.log(JSON.stringify(status.summary, null, 2));
    return;
  }
  // existing in-process path
}
```

Same shape for `status.ts`.

- [ ] **Step 4: Run tests, commit**

```bash
npm test
git add packages/cli/
git commit -m "feat(cli): --remote routes commands through the daemon"
```

---
