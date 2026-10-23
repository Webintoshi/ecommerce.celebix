import assert from 'node:assert/strict';
import test from 'node:test';
import {registerServerProductTaxRepository,resolveServerProductTaxRuntime} from './runtime.ts';
test('tax runtime requires approved native access and resolves only its registered repository',async()=>{
 const access:any={readiness:{mode:'approved_staging'},panelOrigin:'https://panel.saas-staging.celebix.net'},value:any={productId:'test'};
 assert.equal(resolveServerProductTaxRuntime(access),null);registerServerProductTaxRepository(access,{read:async()=>value});assert.equal(await resolveServerProductTaxRuntime(access)?.repository.read({}as any),value);
 assert.throws(()=>registerServerProductTaxRepository(access,{read:async()=>value}),/product_tax_runtime_invalid/);
 const disabled:any={readiness:{mode:'disabled'},panelOrigin:null};assert.equal(resolveServerProductTaxRuntime(disabled),null);assert.throws(()=>registerServerProductTaxRepository(disabled,{read:async()=>value}),/product_tax_runtime_invalid/);
});
