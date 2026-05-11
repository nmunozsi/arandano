import { Command, Flags } from '@oclif/core';
import { isSupportedStack, scaffold } from '@arandano/templates';

export default class Init extends Command {
  static override description = 'Scaffold an arandano project in the current directory.';

  static override flags = {
    stack: Flags.string({ required: true, description: 'node-ts | python | go | polyglot' }),
    name: Flags.string({
      required: true,
      description: 'project name (interpolated into scaffold)',
    }),
    target: Flags.string({ description: 'target directory (defaults to cwd)' }),
    'worker-image': Flags.string({ required: true, description: 'arandano worker image' }),
    license: Flags.string({ default: 'MIT' }),
    'contact-email': Flags.string({ default: 'you@example.com' }),
  };

  async run(): Promise<void> {
    const { flags } = await this.parse(Init);
    if (!isSupportedStack(flags.stack)) {
      throw new Error(`unsupported stack: ${flags.stack}`);
    }
    if (flags.stack !== 'node-ts') {
      throw new Error(`stack ${flags.stack} not supported until Phase 2`);
    }
    await scaffold({
      stack: 'node-ts',
      targetDir: flags.target ?? process.cwd(),
      name: flags.name,
      license: flags.license ?? 'MIT',
      workerImage: flags['worker-image'],
      contactEmail: flags['contact-email'] ?? 'you@example.com',
    });
    this.log(`Scaffolded ${flags.name} (${flags.stack})`);
  }
}
