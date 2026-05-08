export const SUPPORTED_STACKS = ['node-ts', 'python', 'go', 'polyglot'] as const;
export type Stack = (typeof SUPPORTED_STACKS)[number];

export function isSupportedStack(s: string): s is Stack {
  return SUPPORTED_STACKS.includes(s as Stack);
}
