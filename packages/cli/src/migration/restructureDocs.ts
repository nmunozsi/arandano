import { readdir, readFile, writeFile, mkdir, rename, rm, stat } from 'node:fs/promises';
import { join, basename } from 'node:path';
import { parsePhasePlan } from './parsePhasePlan.js';
import { writeNewStructure } from './writeNewStructure.js';
import { locationHeader } from './locationHeader.js';

const PHASE_PLAN_RE = /^2026-05-\d{2}-phase-(\d+)-(.+)\.md$/;
const FOUNDATIONS_RE = /^2026-05-\d{2}-arandano-foundations\.md$/;
const PERF_PLAN_RE = /^2026-05-14-phase-3-performance\.md$/;
const PERF_DESIGN_REL = 'docs/superpowers/specs/2026-05-14-phase-3-performance-design.md';

export interface RestructureOpts {
  repoRoot: string;
}

export async function restructureMonorepoDocs(opts: RestructureOpts): Promise<void> {
  const { repoRoot } = opts;

  // 1. Move arandano-design.md → docs/initial-build/spec.md
  await moveSpec(
    repoRoot,
    'arandano-design.md',
    'docs/initial-build/spec.md',
    'Moved to docs/initial-build/spec.md (2026-05-14 restructure)',
  );

  // 2. Move the perf design (if present)
  try {
    await stat(join(repoRoot, PERF_DESIGN_REL));
    await moveSpec(repoRoot, PERF_DESIGN_REL, 'docs/perf-instrumentation/spec.md', null);
  } catch {
    /* no perf design */
  }

  // 3. Walk docs/plans/ and migrate each phase plan
  let planFiles: string[] = [];
  try {
    planFiles = await readdir(join(repoRoot, 'docs', 'plans'));
  } catch {
    /* docs/plans missing — nothing to migrate */
  }
  const phaseEntries: Array<{ number: number; slug: string; file: string }> = [];
  for (const f of planFiles) {
    if (FOUNDATIONS_RE.test(f)) {
      phaseEntries.push({ number: 0, slug: 'foundations', file: f });
      continue;
    }
    const m = PHASE_PLAN_RE.exec(f);
    if (m) phaseEntries.push({ number: Number(m[1]), slug: m[2]!, file: f });
  }
  phaseEntries.sort((a, b) => a.number - b.number);

  // 4. Split each phase plan that belongs to initial-build (exclude the perf plan)
  const initialBuildEntries = phaseEntries.filter((e) => !PERF_PLAN_RE.test(e.file));
  for (const entry of initialBuildEntries) {
    const text = await readFile(join(repoRoot, 'docs', 'plans', entry.file), 'utf8');
    const parsed = parsePhasePlan(text);
    const destRel = `docs/initial-build/plans/v1-rollout/phase-${entry.number}-${entry.slug}`;
    await writeNewStructure({ repoRoot, destRelPath: destRel, parsed, mode: 'phase' });
    await rm(join(repoRoot, 'docs', 'plans', entry.file));
  }

  // 5. Migrate the perf plan separately (peer spec)
  const perfPlanFile = planFiles.find((f) => PERF_PLAN_RE.test(f));
  if (perfPlanFile) {
    const text = await readFile(join(repoRoot, 'docs', 'plans', perfPlanFile), 'utf8');
    const parsed = parsePhasePlan(text);
    // Drop Task 0 (renumber) since this migration handles it.
    parsed.tasks = parsed.tasks.filter((t) => t.number !== 0);
    await writeNewStructure({
      repoRoot,
      destRelPath: 'docs/perf-instrumentation/plans/instrumentation',
      parsed,
      mode: 'plan',
    });
    await rm(join(repoRoot, 'docs', 'plans', perfPlanFile));
  }

  // 6. Write the v1-rollout plan.md (phase checklist)
  if (initialBuildEntries.length > 0) {
    await writeV1RolloutPlanMd(repoRoot, initialBuildEntries);
  }

  // 7. Remove empty docs/plans/ if everything was migrated
  try {
    const remaining = await readdir(join(repoRoot, 'docs', 'plans'));
    if (remaining.length === 0) await rm(join(repoRoot, 'docs', 'plans'), { recursive: true });
  } catch {
    /* already gone */
  }
}

async function moveSpec(
  repoRoot: string,
  fromRel: string,
  toRel: string,
  stubText: string | null,
): Promise<void> {
  const fromAbs = join(repoRoot, fromRel);
  const toAbs = join(repoRoot, toRel);
  try {
    await stat(fromAbs);
  } catch {
    return; // source missing
  }
  await mkdir(join(toAbs, '..'), { recursive: true });
  const original = await readFile(fromAbs, 'utf8');
  const specName = basename(toRel, '.md');
  const header = locationHeader({
    fullPath: toRel,
    siblings: [
      { name: specName + '.md', isCurrent: true, isDir: false },
      { name: 'plans/', isCurrent: false, isDir: true },
    ],
  });
  await writeFile(toAbs, header + original, 'utf8');
  if (stubText) {
    await writeFile(fromAbs, `# ${stubText}\n`, 'utf8');
  } else {
    await rm(fromAbs);
  }
}

async function writeV1RolloutPlanMd(
  repoRoot: string,
  phases: Array<{ number: number; slug: string }>,
): Promise<void> {
  const destRel = 'docs/initial-build/plans/v1-rollout/plan.md';
  const phaseFolders = phases.map((p) => `phase-${p.number}-${p.slug}`);
  const siblings = [
    { name: 'plan.md', isCurrent: true, isDir: false },
    ...phaseFolders.map((n) => ({ name: n, isCurrent: false, isDir: true })),
  ];
  const header = locationHeader({ fullPath: destRel, siblings });
  const body = [
    '# arandano v1 Rollout — Plan',
    '',
    'Sequential build of arandano v1, broken into 10 phases. Each phase is a self-contained body of work with its own tasks.',
    '',
    '## Phases',
    '',
    ...phases.map(
      (p) => `- [ ] [phase-${p.number} — ${p.slug}](phase-${p.number}-${p.slug}/phase.md)`,
    ),
    '',
  ].join('\n');
  await mkdir(join(repoRoot, 'docs', 'initial-build', 'plans', 'v1-rollout'), {
    recursive: true,
  });
  await writeFile(join(repoRoot, destRel), header + body, 'utf8');
}

export interface UserProjectMigrationOpts {
  projectRoot: string;
  specName: string;
}

export async function migrateUserProjectTasks(opts: UserProjectMigrationOpts): Promise<void> {
  const oldRoot = join(opts.projectRoot, '.arandano', 'tasks');
  let planDirs: string[] = [];
  try {
    planDirs = await readdir(oldRoot);
  } catch {
    return; // nothing to migrate
  }
  for (const slug of planDirs) {
    const newDir = join(opts.projectRoot, '.arandano', 'specs', opts.specName, 'plans', slug);
    await mkdir(newDir, { recursive: true });
    const files = await readdir(join(oldRoot, slug));
    for (const f of files) {
      await rename(join(oldRoot, slug, f), join(newDir, f));
    }
    await rm(join(oldRoot, slug), { recursive: true });
  }
  await rm(oldRoot, { recursive: true });
}
