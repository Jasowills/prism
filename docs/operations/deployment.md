# Deployment

## Docker Compose (recommended)

```bash
cp .env.example .env   # set secrets; never commit .env
docker compose up --build -d
docker compose ps
curl localhost:4100/health/ready
```

Services: `postgres` (16), `redis` (7), `api` (4100), `worker`.
Data volumes: `postgres-data`, `redis-data`.

## Configuration

All settings via environment (see `.env.example`). Required in production:
`DATABASE_URL`, `REDIS_URL`, `FLW_SECRET_KEY`, `FLW_WEBHOOK_SECRET`,
`PRISM_API_KEY`, `PRISM_ENCRYPTION_KEY`. Liveness never depends on the
provider; readiness requires the database.

## Migrations

```bash
DATABASE_URL=postgresql://... pnpm db:migrate
```

Migrations are additive SQL in `packages/database/migrations`. Verify from
empty and previous schema before release.

## Releases

CI builds + tests every PR; `integration` runs full suites on main with
Postgres/Redis services. Tag `v*` triggers SBOM + GitHub release. Provider
live tests run only via manual `provider-live` workflow with secrets.
