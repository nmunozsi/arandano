project:
  name: {{name}}
  default_branch: main
  license: {{license}}
  stack: node-ts

executor:
  backend: docker
  docker:
    image: {{worker_image}}
    workdir: /workspace
    plugins_mount: baked-in
    env_pass:
      - GH_TOKEN
      - ANTHROPIC_API_KEY

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
  architect:
    cli: claude-code
    model: claude-sonnet-4-6
    enabled: true

quality_defaults:
  format: required
  lint: required
  typecheck: required
  test: required
  coverage: { min: 80, delta: any }
  security: warn
  commit_msg: conventional
  reviewer_required: false

batching:
  max_parallel: 1
  timeout_minutes: 45
  retry_policy:
    max_attempts: 1
    on: [container_error, network_error]
