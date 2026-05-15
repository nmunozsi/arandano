> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T3-auth-middleware.md`
>
> **Folder structure:**
>
> ```
> phase-6-daemon-http-sqlite/
> ├── phase.md
> ├── T1-extract-staterepository-interface.md
> ├── T2-sqlite-state-store.md
> ├── T3-auth-middleware.md                                       ← you are here
> ├── T4-http-api-surface.md
> ├── T5-orchestratorpool-in-flight-run-tracking.md
> ├── T6-daemon-binary-config-systemd-unit.md
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 3: Auth middleware (TDD)

**Goal:** A Fastify plugin that requires `Authorization: Bearer <token>` matching one of the configured tokens (hashed at rest in the daemon config).

**Files:**

- Create: `packages/daemon/src/auth.ts`
- Create: `packages/daemon/src/__tests__/auth.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { createHash } from 'node:crypto';
import { bearerAuth } from '../auth.js';

describe('bearerAuth', () => {
  it('rejects requests with no token', async () => {
    const app = Fastify();
    await app.register(bearerAuth, {
      tokenHashes: [createHash('sha256').update('secret').digest('hex')],
    });
    app.get('/p', async () => 'ok');
    const r = await app.inject({ method: 'GET', url: '/p' });
    expect(r.statusCode).toBe(401);
  });
  it('accepts valid bearer', async () => {
    const app = Fastify();
    await app.register(bearerAuth, {
      tokenHashes: [createHash('sha256').update('secret').digest('hex')],
    });
    app.get('/p', async () => 'ok');
    const r = await app.inject({
      method: 'GET',
      url: '/p',
      headers: { authorization: 'Bearer secret' },
    });
    expect(r.statusCode).toBe(200);
  });
});
```

- [ ] **Step 2: Implement `auth.ts`**

```ts
import type { FastifyPluginAsync } from 'fastify';
import { createHash, timingSafeEqual } from 'node:crypto';

export interface BearerOpts {
  tokenHashes: string[];
}

export const bearerAuth: FastifyPluginAsync<BearerOpts> = async (app, opts) => {
  app.addHook('onRequest', async (req, reply) => {
    if (req.url === '/healthz') return;
    const h = req.headers.authorization ?? '';
    const m = /^Bearer (.+)$/.exec(h);
    if (!m) return reply.code(401).send({ error: 'missing bearer' });
    const presented = createHash('sha256').update(m[1]!).digest();
    const ok = opts.tokenHashes.some((expectedHex) => {
      const expected = Buffer.from(expectedHex, 'hex');
      return expected.length === presented.length && timingSafeEqual(expected, presented);
    });
    if (!ok) return reply.code(401).send({ error: 'invalid token' });
  });
};
```

- [ ] **Step 3: Run tests, commit**

```bash
npm test -- auth
git add packages/daemon/
git commit -m "feat(daemon): bearer-token auth middleware"
```

---
