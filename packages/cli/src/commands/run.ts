import { Args, Command, Flags } from '@oclif/core';
import { runOne, Orchestrator } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'yaml';

export default class Run extends Command {
  static override description = 'Run a single task or a whole plan.';

  static override args = {
    taskId: Args.string({ required: false, description: 'task id (omit when using --plan)' }),
  };

  static override flags = {
    plan: Flags.string({ description: 'plan slug under .arandano/specs/<spec>/plans/<slug>/' }),
    spec: Flags.string({ description: 'spec name (disambiguates ambiguous plan slugs)' }),
    phase: Flags.string({ description: 'phase slug to run a single phase of a multi-phase plan' }),
    'with-architect': Flags.boolean({
      description: 'force the architect task to run even when disabled in config or in a phase run',
    }),
    'no-architect': Flags.boolean({
      description: 'suppress the architect task even when enabled in config',
    }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);

    if (flags['with-architect'] && flags['no-architect']) {
      throw new Error('--with-architect and --no-architect are mutually exclusive');
    }

    const projectRoot = process.cwd();
    const cfg = yaml.parse(
      await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'),
    ) as { executor: { docker: { image: string } } };
    const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });

    if (flags.plan) {
      const o = new Orchestrator({
        projectRoot,
        planSlug: flags.plan,
        executor,
        ...(flags.spec !== undefined && { specName: flags.spec }),
        ...(flags.phase !== undefined && { phaseSlug: flags.phase }),
        withArchitect: flags['with-architect'] === true,
        noArchitect: flags['no-architect'] === true,
      });
      const summary = await o.run();
      this.log(
        `completed=${summary.completed.length} failed=${summary.failed.length} skipped=${summary.skipped.length}`,
      );
      if (summary.failed.length > 0) process.exit(1);
      return;
    }

    if (!args.taskId) throw new Error('provide a task id or --plan');
    const result = await runOne({ projectRoot, taskId: args.taskId, executor });
    this.log(`exit=${result.exitCode} reason=${result.reason}`);
    if (result.exitCode !== 0) process.exit(result.exitCode);
  }
}
