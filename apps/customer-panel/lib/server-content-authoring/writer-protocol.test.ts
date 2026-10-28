import assert from 'node:assert/strict';
import test from 'node:test';
import type { ContentAuthoringDraft, ContentAuthoringField, ProductFact, ProductFactPacket } from '../../../../packages/saas-contracts/src/content-authoring/types.ts';
import { validateProductDraftOutput } from '../../../../packages/saas-contracts/src/content-authoring/validation.ts';
import { assertAutomaticSourcePreserved, attachAutomaticProductSource } from './automatic-source.ts';
import { renderContentAuthoringDescription } from './render.ts';
import { assertToshiGeneratedLimits } from './toshi-policy.ts';
import { createProductWriterProtocol, withProductFormattingFacts } from './writer-protocol.ts';

const fact = (ref: string, field: string, value: string, extra: Partial<ProductFact> = {}): ProductFact =>
  ({ ref, field, value, source: 'current_draft', scope: 'product', ...extra });
const base: ProductFactPacket = {
  title: 'Burgu Bileklik',
  sourceFingerprint: 'b'.repeat(64),
  facts: [fact('product:title:0', 'title', 'Burgu Bileklik'), fact('product:material:1', 'Malzeme', 'Çelik'), fact('product:weight:2', 'weight', '14.89', { unit: 'g' })],
};
const nonce = 'a'.repeat(32);
const selected = ['description', 'seoTitle', 'seoDescription'] as const;

function protocol(packet = base, fields: readonly ContentAuthoringField[] = ['description']) {
  const enriched = withProductFormattingFacts(packet);
  return { packet: enriched, writer: createProductWriterProtocol({ packet: enriched, fields, nonce }) };
}
function accepted(value: unknown, packet: ProductFactPacket, fields: readonly ContentAuthoringField[]): ContentAuthoringDraft {
  const draft = validateProductDraftOutput(value, packet, fields);
  assertToshiGeneratedLimits(draft);
  assertAutomaticSourcePreserved(draft, packet);
  return draft;
}
function descriptionFacts(draft: ContentAuthoringDraft) {
  return (draft.description ?? []).flatMap(block => block.type === 'paragraph' || block.type === 'heading' ? block.children : block.type === 'list' ? block.items.flat() : block.rows.flat(2)).filter(node => node.type === 'fact');
}

test('formatting aliases are exact, deterministic, idempotent and bound to the server packet', () => {
  const enriched = withProductFormattingFacts(base);
  assert.deepEqual(withProductFormattingFacts(base), enriched);
  assert.deepEqual(withProductFormattingFacts(enriched), enriched);
  assert.notEqual(enriched.sourceFingerprint, base.sourceFingerprint);
  for (const source of base.facts) {
    assert.deepEqual(enriched.facts.find(node => node.ref === `format:bold:${source.ref}`), { ...source, ref: `format:bold:${source.ref}` });
  }
  assert.equal(new Set(enriched.facts.map(node => node.ref)).size, enriched.facts.length);
  assert.notEqual(withProductFormattingFacts({ ...base, sourceFingerprint: 'c'.repeat(64) }).sourceFingerprint, enriched.sourceFingerprint);
  assert.deepEqual(base.facts.map(node => node.ref), ['product:title:0', 'product:material:1', 'product:weight:2']);
});

test('merchant prose, preserved source and existing aliases never become formatting seeds', () => {
  const packet = { ...base, facts: [...base.facts, fact('product:existing:0', 'merchantDescription', 'Tolerans %5.'), fact('source:closed:0', 'source', 'Eski kaynak.'), fact('product:merchant:9', 'merchantDescription', 'Açıklama.')] };
  const enriched = withProductFormattingFacts(packet);
  assert.ok(!enriched.facts.some(node => node.ref.startsWith('format:bold:format:bold:')));
  for (const ref of ['product:existing:0', 'source:closed:0', 'product:merchant:9']) assert.ok(!enriched.facts.some(node => node.ref === `format:bold:${ref}`));
  assert.throws(() => withProductFormattingFacts({ ...packet, facts: [...packet.facts, fact('format:bold:foreign', 'material', 'Altın')] }));
});

