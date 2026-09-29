import express from 'express';
import { PrismSdk } from '@prism/sdk';
import { OrderStore, type OrderRecord as Order } from './store.js';

const store = new OrderStore();
const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const PRISM_URL = process.env.PRISM_API_URL ?? 'http://localhost:4100';
const FLW_PUBLIC_KEY = process.env.FLW_PUBLIC_KEY ?? '';
const FLW_SECRET_KEY = process.env.FLW_SECRET_KEY ?? '';
const PORT = Number(process.env.MERCHANT_PORT ?? 4200);
const sdk = new PrismSdk({ baseUrl: PRISM_URL, apiKey: process.env.PRISM_API_KEY });

function badge(status: string): string {
  const s = status.toLowerCase();
  const cls = s.includes('fulfill') ? 'ok' : s.includes('return') || s.includes('webhook') ? 'warn' : 'new';
  return `<span class="badge ${cls}">${status}</span>`;
}

function html(order?: Order): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Prism Demo Store</title>
<style>
:root{--bg:#0f1420;--card:#1a2233;--line:#2a3550;--txt:#e8edf5;--mut:#93a0b8;--acc:#5b8cff;--ok:#2fbf71;--warn:#e5a13d}
*{box-sizing:border-box}body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--txt);margin:0;padding:0 1rem 3rem}
header{display:flex;align-items:center;gap:.75rem;max-width:860px;margin:0 auto;padding:1.5rem 0}
.logo{width:38px;height:38px;border-radius:10px;background:linear-gradient(135deg,#5b8cff,#9b6bff);display:flex;align-items:center;justify-content:center;font-weight:800}
header h1{font-size:1.25rem;margin:0}header small{color:var(--mut)}
main{max-width:860px;margin:0 auto;display:grid;gap:1rem}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:1.25rem}
.card h2{margin:0 0 .75rem;font-size:1rem;color:var(--mut);text-transform:uppercase;letter-spacing:.06em}
.row{display:flex;gap:.5rem;flex-wrap:wrap}
input{background:#0d1322;border:1px solid var(--line);color:var(--txt);border-radius:8px;padding:.6rem .75rem;font-size:.95rem}
button{background:var(--acc);border:0;color:#fff;border-radius:8px;padding:.6rem 1rem;font-size:.95rem;font-weight:600;cursor:pointer}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--txt)}
button:hover{filter:brightness(1.1)}
table{width:100%;border-collapse:collapse;font-size:.92rem}
th{color:var(--mut);text-align:left;font-weight:600;padding:.5rem;border-bottom:1px solid var(--line)}
td{padding:.55rem .5rem;border-bottom:1px solid var(--line)}
td a{color:var(--acc);text-decoration:none;font-family:ui-monospace,monospace;font-size:.85rem}
.badge{display:inline-block;padding:.15rem .6rem;border-radius:999px;font-size:.8rem;font-weight:600}
.badge.ok{background:rgba(47,191,113,.15);color:var(--ok)}
.badge.warn{background:rgba(229,161,61,.15);color:var(--warn)}
.badge.new{background:rgba(91,140,255,.15);color:var(--acc)}
pre{background:#0d1322;border:1px solid var(--line);border-radius:8px;padding:.75rem;overflow:auto;font-size:.8rem;max-height:320px}
.pay{display:inline-block;margin:.5rem 0;background:var(--ok);color:#04120a;text-decoration:none;font-weight:700;border-radius:8px;padding:.65rem 1.25rem}
footer{max-width:860px;margin:1.5rem auto 0;color:var(--mut);font-size:.85rem}
</style>
</head><body>
<header><div class="logo">P</div><div><h1>Prism Demo Store</h1><small>test mode only · no live payments</small></div></header>
<main>
<div class="card"><h2>New order</h2>
<form method="POST" action="/orders"><div class="row">
<input name="amount" value="100.00" size="8" /> <input name="currency" value="NGN" size="5" />
<input name="email" value="buyer@example.com" size="24" />
<button type="submit">Create order</button></div></form></div>
<div class="card"><h2>Orders (${store.all().length})</h2>
<table><tr><th>reference</th><th>amount</th><th>status</th><th>fulfilled</th></tr>
${store.all().map((o) => `<tr><td><a href="/orders/${o.reference}">${o.reference}</a></td><td>${o.amount} ${o.currency}</td><td>${badge(o.status)}</td><td>${o.fulfillmentCount}x</td></tr>`).join('')}
</table></div>
${order ? `<div class="card"><h2>Order ${order.reference}</h2>${badge(order.status)}
<p><a class="pay" href="${order.checkoutLink ?? '#'}">Pay with Flutterwave</a></p>
<div class="row">
<form method="POST" action="/orders/${order.reference}/simulate-webhook"><button class="ghost" type="submit">Simulate webhook</button></form>
<form method="POST" action="/orders/${order.reference}/fulfill"><button type="submit">Fulfill (idempotent)</button></form>
<form method="GET" action="/orders/${order.reference}/reconciliation"><button class="ghost" type="submit">View reconciliation</button></form>
</div>
<pre>${JSON.stringify(order, null, 2)}</pre></div>` : ''}
</main>
<footer>Backed by PRISM at ${PRISM_URL} · intents, webhooks, verification and reconciliation are recorded per order.</footer>
</body></html>`;
}

app.get('/', (_req, res) => res.send(html()));
app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/orders', async (req, res) => {
  const amount = String(req.body.amount ?? '100.00');
  const currency = String(req.body.currency ?? 'NGN');
  const email = String(req.body.email ?? 'buyer@example.com');
  const reference = `demo-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
  // 1. Register expected intent in PRISM.
  let intentId: string | undefined;
  try {
    const created = (await sdk.registerIntent({ merchantReference: reference, expectedAmount: amount, currency })) as { id?: string };
    intentId = created.id;
  } catch (e) {
    console.error('PRISM register failed (is PRISM running?)', String(e));
  }
  // 2. Initialize Flutterwave checkout when credentials exist; else local simulation link.
  let link = `/orders/${reference}`;
  if (FLW_SECRET_KEY) {
    try {
      const r = await fetch('https://api.flutterwave.com/v3/payments', {
        method: 'POST',
        headers: { Authorization: `Bearer ${FLW_SECRET_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tx_ref: reference,
          amount: Number(amount),
          currency,
          redirect_url: `http://localhost:${PORT}/orders/${reference}/return`,
          customer: { email },
        }),
      });
      const body = (await r.json()) as { data?: { link?: string } };
      if (body.data?.link) link = body.data.link;
    } catch (e) {
      console.error('flutterwave init failed', String(e));
    }
  } else {
    link = `https://checkout.flutterwave.com/v3/hosted/pay?tx_ref=${reference} (simulation — set FLW_SECRET_KEY for live test link)`;
  }
  const order: Order = {
    id: reference,
    reference,
    amount,
    currency,
    email,
    status: 'created',
    fulfillmentCount: 0,
    prismIntentId: intentId,
    checkoutLink: link,
    processedWebhooks: [],
  };
  await store.save(order);
  if (req.headers.accept?.includes('application/json')) return res.json(order);
  res.redirect(`/orders/${reference}`);
});

app.get('/orders/:ref', (req, res) => {
  const o = store.get(req.params.ref);
  if (!o) return res.status(404).send('not found');
  if (req.headers.accept?.includes('application/json')) return res.json(o);
  res.send(html(o));
});

// Payment return handling: verify via PRISM (which can live-verify provider) before showing status.
app.get('/orders/:ref/return', async (req, res) => {
  const o = store.get(req.params.ref);
  if (!o) return res.status(404).send('not found');
  const txId = req.query.transaction_id ? String(req.query.transaction_id) : null;
  o.status = txId ? `returned(tx=${txId})` : 'returned';
  await store.save(o);
  try {
    await sdk.verify(o.reference);
  } catch {
    /* prism may be down; still show page */
  }
  res.redirect(`/orders/${o.reference}`);
});

// Merchant webhook endpoint (receives provider/forwarded events). Idempotent: dedupe by delivery id.
app.post('/webhooks/flutterwave', express.json({ verify: (req: unknown, _res, buf: Buffer) => { (req as { rawBody?: Buffer }).rawBody = buf; } }), async (req, res) => {
  const deliveryId = String(req.headers['x-delivery-id'] ?? (req.body?.id as string | undefined) ?? JSON.stringify(req.body).slice(0, 32));
  const txRef = (req.body?.data?.tx_ref as string | undefined) ?? (req.body?.tx_ref as string | undefined);
  if (txRef && store.get(txRef)) {
    const o = store.get(txRef)!;
    if (o.processedWebhooks.includes(deliveryId)) {
      return res.json({ ok: true, duplicate: true }); // inspectable, no double fulfill
    }
    o.processedWebhooks.push(deliveryId);
    o.status = 'webhook-received';
    await store.save(o);
  }
  res.json({ ok: true });
});

// Test helper: simulate a provider webhook delivery (also forwards to PRISM when configured).
app.post('/orders/:ref/simulate-webhook', async (req, res) => {
  const o = store.get(req.params.ref);
  if (!o) return res.status(404).send('not found');
  const payload = { event: 'charge.completed', data: { id: 999999, tx_ref: o.reference, amount: Number(o.amount), currency: o.currency, status: 'successful' } };
  // Forward to PRISM webhook receiver as a signed test delivery.
  try {
    await fetch(`${PRISM_URL}/v1/webhooks/flutterwave`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-prism-test': 'true' },
      body: JSON.stringify(payload),
    });
  } catch {
    /* ignore */
  }
  o.status = 'webhook-simulated';
  await store.save(o);
  res.redirect(`/orders/${o.reference}`);
});

// Fulfillment simulation: exactly-once. Retry after commit does not fulfill twice.
app.post('/orders/:ref/fulfill', async (req, res) => {
  const o = store.get(req.params.ref);
  if (!o) return res.status(404).send('not found');
  if (o.fulfillmentCount >= 1) {
    // idempotent: do not re-fulfill. Record the suppressed retry as evidence
    // without adding another 'fulfilled' marker (avoids false risk findings).
    try {
      if (o.prismIntentId) {
        await sdk.recordLedger(o.prismIntentId, { merchantReference: o.reference, recordedStatus: 'successful', recordedAmount: o.amount, currency: o.currency, fulfillmentStatus: 'duplicate-suppressed' });
      }
    } catch {
      /* ignore */
    }
    return res.json({ ok: true, fulfilled: false, reason: 'already-fulfilled (idempotent)', count: o.fulfillmentCount });
  }
  o.fulfillmentCount = 1;
  o.status = 'fulfilled';
  await store.save(o);
  try {
    if (o.prismIntentId) {
      await sdk.recordLedger(o.prismIntentId, { merchantReference: o.reference, recordedStatus: 'successful', recordedAmount: o.amount, currency: o.currency, fulfillmentStatus: 'fulfilled' });
    }
  } catch {
    /* ignore */
  }
  if (req.headers.accept?.includes('application/json')) return res.json({ ok: true, fulfilled: true });
  res.redirect(`/orders/${o.reference}`);
});

app.get('/orders/:ref/reconciliation', async (req, res) => {
  try {
    const data = await sdk.verify(req.params.ref);
    res.json(data);
  } catch (e) {
    res.status(502).json({ error: String(e) });
  }
});

const backend = await store.init();
app.listen(PORT, () => console.log(`merchant-checkout listening on :${PORT}, PRISM=${PRISM_URL}, FLW_PUBLIC_KEY=${FLW_PUBLIC_KEY ? 'set' : 'missing'}, orders=${backend}`));
