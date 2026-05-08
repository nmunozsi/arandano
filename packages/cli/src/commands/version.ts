import { Command } from '@oclif/core';

export default class Version extends Command {
  static description = 'Display arandano version';

  async run(): Promise<void> {
    this.log('arandano/0.0.0');
    return Promise.resolve();
  }
}
