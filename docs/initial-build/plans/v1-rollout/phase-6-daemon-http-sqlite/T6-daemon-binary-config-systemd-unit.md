> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T6-daemon-binary-config-systemd-unit.md`
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
> ├── T6-daemon-binary-config-systemd-unit.md                     ← you are here
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 6: Daemon binary + config + systemd unit

**Goal:** `arandano-daemon` binary reads `daemon-config.yaml` and starts the server. systemd unit and docker-compose deploy options ship in `deploy/`.

**Files:**

- Create: `packages/daemon/src/bin.ts`
- Create: `packages/daemon/src/config.ts`
- Create: `packages/daemon/deploy/systemd/arandano-daemon.service`
- Create: `packages/daemon/deploy/compose/docker-compose.yml`

- [ ] **Step 1: Implement `config.ts`**

```ts
import { readFile } from 'node:fs/promises';
import yaml from 'yaml';
import { z } from 'zod';

const Schema = z.object({
  listen: z.object({ host: z.string().default('0.0.0.0'), port: z.number().int().default(8080) }),
  db_path: z.string().default('/var/lib/arandano/daemon.db'),
  tokens: z.array(z.string()).min(1), // sha256 hex hashes
});

export type DaemonConfig = z.infer<typeof Schema>;

export async function loadDaemonConfig(path: string): Promise<DaemonConfig> {
  const text = await readFile(path, 'utf8');
  return Schema.parse(yaml.parse(text));
}
```

- [ ] **Step 2: Implement `bin.ts`**

```ts
#!/usr/bin/env node
import { loadDaemonConfig } from './config.js';
import { buildServer } from './server.js';

const cfgPath = process.env.ARANDANO_DAEMON_CONFIG ?? '/etc/arandano/daemon.yaml';
const cfg = await loadDaemonConfig(cfgPath);
const app = await buildServer({ tokenHashes: cfg.tokens, dbPath: cfg.db_path });
await app.listen({ host: cfg.listen.host, port: cfg.listen.port });
```

- [ ] **Step 3: Author `deploy/systemd/arandano-daemon.service`**

```ini
[Unit]
Description=arandano daemon
After=network.target docker.service
Wants=docker.service

[Service]
Type=simple
User=arandano
Environment=ARANDANO_DAEMON_CONFIG=/etc/arandano/daemon.yaml
ExecStart=/usr/local/bin/arandano-daemon
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
```

- [ ] **Step 4: Author `deploy/compose/docker-compose.yml`**

```yaml
services:
  daemon:
    image: ghcr.io/nmunozsi/arandano-daemon:latest
    restart: unless-stopped
    environment:
      ARANDANO_DAEMON_CONFIG: /etc/arandano/daemon.yaml
    volumes:
      - ./daemon.yaml:/etc/arandano/daemon.yaml:ro
      - arandano-data:/var/lib/arandano
      - /var/run/docker.sock:/var/run/docker.sock
    ports:
      - '8080:8080'
volumes:
  arandano-data:
```

- [ ] **Step 5: Build, smoke-test locally, commit**

```bash
npm run build
ARANDANO_DAEMON_CONFIG=./examples/daemon.yaml node ./packages/daemon/dist/bin.js &
curl -fsS http://localhost:8080/healthz
```

```bash
git add packages/daemon/
git commit -m "feat(daemon): bin + config + systemd unit + compose template"
```

---
