# arandano

> Build software with coding agents. Reusable, MIT-licensed.

`arandano` is an open-source system that combines [superpowers](https://github.com/obra/superpowers), [sandcastle](https://github.com/mattpocock/sandcastle), and a markdown-as-database project structure to let you spec, plan, and dispatch software-engineering tasks to coding agents running in Docker containers on your homelab.

## Status

Pre-alpha. See [docs/architecture.md](docs/architecture.md) for the design and [docs/plans/](docs/plans/) for implementation plans.

## Prerequisites

- Docker
- [GitHub CLI (`gh`)](https://cli.github.com/) — authenticated (`gh auth login`)
- **Optional (recommended): [GitNexus](https://www.npmjs.com/package/gitnexus)** — enables in-container code-graph context for the architect role. Install with `npm install -g gitnexus@1.6.5` (version pinned in `packages/core/src/mcp/cacheHost.ts`). Without it, `arandano run` still works but the architect runs without graph context and `arandano doctor` will warn you.

Run `arandano doctor` from your project directory to verify all prerequisites are satisfied.

## License

MIT. See [LICENSE](LICENSE).
