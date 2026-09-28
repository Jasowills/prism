# PRISM: Full Project Execution Specification

**PRISM** stands for **Payment Reconciliation, Integrity & Settlement
Monitor**.

An independent payment evidence and reconciliation layer for payment
systems. PRISM compares provider webhooks, provider API observations,
merchant ledger observations, and expected payment intent to detect
missing notifications, duplicate events, inconsistent states, amount
mismatches, orphaned transactions, and reconciliation gaps.

**Initial provider:** Flutterwave\
**Language:** TypeScript\
**Backend:** NestJS\
**Database:** PostgreSQL\
**Queue:** Redis + BullMQ\
**Deployment:** Docker Compose\
**License:** MIT\
**Repository:** `Jasowills/prism` (check availability before creation)

The project is complete only when documented end-to-end workflows have
actually been executed and their evidence captured. Compilation and unit
tests alone are not sufficient.

------------------------------------------------------------------------

## 1. Product definition and guarantees

PRISM is not a payment processor, payment gateway replacement, webhook
forwarding service, or automatic refund/fulfillment engine. It is an
evidence collection service, reconciliation engine, and auditable
discrepancy detection system.

Within its own system boundary, PRISM must guarantee:

1.  Accepted evidence is durably recorded before acknowledgement.
2.  Duplicate webhook deliveries do not cause duplicate logical
    processing.
3.  Provider observations are never silently overwritten.
4.  Merchant intent is preserved separately from provider observations.
5.  Reconciliation outcomes are reproducible from stored evidence and
    versioned rules.
6.  Incomplete provider queries are never reported as complete
    reconciliation.
7.  Discrepancies remain inspectable after resolution.
8.  PRISM does not initiate refunds or fulfillment without an explicit
    merchant-side decision.

These guarantees do not imply that PRISM can guarantee provider
availability or the correctness of a provider's underlying financial
records.

### Evidence streams

Treat these as separate evidence sources, not three independently
authoritative truths:

-   **Provider webhook:** what the provider notified the integration
    about.
-   **Provider API observation:** what the provider reported when
    queried.
-   **Merchant ledger observation:** what the merchant recorded or acted
    upon.
-   **Expected payment intent:** what should have happened, including
    expected amount, currency, reference, and business context.

Agreement among sources does not alone prove that a payment matches the
merchant's intended order.

Expose separate dimensions:

-   `payment_status`
-   `verification_status`
-   `delivery_status`
-   `ledger_status`
-   `evidence_completeness`

A transaction can be financially verified while webhook delivery remains
missing.

------------------------------------------------------------------------

## 2. Research before implementation

OpenCode must research current official Flutterwave documentation before
implementing the provider adapter. Do not invent provider behavior or
assume documentation versions are interchangeable.

Research and document:

-   API version and authentication.
-   Webhook event payloads and event types.
-   Webhook signature verification and required raw-body handling.
-   Webhook acknowledgement and retry behavior.
-   Transaction verification endpoint and identifiers.
-   Transaction listing, date filters, pagination, and ordering.
-   Transaction statuses and lifecycle transitions.
-   Refunds, reversals, and chargebacks.
-   Settlement records and APIs.
-   Rate limits, errors, and retry guidance.
-   Test-mode checkout and supported test payment methods.

Flutterwave documentation has described differing webhook signature
mechanisms in different API documentation versions. Determine which
mechanism applies to the account configuration being used. Never accept
unsigned webhooks merely to simplify local testing.

Research relevant products such as Svix, Hookdeck, Stripe webhook
tooling, open-source webhook inspection tools, and reconciliation
products. Distinguish delivery, observability, transaction verification,
and financial reconciliation. Do not claim competitors lack features
without documentation.

Create:

``` text
docs/research/
  flutterwave-api-contract.md
  webhook-security.md
  transaction-verification.md
  transaction-discovery.md
  settlement-api.md
  rate-limits-and-retries.md
  competitor-analysis.md
  research-decisions.md
```

Create architecture decision records:

``` text
docs/decisions/
  0001-modular-monolith.md
  0002-postgresql-evidence-store.md
  0003-provider-adapter-contract.md
  0004-webhook-acknowledgement.md
  0005-reconciliation-state-machine.md
  0006-test-environment-isolation.md
```

Each ADR must contain context, decision, alternatives, consequences,
risks, and conditions for revisiting the decision. Record uncertainties
and define tests to resolve them.

------------------------------------------------------------------------

## 3. Stack and repository structure

