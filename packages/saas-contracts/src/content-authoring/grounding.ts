import type { ContentAuthoringDraft, ContentAuthoringTextNode, ProductFact, ProductFactPacket } from './types.ts';

function unsupported(): never { throw new TypeError('content_authoring_contract_invalid'); }

/** Lexical comparison only: no float conversion, translation or inferred equivalence. */
function normalize(text: string): string {
  return text.normalize('NFKC').toLocaleLowerCase('tr-TR').normalize('NFD')
    .replace(/\p{M}|\p{Cf}/gu, '').replace(/ı/g, 'i').replace(/(?<=\d),(?=\d)/g, '.')
    // NFKC already folds fullwidth/small/superscript signs. Fold the remaining
    // mathematical/heavy signs, including a spaced sign before a number.
    .replace(/[−➖]/g, '-').replace(/[➕﬩]/g, '+')
    .replace(/([+\-±∓])\s+(?=\p{N})/gu, '$1')
    .replace(/\s+/g, ' ').trim();
}
function escape(text: string): string { return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
const units: Readonly<Record<string, readonly string[]>> = {
  g: ['g', 'gr', 'gram', 'grams'], kg: ['kg', 'kilogram', 'kilograms'], mg: ['mg', 'miligram', 'milligram', 'milligrams'],
  mm: ['mm', 'milimetre', 'millimeter', 'millimeters'], cm: ['cm', 'santimetre', 'centimeter', 'centimeters'],
  m: ['m', 'metre', 'meter', 'meters'], ml: ['ml', 'mililitre', 'milliliter', 'milliliters'],
  l: ['l', 'litre', 'liter', 'liters'], m2: ['m2', 'm²', 'metrekare'], cm2: ['cm2', 'cm²', 'santimetrekare'],
};
// Deliberately finite TR/EN vocabulary. This is an additional gate, not a semantic truth classifier.
const critical = new RegExp(String.raw`(?:^|[^\p{L}\p{N}])(?:` + [
  String.raw`altin\p{L}*|gold\p{L}*|gumus\p{L}*|silver\p{L}*|platin\p{L}*|titanyum\p{L}*|titanium\p{L}*|celik\p{L}*|steel\p{L}*|deri|leather\p{L}*|pamuk\p{L}*|cotton\p{L}*|yun|wool\p{L}*|ipek\p{L}*|silk\p{L}*`,
  String.raw`ayar\p{L}*|karat\p{L}*|carat\p{L}*|purity|saflik|pirlanta\p{L}*|elmas\p{L}*|diamond\p{L}*|zircon\p{L}*|zirkon\p{L}*|yakut\p{L}*|ruby|safir\p{L}*|sapphire\p{L}*|zumrut\p{L}*|emerald\p{L}*|inci\p{L}*|pearl\p{L}*|tas|tasli\p{L}*|tassiz\p{L}*|stone\p{L}*|gemstone\p{L}*`,
  String.raw`sertifika\p{L}*|certif\p{L}*|hipoalerjen\p{L}*|hypoallergen\p{L}*|alerj\p{L}*|allerg\p{L}*|organik\p{L}*|organic\p{L}*|waterproof\p{L}*|water[ -]resistan\p{L}*|su(?:ya)? (?:gecirmez\p{L}*|dayanikli\p{L}*)`,
  String.raw`saglik\p{L}*|health\p{L}*|tedavi\p{L}*|treat\p{L}*|iyilestir\p{L}*|heal\p{L}*|sifa\p{L}*|cure\p{L}*|agri\p{L}*|pain\p{L}*|antibakter\p{L}*|antibacter\p{L}*|antimikrob\p{L}*|antimicrob\p{L}*`,
  String.raw`mense\p{L}*|origin\p{L}*|uretim\p{L}*|uretil\p{L}*|made in|garanti\p{L}*|guarantee\p{L}*|warrant\p{L}*|teslim\p{L}*|deliver\p{L}*|kargo\p{L}*|shipping|dispatch\p{L}*`,
  String.raw`net (?:agirli[kg]\p{L}*|weight)|brut\p{L}*|gross|parca basina|paket basina|per (?:piece|pack|item)|adet|pieces?|packs?`,
  ...Object.values(units).flat().map(u => `${escape(normalize(u))}(?:dir|tir|lik)?`),
].join('|') + String.raw`)(?=$|[^\p{L}\p{N}])`, 'u');

/** Match complete source fragments; never let "250" in ZX-250 authorize a new weight. */
function occurrence(fragment: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}.,+\\-±∓])${escape(normalize(fragment))}(?![\\p{L}\\p{N}])`, 'gu');
}
function fragments(fact: ProductFact): string[] {
  if (fact.unit) return (units[normalize(fact.unit)] ?? [fact.unit]).flatMap(unit =>
    ['', 'dir', 'tir', 'lik'].flatMap(suffix => [' ', ''].map(gap => normalize(`${fact.value}${gap}${unit}${suffix}`))));
  if (fact.field === 'packageCount') return [fact.value, `${fact.value} adet`, `${fact.value} pieces`, `${fact.value} piece`].map(normalize);
  // A field label is evidence only when attached to its full recorded value.
  return [fact.value, `${fact.field}: ${fact.value}`, `${fact.field} ${fact.value}`, `${fact.value} ${fact.field}`].map(normalize);
}
function variantIsNamed(text: string, id: string | undefined, packet: ProductFactPacket): boolean {
  if (!id) return false;
  return packet.facts.some(f => f.scope === 'variant' && f.variantId === id && f.field === 'title' && (
    new RegExp(`(?:^|[^\\p{L}\\p{N}])${escape(normalize(f.value))} (?:varyant[\\p{L}]*|secenek[\\p{L}]*|variant|option)(?=$|[^\\p{L}\\p{N}])`, 'u').test(text) ||
    new RegExp(`(?:^|[^\\p{L}\\p{N}])(?:varyant|secenek|variant|option):? ${escape(normalize(f.value))}(?=$|[^\\p{L}\\p{N}])`, 'u').test(text)
  ));
}

/**
 * Server-only evidence check (pure, with no IO): numeric tokens, unit aliases, listed critical
 * TR/EN terms and exact variant values must be covered by same-scope source fragments.
 * It does not prove arbitrary prose, negation, translated claims, or sentence relationships.
 * Suggestions are non-applied questions and intentionally outside this check. claims[] is
 * never evidence. The public response parser intentionally does not invoke this function.
 */
export function assertProductDraftGrounding(draft: ContentAuthoringDraft, packet: ProductFactPacket): void {
  function check(raw: string, nodes: readonly ContentAuthoringTextNode[] = []): void {
    const text = normalize(raw);
    const eligible = packet.facts.filter(f => f.scope === 'product' || variantIsNamed(text, f.variantId, packet));
    for (const node of nodes) {
      if (node.type === 'fact' && !eligible.some(f => f.ref === node.factRef)) unsupported();
    }
    const evidence = [normalize(packet.title), ...eligible.flatMap(fragments)].filter(Boolean).sort((a, b) => b.length - a.length);
    // Fixed-size spaces preserve boundaries between unmatched tokens and source fragments.
    let uncovered = text;
    for (const fragment of evidence) uncovered = uncovered.replace(occurrence(fragment), match => ' '.repeat(match.length));
    if (/\p{N}/u.test(uncovered) || critical.test(uncovered)) unsupported();
    // Even a noncritical colour/size value must not escape its known variant scope.
    for (const f of packet.facts) {
      if (f.scope === 'variant' && !eligible.includes(f) && occurrence(f.value).test(uncovered)) unsupported();
    }
  }
  const nodeText = (nodes: readonly ContentAuthoringTextNode[]) => nodes.map(n => n.type === 'text' ? n.text : `${n.value}${n.unit ? ` ${n.unit}` : ''}`).join('');
  for (const block of draft.description ?? []) {
    if (block.type === 'paragraph' || block.type === 'heading') check(nodeText(block.children), block.children);
    else if (block.type === 'list') for (const item of block.items) check(nodeText(item), item);
    else if (block.type === 'table') for (const row of block.rows) check(row.map(nodeText).join(' | '), row.flat());
  }
  if (draft.seoTitle !== undefined) check(draft.seoTitle);
  if (draft.seoDescription !== undefined) check(draft.seoDescription);
}
