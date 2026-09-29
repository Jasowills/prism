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

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

type Lamp = 'ok' | 'warn' | 'bad' | 'dim';

function lampClass(status: string): Lamp {
  const s = status.toLowerCase();
  if (s.includes('fulfill') || s === 'successful' || s === 'verified' || s === 'settled' || s === 'delivered' || s === 'matching') return 'ok';
  if (s.includes('mismatch') || s.includes('failed') || s.includes('invalid') || s === 'flagged') return 'bad';
  if (s === 'created' || s === 'unknown' || s === 'unverified') return 'dim';
  return 'warn';
}

interface VerifyView {
  paymentStatus?: string;
  verificationStatus?: string;
  deliveryStatus?: string;
  ledgerStatus?: string;
  settlementStatus?: string;
  findings?: Array<{ type: string; severity: string; detail: string }>;
}

async function fetchVerification(ref: string): Promise<VerifyView | null> {
  try {
    const res = await fetch(`${PRISM_URL}/v1/transactions/${encodeURIComponent(ref)}/verification`, {
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return null;
    return (await res.json()) as VerifyView;
  } catch {
    return null;
  }
}

function stamp(order: Order, label: string): void {
  order.timeline = [...(order.timeline ?? []), { label, at: new Date().toISOString() }];
}

function timeline(order: Order): string {
  const steps = order.timeline ?? [];
  if (steps.length === 0) return '<p class="mut">No lifecycle events recorded yet.</p>';
  const times = steps.map((s) => new Date(s.at).getTime());
  const span = Math.max(times[times.length - 1]! - times[0]!, 1);
  const rows = steps.map((s, i) => {
    const gap = i === 0 ? 0 : times[i]! - times[i - 1]!;
    const width = Math.max(4, Math.round((gap / span) * 100));
    const last = i === steps.length - 1;
    return `<div class="tl-step"><span class="lamp ${last ? 'warn' : 'ok'}"></span><span class="tl-label">${esc(s.label)}</span><span class="tl-bar" style="width:${width}%"></span><span class="tl-at">${esc(s.at.slice(11, 19))}</span></div>`;
  });
  return `<div class="timeline" role="list" aria-label="Order lifecycle">${rows.join('')}</div>`;
}

function readout(v: VerifyView | null): string {
  if (!v) {
    return '<div class="readout offline"><span class="lamp bad"></span><div><strong>PRISM unreachable.</strong><br /><span class="mut">Start the API on :4100 to see verification state.</span></div></div>';
  }
  const dims: Array<[string, string | undefined]> = [
    ['payment', v.paymentStatus],
    ['verification', v.verificationStatus],
    ['delivery', v.deliveryStatus],
    ['ledger', v.ledgerStatus],
    ['settlement', v.settlementStatus],
  ];
  const rows = dims
    .map(([k, val]) => `<div class="ro-row"><span class="ro-k">${k}</span><span class="lamp ${lampClass(val ?? 'unknown')}"></span><span class="ro-v">${esc((val ?? 'UNKNOWN').toLowerCase())}</span></div>`)
    .join('');
  const findings =
    v.findings && v.findings.length > 0
      ? `<ul class="findings">${v.findings.map((f) => `<li><span class="lamp ${f.severity === 'critical' || f.severity === 'high' ? 'bad' : 'warn'}"></span><code>${esc(f.type)}</code> <span class="mut">${esc(f.detail)}</span></li>`).join('')}</ul>`
      : '<p class="mut">No open findings. Every evidence stream agrees.</p>';
  return `<div class="readout">${rows}</div><h3>Findings</h3>${findings}`;
}

function html(order?: Order, verification?: VerifyView | null, renderedAt?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Prism Demo Store — payment console</title>
<style>
:root{
  --ground:#0c0f14; --panel:#12161f; --panel2:#0e1219; --line:#232b3b;
  --ink:#e9e4d8; --dim:#8f99ad; --faint:#5b6579;
  --amber:#f0a832; --green:#3fce7a; --red:#e5605c;
  --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  --sans:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;
}
*{box-sizing:border-box}
::selection{background:var(--amber);color:#14100a}
html{scrollbar-color:var(--line) var(--ground)}
body{background:var(--ground);color:var(--ink);font-family:var(--sans);margin:0;padding:0 1rem 4rem;font-size:15px;line-height:1.5}
a{color:var(--amber)}
:focus-visible{outline:2px solid var(--amber);outline-offset:2px;border-radius:4px}
.consolebar{position:sticky;top:0;z-index:5;background:var(--ground);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:.8rem;max-width:1080px;margin:0 auto;padding:.9rem 0}
.mark{width:30px;height:30px;border:1px solid var(--amber);border-radius:6px;display:flex;align-items:center;justify-content:center;font-family:var(--mono);font-weight:700;color:var(--amber)}
.consolebar h1{font-size:1rem;margin:0;font-weight:650;letter-spacing:.02em}
.consolebar .sub{color:var(--dim);font-size:.85rem}
.spacer{flex:1}
.live{display:flex;align-items:center;gap:.45rem;font-family:var(--mono);font-size:.78rem;color:var(--dim)}
.livedot{width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2.4s ease-out infinite}
@keyframes pulse{0%{opacity:1}50%{opacity:.35}100%{opacity:1}}
main{max-width:1080px;margin:0 auto;display:grid;gap:1.25rem;margin-top:1.5rem}
.grid{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(0,1.6fr);gap:1.25rem}
@media (max-width:820px){.grid{grid-template-columns:1fr}}
.window{background:var(--panel);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.window > h2{margin:0;padding:.7rem 1rem;font-size:.78rem;font-weight:650;letter-spacing:.09em;text-transform:uppercase;color:var(--dim);border-bottom:1px solid var(--line);background:var(--panel2)}
.window .body{padding:1rem}
.window .body h2{margin:1.4rem 0 .4rem;font-size:.78rem;letter-spacing:.09em;text-transform:uppercase;color:var(--dim)}
.window .body h3{margin:1.1rem 0 .4rem;font-size:.82rem;color:var(--ink);font-weight:650}
label{display:block;font-size:.82rem;color:var(--dim);margin:.6rem 0 .25rem}
input{background:var(--ground);border:1px solid var(--line);color:var(--ink);border-radius:6px;padding:.55rem .7rem;font-size:.95rem;width:100%;font-family:var(--mono)}
input::placeholder{color:var(--faint)}
button{background:var(--amber);border:0;color:#171106;border-radius:6px;padding:.6rem 1.1rem;font-size:.92rem;font-weight:700;cursor:pointer;font-family:var(--sans)}
button:hover{filter:brightness(1.08)}
button:active{transform:translateY(1px)}
button.ghost{background:transparent;border:1px solid var(--line);color:var(--ink);font-weight:600}
button:disabled{opacity:.45;cursor:not-allowed}
.row{display:flex;gap:.6rem;flex-wrap:wrap;margin-top:.9rem;align-items:center}
table{width:100%;border-collapse:collapse;font-size:.9rem}
th{color:var(--dim);text-align:left;font-weight:600;font-size:.76rem;letter-spacing:.07em;text-transform:uppercase;padding:.5rem .6rem;border-bottom:1px solid var(--line)}
td{padding:.6rem;border-bottom:1px solid var(--line);vertical-align:middle}
td.ref{font-family:var(--mono);font-size:.83rem}
td.num{font-family:var(--mono);font-variant-numeric:tabular-nums;white-space:nowrap}
td a{font-family:var(--mono);font-size:.83rem;text-decoration:none;border-bottom:1px dotted var(--faint)}
td a:hover{color:var(--ink);border-bottom-color:var(--amber)}
.lamp{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none}
.lamp.ok{background:var(--green)} .lamp.warn{background:var(--amber)} .lamp.bad{background:var(--red)} .lamp.dim{background:var(--faint)}
.cell{display:flex;align-items:center;gap:.5rem}
.mut{color:var(--dim)} .mono{font-family:var(--mono)} .num{font-variant-numeric:tabular-nums}
.readout{display:grid;gap:0;border:1px solid var(--line);border-radius:8px;overflow:hidden}
.ro-row{display:grid;grid-template-columns:110px 20px 1fr;align-items:center;gap:.5rem;padding:.5rem .8rem;background:var(--panel2)}
.ro-row + .ro-row{border-top:1px solid var(--line)}
.ro-k{font-family:var(--mono);font-size:.78rem;color:var(--dim)}
.ro-v{font-family:var(--mono);font-size:.86rem}
.readout.offline{display:flex;gap:.7rem;padding:.9rem;align-items:flex-start}
.findings{list-style:none;margin:.4rem 0 0;padding:0;display:grid;gap:.45rem}
.findings li{display:flex;gap:.55rem;align-items:baseline;font-size:.87rem}
.findings code{font-family:var(--mono);font-size:.8rem;color:var(--amber)}
.timeline{display:grid;gap:.35rem;margin-top:.4rem}
.tl-step{display:grid;grid-template-columns:20px minmax(120px,180px) 1fr 64px;align-items:center;gap:.5rem;font-size:.85rem}
.tl-label{color:var(--ink)}
.tl-bar{height:8px;background:var(--line);border-radius:4px;min-width:8px}
.tl-at{font-family:var(--mono);font-size:.76rem;color:var(--faint);text-align:right;font-variant-numeric:tabular-nums}
.deliveries{list-style:none;margin:.4rem 0 0;padding:0;font-family:var(--mono);font-size:.8rem;color:var(--dim);display:grid;gap:.3rem}
.pay{display:inline-block;margin:.6rem 0;background:var(--green);color:#06130c;text-decoration:none;font-weight:700;border-radius:6px;padding:.65rem 1.3rem}
.pay:hover{filter:brightness(1.07)}
details{margin-top:1rem;border:1px solid var(--line);border-radius:8px}
summary{cursor:pointer;padding:.55rem .8rem;font-size:.85rem;color:var(--dim)}
pre{background:var(--ground);border-top:1px solid var(--line);margin:0;padding:.8rem;overflow:auto;font-size:.78rem;max-height:300px;font-family:var(--mono)}
.empty{padding:1.2rem .2rem;color:var(--dim)}
footer{max-width:1080px;margin:2rem auto 0;color:var(--faint);font-size:.82rem;display:flex;gap:1rem;flex-wrap:wrap}
footer .mono{font-size:.78rem}
@media (prefers-reduced-motion:reduce){.livedot{animation:none}}
@media (max-width:600px){
  .consolebar .sub,.rendered-at{display:none}
  .tl-step{grid-template-columns:20px minmax(0,1fr) 1fr 56px}
  .tl-label{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
}
</style>
</head><body>
<div class="consolebar"><div class="mark" aria-hidden="true">P/</div><div><h1>Prism Demo Store</h1><div class="sub">payment console · test mode only</div></div><div class="spacer"></div><div class="live"><span class="livedot" aria-hidden="true"></span>PRISM ${esc(PRISM_URL.replace(/^https?:\/\//, ''))} <span class="rendered-at">· ${esc(renderedAt ?? '')}</span></div></div>
<main>
<div class="grid">
<section class="window" aria-label="New order"><h2>New order</h2><div class="body">
<form method="POST" action="/orders">
<label for="amount">Amount (decimal)</label><input id="amount" name="amount" value="100.00" inputmode="decimal" />
<label for="currency">Currency</label><input id="currency" name="currency" value="NGN" maxlength="3" />
<label for="email">Customer email</label><input id="email" name="email" value="buyer@example.com" type="email" />
<div class="row"><button type="submit">Open order</button></div></form>
<p class="mut">Opens an order, registers the PRISM intent, and returns a hosted-checkout link.</p>
</div></section>
<section class="window" aria-label="Order stack"><h2>Order stack</h2><div class="body" style="padding:0">
${store.all().length === 0 ? '<p class="empty" style="padding:1rem">No orders yet. Open one to begin a demo run.</p>' : `<table><tr><th></th><th>reference</th><th>amount</th><th>status</th><th>×</th></tr>
${store.all().map((o) => `<tr><td><span class="lamp ${lampClass(o.status)}"></span></td><td class="ref"><a href="/orders/${esc(o.reference)}">${esc(o.reference)}</a></td><td class="num">${esc(o.amount)} ${esc(o.currency)}</td><td>${esc(o.status)}</td><td class="num">${o.fulfillmentCount}x</td></tr>`).join('')}
</table>`}
</div></section>
</div>
${order ? `<section class="window" aria-label="Order detail"><h2>Order <span class="mono">${esc(order.reference)}</span></h2><div class="body">
<div class="cell"><span class="lamp ${lampClass(order.status)}"></span><strong>${esc(order.status)}</strong><span class="mut mono">${esc(order.amount)} ${esc(order.currency)} · fulfilled ${order.fulfillmentCount}x</span></div>
<p><a class="pay" href="${esc(order.checkoutLink ?? '#')}">Pay with Flutterwave</a></p>
<div class="row">
<form method="POST" action="/orders/${esc(order.reference)}/simulate-webhook"><button class="ghost" type="submit">Simulate webhook</button></form>
<form method="POST" action="/orders/${esc(order.reference)}/fulfill"><button type="submit">Fulfill (exactly once)</button></form>
</div>
<h2 style="margin-top:1.4rem">Lifecycle</h2>
${timeline(order)}
<h2 style="margin-top:1.4rem">PRISM readout</h2>
${readout(verification ?? null)}
<h2 style="margin-top:1.4rem">Deliveries</h2>
${order.processedWebhooks.length === 0 ? '<p class="mut">No merchant deliveries recorded.</p>' : `<ul class="deliveries">${order.processedWebhooks.map((d) => `<li>${esc(d)}</li>`).join('')}</ul>`}
<details><summary>Raw order record</summary><pre>${esc(JSON.stringify(order, null, 2))}</pre></details>
</div></section>` : ''}
</main>
<footer><span>PRISM <span class="mono">${esc(PRISM_URL)}</span></span><span>Rendered <span class="mono">${esc(renderedAt ?? '')}</span></span><span>Demo data only — never live funds.</span></footer>
</body></html>`;
}

app.get('/', (_req, res) => res.send(html(undefined, undefined, new Date().toISOString())));
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
    createdAt: '',
    updatedAt: '',
    timeline: [],
  };
  stamp(order, 'created');
  await store.save(order);
  if (req.headers.accept?.includes('application/json')) return res.json(order);
  res.redirect(`/orders/${reference}`);
});

app.get('/orders/:ref', async (req, res) => {
  const o = store.get(req.params.ref);
  if (!o) return res.status(404).send('not found');
  if (req.headers.accept?.includes('application/json')) return res.json(o);
  const verification = await fetchVerification(o.reference);
  res.send(html(o, verification, new Date().toISOString()));
});

// Payment return handling: verify via PRISM (which can live-verify provider) before showing status.
app.get('/orders/:ref/return', async (req, res) => {
  const o = store.get(req.params.ref);
  if (!o) return res.status(404).send('not found');
  const txId = req.query.transaction_id ? String(req.query.transaction_id) : null;
  o.status = txId ? `returned(tx=${txId})` : 'returned';
  stamp(o, 'returned');
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
    stamp(o, 'webhook');
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
  stamp(o, 'simulated');
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
  stamp(o, 'fulfilled');
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
