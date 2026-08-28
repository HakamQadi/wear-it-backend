import { createServer } from 'http';

const port = Number(process.env.STRIPE_STUB_PORT || 4998);
let last = null;

function send(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(value));
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  if (url.pathname === '/__last') return send(res, 200, last || {});
  if (url.pathname.startsWith('/checkout/') || url.pathname.startsWith('/portal/')) return send(res, 200, { ok: true });

  let raw = '';
  for await (const chunk of req) raw += chunk;
  const form = Object.fromEntries(new URLSearchParams(raw));
  last = { method: req.method, path: url.pathname, form, idempotencyKey: req.headers['idempotency-key'] || '' };

  if (req.method === 'POST' && url.pathname === '/v1/checkout/sessions') {
    return send(res, 200, { id: 'cs_qa', url: `http://127.0.0.1:${port}/checkout/qa` });
  }
  if (req.method === 'POST' && url.pathname === '/v1/billing_portal/sessions') {
    return send(res, 200, { url: `http://127.0.0.1:${port}/portal/qa` });
  }
  return send(res, 404, { error: { message: 'Stripe stub route not found' } });
});

server.listen(port, '127.0.0.1', () => console.log(`Stripe QA stub listening on ${port}`));
