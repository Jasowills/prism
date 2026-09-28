# Contributing

- Node 20+, pnpm 9. `pnpm install`, `pnpm build`, `pnpm typecheck`, `pnpm lint`.
- Run all suites before PRs: `pnpm test`, `test:integration`, `test:e2e`,
  `test:faults`, `test:provider`.
- Small verifiable increments; never weaken assertions for green builds.
- No secrets in code, history, logs, or fixtures. Test mode only.
- Controllers must use explicit `@Inject()` (vitest/esbuild drops decorator metadata).
- Money: decimal strings + `@prism/core` helpers only. Evidence tables: inserts
  only — no updates/deletes.
