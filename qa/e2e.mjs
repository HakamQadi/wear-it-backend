/**
 * End-to-end contract check for the Wear It virtual-closet API.
 *
 *   1. start a Mongo the API can reach
 *   2. node qa/openai-stub.mjs &
 *   3. MONGODB_URI=... PORT=4100 OPENAI_API_KEY=stub OPENAI_BASE_URL=http://127.0.0.1:4999/v1 node dist/main.js &
 *   4. API_URL=http://localhost:4100/api node qa/e2e.mjs
 */
import { existsSync } from 'fs';
import { join } from 'path';
import sharp from 'sharp';

const API = process.env.API_URL || 'http://localhost:4100/api';
const UPLOADS = join(process.cwd(), process.env.UPLOADS_DIR || 'uploads');
const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@wearit.local', password: process.env.ADMIN_PASSWORD || 'WearIt123!' };

let passed = 0;
const failures = [];

function check(name, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ''}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

async function call(path, { method = 'GET', body, token, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${API}${path}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  return { status: response.status, data };
}

function messageOf(data) {
  const message = data?.message;
  return Array.isArray(message) ? message.join(', ') : String(message ?? '');
}

async function swatch(hex) {
  return sharp({ create: { width: 64, height: 96, channels: 3, background: hex } }).png().toBuffer();
}

async function upload(token, buffer, filename) {
  const form = new FormData();
  form.append('file', new Blob([buffer], { type: 'image/png' }), filename);
  const response = await fetch(`${API}/uploads/image`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return { status: response.status, data: await response.json().catch(() => null) };
}

const stamp = Date.now().toString(36);
const userA = { name: 'QA Member A', email: `qa-a-${stamp}@wearit.test`, password: 'WearItQA123!' };
const userB = { name: 'QA Member B', email: `qa-b-${stamp}@wearit.test`, password: 'WearItQA123!' };

async function run() {
  section('Health');
  const health = await call('/health');
  check('GET /health returns ok', health.status === 200 && health.data?.status === 'ok', `status ${health.status}`);

  section('Accounts');
  const registerA = await call('/auth/register', { method: 'POST', body: userA });
  check('member A can register', registerA.status === 201 && Boolean(registerA.data?.accessToken), `status ${registerA.status}`);
  check('registration returns the user role', registerA.data?.user?.role === 'user', `role ${registerA.data?.user?.role}`);
  const tokenA = registerA.data?.accessToken;

  const duplicate = await call('/auth/register', { method: 'POST', body: userA });
  check('duplicate email is rejected', duplicate.status === 409, `status ${duplicate.status}`);
  check('the duplicate is coded for translation', duplicate.data?.code === 'EMAIL_TAKEN', duplicate.data?.code);

  const weak = await call('/auth/register', { method: 'POST', body: { ...userB, password: 'short' } });
  check('short password is rejected', weak.status === 400, `status ${weak.status}`);

  const registerB = await call('/auth/register', { method: 'POST', body: userB });
  const tokenB = registerB.data?.accessToken;
  check('member B can register', registerB.status === 201 && Boolean(tokenB), `status ${registerB.status}`);

  const badLogin = await call('/auth/login', { method: 'POST', body: { email: userA.email, password: 'WrongPass1!' } });
  check('wrong password is rejected', badLogin.status === 401, `status ${badLogin.status}`);
  check('the rejection is coded for translation', badLogin.data?.code === 'INVALID_CREDENTIALS', badLogin.data?.code);

  const meA = await call('/auth/me', { token: tokenA });
  check('GET /auth/me reports the real role', meA.status === 200 && meA.data?.role === 'user', JSON.stringify(meA.data));

  const adminLogin = await call('/auth/login', { method: 'POST', body: ADMIN });
  const adminToken = adminLogin.data?.accessToken;
  check('admin can sign in', adminLogin.status === 200 && Boolean(adminToken), `status ${adminLogin.status}`);
  const meAdmin = await call('/auth/me', { token: adminToken });
  check('admin session reports the admin role', meAdmin.data?.role === 'admin', JSON.stringify(meAdmin.data));

  section('Authorisation');
  check('anonymous wardrobe read is blocked', (await call('/wardrobe')).status === 401);
  check('anonymous photo read is blocked', (await call('/photos')).status === 401);
  check('anonymous look read is blocked', (await call('/looks')).status === 401);
  check('anonymous upload is blocked', (await call('/uploads/image', { method: 'POST' })).status === 401);

  const memberCreatesType = await call('/clothing-types', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Sneaky', slug: 'sneaky' },
  });
  check('member cannot create a clothing type', memberCreatesType.status === 403, `status ${memberCreatesType.status}`);
  check('member cannot list all clothing types', (await call('/clothing-types/admin/all', { token: tokenA })).status === 403);
  check('member cannot edit site content', (await call('/content', { method: 'PATCH', token: tokenA, body: { brandName: 'Hacked' } })).status === 403);
  check('member cannot read admin stats', (await call('/admin/stats', { token: tokenA })).status === 403);
  check('admin can read admin stats', (await call('/admin/stats', { token: adminToken })).status === 200);

  section('Clothing types (CMS)');
  const publicTypes = await call('/clothing-types');
  check('public type list is available', publicTypes.status === 200 && publicTypes.data.length > 0, `count ${publicTypes.data?.length}`);
  const typeOf = (slug) => publicTypes.data.find((type) => type.slug === slug);
  const tshirt = typeOf('t-shirt');
  const pants = typeOf('pants');
  const jacket = typeOf('jacket');
  check('seeded types include t-shirt, pants and jacket', Boolean(tshirt && pants && jacket));

  const created = await call('/clothing-types', {
    method: 'POST',
    token: adminToken,
    body: {
      name: `QA Cape ${stamp}`,
      nameAr: `عباءة ${stamp}`,
      slug: `qa-cape-${stamp}`,
      description: 'Temporary QA type',
      sortOrder: 200,
    },
  });
  check('admin can create a clothing type', created.status === 201, `status ${created.status}`);
  check('a clothing type keeps its Arabic name', created.data?.nameAr === `عباءة ${stamp}`, created.data?.nameAr);
  const capeId = created.data?._id;

  check(
    'seeded clothing types carry Arabic names',
    publicTypes.data.every((type) => typeof type.nameAr === 'string' && type.nameAr.length > 0),
    JSON.stringify(publicTypes.data.slice(0, 2).map((type) => [type.slug, type.nameAr])),
  );

  const noArabic = await call('/clothing-types', {
    method: 'POST',
    token: adminToken,
    body: { name: 'No Arabic', slug: `no-arabic-${stamp}` },
  });
  check('a new clothing type cannot be created without an Arabic name', noArabic.status === 400, `status ${noArabic.status}`);
  check(
    'the rejection names the missing field',
    /nameAr/.test(messageOf(noArabic.data)),
    messageOf(noArabic.data),
  );

  const badSlug = await call('/clothing-types', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Bad Slug', nameAr: 'معرّف خاطئ', slug: 'Not A Slug' },
  });
  check('invalid slug is rejected', badSlug.status === 400, `status ${badSlug.status}`);

  const dupSlug = await call('/clothing-types', {
    method: 'POST',
    token: adminToken,
    body: { name: 'Another', nameAr: 'أخرى', slug: `qa-cape-${stamp}` },
  });
  check('duplicate slug is rejected', dupSlug.status === 409, `status ${dupSlug.status}`);

  const hidden = await call(`/clothing-types/${capeId}`, { method: 'PATCH', token: adminToken, body: { isActive: false } });
  check('admin can hide a clothing type', hidden.status === 200 && hidden.data?.isActive === false);
  check('hidden type disappears from the public list', !(await call('/clothing-types')).data.some((type) => type._id === capeId));
  await call(`/clothing-types/${capeId}`, { method: 'PATCH', token: adminToken, body: { isActive: true } });

  section('Wardrobe');
  const teeUpload = await upload(tokenA, await swatch('#d8cdbb'), 'tee.png');
  check('member can upload an item photo', teeUpload.status === 201 && /^\/uploads\//.test(teeUpload.data?.url), JSON.stringify(teeUpload.data));
  const pantsUpload = await upload(tokenA, await swatch('#2f3a44'), 'pants.png');
  const jacketUpload = await upload(tokenA, await swatch('#1d2b22'), 'jacket.png');
  const tee2Upload = await upload(tokenA, await swatch('#ffffff'), 'tee2.png');
  const personUpload = await upload(tokenA, await swatch('#c39a7b'), 'me.png');

  const badMime = new FormData();
  badMime.append('file', new Blob([Buffer.from('not an image')], { type: 'text/plain' }), 'evil.txt');
  const badMimeResponse = await fetch(`${API}/uploads/image`, { method: 'POST', headers: { Authorization: `Bearer ${tokenA}` }, body: badMime });
  check('non-image upload is rejected', badMimeResponse.status === 400, `status ${badMimeResponse.status}`);

  section('Adding an item from a link');
  const STUB = 'http://127.0.0.1:4999';
  const importImage = (body, token = tokenA) => call('/uploads/from-url', { method: 'POST', token, body });

  check('importing without a session is blocked', (await call('/uploads/from-url', { method: 'POST', body: { url: `${STUB}/__image.png` } })).status === 401);

  const imported = await importImage({ url: `${STUB}/__image.png` });
  check('a linked image is imported', imported.status === 201, JSON.stringify(imported.data));
  check('the import is stored as a normal upload', /^\/uploads\/[0-9a-f-]{36}\.png$/.test(imported.data?.url || ''), imported.data?.url);
  check('the imported file exists on disk', existsSync(join(UPLOADS, (imported.data?.url || '').split('/').pop() || 'missing')));

  const redirected = await importImage({ url: `${STUB}/__redirect` });
  check('an import follows a redirect to the image', redirected.status === 201, `status ${redirected.status}`);

  for (const [label, url] of [
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['a private network address', 'http://10.0.0.1/logo.png'],
    ['a bracketed IPv6 private address', 'http://[fd00::1]/logo.png'],
    ['a redirect onto an internal address', `${STUB}/__redirect-internal`],
  ]) {
    const blocked = await importImage({ url });
    check(`importing from ${label} is refused`, blocked.status === 400, `status ${blocked.status}`);
      check(`the refusal for ${label} names the reason`, /private or internal address/.test(messageOf(blocked.data)), messageOf(blocked.data));
    check(`the refusal for ${label} is coded`, blocked.data?.code === 'IMPORT_BLOCKED_HOST', blocked.data?.code);
  }

  for (const [label, url] of [
    ['a file:// path', 'file:///etc/passwd'],
    ['an ftp link', 'ftp://example.com/logo.png'],
    ['a link with credentials', 'https://user:secret@example.com/logo.png'],
    ['nonsense', 'this is not a url'],
  ]) {
    check(`importing ${label} is refused`, (await importImage({ url })).status === 400);
  }

  check('importing a page that is not an image is refused', (await importImage({ url: `${STUB}/__notimage` })).status === 400);
  check('an empty link is refused', (await importImage({ url: '' })).status === 400);

  const importedItem = await call('/wardrobe', {
    method: 'POST',
    token: tokenA,
    body: { name: 'Linked shirt', typeId: typeOf('shirt')._id, imageUrl: imported.data.url },
  });
  check('an imported image can be used for a wardrobe item', importedItem.status === 201, JSON.stringify(importedItem.data).slice(0, 200));
  await call(`/wardrobe/${importedItem.data._id}`, { method: 'DELETE', token: tokenA });
  check('deleting that item removes the imported file', !existsSync(join(UPLOADS, imported.data.url.split('/').pop())));

  const remoteImage = await call('/wardrobe', {
    method: 'POST',
    token: tokenA,
    body: { name: 'SSRF probe', typeId: tshirt._id, imageUrl: 'http://169.254.169.254/latest/meta-data/' },
  });
  check('a raw remote URL is still rejected as an item image', remoteImage.status === 400, `status ${remoteImage.status}`);

  const newItem = (name, typeId, url) => call('/wardrobe', { method: 'POST', token: tokenA, body: { name, typeId, imageUrl: url } });
  const itemTee = await newItem('Sand tee', tshirt._id, teeUpload.data.url);
  check('member can add a wardrobe item', itemTee.status === 201, JSON.stringify(itemTee.data).slice(0, 200));
  check('item response carries the populated clothing type', itemTee.data?.typeId?.name === 'T-shirt', JSON.stringify(itemTee.data?.typeId));
  const itemPants = (await newItem('Navy pants', pants._id, pantsUpload.data.url)).data;
  const itemJacket = (await newItem('Green jacket', jacket._id, jacketUpload.data.url)).data;
  const itemTee2 = (await newItem('White tee', tshirt._id, tee2Upload.data.url)).data;

  const unknownType = await newItem('Ghost', '000000000000000000000000', teeUpload.data.url);
  check('unknown clothing type is rejected', unknownType.status === 404, `status ${unknownType.status}`);

  const listA = await call('/wardrobe', { token: tokenA });
  check('closet lists exactly the member items', listA.data?.length === 4, `count ${listA.data?.length}`);
  const filtered = await call(`/wardrobe?typeId=${tshirt._id}`, { token: tokenA });
  check('closet can filter by clothing type', filtered.data?.length === 2, `count ${filtered.data?.length}`);
  const searched = await call('/wardrobe?search=navy', { token: tokenA });
  check('closet search matches item names', searched.data?.length === 1, `count ${searched.data?.length}`);

  section('Ownership isolation');
  check("member B cannot read member A's closet", (await call('/wardrobe', { token: tokenB })).data?.length === 0);
  check("member B cannot open member A's item", (await call(`/wardrobe/${itemTee.data._id}`, { token: tokenB })).status === 404);
  check("member B cannot edit member A's item", (await call(`/wardrobe/${itemTee.data._id}`, { method: 'PATCH', token: tokenB, body: { name: 'Stolen' } })).status === 404);
  check("member B cannot delete member A's item", (await call(`/wardrobe/${itemTee.data._id}`, { method: 'DELETE', token: tokenB })).status === 404);

  section('Personal photos');
  const photo = await call('/photos', { method: 'POST', token: tokenA, body: { imageUrl: personUpload.data.url, label: 'Full length' } });
  check('member can save a personal photo', photo.status === 201, JSON.stringify(photo.data).slice(0, 200));
  check('first photo becomes the default', photo.data?.isDefault === true);
  const photoId = photo.data?._id;
  check("member B cannot use member A's photo", (await call(`/photos/${photoId}`, { method: 'PATCH', token: tokenB, body: { label: 'x' } })).status === 404);

  section('Look generation');
  const status = await call('/looks/status', { token: tokenA });
  check('studio can read the AI configuration flag', status.status === 200 && status.data?.aiConfigured === true, JSON.stringify(status.data));

  const sameType = await call('/looks/generate', {
    method: 'POST',
    token: tokenA,
    body: { itemIds: [itemTee.data._id, itemTee2._id], photoId },
  });
  check('two items of the same type are rejected', sameType.status === 400, `status ${sameType.status}`);
  check('the rejection names the clashing type', /only include one T-shirt/.test(messageOf(sameType.data)), messageOf(sameType.data));
  check('the rejection carries a code a client can translate', sameType.data?.code === 'ITEM_TYPE_CLASH', sameType.data?.code);
  check(
    'the rejection carries the values a translated sentence needs',
    sameType.data?.params?.type === 'T-shirt' && sameType.data?.params?.count === 2,
    JSON.stringify(sameType.data?.params),
  );

  const duplicateItem = await call('/looks/generate', {
    method: 'POST',
    token: tokenA,
    body: { itemIds: [itemTee.data._id, itemTee.data._id], photoId },
  });
  check('the same item twice is rejected', duplicateItem.status === 400, `status ${duplicateItem.status}`);

  const foreignItem = await call('/looks/generate', {
    method: 'POST',
    token: tokenB,
    body: { itemIds: [itemTee.data._id], photoId },
  });
  check("member B cannot build a look from member A's items", foreignItem.status === 404, `status ${foreignItem.status}`);

  const noItems = await call('/looks/generate', { method: 'POST', token: tokenA, body: { itemIds: [], photoId } });
  check('an empty outfit is rejected', noItems.status === 400, `status ${noItems.status}`);

  const tooMany = await call('/looks/generate', {
    method: 'POST',
    token: tokenA,
    body: { itemIds: Array.from({ length: 9 }, () => itemTee.data._id), photoId },
  });
  check('more than eight items is rejected', tooMany.status === 400, `status ${tooMany.status}`);

  const unknownPhoto = await call('/looks/generate', {
    method: 'POST',
    token: tokenA,
    body: { itemIds: [itemTee.data._id], photoId: '000000000000000000000000' },
  });
  check('an unknown photo is rejected', unknownPhoto.status === 404, `status ${unknownPhoto.status}`);

  const look = await call('/looks/generate', {
    method: 'POST',
    token: tokenA,
    body: { itemIds: [itemJacket._id, itemTee.data._id, itemPants._id], photoId, prompt: 'Keep my background.' },
  });
  check('a three-type outfit generates a look', look.status === 201, JSON.stringify(look.data).slice(0, 300));
  check('the look is marked ready', look.data?.status === 'ready', look.data?.status);
  check('the look stores a result image', /^\/uploads\/look-/.test(look.data?.resultImageUrl || ''), look.data?.resultImageUrl);
  check('the result file exists on disk', existsSync(join(UPLOADS, (look.data?.resultImageUrl || '').split('/').pop() || 'missing')));
  check('the look snapshots all three garments', look.data?.items?.length === 3, `count ${look.data?.items?.length}`);
  check(
    'the look snapshots the Arabic type label too',
    look.data?.items?.every((entry) => /[\u0600-\u06FF]/.test(entry.typeNameAr || '')),
    JSON.stringify(look.data?.items?.map((entry) => entry.typeNameAr)),
  );
  const parts = await fetch('http://127.0.0.1:4999/__parts').then((response) => response.json()).catch(() => null);
  check(
    'the person photo and all three garments reach the image API as separate parts',
    parts?.lastImageParts === 4,
    `parts ${parts?.lastImageParts}`,
  );
  check(
    'garments are layered base-first',
    JSON.stringify(look.data?.items?.map((entry) => entry.typeName)) === JSON.stringify(['T-shirt', 'Pants', 'Jacket']),
    JSON.stringify(look.data?.items?.map((entry) => entry.typeName)),
  );

  check("member B cannot open member A's look", (await call(`/looks/${look.data._id}`, { token: tokenB })).status === 404);
  check("member B's look gallery stays empty", (await call('/looks', { token: tokenB })).data?.length === 0);

  section('Failure handling');
  await fetch('http://127.0.0.1:4999/__fail').catch(() => null);
  const failedLook = await call('/looks/generate', { method: 'POST', token: tokenA, body: { itemIds: [itemTee.data._id], photoId } });
  check('a provider failure surfaces as an error', failedLook.status >= 500, `status ${failedLook.status}`);
  const gallery = await call('/looks', { token: tokenA });
  const failedEntry = gallery.data?.find((entry) => entry.status === 'failed');
  check('the failed attempt is recorded in the gallery', Boolean(failedEntry));
  check('the failed attempt keeps the reason', Boolean(failedEntry?.errorMessage), failedEntry?.errorMessage);
  await fetch('http://127.0.0.1:4999/__ok').catch(() => null);

  section('Deleting a wardrobe item keeps its looks');
  await call(`/wardrobe/${itemTee2._id}`, { method: 'DELETE', token: tokenA });
  const teeFile = join(UPLOADS, tee2Upload.data.url.split('/').pop());
  check('the unused item photo is removed from disk', !existsSync(teeFile));
  await call(`/wardrobe/${itemJacket._id}`, { method: 'DELETE', token: tokenA });
  const afterDelete = await call(`/looks/${look.data._id}`, { token: tokenA });
  check('an existing look survives deleting one of its items', afterDelete.status === 200 && afterDelete.data.items.length === 3);
  const jacketFile = join(UPLOADS, jacketUpload.data.url.split('/').pop());
  check('an image still referenced by a look is kept on disk', existsSync(jacketFile));

  section('Clothing type deletion rules');
  const inUse = await call(`/clothing-types/${tshirt._id}`, { method: 'DELETE', token: adminToken });
  check('a clothing type still in use cannot be deleted', inUse.status === 400, `status ${inUse.status}`);
  check('the refusal explains why', /wardrobe item/.test(messageOf(inUse.data)), messageOf(inUse.data));
  check('the refusal is coded', inUse.data?.code === 'TYPE_IN_USE', inUse.data?.code);
  const unusedDelete = await call(`/clothing-types/${capeId}`, { method: 'DELETE', token: adminToken });
  check('an unused clothing type can be deleted', unusedDelete.status === 200, `status ${unusedDelete.status}`);

  section('Content CMS (bilingual)');
  const publicContent = await call('/content');
  check(
    'every content field is returned in both languages',
    ['brandName', 'heroTitle', 'heroSubtitle', 'heroCta', 'announcement', 'footerText'].every(
      (field) => typeof publicContent.data?.[field]?.ar === 'string' && typeof publicContent.data?.[field]?.en === 'string',
    ),
    JSON.stringify(publicContent.data?.heroTitle),
  );
  check(
    'the default Arabic copy is Arabic',
    /[\u0600-\u06FF]/.test(publicContent.data?.heroTitle?.ar || ''),
    publicContent.data?.heroTitle?.ar,
  );

  const contentUpdate = await call('/content', {
    method: 'PATCH',
    token: adminToken,
    body: { announcement: { ar: `عربي ${stamp}`, en: `QA ${stamp}` } },
  });
  check('admin can update both languages at once', contentUpdate.status === 200, `status ${contentUpdate.status}`);
  check('the Arabic copy is stored', contentUpdate.data?.announcement?.ar === `عربي ${stamp}`);
  check('the English copy is stored', contentUpdate.data?.announcement?.en === `QA ${stamp}`);

  const arabicOnly = await call('/content', {
    method: 'PATCH',
    token: adminToken,
    body: { announcement: { ar: `عربي فقط ${stamp}` } },
  });
  check('saving one language leaves the other intact', arabicOnly.data?.announcement?.en === `QA ${stamp}`, JSON.stringify(arabicOnly.data?.announcement));

  const rejected = await call('/content', { method: 'PATCH', token: adminToken, body: { announcement: 'a bare string' } });
  check('a bare string is rejected in place of a language pair', rejected.status === 400, `status ${rejected.status}`);

  check('content is publicly readable', (await call('/content')).data?.announcement?.ar === `عربي فقط ${stamp}`);

  section('Admin reporting');
  const stats = await call('/admin/stats', { token: adminToken });
  check('stats count members', stats.data?.members >= 2, JSON.stringify(stats.data));
  check('stats count looks', stats.data?.looks >= 2, JSON.stringify(stats.data));
  const usage = await call('/admin/type-usage', { token: adminToken });
  check('type usage reports item counts', usage.data?.some((row) => row.slug === 't-shirt' && row.itemCount >= 1));
  const members = await call('/admin/members', { token: adminToken });
  check('member list includes per-member counts', members.data?.some((row) => row.email === userA.email && row.lookCount >= 1));

  section('Cleanup of personal media');
  const lookFile = join(UPLOADS, look.data.resultImageUrl.split('/').pop());
  await call(`/looks/${look.data._id}`, { method: 'DELETE', token: tokenA });
  check('deleting a look removes the generated image', !existsSync(lookFile));
  const personFile = join(UPLOADS, personUpload.data.url.split('/').pop());
  await call(`/photos/${photoId}`, { method: 'DELETE', token: tokenA });
  check('a photo still referenced by a look is kept on disk', existsSync(personFile));

  for (const entry of (await call('/looks', { token: tokenA })).data || []) {
    await call(`/looks/${entry._id}`, { method: 'DELETE', token: tokenA });
  }
  const orphanPhoto = await upload(tokenA, await swatch('#b08968'), 'orphan.png');
  const savedOrphan = await call('/photos', { method: 'POST', token: tokenA, body: { imageUrl: orphanPhoto.data.url } });
  await call(`/photos/${savedOrphan.data._id}`, { method: 'DELETE', token: tokenA });
  check('deleting an unused personal photo removes the file', !existsSync(join(UPLOADS, orphanPhoto.data.url.split('/').pop())));

  console.log(`\n${failures.length ? 'FAILED' : 'PASSED'} — ${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    failures.forEach((failure) => console.log(`  - ${failure}`));
    process.exit(1);
  }
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
