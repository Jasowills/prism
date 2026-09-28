# Local development

## Prerequisites

- Node.js 20+, pnpm 9 (`corepack enable`), Git, GitHub CLI.
- Docker + Compose for the full stack (optional for tests; required for
  production-like runs). Without Docker, the API uses in-memory evidence and an
  inline queue automatically.

## Setup

```bash
cp .env.example .env   # fill FLW_* for live provider work; leave blank for local
pnpm install
pnpm build
pnpm typecheck && pnpm lint
pnpm test && pnpm test:integration && pnpm test:e2e && pnpm test:faults && pnpm test:provider
```

## Run (without Docker)

```bash
PRISM_FORCE_MEMORY=1 FLW_WEBHOOK_SECRET=test-secret pnpm --filter @prism/api dev
# in another shell:
pnpm --filter @prism/merchant-checkout dev
```

## Run (full stack)

```bash
docker compose up --build
docker compose exec api pnpm db:migrate  # or: DATABASE_URL=... pnpm db:migrate
```

## Useful endpoints

- `GET /health/live`, `/health/ready`, `/health/dependencies`, `/metrics`
- `GET /v1/openapi.json`
