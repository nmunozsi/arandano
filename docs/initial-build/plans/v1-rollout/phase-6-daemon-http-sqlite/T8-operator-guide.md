> **Location:** `docs/initial-build/plans/v1-rollout/phase-6-daemon-http-sqlite/T8-operator-guide.md`
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
> ├── T8-operator-guide.md                                        ← you are here
> └── T9-end-to-end-with-a-real-daemon-on-the-homelab.md
> ```

### Task 8: Operator guide

**Goal:** `docs/daemon.md` covering install (systemd or compose), config, token management, and rolling restarts.

- [ ] **Step 1: Author `docs/daemon.md`**

````markdown
# Running arandano as a daemon on the homelab

## Install (systemd)

```bash
# 1. Create user + dirs
sudo useradd -r -s /usr/sbin/nologin arandano
sudo install -d -o arandano -g arandano /var/lib/arandano /etc/arandano

# 2. Drop the binary
curl -fsSL https://github.com/nmunozsi/arandano/releases/latest/download/arandano-daemon-linux-x64 -o /usr/local/bin/arandano-daemon
sudo chmod +x /usr/local/bin/arandano-daemon

# 3. Author /etc/arandano/daemon.yaml
listen: { host: 0.0.0.0, port: 8080 }
db_path: /var/lib/arandano/daemon.db
tokens:
  - <sha256 hex of your token>     # generate: echo -n "your-token" | sha256sum

# 4. Install and start the unit
sudo cp ./packages/daemon/deploy/systemd/arandano-daemon.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now arandano-daemon
```
````

## Verify

```bash
curl -fsS http://homelab:8080/healthz
```

## Use from a laptop

```bash
export ARANDANO_TOKEN=<your raw token>
arandano --remote http://homelab:8080 status
arandano --remote http://homelab:8080 run --plan=2026-05-08-feat-x
```

## Token rotation

Add a new sha256 hash under `tokens:`, restart, share the new raw token, then remove the old hash and restart again. No downtime.

## Backups

`/var/lib/arandano/daemon.db` is the only stateful artifact. `cp` it while the daemon is stopped, or use SQLite's `.backup` via cron.

````

- [ ] **Step 2: Commit**

```bash
git add docs/daemon.md
git commit -m "docs: daemon operator guide"
````

---