test('writer context supplies readable attributes and variants without internal evidence bookkeeping', () => {
  const variantPacket = { ...base, facts: [...base.facts, fact('variant:draft-0:title:3', 'title', 'Küçük', { scope: 'variant', variantId: 'draft-0' }), fact('variant:draft-0:weight:4', 'weight', '2.2', { scope: 'variant', variantId: 'draft-0', unit: 'g' })] };
  const { writer } = protocol(variantPacket);
  assert.equal(writer.context.productName, base.title);
  assert.ok(writer.context.attributes.some(attribute => attribute.value === 'Çelik'));
  assert.ok(writer.context.attributes.some(attribute => attribute.value === '14.89' && attribute.unit === 'g'));
  assert.equal(writer.context.variants.length, 1);
  assert.equal(writer.context.variants[0].name, 'Küçük');
  assert.ok(writer.context.variants[0].attributes.some(attribute => attribute.value === '2.2' && attribute.unit === 'g'));
  const visible = JSON.stringify(writer.context);
  for (const secret of ['product:title:0', 'variant:draft-0:', 'format:bold:', 'sourceFingerprint', base.sourceFingerprint, 'factRef']) assert.ok(!visible.includes(secret), secret);
  assert.equal(writer.context.attributes.filter(attribute => attribute.value === 'Çelik').length, 1);
});

test('plain selected JSON becomes validated structured content with server generated evidence', () => {
  const { packet, writer } = protocol(base, selected);
  const draft = accepted(writer.decode({ descriptionMarkdown: '## Ürün bilgileri\n\n**burgu bileklik** ile **ÇELİK** görünüm.\n\nAğırlık: **14.89 g**.', seoTitle: 'Burgu Bileklik', seoDescription: 'Çelik Burgu Bileklik, 14.89 g.' }), packet, selected);
  assert.deepEqual(draft.suggestions, []);
  assert.equal(draft.sourceFingerprint, packet.sourceFingerprint);
  assert.equal(draft.description?.[0].type, 'heading');
  assert.ok(descriptionFacts(draft).some(node => node.factRef === 'format:bold:product:title:0' && node.value === 'Burgu Bileklik'));
  assert.ok(descriptionFacts(draft).some(node => node.factRef === 'format:bold:product:material:1' && node.value === 'Çelik'));
  assert.ok(descriptionFacts(draft).some(node => node.factRef === 'format:bold:product:weight:2' && node.value === '14.89' && node.unit === 'g'));
  assert.ok(draft.claims.length > 0);
  for (const claim of draft.claims) {
    const source = packet.facts.find(node => node.ref === claim.factRef);
    assert.ok(source);
    assert.equal(claim.value, source.value);
    assert.equal(claim.unit, source.unit);
    assert.ok(selected.includes(claim.field));
  }
  assert.equal(Object.hasOwn(draft, 'descriptionMarkdown'), false);
  const html = renderContentAuthoringDescription(draft.description!);
  assert.ok(html.includes('<strong>Çelik</strong>'));
  assert.ok(!html.includes('**'));
});

test('unknown bold prose remains plain text and provides no evidence', () => {
  const { packet, writer } = protocol();
  const draft = accepted(writer.decode({ descriptionMarkdown: 'Zarif **günlük görünüm**.' }), packet, ['description']);
  assert.deepEqual(descriptionFacts(draft), []);
  assert.deepEqual(draft.claims, []);
  assert.equal(renderContentAuthoringDescription(draft.description!), '<p>Zarif günlük görünüm.</p>');
});

test('unit facts require a complete display before bold formatting is authorized', () => {
  const { packet, writer } = protocol();
  const bare = accepted(writer.decode({ descriptionMarkdown: 'Ağırlık: **14.89** g.' }), packet, ['description']);
  assert.ok(!descriptionFacts(bare).some(node => node.factRef.startsWith('format:bold:')));
  assert.ok(!renderContentAuthoringDescription(bare.description!).includes('<strong>'));
  const whole = accepted(writer.decode({ descriptionMarkdown: 'Ağırlık: **14.89 g**.' }), packet, ['description']);
  assert.ok(renderContentAuthoringDescription(whole.description!).includes('<strong>14.89 g</strong>'));
});

