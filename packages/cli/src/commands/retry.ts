import { Args, Command } from '@oclif/core';
import { StateStore } from '@arandano/core';
import { join } from 'node:path';

export default class Retry extends Command {
  static override description = 'Reset a failed task so the next run picks it up.';
  static override args = { taskId: Args.string({ required: true }) };

  async run(): Promise<void> {
    const { args } = await this.parse(Retry);
    const store = new StateStore(join(process.cwd(), '.arandano', 'state.json'));
    const state = await store.read();
    const cur = state.tasks[args.taskId];
    if (!cur) throw new Error(`unknown task: ${args.taskId}`);
    if (cur.status !== 'failed')
      throw new Error(`task ${args.taskId} is ${cur.status}, not failed`);
    await store.update((s) => {
      const t = s.tasks[args.taskId];
      if (t) {
        t.status = 'pending';
        t.retry_count = (t.retry_count ?? 0) + 1;
        delete t.error;
      }
    });
    this.log(`reset ${args.taskId}`);
  }
}
