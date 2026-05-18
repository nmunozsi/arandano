import type { QualitySpec } from './quality.js';
import type { TddMode } from './task.js';

export interface TaskRun {
  taskId: string;
  taskMdPath: string;
  rolePath: string;
  contextPaths: string[];
  cli: string;
  model: string;
  tdd: TddMode;
  quality: QualitySpec;
  envPass: string[];
  envSet?: Record<string, string>;
  workdir: string;
  timeoutMs: number;
  mcpServers: string[];
}

export type ExitReason =
  | 'ok'
  | 'timeout'
  | 'rate_limit'
  | 'error'
  | 'tdd_violation'
  | 'quality_violation';

export interface ExitResult {
  exitCode: number;
  reason: ExitReason;
  resultJsonPath?: string;
  journalPath?: string;
}

export interface Handle {
  id: string;
}

export interface Executor {
  start(task: TaskRun): Promise<Handle>;
  wait(h: Handle, opts?: { timeoutMs: number }): Promise<ExitResult>;
  logs(h: Handle, opts?: { follow: boolean }): AsyncIterable<string>;
  cancel(h: Handle): Promise<void>;
}
