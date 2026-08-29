import { createHmac } from 'crypto';
import sharp from 'sharp';

const API = process.env.API_URL || 'http://127.0.0.1:4100/api';
const OPENAI_STUB = process.env.OPENAI_STUB_URL || 'http://127.0.0.1:4999';
const STRIPE_STUB = process.env.STRIPE_STUB_URL || 'http://127.0.0.1:4998';
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || 'whsec_qa';
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@wearit.local', password: process.env.ADMIN_PASSWORD || 'WearIt123!' };
let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) { passed += 1; console.log(`  PASS  ${name}`); }
  else { failures.push(`${name}${detail ? ` — ${detail}` : ''}`); console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`); }
}

async function call(path, { method = 'GET', body, token } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(`${API}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = text; }
  return { status: response.status, data };
}

async function swatch(hex) {
  return sharp({ create: { width: 64, height: 96, channels: 3, background: hex } }).png().toBuffer();
}

async function upload(token, buffer, name) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), name);
  const response = await fetch(`${API}/uploads/image`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: form });
  return { status: response.status, data: await response.json().catch(() => null) };
}

async function webhook(type, object) {
  const raw = JSON.stringify({ id: `evt_${Date.now()}`, type, data: { object } });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHmac('sha256', WEBHOOK_SECRET).update(`${timestamp}.${raw}`).digest('hex');
  const response = await fetch(`${API}/billing/stripe/webhook`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'stripe-signature': `t=${timestamp},v1=${signature}` },
    body: raw,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

const stamp = Date.now().toString(36);
const member = { name: 'Billing QA', email: `billing-${stamp}@wearit.test`, password: 'WearItQA123!' };

async function run() {
  const adminLogin = await call('/auth/login', { method: 'POST', body: ADMIN });
  const adminToken = adminLogin.data?.accessToken;
  check('admin can sign in', adminLogin.status === 200 && Boolean(adminToken), `status ${adminLogin.status}`);

  const registration = await call('/auth/register', { method: 'POST', body: member });
  const token = registration.data?.accessToken;
  const userId = registration.data?.user?.id;
  check('billing member can register', registration.status === 201 && Boolean(token) && Boolean(userId), `status ${registration.status}`);

  const initialPlans = await call('/plans');
  check('public API exposes exactly Free and Pro', initialPlans.status === 200 && initialPlans.data?.length === 2);
  check('default Free allowance is 3', initialPlans.data?.find((p) => p.tier === 'free')?.generationLimit === 3);
  check('default Pro is $9.99 with 30 generations', initialPlans.data?.find((p) => p.tier === 'pro')?.priceCents === 999 && initialPlans.data?.find((p) => p.tier === 'pro')?.generationLimit === 30);

  const freePlan = initialPlans.data?.find((plan) => plan.tier === 'free');
  const proPlan = initialPlans.data?.find((plan) => plan.tier === 'pro');
  const memberAssignmentForbidden = await call(`/admin/members/${userId}/plan`, {
    method: 'PATCH', token, body: { planId: proPlan?._id },
  });
  check('members cannot assign plans', memberAssignmentForbidden.status === 403, `status ${memberAssignmentForbidden.status}`);

  const assignedPro = await call(`/admin/members/${userId}/plan`, {
    method: 'PATCH', token: adminToken, body: { planId: proPlan?._id },
  });
  check('admin can assign Pro to a member', assignedPro.status === 200 && assignedPro.data?.plan?.tier === 'pro');
  const adminGrantedStatus = await call('/billing/me', { token });
  check('admin-assigned plan is the effective entitlement', adminGrantedStatus.data?.plan?.tier === 'pro');

  const assignedFree = await call(`/admin/members/${userId}/plan`, {
    method: 'PATCH', token: adminToken, body: { planId: freePlan?._id },
  });
  check('admin can change the member back to Free', assignedFree.status === 200 && assignedFree.data?.plan?.tier === 'free');

  const forbidden = await call('/admin/plans/pro', { method: 'PATCH', token, body: { priceCents: 1 } });
  check('members cannot edit plans', forbidden.status === 403, `status ${forbidden.status}`);

  const freeDisable = await call('/admin/plans/free', { method: 'PATCH', token: adminToken, body: { isActive: false } });
  check('admin cannot disable Free', freeDisable.status === 400, `status ${freeDisable.status}`);

  try {
    await call('/admin/plans/free', { method: 'PATCH', token: adminToken, body: { generationLimit: 1 } });
    await call('/admin/plans/pro', { method: 'PATCH', token: adminToken, body: { priceCents: 1099, generationLimit: 31 } });

    const status0 = await call('/billing/me', { token });
    check('new member starts on Free', status0.status === 200 && status0.data?.plan?.tier === 'free');
    check('CMS Free limit applies immediately', status0.data?.limit === 1 && status0.data?.remaining === 1, JSON.stringify(status0.data));
    check('Stripe configuration is reported without exposing secrets', status0.data?.paymentsConfigured === true && !JSON.stringify(status0.data).includes('whsec_'));

    const types = await call('/clothing-types');
    const type = types.data?.find((row) => row.slug === 't-shirt') || types.data?.[0];
    const itemImage = await upload(token, await swatch('#d8cdbb'), 'billing-item.png');
    const personImage = await upload(token, await swatch('#c39a7b'), 'billing-person.png');
    const item = await call('/wardrobe', { method: 'POST', token, body: { name: 'Billing tee', typeId: type?._id, imageUrl: itemImage.data?.url } });
    const photo = await call('/photos', { method: 'POST', token, body: { label: 'Billing photo', imageUrl: personImage.data?.url } });
    check('billing fixtures are created', item.status === 201 && photo.status === 201);

    const first = await call('/looks/generate', { method: 'POST', token, body: { itemIds: [item.data?._id], photoId: photo.data?._id } });
    check('first Free generation succeeds', first.status === 201, `status ${first.status}`);
    const capped = await call('/looks/generate', { method: 'POST', token, body: { itemIds: [item.data?._id], photoId: photo.data?._id } });
    check('quota blocks the next generation', capped.status === 403 && capped.data?.code === 'GENERATION_LIMIT_REACHED', JSON.stringify(capped.data));

    await call('/admin/plans/free', { method: 'PATCH', token: adminToken, body: { generationLimit: 2 } });
    await fetch(`${OPENAI_STUB}/__fail`).catch(() => null);
    const failed = await call('/looks/generate', { method: 'POST', token, body: { itemIds: [item.data?._id], photoId: photo.data?._id } });
    check('provider failure is surfaced', failed.status >= 500, `status ${failed.status}`);
    await fetch(`${OPENAI_STUB}/__ok`).catch(() => null);
    const afterFailure = await call('/billing/me', { token });
    check('failed generation refunds its reserved credit', afterFailure.data?.used === 1 && afterFailure.data?.remaining === 1, JSON.stringify(afterFailure.data));

    const checkout = await call('/billing/checkout', { method: 'POST', token });
    check('Pro checkout is created', checkout.status === 201 && /checkout\/qa/.test(checkout.data?.url || ''), JSON.stringify(checkout.data));
    const stripeLast = await fetch(`${STRIPE_STUB}/__last`).then((response) => response.json());
    check('checkout price comes from CMS', stripeLast.form?.['line_items[0][price_data][unit_amount]'] === '1099', JSON.stringify(stripeLast.form));
    check('checkout has an idempotency key', /^wearit-checkout-/.test(stripeLast.idempotencyKey || ''), stripeLast.idempotencyKey);

    const now = Math.floor(Date.now() / 1000);
    const active = await webhook('customer.subscription.updated', {
      id: 'sub_qa', customer: 'cus_qa', status: 'active', cancel_at_period_end: false,
      current_period_start: now, current_period_end: now + 30 * 86400,
      metadata: { userId, planTier: 'pro' },
    });
    check('signed Stripe webhook is accepted', active.status === 201, `status ${active.status}`);
    const pro = await call('/billing/me', { token });
    check('active Stripe subscription grants Pro', pro.data?.plan?.tier === 'pro' && pro.data?.limit === 31, JSON.stringify(pro.data));

    const canceled = await webhook('customer.subscription.deleted', {
      id: 'sub_qa', customer: 'cus_qa', status: 'canceled', cancel_at_period_end: false,
      metadata: { userId, planTier: 'pro' },
    });
    check('cancellation webhook is accepted', canceled.status === 201, `status ${canceled.status}`);
    const backToFree = await call('/billing/me', { token });
    check('canceled Pro falls back to Free', backToFree.data?.plan?.tier === 'free', JSON.stringify(backToFree.data));
  } finally {
    if (adminToken) {
      await call('/admin/plans/free', { method: 'PATCH', token: adminToken, body: { priceCents: 0, generationLimit: 3, isActive: true } });
      await call('/admin/plans/pro', { method: 'PATCH', token: adminToken, body: { priceCents: 999, generationLimit: 30, isActive: true } });
    }
    await fetch(`${OPENAI_STUB}/__ok`).catch(() => null);
  }

  console.log(`\n${failures.length ? 'FAILED' : 'PASSED'} — ${passed} passed, ${failures.length} failed`);
  if (failures.length) { failures.forEach((failure) => console.log(`  - ${failure}`)); process.exit(1); }
}

run().catch((error) => { console.error(error); process.exit(1); });
