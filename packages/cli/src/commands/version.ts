import { Command } from '@oclif/core';
import { VERSION } from '@arandano/core';

export default class Version extends Command {
  static description = 'Display arandano version';

  async run(): Promise<void> {
    this.log(`arandano/${VERSION}`);
    return Promise.resolve();
  }
}
