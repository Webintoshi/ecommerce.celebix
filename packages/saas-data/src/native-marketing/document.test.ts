import assert from 'node:assert/strict';
import test from 'node:test';
import { parseNativeMarketingContent, parseNativeMarketingDraftContent, nativeMarketingProductIds, legacyNativeMarketingBlocks } from './document.ts';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';
const C = '33333333-3333-4333-8333-333333333333';
const legacy = { subject: 'Konu', heading: 'Başlık', body: 'Gövde\nİkinci satır', buttonLabel: 'Bak', buttonPath: '/products?q=one#new' };
const doc = (blocks: unknown[]) => ({ ...legacy, schemaVersion: 2, blocks });
test('preserves all V1 fields without conversion or trimming', () => {
  assert.deepEqual(parseNativeMarketingContent({ ...legacy, body: ' gövde\n' }), { ...legacy, body: ' gövde\n' });
  assert.deepEqual(nativeMarketingProductIds(parseNativeMarketingContent(legacy)), []);
});
test('parses exact block shapes and aggregates unique products in first occurrence order', () => {
  const value = doc([{ id: A, type: 'products', productIds: [B, A], columns: 2 }, { id: B, type: 'products', productIds: [A, C], columns: 1 }]);
  assert.deepEqual(parseNativeMarketingContent(value), value);
  assert.deepEqual(nativeMarketingProductIds(parseNativeMarketingContent(value)), [B, A, C]);
});
test('rejects unknown keys, duplicate block ids, malformed paths and colors', () => {
  const block = { id: A, type: 'button', label: 'Bak', path: '/products', color: '#123aBC', align: 'center' };
  for (const value of [ { ...legacy, schemaVersion: 1 }, doc([{ ...block, html: '<b>x</b>' }]), doc([block, block]), doc([{ ...block, color: 'red' }]), ...['//evil.test', '/a\\b', '/a b', 'https://evil.test', '/a\n', '/a%2Fb', '/a%5cb', '/a%0db', '/a%0Ab'].map(path => doc([{ ...block, path }])) ]) assert.throws(() => parseNativeMarketingContent(value));
});
test('retains incomplete drafts but strict submission rejects placeholders and blank visible text', () => {
  const value = doc([{ id: A, type: 'image', assetId: '', alt: '', linkPath: '' }, { id: B, type: 'products', productIds: [], columns: 2 }, { id: C, type: 'text', text: '', align: 'left', color: '#292524' }]);
  assert.deepEqual(parseNativeMarketingDraftContent(value), value);
  assert.throws(() => parseNativeMarketingContent(value));
  assert.throws(() => parseNativeMarketingDraftContent(doc([{ id: A, type: 'image', assetId: 'bad-id', alt: '', linkPath: '' }])));
});
test('bounds the document by UTF8 bytes, twenty blocks and eight distinct products', () => {
  assert.throws(() => parseNativeMarketingContent({ ...doc([{ id: A, type: 'text', text: '界'.repeat(4000), align: 'left', color: '#292524' }]), body: 'x'.repeat(1000) }));
  const ids = Array.from({ length: 21 }, (_, i) => `11111111-1111-4111-8111-${String(i).padStart(12, '0')}`);
  assert.throws(() => parseNativeMarketingContent(doc(ids.map(id => ({ id, type: 'spacer', height: 8 })))));
  assert.throws(() => parseNativeMarketingContent(doc([{ id: A, type: 'products', productIds: ids.slice(0, 9), columns: 1 }])));
});
test('explicit legacy conversion creates editable blocks with caller supplied ids', () => {
  const ids = [A, B, C];
  assert.deepEqual(legacyNativeMarketingBlocks(legacy, () => ids.shift()!), [
    { id: A, type: 'heading', text: 'Başlık', align: 'left', color: '#292524', size: 'large' },
    { id: B, type: 'text', text: 'Gövde\nİkinci satır', align: 'left', color: '#292524' },
    { id: C, type: 'button', label: 'Bak', path: '/products?q=one#new', color: '#292524', align: 'left' },
  ]);
});
test('draft recovery keeps every block scalar while rejecting missing keys and unsafe structure', () => {
  const blocks = [
    { id: A, type: 'image_text', assetId: '', alt: '', heading: '', text: '', buttonLabel: '', buttonPath: '', imagePosition: 'left' },
    { id: B, type: 'banner', heading: '', text: '', backgroundColor: '#aABBcc', textColor: '#112233' },
    { id: C, type: 'heading', text: '', align: 'right', color: '#000000', size: 'medium' },
  ];
  assert.deepEqual(parseNativeMarketingDraftContent(doc(blocks)), doc(blocks));
  const { imagePosition: _position, ...missing } = blocks[0]!;
  assert.throws(() => parseNativeMarketingDraftContent(doc([missing])));
  assert.throws(() => parseNativeMarketingDraftContent(doc([{ ...blocks[1], text: '\u0085' }])));
  assert.throws(() => parseNativeMarketingDraftContent(doc([{ id: A, type: 'products', productIds: [B, B], columns: 1 }])));
  assert.throws(() => parseNativeMarketingDraftContent(doc([{ id: 'AAAAAAAA-1111-4111-8111-111111111111', type: 'spacer', height: 8 }])));
});

test('unfinished link edits survive draft recovery until strict submission', () => {
  for (const path of ['products', '/my path', 'https://example.test', '//unfinished']) {
    const value = doc([{ id: A, type: 'button', label: 'Bak', path, color: '#292524', align: 'left' }]);
    assert.deepEqual(parseNativeMarketingDraftContent(value), value);
    assert.throws(() => parseNativeMarketingContent(value));
  }
  assert.throws(() => parseNativeMarketingDraftContent(doc([{ id: A, type: 'button', label: 'Bak', path: '/x\n', color: '#292524', align: 'left' }])));
});
