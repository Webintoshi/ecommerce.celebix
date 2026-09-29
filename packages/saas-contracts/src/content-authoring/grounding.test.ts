import test from 'node:test';
import assert from 'node:assert/strict';
import { validateProductDraftOutput, parseContentGenerationView } from './validation.ts';
import type { ContentAuthoringDraft, ContentAuthoringField, ProductFact, ProductFactPacket } from './types.ts';

const fingerprint = 'a'.repeat(64);
const fact = (field: string, value: string, unit?: string): ProductFact => ({ ref: field, field, value, ...(unit ? { unit } : {}), scope: 'product', source: 'current_draft' });
const packet = (facts: ProductFact[] = [], title = 'Burgu Bileklik'): ProductFactPacket => ({ title, facts, sourceFingerprint: fingerprint });
const draft = (text: string, field: ContentAuthoringField = 'description'): ContentAuthoringDraft => ({
  ...(field === 'description' ? { description: [{ type: 'paragraph', children: [{ type: 'text', text }] }] } : { [field]: text }),
  claims: [], suggestions: [], sourceFingerprint: fingerprint,
});
const validate = (text: string, source = packet(), field: ContentAuthoringField = 'description') => validateProductDraftOutput(draft(text, field), source, [field]);

for (const field of ['description', 'seoTitle', 'seoDescription'] as const) {
  test(`title-only source rejects unsupported numeric and material prose in ${field}`, () => {
    assert.throws(() => validate('24 ayar 14,89 g altın Burgu Bileklik', packet(), field));
  });
}
for (const text of ['0,25 g ağırlığında.', '250 kg ağırlığında.', '250 g ağırlığında.', '0,025 kg ağırlığında.', '-0,25 kg ağırlığında.', '0,25 kg/cm ölçüsündedir.']) {
  test(`0.25 kg source rejects scale/unit/sign mutation: ${text}`, () => {
    assert.throws(() => validate(text, packet([fact('weight', '0.25', 'kg')])));
  });
}
for (const text of ['Altın bileklik.', '24 ayar.', 'Pırlantalı bileklik.', 'Taşsız bileklik.', 'Sertifikalı ürün.', 'Hipoalerjenik yapı.', 'Organik ürün.', 'Su geçirmez.', 'Alerji yapmaz.', 'Ağrıyı azaltır.', 'Türkiye üretimi.', 'Ömür boyu garantili.', 'Ücretsiz kargo.', 'Aynı gün teslimat.', 'Made in Italy.', 'Waterproof and hypoallergenic.', 'Gold plated.', 'Sterling silver.', 'Net ağırlığı 14,89 g.', 'Parça başına 14,89 gram.']) {
  test(`unsupported critical phrase rejected: ${text}`, () => {
    assert.throws(() => validate(text, packet([fact('weight', '14.89', 'g')])));
  });
}
test('claims cannot launder unsupported prose through a supported fact ref', () => {
  const source = packet([fact('weight', '14.89', 'g')]);
  assert.throws(() => validateProductDraftOutput({ ...draft('24 ayar altın.'), claims: [{ field: 'description', factRef: 'weight', value: '14.89', unit: 'g' }] }, source, ['description']));
});
test('all description text containers are checked, including fragmented tokens', () => {
  for (const description of [
    [{ type: 'heading', level: 2, children: [{ type: 'text', text: 'Altın' }] }],
    [{ type: 'list', ordered: false, items: [[{ type: 'text', text: 'Hipoalerjenik' }]] }],
    [{ type: 'table', rows: [[[{ type: 'text', text: '250 g' }]]] }],
    [{ type: 'paragraph', children: [{ type: 'text', text: 'Al' }, { type: 'text', text: 'tın 14,' }, { type: 'text', text: '89 g' }] }],
  ]) assert.throws(() => validateProductDraftOutput({ ...draft(''), description }, packet(), ['description']));
});
test('neutral short text and optional suggestions require no invented attributes', () => {
  assert.equal(validate('Burgu Bileklik. Modeli diğer seçeneklerle karşılaştırarak tercihinizi yapabilirsiniz.').description?.length, 1);
  assert.equal(validateProductDraftOutput({ ...draft('Burgu Bileklik.'), suggestions: ['Dilerseniz ayar ve ağırlık bilgisini ekleyin.'] }, packet(), ['description']).suggestions.length, 1);
});
test('correct decimal separator and unit aliases preserve source magnitude without conversion', () => {
  for (const text of ['Burgu Bileklik, 14,89 g ağırlığındadır.', 'Burgu Bileklik – 14.89 gram']) {
    assert.doesNotThrow(() => validate(text, packet([fact('weight', '14.89', 'g')])));
  }
  assert.doesNotThrow(() => validate('0,25 kilogram ağırlığındadır.', packet([fact('weight', '0.25', 'kg')])));
});
test('full source title and model identifiers retain their numbers but cannot authorize unrelated quantities', () => {
  const source = packet([fact('Model', 'ZX-250')], 'Burgu 24 Bileklik');
  assert.doesNotThrow(() => validate('Burgu 24 Bileklik. ZX-250 modelini inceleyin.', source));
  assert.throws(() => validate('24 ayar, 250 g ağırlığında.', source));
});
test('safe product fact nodes and explicitly sourced material remain valid', () => {
  const source = packet([fact('weight', '14.89', 'g'), fact('Malzeme', '14 ayar altın')]);
  const output = { ...draft(''), description: [{ type: 'paragraph', children: [{ type: 'text', text: 'Burgu Bileklik, ' }, { type: 'fact', factRef: 'Malzeme', value: '14 ayar altın' }, { type: 'text', text: '. Ağırlık: ' }, { type: 'fact', factRef: 'weight', value: '14.89', unit: 'g' }] }] };
  assert.doesNotThrow(() => validateProductDraftOutput(output, source, ['description']));
  assert.doesNotThrow(() => validate('14 ayar altın Burgu Bileklik, 14,89 g.', source, 'seoTitle'));
});
test('source qualifiers cannot be dropped to turn gold colour or a negative into material/benefit evidence', () => {
  for (const value of ['Altın rengi', 'Altın değildir']) {
    assert.throws(() => validate('Altın bileklik.', packet([fact('Renk', value)])));
    assert.doesNotThrow(() => validate(`${value} Burgu Bileklik.`, packet([fact('Renk', value)])));
  }
});
const variants = packet([
  { ...fact('title', 'Kırmızı'), ref: 'variant-title', scope: 'variant', variantId: 'red' },
  { ...fact('Renk', 'Kırmızı'), ref: 'variant-color', scope: 'variant', variantId: 'red' },
  { ...fact('weight', '14.89', 'g'), ref: 'variant-weight', scope: 'variant', variantId: 'red' },
]);
for (const text of ['Kırmızı Burgu Bileklik.', 'Burgu Bileklik 14,89 g ağırlığındadır.']) {
  test(`variant-only fact is rejected as common prose: ${text}`, () => assert.throws(() => validate(text, variants)));
}
test('variant fact nodes also require an explicit variant label in their own paragraph/item/row', () => {
  const node = { type: 'fact', factRef: 'variant-weight', value: '14.89', unit: 'g' };
  assert.throws(() => validateProductDraftOutput({ ...draft(''), description: [{ type: 'paragraph', children: [node] }] }, variants, ['description']));
  assert.doesNotThrow(() => validateProductDraftOutput({ ...draft(''), description: [{ type: 'paragraph', children: [{ type: 'text', text: 'Kırmızı varyantı: ' }, node] }] }, variants, ['description']));
  assert.doesNotThrow(() => validate('Kırmızı varyantı: 14,89 gram.', variants));
  assert.throws(() => validate('Mavi varyantı: 14,89 gram.', variants));
});
test('public generation parser remains a shape parser without source packet', () => {
  const id = '11111111-1111-4111-8111-111111111111', at = '2026-09-29T10:00:00.000Z';
  assert.doesNotThrow(() => parseContentGenerationView({ id, draftId: id, productId: null, status: 'completed', draft: draft('24 ayar'), sourceFingerprint: fingerprint, usage: null, safeCode: null, createdAt: at, updatedAt: at, finishedAt: at }));
});

test('same-unit typography allows compact units and Turkish copula without changing magnitude', () => {
  for (const text of ['14,89g', '14,89 gramdır.', '14,89 gramlık Burgu Bileklik.']) {
    assert.doesNotThrow(() => validate(text, packet([fact('weight', '14.89', 'g')])));
  }
});
test('recorded package count supports a count noun but cannot authorize a new measurement', () => {
  const source = packet([fact('packageCount', '6')]);
  assert.doesNotThrow(() => validate('Paket içeriği: 6 adet.', source));
  assert.throws(() => validate('6 g ağırlığındadır.', source));
  assert.throws(() => validate('6 ayar.', source));
});
test('an explicitly named variant cannot authorize a later unlabelled paragraph or another variant', () => {
  const node = { type: 'fact', factRef: 'variant-weight', value: '14.89', unit: 'g' };
  assert.throws(() => validateProductDraftOutput({ ...draft(''), description: [
    { type: 'paragraph', children: [{ type: 'text', text: 'Kırmızı varyantı.' }] },
    { type: 'paragraph', children: [node] },
  ] }, variants, ['description']));
  assert.doesNotThrow(() => validate('Kırmızı varyantı — 14,89 g', variants, 'seoTitle'));
});
