import assert from 'node:assert/strict';
import test from 'node:test';
import {parsePublicProductVariant} from './validation.ts';
const variant={id:'40000000-0000-4000-8000-000000000001',title:'Standard',priceCents:1000,stockTracking:false,stockQuantity:0,available:true,attributes:{}};
test('public Merchant identities are optional and expose only strict public identifier keys',()=>{
 assert.equal(Object.hasOwn(parsePublicProductVariant(variant),'merchantIdentifiers'),false);
 const identity={brand:'Atölye',mpn:'9800000000004'};
 assert.deepEqual((parsePublicProductVariant({...variant,merchantIdentifiers:identity}) as any).merchantIdentifiers,identity);
 for(const invalid of [{credential:'secret'},{gtin:'9800000000004'},{gtin:'4006381333931',identifierExists:false},{mpn:'internal',identifierExists:false},{brand:'<script>'},null])assert.throws(()=>parsePublicProductVariant({...variant,merchantIdentifiers:invalid}));
});
