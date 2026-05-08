export const SUPPORTED_STACKS = ['typescript', 'node', 'react', 'nextjs'] as const;
export type SupportedStack = (typeof SUPPORTED_STACKS)[number];
