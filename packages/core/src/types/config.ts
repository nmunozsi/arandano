import type { QualitySpec } from './quality.js';
import type { TddMode } from './task.js';

export type ExecutorBackend = 'docker' | 'k8s' | 'local';
export type Forge = 'github' | 'forgejo' | 'gitlab' | 'none';
export type Stack = 'node-ts' | 'python' | 'go' | 'polyglot';

export interface DockerExecutorConfig {
  host?: string;
  image: string;
  workdir: string;
  plugins_mount: string;
  env_pass: string[];
}

export interface ExecutorConfig {
  backend: ExecutorBackend;
  docker?: DockerExecutorConfig;
}

export interface GitConfig {
  forge: Forge;
  remote: string;
  branch_prefix: string;
  open_pr: boolean;
}

export interface RoleConfig {
  cli: string;
  model: string;
  tdd?: TddMode;
  enabled?: boolean;
}

export type ArchitectRoleConfig = RoleConfig & { enabled: boolean };

export interface McpConfig {
  enabled: boolean;
  transport: 'stdio' | 'sse';
  image?: string;
  url?: string;
}

export interface BatchingConfig {
  max_parallel: number;
  timeout_minutes: number;
  retry_policy: {
    max_attempts: number;
    on: Array<'container_error' | 'network_error' | 'provider_rate_limit'>;
  };
}

export interface ProjectMeta {
  name: string;
  default_branch: string;
  license?: string;
  stack?: Stack;
}

export interface ProjectConfig {
  project: ProjectMeta;
  executor: ExecutorConfig;
  git: GitConfig;
  roles: Record<string, RoleConfig>;
  mcp?: Record<string, McpConfig>;
  quality_defaults: QualitySpec;
  batching: BatchingConfig;
}
