import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config/load.js';

const validYaml = `
project:
  name: my-app
  default_branch: main
  stack: node-ts
executor:
  backend: docker
  docker:
    image: ghcr.io/nmunozsi/arandano-worker:0.0.0
    workdir: /workspace
    plugins_mount: baked-in
    env_pass: [GH_TOKEN]
git:
  forge: github
  remote: origin
  branch_prefix: agent/
  open_pr: true
roles:
  coder:
    cli: claude-code
    model: claude-sonnet-4-6
    tdd: strict
quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage: { min: 80, delta: nonneg }
  security: required
  commit_msg: conventional
  reviewer_required: true
batching:
  max_parallel: 3
  timeout_minutes: 45
  retry_policy:
    max_attempts: 2
    on: [container_error, network_error]
`;

describe('loadConfig', () => {
  it('parses a valid config', () => {
    const cfg = loadConfig(validYaml);
    expect(cfg.project.name).toBe('my-app');
    expect(cfg.executor.backend).toBe('docker');
    expect(cfg.executor.docker?.image).toContain('arandano-worker');
    expect(cfg.roles.coder?.tdd).toBe('strict');
    expect(cfg.quality_defaults.coverage.min).toBe(80);
  });

  it('throws on missing project.name', () => {
    const bad = validYaml.replace('name: my-app', '');
    expect(() => loadConfig(bad)).toThrow(/project\.name|name/);
  });

  it('throws on invalid executor.backend', () => {
    const bad = validYaml.replace('backend: docker', 'backend: nope');
    expect(() => loadConfig(bad)).toThrow(/backend/);
  });

  it('throws on invalid quality coverage delta', () => {
    const bad = validYaml.replace('delta: nonneg', 'delta: lol');
    expect(() => loadConfig(bad)).toThrow(/delta/);
  });
});
