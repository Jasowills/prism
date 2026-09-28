import { randomUUID } from 'node:crypto';
import { sha256Hex, canonicalJson } from './redact.js';
import type {
  ApiObsRow,
  DiscrepancyRow,
  EvidenceStore,
  IntentRow,
  LedgerRow,
  RunRow,
  WebhookRow,
} from './store.js';

function nowIso(): string {
  return new Date().toISOString();
}

function chainHash(prev: string | null | undefined, body: string): { prev: string | null; entry: string } {
  const p = prev ?? 'GENESIS';
  return { prev: prev ?? null, entry: sha256Hex(`${p}|${body}`) };
}

/** In-memory evidence store. Used for local dev/tests when Postgres is unavailable. Same append-only semantics. */
export class MemoryStore implements EvidenceStore {
  intents = new Map<string, IntentRow>();
  webhooks: WebhookRow[] = [];
  apiObs: ApiObsRow[] = [];
  ledger: LedgerRow[] = [];
  runs = new Map<string, RunRow>();
  discrepancies = new Map<string, DiscrepancyRow>();
  private lastWebhookHash: string | null = null;
  private lastApiHash: string | null = null;

  async createIntent(row: Omit<IntentRow, 'id' | 'createdAt'>): Promise<IntentRow> {
    for (const v of this.intents.values()) {
      if (v.tenantId === row.tenantId && v.provider === row.provider && v.merchantReference === row.merchantReference) {
        throw Object.assign(new Error('duplicate intent'), { code: 'DUPLICATE_INTENT' });
      }
    }
    const created: IntentRow = { ...row, id: randomUUID(), createdAt: nowIso() };
    this.intents.set(created.id, created);
    return created;
  }

  async getIntentById(id: string): Promise<IntentRow | null> {
    return this.intents.get(id) ?? null;
  }

  async getIntentByReference(tenantId: string, provider: string, merchantReference: string): Promise<IntentRow | null> {
    for (const v of this.intents.values()) {
      if (v.tenantId === tenantId && v.provider === provider && v.merchantReference === merchantReference) return v;
    }
    return null;
  }

  async listIntentsInWindow(tenantId: string, fromIso: string, toIso: string): Promise<IntentRow[]> {
    return [...this.intents.values()].filter(
      (v) => v.tenantId === tenantId && v.createdAt >= fromIso && v.createdAt <= toIso,
    );
  }

  async addLedgerObservation(row: Omit<LedgerRow, 'id' | 'observedAt'> & { observedAt?: string }): Promise<LedgerRow> {
    const created: LedgerRow = { ...row, id: randomUUID(), observedAt: row.observedAt ?? nowIso() };
    this.ledger.push(created);
    return created;
  }

  async addWebhookEvent(
    row: Omit<WebhookRow, 'id' | 'receivedAt' | 'prevHash' | 'entryHash'> & { receivedAt?: string },
  ): Promise<WebhookRow> {
    const body = canonicalJson({ fp: row.deliveryFingerprint, hash: row.payloadHash, ref: row.providerReference });
    const { prev, entry } = chainHash(this.lastWebhookHash, body);
    this.lastWebhookHash = entry;
    const created: WebhookRow = {
      ...row,
      id: randomUUID(),
      receivedAt: row.receivedAt ?? nowIso(),
      prevHash: prev,
      entryHash: entry,
    };
    this.webhooks.push(created);
    return created;
  }

  async findWebhookByFingerprint(fingerprint: string): Promise<WebhookRow | null> {
    return this.webhooks.find((w) => w.deliveryFingerprint === fingerprint) ?? null;
  }

  async listWebhooksByReference(tenantId: string, reference: string): Promise<WebhookRow[]> {
    return this.webhooks.filter((w) => w.tenantId === tenantId && w.providerReference === reference);
  }

