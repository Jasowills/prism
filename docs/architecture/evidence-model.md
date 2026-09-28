# Evidence model

Four streams, stored separately (spec §1):

| Stream | Table | Mutability |
|---|---|---|
| Expected payment intent | `payment_intents` (+ `intent_amendments`) | Amendments only, with actor/reason |
| Provider webhook | `provider_webhook_events` | Append-only, duplicates kept |
| Provider API observation | `provider_api_observations` | Append-only, failures kept |
| Merchant ledger observation | `merchant_ledger_observations` | Append-only snapshots |

Plus `reconciliation_runs` (window, pages/records, cursor, status) and
`discrepancies` + `discrepancy_events` (resolution appends events).

## Integrity

- SQL triggers reject UPDATE/DELETE on evidence tables.
- `prev_hash`/`entry_hash` SHA-256 chains over canonical JSON per table.
- `MemoryStore` mirrors both properties for tests.
- Tamper-evident, not tamper-proof vs a DB superuser (see threat model).

## Money

`NUMERIC(20,6)` in Postgres; decimal strings at API boundaries; `parseMoneyToMinor`
(BigInt, 10^6 scale) for comparisons. No floating-point arithmetic on amounts.