Use a modular monolith with separate API and worker processes. Avoid
Kafka, Kubernetes, and microservice separation in v1 unless research
demonstrates a concrete need.

  -----------------------------------------------------------------------
  Area                                Choice
  ----------------------------------- -----------------------------------
  Runtime                             Node.js LTS, TypeScript strict mode

  Backend                             NestJS

  Database                            PostgreSQL

  Data access                         Drizzle ORM; explicit SQL for
                                      immutable evidence writes

  Queue                               Redis + BullMQ

  Validation                          Zod at external boundaries

  API                                 REST + OpenAPI

  CLI                                 Commander

  Tests                               Vitest, Supertest, Docker-based
                                      integration and E2E

  Logs                                Pino structured JSON

  Metrics                             Prometheus-compatible endpoint

  Deployment                          Docker Compose

  CI                                  GitHub Actions

  Package manager                     pnpm
  -----------------------------------------------------------------------

Use decimal-safe monetary values. Do not use JavaScript floating-point
arithmetic for financial comparisons.

Suggested monorepo:

``` text
prism/
  apps/
    api/
    worker/
    cli/
  packages/
    core/
    database/
    provider-flutterwave/
    sdk/
    contracts/
    testing/
    config/
  examples/
    merchant-checkout/
  test/
    integration/
    e2e/
    provider/
    fault-injection/
    load/
  docs/
    architecture/
    decisions/
    guides/
    operations/
    security/
    testing/
    research/
  infra/
    docker/
    scripts/
  .github/
    workflows/
    ISSUE_TEMPLATE/
    pull_request_template.md
  docker-compose.yml
  docker-compose.test.yml
  pnpm-workspace.yaml
  package.json
  README.md
  CONTRIBUTING.md
  SECURITY.md
  LICENSE
  CHANGELOG.md
  .env.example
```

Adjust package boundaries when justified, but keep the core
reconciliation domain independent of Flutterwave-specific response
types.

------------------------------------------------------------------------

## 4. Environment inspection and secrets

Before changing files, inspect:

``` bash
pwd
git --version
gh --version
gh auth status
node --version
corepack --version
pnpm --version
docker --version
docker compose version
```

Check whether the directory or remote repository already exists, whether
required ports are occupied, whether Docker is available, and whether
Flutterwave credentials are configured. Never print secrets.

Example `.env.example`:

``` dotenv
NODE_ENV=development
DATABASE_URL=postgresql://prism:prism@localhost:5433/prism
REDIS_URL=redis://localhost:6380
PRISM_API_PORT=4100
PRISM_WEBHOOK_PORT=4101
FLW_SECRET_KEY=
FLW_WEBHOOK_SECRET=
FLW_API_VERSION=
PRISM_ENCRYPTION_KEY=
PRISM_API_KEY=
PRISM_TEST_MODE=true
PRISM_ALLOW_TEST_WEBHOOKS=true
LOG_LEVEL=debug
```

Use placeholders only in `.env.example`. Keep real credentials in an
untracked `.env` file or secrets manager. If credentials are
unavailable, continue local development but mark provider E2E as
blocked, not passed.

------------------------------------------------------------------------

## 5. GitHub repository creation with GitHub CLI

Check whether the repository exists before creating it:

``` bash
gh repo view Jasowills/prism
```

If it does not exist:

``` bash
mkdir prism
cd prism
git init
git branch -M main
```

Create a minimal README, MIT license, and `.gitignore`, then publish:

``` bash
gh repo create Jasowills/prism \
  --public \
  --source=. \
  --remote=origin \
  --description="Independent payment reconciliation and verification infrastructure" \
  --license=MIT \
  --push
```

If the remote already exists, inspect it. Do not overwrite or delete it.

Configure issues, branch protection, pull-request checks, Dependabot
alerts, secret scanning where available, a security policy, repository
topics, and minimum GitHub Actions permissions.

Suggested topics:

``` text
payments reconciliation flutterwave fintech typescript nestjs
postgresql webhooks observability distributed-systems
```

Create milestone `v0.1.0 — Flutterwave Reconciliation MVP` and issues
for research, domain model, evidence store, webhook adapter,
verification adapter, intent registration, reconciliation, discrepancy
lifecycle, example merchant, fault injection, provider E2E, and release
documentation.

------------------------------------------------------------------------

## 6. Domain model and database

Do not collapse all evidence into one mutable `transactions.status`
column.

### `payment_intents`

