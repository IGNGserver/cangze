# Contributing

Thanks for helping build Cangze!

## Requirements

- Node.js 24 and pnpm 10 (`corepack enable`)
- A Home Assistant instance for manual testing (tests use a built-in fake HA server)

## Workflow

```bash
pnpm install
pnpm dev          # server on :8080 (tsx watch) + web on :5173 (Vite, proxies /api)
pnpm verify       # version · boundaries · i18n · format · lint · typecheck · test · OpenAPI
```

- Every change goes through a pull request; CI must be green.
- Contracts first: change `packages/contracts`, run `pnpm openapi:write`, commit `docs/openapi.json`.
- Database changes are new files in `apps/server/src/db/migrations/` — never edit a released migration.
- UI strings go into both `apps/web/src/i18n/locales/zh-CN.json` and `en.json`.
- Commit messages follow Conventional Commits (`feat:`, `fix:`, `docs:` …) and explain _why_.

## Architecture rules

Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [AGENTS.md](AGENTS.md). In particular, every write to
Home Assistant must go through `HaGateway` with a principal; `pnpm verify:boundaries` enforces it.
