export type TaskStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

export interface TaskState {
  status: TaskStatus;
  branch?: string;
  pr_url?: string;
  retry_count: number;
  error?: string;
  started_at?: string;
  finished_at?: string;
}

export interface RunState {
  tasks: Record<string, TaskState>;
}
