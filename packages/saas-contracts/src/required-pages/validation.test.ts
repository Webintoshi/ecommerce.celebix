import assert from 'node:assert/strict';
import test from 'node:test';
import { parseMerchantAdminRecord } from '../merchant-admin/index.ts';
import { parseMerchantContentDocument, parseSaveMerchantContentRequest } from '../merchant-content/index.ts';
import { REQUIRED_STORE_PAGES } from './index.ts';

const id = '11111111-1111-4111-8111-111111111111';
const now = '2026-10-04T12:00:00.000Z';
const values = { name: 'Hakkımızda', slug: 'hakkimizda', locale: 'tr', body: '', excerpt: null, seoTitle: null, seoDescription: null, published: false, status: 'draft' };
const record = { id, kind: 'page', name: values.name, config: { slug: values.slug, locale: values.locale, published: false }, status: 'draft', version: 1, createdAt: now, updatedAt: now };
const document = { ...values, id, kind: 'page', version: 1, publishedAt: null, createdAt: now, updatedAt: now, bodyFormat: 'normalized_html', bodyDigest: `sha256:${'a'.repeat(64)}`, origins: {} };

test('required page identity survives both read projections without changing legacy payloads', () => {
  for (const { key } of REQUIRED_STORE_PAGES) {
    assert.equal(parseMerchantAdminRecord({ ...record, requiredPageKey: key }).requiredPageKey, key);
    assert.equal(parseMerchantContentDocument({ ...document, requiredPageKey: key }).requiredPageKey, key);
  }
  assert.equal(Object.hasOwn(parseMerchantAdminRecord(record), 'requiredPageKey'), false);
  assert.equal(Object.hasOwn(parseMerchantContentDocument(document), 'requiredPageKey'), false);
});

test('only pages can carry an exact server-owned required identity', () => {
  for (const requiredPageKey of [undefined, null, '', 'about-us', {}, ['about']]) {
    assert.throws(() => parseMerchantAdminRecord({ ...record, requiredPageKey }));
    assert.throws(() => parseMerchantContentDocument({ ...document, requiredPageKey }));
  }
  assert.throws(() => parseMerchantAdminRecord({ ...record, kind: 'blog_post', requiredPageKey: 'blog' }));
  assert.throws(() => parseMerchantContentDocument({ ...document, kind: 'blog_post', requiredPageKey: 'blog' }));
});

test('a content write cannot forge required identity in its envelope or values', () => {
  const request = { draftId: id, recordId: null, expectedVersion: null, expectedBodyDigest: null, kind: 'page', bodyAction: 'replace', values, origins: {} };
  assert.throws(() => parseSaveMerchantContentRequest({ ...request, requiredPageKey: 'about' }));
  assert.throws(() => parseSaveMerchantContentRequest({ ...request, values: { ...values, requiredPageKey: 'about' } }));
  let invoked = 0;
  const payload = { ...document };
  Object.defineProperty(payload, 'requiredPageKey', { enumerable: true, get() { invoked++; return 'about'; } });
  assert.throws(() => parseMerchantContentDocument(payload));
  assert.equal(invoked, 0);
});
