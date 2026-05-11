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
    plan: Flags.string({ description: 'plan slug under .arandano/tasks/<slug>/' }),
  };

  async run(): Promise<void> {
    const { args, flags } = await this.parse(Run);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(
      await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'),
    ) as { executor: { docker: { image: string } } };
    const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });

    if (flags.plan) {
      const o = new Orchestrator({ projectRoot, planSlug: flags.plan, executor });
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
