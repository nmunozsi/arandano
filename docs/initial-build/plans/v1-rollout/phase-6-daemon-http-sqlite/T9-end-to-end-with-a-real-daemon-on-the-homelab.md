> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T9-end-to-end-with-a-real-daemon-on-the-homelab.md`
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
> ├── T7-remoteclient-and-cli-remote-flag.md
> ├── T8-operator-guide.md
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md          ← you are here
> ```

### Task 9: End-to-end with a real daemon on the homelab

- [ ] **Step 1: Build and ship the daemon**

```bash
npm run build
scp packages/daemon/dist/bin.js homelab:/tmp/arandano-daemon
ssh homelab 'sudo install /tmp/arandano-daemon /usr/local/bin/arandano-daemon'
```

(Or use the compose deploy.)

- [ ] **Step 2: Configure tokens and start**

Follow the operator guide.

- [ ] **Step 3: Drive a task from a laptop**

```bash
export ARANDANO_TOKEN=...
arandano --remote http://homelab:8080 run T1
```

Expected: same outcome as in-process — PR opens.

- [ ] **Step 4: Document in examples**

Append a daemon section to `arandano-examples/README.md` linking the PR opened via daemon.

---
