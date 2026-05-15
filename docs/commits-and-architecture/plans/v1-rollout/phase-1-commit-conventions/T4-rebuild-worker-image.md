> **Location:** `docs/commits-and-architecture/plans/v1-rollout/phase-1-commit-conventions/T4-rebuild-worker-image.md`

---

id: T4
title: Rebuild worker image and confirm GHCR push
role: coder
tdd: relaxed
depends_on: [T3]

---

# T4 — Rebuild worker image and confirm GHCR push

**Why:** Per `CLAUDE.md`'s lessons-learned section: never `docker push` manually. The push to `arandano-worker` `main` (T3 step 6) triggers `release.yml`, which builds and pushes `ghcr.io/nmunozsi/arandano-worker:latest`. This task watches that workflow to completion.

---

- [ ] **Step 1: Find the most recent release.yml run**

```bash
gh run list --workflow=release.yml --repo nmunozsi/arandano-worker --limit 3
```

Expected: top row is the run triggered by T3's push. Capture its `databaseId` (first column).

- [ ] **Step 2: Watch the run to completion**

```bash
gh run watch <databaseId> --repo nmunozsi/arandano-worker --exit-status
```

Expected: exits 0 when the build + push succeeds. If it fails, read the logs:

```bash
gh run view <databaseId> --repo nmunozsi/arandano-worker --log-failed
```

- [ ] **Step 3: Confirm the new image digest is in GHCR**

```bash
gh api -H 'Accept: application/vnd.oci.image.manifest.v1+json' \
  "/orgs/nmunozsi/packages/container/arandano-worker/versions" \
  --jq '.[0] | {id, name, created_at}'
```

(If the org-level path doesn't match — `nmunozsi` is a user, not an org — fall back to:)

```bash
gh api "/users/nmunozsi/packages/container/arandano-worker/versions" \
  --jq '.[0] | {name, created_at}'
```

Expected: a `created_at` within the last few minutes.

- [ ] **Step 4: Pull the new image locally**

```bash
docker pull ghcr.io/nmunozsi/arandano-worker:latest
```

Expected: pulls fresh layers (the skill and rule pack copies should show as `pulled` layers).

- [ ] **Step 5: Confirm the skill and rule pack are inside the image**

```bash
docker run --rm --entrypoint cat ghcr.io/nmunozsi/arandano-worker:latest \
  /opt/arandano/skills/gitmoji-commits/SKILL.md | head -20

docker run --rm --entrypoint cat ghcr.io/nmunozsi/arandano-worker:latest \
  /opt/arandano/commitlint-rules/index.cjs | head -10
```

Expected: both print real content (frontmatter for the skill, `'use strict'` + `require('./rules.cjs')` for the rule pack).

- [ ] **Step 6: No commit required**

This task only verifies the image. The next task (T5) does the first commit that will use the new convention.

## Acceptance

- `release.yml` run for the T3 push completed successfully
- `docker pull ghcr.io/nmunozsi/arandano-worker:latest` returns a fresh digest
- The SKILL.md and rule pack are visible at the expected paths inside the image