  async addApiObservation(
    row: Omit<ApiObsRow, 'id' | 'requestStartedAt' | 'prevHash' | 'entryHash'> & { requestStartedAt?: string },
  ): Promise<ApiObsRow> {
    const body = canonicalJson({ q: row.queryReference, s: row.providerStatus, o: row.outcome });
    const { prev, entry } = chainHash(this.lastApiHash, body);
    this.lastApiHash = entry;
    const created: ApiObsRow = {
      ...row,
      id: randomUUID(),
      requestStartedAt: row.requestStartedAt ?? nowIso(),
      prevHash: prev,
      entryHash: entry,
    };
    this.apiObs.push(created);
    return created;
  }

  async listApiObservationsByReference(tenantId: string, reference: string): Promise<ApiObsRow[]> {
    return this.apiObs.filter((o) => o.tenantId === tenantId && o.queryReference === reference);
  }

  async listLedgerByReference(tenantId: string, reference: string): Promise<LedgerRow[]> {
    return this.ledger.filter((l) => l.tenantId === tenantId && l.merchantReference === reference);
  }

  async createRun(
    row: Omit<RunRow, 'id' | 'startedAt' | 'pagesScanned' | 'recordsScanned' | 'status'> & { status?: string },
  ): Promise<RunRow> {
    const created: RunRow = {
      ...row,
      id: randomUUID(),
      startedAt: nowIso(),
      pagesScanned: 0,
      recordsScanned: 0,
      status: row.status ?? 'running',
    };
    this.runs.set(created.id, created);
    return created;
  }

  async getRun(id: string): Promise<RunRow | null> {
    return this.runs.get(id) ?? null;
  }

  async updateRun(id: string, patch: Partial<RunRow>): Promise<RunRow> {
    const cur = this.runs.get(id);
    if (!cur) throw new Error('run not found');
    const next = { ...cur, ...patch };
    this.runs.set(id, next);
    return next;
  }

  async upsertDiscrepancy(
    row: Omit<DiscrepancyRow, 'id' | 'firstDetectedAt' | 'lastDetectedAt' | 'status'> & { status?: string },
  ): Promise<DiscrepancyRow> {
    for (const d of this.discrepancies.values()) {
      if (
        d.tenantId === row.tenantId &&
        d.merchantReference === row.merchantReference &&
        d.type === row.type &&
        d.status !== 'resolved'
      ) {
        const next: DiscrepancyRow = {
          ...d,
          lastDetectedAt: nowIso(),
          evidenceRefs: [...new Set([...d.evidenceRefs, ...row.evidenceRefs])],
          severity: row.severity,
        };
        this.discrepancies.set(d.id, next);
        return next;
      }
    }
    const created: DiscrepancyRow = {
      ...row,
      id: randomUUID(),
      status: row.status ?? 'open',
      firstDetectedAt: nowIso(),
      lastDetectedAt: nowIso(),
    };
    this.discrepancies.set(created.id, created);
    return created;
  }

  async listDiscrepancies(tenantId: string, status?: string): Promise<DiscrepancyRow[]> {
    return [...this.discrepancies.values()].filter(
      (d) => d.tenantId === tenantId && (!status || d.status === status),
    );
  }

  async getDiscrepancy(id: string): Promise<DiscrepancyRow | null> {
    return this.discrepancies.get(id) ?? null;
  }

  async resolveDiscrepancy(id: string, reason: string, _actor = 'operator'): Promise<DiscrepancyRow> {
    const cur = this.discrepancies.get(id);
    if (!cur) throw new Error('discrepancy not found');
    const next: DiscrepancyRow = { ...cur, status: 'resolved', resolvedAt: nowIso(), resolutionReason: reason };
    this.discrepancies.set(id, next);
    return next;
  }

  async verifyIntegrity(_tenantId: string): Promise<{ ok: boolean; checked: number; failures: string[] }> {
    const failures: string[] = [];
    let prev: string | null = null;
    let checked = 0;
    for (const w of this.webhooks) {
      checked++;
      const body = canonicalJson({ fp: w.deliveryFingerprint, hash: w.payloadHash, ref: w.providerReference });
      const expected = sha256Hex(`${prev ?? 'GENESIS'}|${body}`);
      if (w.entryHash !== expected) failures.push(`webhook:${w.id}`);
      prev = w.entryHash ?? prev;
    }
    return { ok: failures.length === 0, checked, failures };
  }
}