``` text
id                  UUID PRIMARY KEY
tenant_id           UUID NOT NULL
provider            TEXT NOT NULL
merchant_reference  TEXT NOT NULL
expected_amount     NUMERIC(20, 6) NOT NULL
currency            CHAR(3) NOT NULL
expected_customer   JSONB
expected_metadata   JSONB
created_at          TIMESTAMPTZ NOT NULL
expires_at          TIMESTAMPTZ
```

Unique `(tenant_id, provider, merchant_reference)`. Amount must be
positive. Currency must be valid. Intent changes require explicit
amendments with actor, reason, timestamp, and previous/new values.

### `provider_webhook_events`

Store each accepted delivery, including duplicates:

``` text
id                   UUID PRIMARY KEY
tenant_id            UUID NOT NULL
provider             TEXT NOT NULL
provider_event_id    TEXT
event_type           TEXT NOT NULL
provider_reference   TEXT
provider_tx_id       TEXT
received_at          TIMESTAMPTZ NOT NULL
provider_event_at    TIMESTAMPTZ
signature_valid      BOOLEAN NOT NULL
payload_hash         TEXT NOT NULL
payload_redacted     JSONB NOT NULL
delivery_fingerprint TEXT NOT NULL
duplicate_of         UUID
```

Do not use a uniqueness constraint that erases duplicate delivery
evidence. Retain raw payloads only when configured, encrypted where
appropriate, minimized, and governed by retention policy.

### `provider_api_observations`

Record successful and failed API attempts:

``` text
id                   UUID PRIMARY KEY
tenant_id            UUID NOT NULL
provider             TEXT NOT NULL
query_type           TEXT NOT NULL
query_reference      TEXT
provider_tx_id       TEXT
request_started_at   TIMESTAMPTZ NOT NULL
response_received_at TIMESTAMPTZ
http_status          INTEGER
provider_status      TEXT
amount               NUMERIC(20, 6)
currency             CHAR(3)
response_hash        TEXT
response_redacted    JSONB
outcome              TEXT NOT NULL
error_code           TEXT
```

Timeouts, rate limits, authentication failures, not-found responses,
malformed responses, and successes are all observations. An API failure
is not proof that a transaction does not exist.

### `merchant_ledger_observations`

Append-only snapshots of merchant-reported state:

``` text
id                  UUID PRIMARY KEY
tenant_id           UUID NOT NULL
payment_intent_id   UUID
merchant_reference  TEXT NOT NULL
recorded_status     TEXT NOT NULL
recorded_amount     NUMERIC(20, 6)
currency            CHAR(3)
fulfillment_status  TEXT
source              TEXT NOT NULL
observed_at         TIMESTAMPTZ NOT NULL
```

### `reconciliation_runs`

Track run type, provider, time window, status, start/completion
timestamps, pages and records scanned, cursor, and error summary. A run
is complete only after every required page and record is processed
successfully.

### `discrepancies`

Store tenant, intent/reference, type, severity, status, first/last
detection, resolution timestamp/reason, evidence references, and rule
version. Resolution appends an event; it does not delete or rewrite the
original finding.

### Evidence integrity

Restrict database permissions against evidence updates/deletes. Use
database triggers or separate roles as appropriate. Hash normalized
evidence records; consider a per-tenant hash chain. Document that hashes
are tamper-evident, not tamper-proof against an administrator
controlling the database and hashes.

------------------------------------------------------------------------

## 7. State model and reconciliation

Keep payment state, verification state, and delivery state separate.

Conceptual payment lifecycle:

``` text
CREATED -> PENDING -> SUCCESSFUL
                   -> FAILED
                   -> CANCELLED

SUCCESSFUL -> REVERSED
           -> PARTIALLY_REFUNDED
           -> REFUNDED
```

Map actual provider statuses carefully. A successful payment later
reversed is a lifecycle event, not necessarily an invalid status
regression. Preserve the original success and subsequent reversal/refund
evidence.

Verification states:

``` text
UNVERIFIED
VERIFYING
VERIFIED
DISCREPANCY
INSUFFICIENT_EVIDENCE
RECONCILIATION_INCOMPLETE
```

### Reconciliation algorithm

For a reference:

1.  Load expected intent.
2.  Load webhook evidence.
3.  Load provider API observations.
4.  Load merchant ledger observations.
5.  Select valid provider observations using documented ordering
    semantics.
