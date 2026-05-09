import type { Stack } from '@arandano/core';

export const SUPPORTED_STACKS: readonly Stack[] = ['node-ts', 'python', 'go', 'polyglot'] as const;

export function isSupportedStack(s: string): s is Stack {
  return SUPPORTED_STACKS.includes(s as Stack);
}
