> **Location:** `docs/initial-build/plans/v1-rollout/phase-4-remote-docker-ci-templates/T3-setup-guide-local-laptop-driving-homelab-docker.md`
>
> **Folder structure:**
>
> ```
> phase-4-remote-docker-ci-templates/
> ├── phase.md
> ├── T1-parse-the-docker-host-url.md
> ├── T2-wire-parsedockerhost-into-the-dockerode-client-fac.md
> ├── T3-setup-guide-local-laptop-driving-homelab-docker.md             ← you are here
> ├── T4-github-actions-templates-per-stack.md
> ├── T5-forgejo-actions-templates.md
> ├── T6-gitlab-ci-templates.md
> ├── T7-arandano-init-forge-selection.md
> └── T8-end-to-end-smoke-against-the-real-homelab.md
> ```

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
