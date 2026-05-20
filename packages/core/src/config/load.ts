import yaml from 'yaml';
import { z } from 'zod';
import type { ProjectConfig } from '../types/config.js';

const GateMode = z.enum(['required', 'warn', 'skip']);

const QualitySpecSchema = z.object({
  format: GateMode,
  lint: GateMode,
  typecheck: GateMode,
  test: GateMode,
  coverage: z.object({
    min: z.number().int().min(0).max(100),
    delta: z.enum(['nonneg', 'any']),
  }),
  security: GateMode,
  commit_msg: z.enum(['conventional', 'freeform', 'skip']),
  reviewer_required: z.boolean(),
});

const RoleConfigSchema = z.object({
  cli: z.string().min(1),
  model: z.string().min(1),
  tdd: z.enum(['strict', 'relaxed']).optional(),
  enabled: z.boolean().optional(),
});

const DockerExecutorSchema = z.object({
  host: z.string().optional(),
  image: z.string().min(1),
  workdir: z.string().min(1),
  plugins_mount: z.string().min(1),
  env_pass: z.array(z.string()),
});

const ExecutorSchema = z.object({
  backend: z.enum(['docker', 'k8s', 'local']),
  docker: DockerExecutorSchema.optional(),
});

const GitSchema = z.object({
  forge: z.enum(['github', 'forgejo', 'gitlab', 'none']),
  remote: z.string().min(1),
  branch_prefix: z.string().min(1),
  open_pr: z.boolean(),
});

const McpSchema = z.object({
  enabled: z.boolean(),
  transport: z.enum(['stdio', 'sse']),
  image: z.string().optional(),
  url: z.string().optional(),
});

const BatchingSchema = z.object({
  max_parallel: z.number().int().positive(),
  timeout_minutes: z.number().int().positive(),
  retry_policy: z.object({
    max_attempts: z.number().int().min(0),
    on: z.array(z.enum(['container_error', 'network_error', 'provider_rate_limit'])),
  }),
});

const ProjectMetaSchema = z.object({
  name: z.string().min(1),
  default_branch: z.string().min(1),
  license: z.string().optional(),
  stack: z.enum(['node-ts', 'python', 'go', 'polyglot']).optional(),
});

const ProjectConfigSchema = z.object({
  project: ProjectMetaSchema,
  executor: ExecutorSchema,
  git: GitSchema,
  roles: z.record(RoleConfigSchema),
  mcp: z.record(McpSchema).optional(),
  quality_defaults: QualitySpecSchema,
  batching: BatchingSchema,
});

export function loadConfig(yamlText: string): ProjectConfig {
  const parsed = yaml.parse(yamlText) as unknown;
  const result = ProjectConfigSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '<root>'}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid arandano config: ${issues}`);
  }
  const cfg = result.data as ProjectConfig;
  if (cfg.roles['architect'] && cfg.roles['architect'].enabled === undefined) {
    cfg.roles['architect'] = { ...cfg.roles['architect'], enabled: true };
  }
  return cfg;
}