test('bold fragments never elevate foreign or qualified facts into new product authority', () => {
  const { packet, writer } = protocol();
  for (const text of ['**Altın** bileklik.', '**15 g** ağırlık.', 'Net ağırlık **14.89 g**.']) {
    assert.throws(() => accepted(writer.decode({ descriptionMarkdown: text }), packet, ['description']));
  }
});

test('variant formatting keeps the same variant qualifier requirement', () => {
  const source = { ...base, facts: [...base.facts, fact('variant:small:title:3', 'title', 'Küçük', { scope: 'variant', variantId: 'small' }), fact('variant:small:weight:4', 'weight', '2.2', { unit: 'g', scope: 'variant', variantId: 'small' })] };
  const { packet, writer } = protocol(source);
  assert.throws(() => accepted(writer.decode({ descriptionMarkdown: 'Ağırlık: **2.2 g**.' }), packet, ['description']));
  const draft = accepted(writer.decode({ descriptionMarkdown: 'Küçük varyantı ağırlığı: **2.2 g**.' }), packet, ['description']);
  assert.ok(descriptionFacts(draft).some(node => node.factRef === 'format:bold:variant:small:weight:4'));
});

test('source slots expand into original exact nodes once in source order and decode is repeatable', () => {
  const source = attachAutomaticProductSource(base, { currentDraft: { title: base.title, description: '<p>Tolerans %5 olabilir.</p><p>Suya dayanıklı değildir.</p>' } } as any);
  const { packet, writer } = protocol(source);
  assert.equal(writer.context.sourceSlots.length, 2);
  const markdown = writer.context.sourceSlots.map(slot => slot.marker).join('\n\n');
  const first = accepted(writer.decode({ descriptionMarkdown: markdown }), packet, ['description']);
  const second = accepted(writer.decode({ descriptionMarkdown: markdown }), packet, ['description']);
  assert.deepEqual(first, second);
  assert.deepEqual(descriptionFacts(first).map(node => node.factRef), ['product:existing:0', 'product:existing:1']);
  assert.deepEqual(descriptionFacts(first).map(node => node.value), ['Tolerans %5 olabilir.', 'Suya dayanıklı değildir.']);
  assert.ok(!renderContentAuthoringDescription(first.description!).includes('<strong>'));
  for (const slot of writer.context.sourceSlots) assert.ok(!JSON.stringify(first).includes(slot.marker));
});

test('missing, repeated, reordered and foreign source slots fail closed', () => {
  const source = attachAutomaticProductSource(base, { currentDraft: { title: base.title, description: '<p>İlk kaynak.</p><p>Son kaynak.</p>' } } as any);
  const { writer } = protocol(source);
  const [first, last] = writer.context.sourceSlots.map(slot => slot.marker);
  const foreign = createProductWriterProtocol({ packet: withProductFormattingFacts(source), fields: ['description'], nonce: 'f'.repeat(32) }).context.sourceSlots[0].marker;
  for (const markdown of ['Zarif görünüm.', first, `${first}\n\n${first}\n\n${last}`, `${last}\n\n${first}`, `${foreign}\n\n${last}`]) assert.throws(() => writer.decode({ descriptionMarkdown: markdown }));
});

test('plain copying of merchant prose cannot replace required exact source slots', () => {
  const source = attachAutomaticProductSource(base, { currentDraft: { title: base.title, description: '<p>Suya dayanıklı değildir.</p>' } } as any);
  const { writer } = protocol(source);
  assert.throws(() => writer.decode({ descriptionMarkdown: '**Suya dayanıklı değildir.**' }));
});

test('new writer output accepts only selected fields and cannot inject internal metadata', () => {
  const { packet, writer } = protocol(base, ['seoTitle']);
  accepted(writer.decode({ seoTitle: 'Burgu Bileklik' }), packet, ['seoTitle']);
  for (const value of [{}, { seoTitle: 'Burgu Bileklik', descriptionMarkdown: 'Ek açıklama.' }, { seoTitle: 'Burgu Bileklik', suggestions: ['Ek bilgi'] }, { seoTitle: 'Burgu Bileklik', claims: [] }, { seoTitle: 'Burgu Bileklik', sourceFingerprint: packet.sourceFingerprint }]) assert.throws(() => accepted(writer.decode(value), packet, ['seoTitle']));
});

