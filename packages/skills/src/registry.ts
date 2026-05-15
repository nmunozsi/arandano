export interface SkillMeta {
  name: string;
  description: string;
}

export const BUNDLED_SKILLS: SkillMeta[] = [
  {
    name: 'gitmoji-commits',
    description:
      'Use whenever creating a Git commit. Every commit subject must start with one of the 16 curated gitmoji shortcodes paired with a Conventional Commits type.',
  },
];
