import { Command } from '@oclif/core';
import { StateStore } from '@arandano/core';
import { join } from 'node:path';

export default class Status extends Command {
  static override description = 'Show task status from .arandano/state.json';

  async run(): Promise<void> {
    const store = new StateStore(join(process.cwd(), '.arandano', 'state.json'));
    const state = await store.read();
    const ids = Object.keys(state.tasks).sort();
    if (ids.length === 0) {
      this.log('no tasks tracked yet');
      return;
    }
    this.log('TASK    STATUS        BRANCH                                    PR');
    for (const id of ids) {
      const t = state.tasks[id];
      this.log(
        `${id.padEnd(7)} ${(t?.status ?? '?').padEnd(13)} ${(t?.branch ?? '').padEnd(40)}  ${t?.pr_url ?? ''}`,
      );
    }
  }
}
