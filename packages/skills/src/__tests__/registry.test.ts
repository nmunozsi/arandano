import { describe, it, expect } from 'vitest';
import { SkillRegistry } from '../registry.js';

describe('SkillRegistry', () => {
  it('should register and get skills', () => {
    const registry = new SkillRegistry();
    registry.register('test', { id: 'test' });
    expect(registry.get('test')).toEqual({ id: 'test' });
  });
});
