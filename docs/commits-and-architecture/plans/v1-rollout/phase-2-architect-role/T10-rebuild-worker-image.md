> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-2-architect-role/T10-rebuild-worker-image.md`

---

id: T10
title: Rebuild worker image with architect support and confirm GHCR push
role: coder
tdd: relaxed
depends_on: [T9]

---

# T10 — Rebuild worker image (architect-aware) and confirm GHCR push

**Why:** Same procedure as Phase 1's T4 — never `docker push` manually; let `release.yml` do it.

---

- [ ] **Step 1: Find the run triggered by T9's push**

```bash
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 3
```

Capture the most-recent run's `databaseId`.

- [ ] **Step 2: Watch the run to completion**

```bash
gh run watch <databaseId> --repo nmunozsi/arandano-worker --exit-status
```

Expected: exits 0.

- [ ] **Step 3: Pull and inspect the new image**

```bash
docker pull ghcr.io/nmunozsi/arandano-worker:latest

docker run --rm --entrypoint cat ghcr.io/nmunozsi/arandano-worker:latest \
  /opt/arandano/skills/architect/SKILL.md | head -20

docker run --rm --entrypoint cat ghcr.io/nmunozsi/arandano-worker:latest \
  /opt/arandano/skills/gitmoji-commits/SKILL.md | head -20

docker run --rm --entrypoint ls ghcr.io/nmunozsi/arandano-worker:latest \
  /app/dist 2>/dev/null
```

Expected: both SKILL.md files render real content; the `dist` listing includes `architectDriver.js` (path may differ — verify the exact location in your Dockerfile).

- [ ] **Step 4: No commit required**

Same as T4 — this task only validates the image. T11 begins the consumer-side migration.

## Acceptance

- The `release.yml` run completed successfully
- The new image contains both SKILL.md files at `/opt/arandano/skills/`
- The new image contains the compiled `architectDriver.js`
