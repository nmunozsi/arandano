export interface SkillMeta {
  name: string;
  description: string;
}

// Phase 1 fills this in with real skill definitions; Phase 0 just ships the registry shape.
export const BUNDLED_SKILLS: SkillMeta[] = [];
