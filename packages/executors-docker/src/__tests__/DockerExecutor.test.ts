import { describe, it, expect } from 'vitest';
import { DockerExecutor } from '../DockerExecutor.js';

describe('DockerExecutor', () => {
  it('should be defined', () => {
    expect(new DockerExecutor()).toBeDefined();
  });

  it('should throw "not implemented" on execute', async () => {
    const executor = new DockerExecutor();
    await expect(executor.execute()).rejects.toThrow('Method not implemented.');
  });
});