6.  Compare provider amount/currency/reference with expected intent.
7.  Compare provider state with merchant ledger.
8.  Evaluate webhook delivery against a configurable grace period.
9.  Inspect duplicate deliveries and lifecycle events.
10. Check whether discovery/pagination is complete.
11. Persist typed findings with evidence references and rule version.
12. Return a verification result that distinguishes facts from
    uncertainty.

Never use "latest HTTP response wins." Requests can return out of order.
Preserve all observations and use provider timestamps and documented
ordering semantics. If ordering cannot be established, report
uncertainty.

### Missing webhook detection

A missing webhook requires a configured expectation/grace window;
absence alone is not sufficient.

Example: payment created at 10:00, grace period 15 minutes, provider API
verifies success at 10:20, no webhook received. Create a
`missing_webhook` finding. A later webhook can resolve the delivery
discrepancy while preserving detection and resolution history.

### Discovery reconciliation

Use provider transaction listing over fixed UTC windows:

1.  Create a run with a fixed window.
2.  Fetch a page and persist the response.
3.  Process transactions idempotently.
4.  Continue through all pages.
5.  Mark complete only after every page succeeds.
6.  Compare provider transactions with local intents.
7.  Flag unmatched records.

If a page fails, mark the run incomplete. Never report complete
reconciliation for a partially fetched interval.

------------------------------------------------------------------------

## 8. Discrepancy taxonomy

At minimum:

-   `missing_webhook`
-   `duplicate_webhook`
-   `delayed_webhook`
-   `amount_mismatch`
-   `currency_mismatch`
-   `provider_local_status_mismatch`
-   `orphaned_provider_transaction`
-   `orphaned_local_transaction`
-   `unresolved_provider_state`
-   `reconciliation_incomplete`
-   `duplicate_fulfillment_risk`
-   `unexpected_reversal`

Findings must include evidence references, detection time, rule version,
and resolution history.

------------------------------------------------------------------------

## 9. REST API and CLI

Base path: `/v1`.

Required endpoints:

``` text
POST /v1/payment-intents
POST /v1/payment-intents/{id}/ledger-observations
POST /v1/webhooks/flutterwave
GET  /v1/transactions/{reference}/verification
POST /v1/reconciliation-runs
GET  /v1/reconciliation-runs/{id}
GET  /v1/discrepancies
POST /v1/discrepancies/{id}/resolutions
GET  /health/live
GET  /health/ready
GET  /health/dependencies
GET  /metrics
```

Use decimal strings for money at API boundaries. Validate external input
and generate accurate OpenAPI documentation.

Webhook handling must read raw body where required, verify signature,
validate payload, durably persist evidence, enqueue processing, and only
then return HTTP 200. Do not falsely acknowledge when durable
persistence fails.

CLI capabilities:

-   Register an expected intent.
-   Verify a transaction.
-   Run reconciliation.
-   Inspect evidence and discrepancies.
-   Verify evidence integrity.

Document only commands that actually exist.

------------------------------------------------------------------------

## 10. Flutterwave adapter and real test-mode workflow

Provider adapter responsibilities:

``` typescript
interface PaymentProviderAdapter {
  verifyTransaction(reference: string): Promise<ProviderObservation>;
  listTransactions(query: TransactionListQuery): Promise<PaginatedProviderTransactions>;
  verifyWebhook(
    rawBody: Buffer,
    headers: Record<string, string>
  ): Promise<WebhookVerificationResult>;
  normalizeTransaction(response: unknown): NormalizedProviderTransaction;
}
```

Preserve provider transaction IDs and references. Record failed API
attempts. Implement pagination, rate-limit handling, bounded retries,
and backoff.

### Real provider E2E

Use your Flutterwave test account and current documented test payment
procedure. Do not invent test card details or claim success without
observing provider responses.

The test must:

1.  Start API, worker, PostgreSQL, Redis, and example merchant.
2.  Register a payment intent.
3.  Initiate a Flutterwave test-mode transaction.
4.  Complete payment using documented test procedure.
5.  Capture provider transaction ID and reference.
6.  Verify directly through Flutterwave API.
7.  Deliver webhook through a configured public development tunnel or
    supported provider test mechanism.
8.  Validate signature.
9.  Confirm durable webhook storage.
10. Confirm worker processing.
11. Confirm merchant ledger update is idempotent.
12. Run reconciliation.
13. Retrieve evidence report.
14. Assert final states.

Record timestamp, environment, transaction reference/ID, verification
result, webhook receipt time, reconciliation result, sanitized logs, and
pass/fail. Never commit secrets, card data, or unnecessary personal
information.

