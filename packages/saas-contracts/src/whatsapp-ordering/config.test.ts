import assert from 'node:assert/strict';
import test from 'node:test';
import { COMMERCIAL_PACKAGES, getCommercialPackage, hasCommercialCapability } from '../commercial-packages/catalog.ts';
import { createDefaultWhatsAppOrderConfig, parseWhatsAppOrderConfig, resolveStorefrontCommercePolicy, hasWhatsAppOrderingAccess } from './index.ts';

test('default and disabled WhatsApp settings preserve commerce; active switch combinations resolve one policy', () => {
 const defaults=createDefaultWhatsAppOrderConfig();
 assert.equal(defaults.enabled,false); assert.equal(defaults.phone,'');
 assert.deepEqual(resolveStorefrontCommercePolicy(null),{...defaults,checkoutAllowed:true,version:0});
 for(const enabled of [false,true])for(const hidePrices of [false,true])for(const hideAddToCart of [false,true]){
  const config=parseWhatsAppOrderConfig({...defaults,phone:'+905551112233',enabled,hidePrices,hideAddToCart});
  const policy=resolveStorefrontCommercePolicy(config,7);
  assert.equal(policy.hidePrices,enabled&&hidePrices);assert.equal(policy.hideAddToCart,enabled&&hideAddToCart);
  assert.equal(policy.checkoutAllowed,!enabled||(!hidePrices&&!hideAddToCart));assert.equal(policy.version,7);
 }
});
test('strict settings require canonical international phone and safe message text', () => {
 const defaults=createDefaultWhatsAppOrderConfig();
 assert.doesNotThrow(()=>parseWhatsAppOrderConfig(defaults));
 for(const phone of ['', '05551112233','905551112233','+01234567','+1','https://evil.test','+90555 1112233'])assert.throws(()=>parseWhatsAppOrderConfig({...defaults,enabled:true,phone}));
 for(const patch of [{unknown:true},{schemaVersion:2},{enabled:'true'},{hidePrices:1},{messageIntro:'<b>Hi</b>'},{messageIntro:'https://evil.test'},{messageIntro:'x\nhello'},{messageIntro:'x'.repeat(301)}])assert.throws(()=>parseWhatsAppOrderConfig({...defaults,...patch}));
 let invoked=false;const getter={...defaults};Object.defineProperty(getter,'phone',{enumerable:true,get(){invoked=true;return ''}});assert.throws(()=>parseWhatsAppOrderConfig(getter));assert.equal(invoked,false);
 assert.throws(()=>resolveStorefrontCommercePolicy(defaults,-1));
});
test('WhatsApp eligibility is additive for exact paid identities without changing historical tariff rights',()=>{
 for(const p of COMMERCIAL_PACKAGES){const e={schemaVersion:1 as const,validFrom:'2026-01-01T00:00:00.000Z',planId:p.id,planCode:p.code,version:p.version,status:'active' as const,features:p.features,limits:p.limits};assert.equal(hasWhatsAppOrderingAccess(e),p.code!=='free_starter');if(p.code==='starter'){assert.equal(hasCommercialCapability(e,'manual_orders'),false);assert.equal(getCommercialPackage(e)?.capabilities.includes('manual_orders'),false);}}
 const p=COMMERCIAL_PACKAGES[1]!;const e={schemaVersion:1 as const,validFrom:'2026-01-01T00:00:00.000Z',planId:p.id,planCode:p.code,version:p.version,status:'active' as const,features:p.features,limits:p.limits};assert.equal(hasWhatsAppOrderingAccess({...e,planId:'00000000-0000-4000-8000-000000009999'}),false);assert.equal(hasWhatsAppOrderingAccess({...e,status:'expired' as never}),false);
});