test('JSON prototype-named extra fields cannot disappear during writer output validation', () => {
  const { packet, writer } = protocol(base, ['seoTitle']);
  for (const extra of ['null', '"ignored"', '{"injected":true}']) {
    const raw = JSON.parse(`{"seoTitle":"Burgu Bileklik","__proto__":${extra}}`);
    assert.equal(Object.hasOwn(raw, '__proto__'), true);
    assert.throws(() => writer.decode(raw));
  }
  const legacy = JSON.parse(`{"description":[{"type":"paragraph","children":[{"type":"text","text":"Zarif görünüm."}]}],"claims":[],"suggestions":[],"sourceFingerprint":"${packet.sourceFingerprint}","__proto__":null}`);
  const decoded = protocol().writer.decode(legacy) as Record<string, unknown>;
  assert.equal(Object.hasOwn(decoded, '__proto__'), true);
  assert.throws(() => accepted(decoded, packet, ['description']));
});

test('Markdown H3 headings require a preceding H2 heading', () => {
  const { packet, writer } = protocol();
  for (const descriptionMarkdown of ['### Ürün bilgileri\n\nZarif görünüm.', 'Zarif görünüm.\n\n### Ürün bilgileri']) assert.throws(() => writer.decode({ descriptionMarkdown }));
  const draft = accepted(writer.decode({ descriptionMarkdown: '## Ürün bilgileri\n\n### Ayrıntılar\n\nZarif görünüm.' }), packet, ['description']);
  assert.deepEqual(draft.description?.filter(block => block.type === 'heading').map(block => block.level), [2, 3]);
});

test('unsafe or unsupported Markdown cannot reach persisted rendered content', () => {
  const { packet, writer } = protocol();
  for (const markdown of ['[Bağlantı](https://example.com)', '![Görsel](https://example.com/image.png)', '`kod`', '```html\n<p>İçerik</p>\n```', '<strong>Çelik</strong>', '<script>alert(1)</script>']) {
    assert.throws(() => accepted(writer.decode({ descriptionMarkdown: markdown }), packet, ['description']));
  }
});

test('SEO limits and unsupported claims still pass through existing server validation gates', () => {
  const { packet, writer } = protocol(base, ['seoTitle', 'seoDescription']);
  for (const value of [{ seoTitle: 'İ'.repeat(61), seoDescription: 'Zarif görünüm.' }, { seoTitle: 'Burgu Bileklik', seoDescription: 'ş'.repeat(161) }, { seoTitle: 'Altın Burgu Bileklik', seoDescription: 'Zarif görünüm.' }]) assert.throws(() => accepted(writer.decode(value), packet, ['seoTitle', 'seoDescription']));
});

test('bounded parsing rejects oversized output and empty descriptions', () => {
  const { packet, writer } = protocol();
  for (const descriptionMarkdown of ['', ' '.repeat(20), 'x'.repeat(100_001), Array(1001).fill('ürün').join(' ')]) assert.throws(() => accepted(writer.decode({ descriptionMarkdown }), packet, ['description']));
});

test('legacy structured drafts remain unchanged for the existing compatibility path', () => {
  const { packet, writer } = protocol();
  const legacy = { description: [{ type: 'paragraph', children: [{ type: 'fact', factRef: 'product:title:0', value: base.title }] }], claims: [{ field: 'description', factRef: 'product:title:0', value: base.title }], suggestions: [], sourceFingerprint: packet.sourceFingerprint };
  assert.deepEqual(writer.decode(legacy), legacy);
  accepted(writer.decode(legacy), packet, ['description']);
});

test('legacy structured H4 headings retain their existing compatibility behavior', () => {
  const { packet, writer } = protocol();
  const legacy = { description: [{ type: 'heading', level: 4, children: [{ type: 'text', text: 'Ürün bilgileri' }] }], claims: [], suggestions: [], sourceFingerprint: packet.sourceFingerprint };
  assert.deepEqual(writer.decode(legacy), legacy);
  const draft = accepted(writer.decode(legacy), packet, ['description']);
  assert.deepEqual(draft.description, legacy.description);
});
