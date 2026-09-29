import test from 'node:test';
import assert from 'node:assert/strict';
import { buildProductFactPacket } from './facts.ts';
const id = '11111111-1111-4111-8111-111111111111';
const resolver = { category: () => null, brand: () => null, attribute: () => null, variant: () => null };
test('title-only snapshot and cleared fields never recover saved DB values', () => { const p = buildProductFactPacket({ title: 'Old', brandId: id, measurements: { weight: { valueMilli: 14890, unit: 'g' } } }, { title: 'Burgu', brandId: null, measurements: null }, resolver); assert.deepEqual(p.facts.map(f => f.field), ['title']); });
test('milli measurements preserve decimal magnitude and unit', () => { for (const [valueMilli, unit, value] of [[14890, 'g', '14.89'], [250, 'kg', '0.25']] as const) {
    const p = buildProductFactPacket(null, { title: 'Burgu', measurements: { weight: { valueMilli, unit } } }, resolver);
    assert.deepEqual(p.facts.find(f => f.field === 'weight')?.value, value);
    assert.equal(p.facts.find(f => f.field === 'weight')?.unit, unit);
} });
test('all tenant reference kinds fail closed', () => { for (const fields of [{ categoryIds: [id] }, { brandId: id }, { attributes: [{ attributeId: id, value: 'red' }] }, { variants: [{ id, title: 'Red' }] }])
    assert.throws(() => buildProductFactPacket(null, { title: 'Burgu', ...fields }, resolver)); });
test('variant-only color never becomes product fact', () => { const p = buildProductFactPacket(null, { title: 'Burgu', variants: [{ title: 'Red', attributes: [{ attributeId: id, value: 'red' }] }] }, { ...resolver, attribute: () => ({ id, name: 'Color' }) }); assert.equal(p.facts.find(f => f.field === 'Color')?.scope, 'variant'); });
test('fingerprints canonicalize object key ordering but preserve empty/null/omitted snapshots', () => { const a = buildProductFactPacket(null, { title: 'Burgu', measurements: { weight: { valueMilli: 250, unit: 'kg' } } }, resolver); const b = buildProductFactPacket(null, { measurements: { weight: { unit: 'kg', valueMilli: 250 } }, title: 'Burgu' }, resolver); assert.equal(a.sourceFingerprint, b.sourceFingerprint); const fingerprints = [{ title: 'Burgu' }, { title: 'Burgu', description: '' }, { title: 'Burgu', description: null }].map(d => buildProductFactPacket(null, d, resolver).sourceFingerprint); assert.equal(new Set(fingerprints).size, 3); });
test('tenant resolved labels replace client labels and variants must belong to product', () => { assert.throws(() => buildProductFactPacket({ id, title: 'Burgu' }, { title: 'Burgu', variants: [{ id, title: 'Red' }] }, { ...resolver, variant: () => ({ id, productId: 'other' }) })); assert.throws(() => buildProductFactPacket(null, { title: 'Burgu', brandId: id, brandName: 'Forged' } as never, resolver)); assert.equal(buildProductFactPacket(null, { title: 'Burgu', brandId: id }, { ...resolver, brand: () => ({ id, name: 'Verified' }) }).facts.find(f => f.field === 'brand')?.value, 'Verified'); });

test('empty default variant is not a merchandising fact, while meaningful variants keep exact scope',()=>{
 const empty=buildProductFactPacket(null,{title:'Yüzük',variants:[{title:'Varsayılan',attributes:[],measurements:null}]},resolver);
 assert.deepEqual(empty.facts.map(f=>f.field),['title']);
 assert.notEqual(empty.sourceFingerprint,buildProductFactPacket(null,{title:'Yüzük',variants:[]},resolver).sourceFingerprint);
 for(const variant of [{title:'Varsayılan',measurements:{weight:{valueMilli:2280,unit:'g' as const}}},{title:'Küçük'},{title:'Varsayılan',attributes:[{attributeId:id,value:'Sarı'}]}]){
  const result=buildProductFactPacket(null,{title:'Yüzük',variants:[variant]},{...resolver,attribute:()=>({id,name:'Renk'})});
  assert.equal(result.facts.find(f=>f.scope==='variant'&&f.field==='title')?.value,variant.title);
  assert.ok(result.facts.filter(f=>f.scope==='variant').every(f=>f.variantId==='draft-0'));
 }
 assert.throws(()=>buildProductFactPacket({id,title:'Yüzük'},{title:'Yüzük',variants:[{id,title:'Varsayılan'}]},resolver),'placeholder omission never bypasses tenant variant ownership');
});
