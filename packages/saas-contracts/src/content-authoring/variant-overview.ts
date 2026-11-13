import type { ProductFactPacket } from './types.ts';

const labels = new Map([
  ['renk', 'Renk'], ['color', 'Renk'], ['colour', 'Renk'],
  ['beden', 'Beden'], ['size', 'Beden'], ['ayakkabi numarasi', 'Numara'], ['shoe size', 'Numara'], ['numara', 'Numara'],
  ['desen', 'Desen'], ['pattern', 'Desen'],
  ['aroma', 'Aroma'], ['flavor', 'Aroma'], ['flavour', 'Aroma'],
]);

const fold = (value: string) => value.normalize('NFC').toLocaleLowerCase('tr-TR').replace(/ı/gu, 'i');
const sizeLabel = /^(?:(?:u[ks]|eu) )?(?:[0-9]{1,3}|x{0,4}[sl]|m|[2-6]x[ls]|small|medium|large|standart|standard|x{1,4} (?:small|large))$/u;
const plainLabel = /^\p{L}+(?:(?:[ -]| & )\p{L}+){0,3}$/u;
const leadingOverview = /^(renk|beden|numara|desen|aroma) seçenekleri: (.+)$/u;
const trailingOverview = /^(.+) (renk|beden|numara|desen|aroma) seçenekleri (?:bulunur|vardir|sunulur|mevcuttur)$/u;

export function variantOverviewOptions(packet: ProductFactPacket) {
  const variants = new Set(packet.facts.flatMap(fact => fact.scope === 'variant' && fact.variantId ? [fact.variantId] : []));
  const groups = new Map<string, { id: string; variants: Map<string, string>; ambiguous: boolean }>();
  for (const fact of packet.facts) {
    if (fact.scope !== 'variant' || !fact.variantId || !fact.attributeId || fact.unit || fact.ref.startsWith('format:bold:')) continue;
    const label = labels.get(fold(fact.field));
    if (!label) continue;
    const group = groups.get(label) ?? { id: fact.attributeId, variants: new Map<string, string>(), ambiguous: false };
    group.ambiguous ||= group.id !== fact.attributeId || group.variants.has(fact.variantId);
    group.variants.set(fact.variantId, fact.value);
    groups.set(label, group);
  }
  return [...groups].flatMap(([label, group]) => {
    if (group.ambiguous || group.variants.size !== variants.size) return [];
    const values = [...new Map([...group.variants.values()].map(value => [fold(value), value])).values()];
    const valid = label === 'Beden' || label === 'Numara'
      ? (value: string) => value.split(' / ').every(size => sizeLabel.test(size))
      : (value: string) => plainLabel.test(value);
    if (values.length < 2 || values.length > 24 || values.some(value => value.length > 48 || !valid(fold(value)))) return [];
    return [{ label, values, attributeId: group.id }];
  });
}

/** Recognize only a complete option-list sentence, with no authority outside it. */
export function parseVariantOverview(text: string) {
  const sentence = fold(text.trim()).replace(/\.$/u, '');
  const leading = leadingOverview.exec(sentence);
  const trailing = trailingOverview.exec(sentence);
  const label = leading?.[1] ?? trailing?.[2];
  const list = leading?.[2] ?? trailing?.[1];
  return label && list ? { label, list } : null;
}

export function matchesVariantOverview(list: string, values: readonly string[]): boolean {
  if (list === values.map(fold).join(', ')) return true;
  const available = new Set(values.map(fold));
  const parts = list.split(/, | ve /u);
  return parts.length === available.size && new Set(parts).size === parts.length && parts.every(value => available.has(value));
}
