import { Args, Command } from '@oclif/core';
import { runOne } from '@arandano/core';
import { DockerExecutor } from '@arandano/executors-docker';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import yaml from 'yaml';

export default class Run extends Command {
  static override description = 'Dispatch a task to a local Docker worker.';

  static override args = {
    taskId: Args.string({ required: true, description: 'task id (e.g. T1)' }),
  };

  async run(): Promise<void> {
    const { args } = await this.parse(Run);
    const projectRoot = process.cwd();
    const cfg = yaml.parse(
      await readFile(join(projectRoot, '.arandano', 'config.yaml'), 'utf8'),
    ) as { executor: { docker: { image: string } } };

    const executor = new DockerExecutor({ image: cfg.executor.docker.image, projectRoot });
    const result = await runOne({ projectRoot, taskId: args.taskId, executor });
    this.log(`exit=${result.exitCode} reason=${result.reason}`);
    if (result.exitCode !== 0) this.exit(result.exitCode);
  }
}