------------------------------------------------------------------------

## 11. Example merchant application

Build `examples/merchant-checkout` as a functioning application, not a
mock-only demo. Include:

-   Customer checkout page.
-   Order creation and database.
-   Payment initialization and Flutterwave checkout/redirect.
-   Payment return handling.
-   Webhook endpoint.
-   PRISM SDK integration.
-   Fulfillment simulation.
-   Order status page.
-   Reconciliation inspection.

Demonstrate the critical scenario: payment commits, acknowledgement is
lost, provider retries, and the order is fulfilled exactly once while
every delivery attempt remains inspectable.

------------------------------------------------------------------------

## 12. End-to-end and fault-injection testing

Unit tests are necessary but insufficient. Test actual HTTP requests,
PostgreSQL transactions, Redis queues, workers, Docker Compose, and
Flutterwave test API.

Test layers:

-   Unit: domain rules and transitions.
-   Integration: database, queue, provider adapter.
-   API E2E: HTTP and authentication.
-   Docker E2E: full application stack.
-   Provider E2E: real Flutterwave test-mode transaction.
-   Fault injection: retries, delays, outages, restarts.
-   Load: throughput, latency, resource behavior.
-   Security: signature validation, tenant isolation, secret handling.

### Mandatory scenarios

1.  Successful payment: provider success, webhook, matching ledger,
    verified result.
2.  Missing webhook: API discovery finds payment and flags delivery
    absence.
3.  Duplicate webhook: all deliveries recorded, one logical processing
    result.
4.  Delayed webhook: finding resolves without history deletion.
5.  Invalid signature: reject; no state change.
6.  Provider timeout: failed observation recorded; state unresolved.
7.  Rate limit: bounded backoff; no retry storm.
8.  Amount mismatch: expected and observed amounts shown.
9.  Currency mismatch: discrepancy; no fulfillment.
10. Orphan provider transaction: discovered without local intent.
11. Orphan local transaction: local intent without provider evidence.
12. Worker crash: job recovers without duplicate financial processing.
13. Database unavailable: no false durable-acceptance acknowledgement.
14. Out-of-order observations: older evidence does not incorrectly
    overwrite newer state.
15. Reversal/refund: lifecycle preserved and finding generated.
16. Pagination failure: run incomplete, never falsely complete.
17. Tenant isolation: no cross-tenant access.
18. Evidence integrity: modification/deletion rejected or detected.
19. Idempotent merchant processing: retry after commit does not fulfill
    twice.
20. Real Flutterwave test-mode checkout and reconciliation.

### Fault injection harness

Support:

-   Dropped, duplicated, delayed, and reordered webhooks.
-   Provider API timeouts, 429s, malformed responses.
-   Worker interruption.
-   Redis restart.
-   PostgreSQL restart/outage.
-   Network disconnection.
-   Queue retry exhaustion.

Use deterministic scenario configuration and fixed seeds. Do not
substitute fault simulation for provider E2E; both are required.

Example scenario:

``` json
{
  "scenario": "payment-committed-ack-lost",
  "webhook": {
    "dropFirst": 1,
    "duplicateNext": 2
  },
  "providerApi": {
    "timeoutFirst": 1
  },
  "worker": {
    "restartAfterCommit": true
  }
}
```

------------------------------------------------------------------------

## 13. Reliability, security, and operations

Implement:

-   Idempotent webhook ingestion and jobs.
-   Bounded retries with exponential backoff and jitter.
-   Dead-letter handling.
-   Transactional outbox where needed.
-   Graceful worker shutdown.
-   Queue health monitoring.
-   Safe database migrations.
-   Correlation IDs and structured error codes.
-   Configurable retention.
-   Health/readiness endpoints.
-   Tenant isolation.
-   Encrypted provider credentials.
-   Redacted payloads and logs.
-   Raw-body signature verification.
-   Constant-time signature comparison where applicable.
-   Rate limiting.
-   Authenticated administrative endpoints.
-   Threat model and incident runbook.

Readiness should reflect required dependencies. Liveness should not fail
merely because a third-party provider is temporarily unavailable.

------------------------------------------------------------------------

## 14. README and documentation

README must explain:

-   Problem and motivation.
-   Why webhook retries alone do not establish payment correctness.
-   Evidence sources and reconciliation model.
-   Guarantees and limitations.
-   Architecture.
-   Supported provider.
-   Local setup.
-   Flutterwave test setup.
-   Example merchant workflow.
-   Transaction verification.
-   E2E and fault-injection commands.
-   API reference.
-   Security, retention, and limitations.
-   Roadmap, contribution, and license.

