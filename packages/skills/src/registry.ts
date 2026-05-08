export class SkillRegistry {
  private skills = new Map<string, unknown>();

  register(name: string, skill: unknown): void {
    this.skills.set(name, skill);
  }

  get(name: string): unknown {
    return this.skills.get(name);
  }
}
