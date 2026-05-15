import { Command, Flags } from '@oclif/core';
import { resolve } from 'node:path';
import {
  restructureMonorepoDocs,
  migrateUserProjectTasks,
} from '../../migration/restructureDocs.js';

export default class MigrateDocs extends Command {
  static override description =
    'Migrate docs/plans/ and .arandano/tasks/ to the new spec→plans→phases→tasks hierarchy.';

  static override flags = {
    project: Flags.string({
      description: 'project root (defaults to current dir)',
      default: process.cwd(),
    }),
    commit: Flags.boolean({
      description: 'actually perform the migration (without this, runs as a dry-run)',
      default: false,
    }),
    spec: Flags.string({
      description: 'spec name to use when migrating a user project (.arandano/tasks/)',
    }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(MigrateDocs);
    const root = resolve(flags.project);

    if (!flags.commit) {
      this.log(`dry-run mode — would migrate ${root}`);
      this.log('  - monorepo: docs/plans/*.md → docs/initial-build/plans/v1-rollout/phase-*/');
      this.log('  - user project: .arandano/tasks/*/T*.md → .arandano/specs/<spec>/plans/*/T*.md');
      this.log('Re-run with --commit to perform the migration.');
      return;
    }

    await restructureMonorepoDocs({ repoRoot: root });
    if (flags.spec) {
      await migrateUserProjectTasks({ projectRoot: root, specName: flags.spec });
    }
    this.log(`migration complete at ${root}`);
  }
}