Required docs:

``` text
docs/
  architecture/
    overview.md
    data-flow.md
    evidence-model.md
    reconciliation-engine.md
  guides/
    local-development.md
    flutterwave-setup.md
    merchant-integration.md
    troubleshooting.md
  operations/
    deployment.md
    backups.md
    monitoring.md
    incident-response.md
  security/
    threat-model.md
    data-retention.md
  testing/
    test-strategy.md
    e2e-scenarios.md
    provider-test-results.md
```

Execute every documented command from a clean checkout. Do not present
hypothetical commands as working commands.

------------------------------------------------------------------------

## 15. CI and release

GitHub Actions PR workflow:

1.  Install dependencies.
2.  Lint.
3.  Typecheck.
4.  Unit tests.
5.  Database integration tests.
6.  Build all packages.
7.  Docker image build.
8.  Dependency/security checks.

Run full local integration suite on main. Provider tests requiring
secrets must run in a separately configured or manually triggered
workflow. Never expose secrets to untrusted pull-request code.

Release workflow should verify clean build, run release checks, generate
changelog, create GitHub release, and publish artifacts only when
explicitly configured. Generate an SBOM if supported.

Do not publish npm packages until package naming, API stability,
license, and documentation are ready.

------------------------------------------------------------------------

## 16. Execution discipline

Do not generate the entire codebase in one pass. Work in small,
verifiable phases.

For each phase:

1.  Read relevant specification.
2.  Inspect repository state.
3.  Identify deliverables.
4.  Implement the smallest complete increment.
5.  Run relevant tests.
6.  Inspect diff.
7.  Update documentation.
8.  Commit coherent working increment.
9.  Record deviations and unresolved questions.
10. Continue only when acceptance criteria pass.

Never skip failed tests, weaken assertions to get green results, replace
required real integration tests with mocks, or claim external operations
succeeded without evidence.

Maintain `docs/EXECUTION_LOG.md` with phase, dates, files changed,
commands, tests passed/failed, external services exercised, evidence
captured, limitations, and next phase.

------------------------------------------------------------------------

## 17. Cleanup and final verification

Before release:

-   Remove dead code and unused dependencies.
-   Remove temporary files and debug logging.
-   Resolve TypeScript and lint errors.
-   Check circular dependencies and vulnerabilities.
-   Verify migrations from empty and previous schema.
-   Verify Docker Compose from clean environment.
-   Confirm `.env` and test artifacts are ignored.
-   Scan for secrets.
-   Execute README commands.
-   Inspect final diff.
-   Preserve useful fixtures and fault tests.

Required commands must exist as real scripts:

``` bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm test:faults
pnpm build
pnpm audit
docker compose config
git diff --check
git status --short
```

Do not create placeholder scripts that exit successfully without
performing their stated checks.

Publish with Git/GitHub CLI after checks:

``` bash
git add .
git diff --cached --check
git diff --cached --stat
git commit -m "Release PRISM v0.1.0"
git push origin main

gh repo view Jasowills/prism
gh run list --repo Jasowills/prism
gh release list --repo Jasowills/prism
```

Create v0.1.0 only when all acceptance criteria pass.

### Release acceptance criteria

-   Repository published.
-   Flutterwave API contract and signature mechanism documented.
-   Intent registration and ledger observations work.
-   Webhook evidence persisted before acknowledgement.
-   Duplicate deliveries preserved and processed idempotently.
-   Independent verification works against Flutterwave test mode.
-   Discovery pagination and incomplete runs handled correctly.
-   Discrepancies are typed, reproducible, and auditable.
-   Example merchant completes provider test payment.
-   Lost-acknowledgement and duplicate-delivery scenario passes.
-   Worker, database, and provider failure scenarios pass.
-   Tenant isolation and secret redaction tests pass.
-   Docker Compose and clean-checkout setup work.
-   README commands executed successfully.
-   CI passes on release commit.
-   No secrets or sensitive payment data committed.
-   Git tree clean and release notes accurate.

### Final report

Report repository URL, commit SHA, release tag, implemented
capabilities, actual Flutterwave test results, E2E and fault-injection
results, CI status, known limitations, remaining work, and exact local
setup commands.

Clearly distinguish tests executed from tests merely authored.

Begin with Phase 0. Do not skip ahead to implementation.
