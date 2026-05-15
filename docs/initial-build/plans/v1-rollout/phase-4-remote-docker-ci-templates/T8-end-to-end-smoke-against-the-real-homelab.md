> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T8-end-to-end-smoke-against-the-real-homelab.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md                   ← you are here
> ```

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
