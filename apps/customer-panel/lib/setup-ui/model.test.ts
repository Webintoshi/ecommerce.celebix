import assert from "node:assert/strict";
import test from "node:test";
import { setupStatus } from "./model.ts";
import { inputs, tenant, payment, WORKSPACE, executionAuthority } from "./fixtures.ts";
const NOW="2026-09-27T00:00:00.000Z",ID="11111111-1111-4111-8111-111111111111";
test("empty catalog and optional logo do not invalidate account access or a published blank starter",()=>{const result=setupStatus(tenant(),inputs());assert.equal(result.access.state,"ready");assert.equal(result.products.state,"action_required");assert.equal(result.design.state,"ready");assert.equal(result.design.recommendation,"optional_logo");assert.equal(result.delivery.state,"action_required");});
test("unpublished edits remain separate from the valid published design",()=>{const input=inputs();const result=setupStatus(tenant(),{...input,design:{kind:"value",value:{...WORKSPACE,draftVersion:2,draft:{...WORKSPACE.draft,hero:{...WORKSPACE.draft.hero,slides:WORKSPACE.draft.hero.slides.map(x=>({...x,headline:"Yeni taslak"}))}}}}});assert.equal(result.design.state,"ready");assert.equal(result.design.recommendation,"unpublished_changes");});
test("only a latest active explicit shipping fee is configured, including zero",()=>{for(const shippingPriceCents of[0,1489]){const record={id:ID,kind:"shipping_setting"as const,name:"Teslimat",config:{shippingPriceCents},status:"active"as const,version:1,createdAt:NOW,updatedAt:NOW};assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:[record]}}).delivery.state,"ready");assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:[{...record,status:"draft"}]}}).delivery.state,"action_required");assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:[{...record,config:{regions:"Türkiye"}}]}}).delivery.state,"action_required");}});
test("read errors and permissions are distinct from absent merchant settings",()=>{const input=inputs();for(const key of["products","design","domains","delivery","payment"]as const){const result=setupStatus(tenant(),{...input,[key]:{kind:"unavailable"}});assert.equal(result[key].state,"unavailable");const restricted=setupStatus(tenant(),{...input,[key]:{kind:"restricted"}});assert.equal(restricted[key].state,"restricted");}assert.equal(setupStatus(tenant(),{...input,access:{kind:"value",value:{...(input.access.kind==="value"?input.access.value:{}as never),storeId:"other"}}}).access.state,"unavailable");});
test("online payment requires matching active profile, admin authority and actual storefront execution",()=>{for(const environment of["test","live"]as const){const input=inputs(),online=payment(environment);const edge=input.access.kind==="value"?input.access.value:null;assert.ok(edge);const ready=setupStatus(tenant(),{...input,payment:{kind:"value",value:online},access:{kind:"value",value:{...edge,payment:{kind:"ready",providers:[executionAuthority(environment)]}}}});assert.equal(ready.payment.kind,environment);assert.equal(ready.payment.state,environment==="live"?"ready":"action_required");assert.equal(setupStatus(tenant(),{...input,payment:{kind:"value",value:online}}).payment.kind,"configured");assert.equal(setupStatus(tenant(),{...input,payment:{kind:"value",value:online},access:{kind:"value",value:{...edge,payment:{kind:"unavailable",providers:[]}}}}).payment.state,"unavailable");const disabled={...online,profiles:online.profiles.map(x=>({...x,status:"disabled"as const}))};assert.equal(setupStatus(tenant(),{...input,payment:{kind:"value",value:disabled},access:{kind:"value",value:{...edge,payment:{kind:"ready",providers:[executionAuthority(environment)]}}}}).payment.kind,"configured");}});
test("offline methods stay distinct and an admin or storefront environment mismatch never claims live readiness",()=>{
 const input=inputs(),online=payment(),proof=input.access.kind==="value"?input.access.value:null;assert.ok(proof);
 const offline={...online.methods[0]!,kind:"cash_on_delivery"as const,profileId:null,providerCode:null,config:{instructions:"Teslimatta ödeme"}};
 assert.equal(setupStatus(tenant(),{...input,payment:{kind:"value",value:{methods:[offline],profiles:[],authorities:[]}}}).payment.kind,"offline");
 for(const authorities of[[],[executionAuthority("test")]])assert.equal(setupStatus(tenant(),{...input,payment:{kind:"value",value:{...online,authorities}},access:{kind:"value",value:{...proof,payment:{kind:"ready",providers:[executionAuthority()]}}}}).payment.kind,"configured");
 assert.equal(setupStatus(tenant(),{...input,payment:{kind:"value",value:online},access:{kind:"value",value:{...proof,payment:{kind:"disabled",providers:[executionAuthority()]}}}}).payment.kind,"configured");
});
test("malformed delivery data is unavailable and a newer draft does not hide the current active fee",()=>{
 const base={id:ID,kind:"shipping_setting"as const,name:"Teslimat",status:"active"as const,version:1,createdAt:NOW,updatedAt:NOW,config:{shippingPriceCents:1489}};
 assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:[{...base,config:{shippingPriceCents:-1}}]}}).delivery.state,"unavailable");
 assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:[base,{...base,id:"22222222-2222-4222-8222-222222222222",status:"draft",updatedAt:"2026-09-28T00:00:00.000Z",config:{shippingPriceCents:0}}]}}).delivery.state,"ready");
});
test("a full bounded delivery window cannot prove absence of an older active setting",()=>{
 const records=Array.from({length:200},(_,index)=>({id:`11111111-1111-4111-8111-${String(index).padStart(12,"0")}`,kind:"shipping_setting"as const,name:"Draft",status:"draft"as const,version:1,createdAt:NOW,updatedAt:NOW,config:{shippingPriceCents:1489}}));
 assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:records}}).delivery.state,"unavailable");
 assert.equal(setupStatus(tenant(),{...inputs(),delivery:{kind:"value",value:records.slice(0,199)}}).delivery.state,"action_required");
});
test("stale admin execution version or evidence cannot match the current storefront authority",()=>{
 const input=inputs(),online=payment(),proof=input.access.kind==="value"?input.access.value:null;assert.ok(proof);
 const current={providerCode:"paytr_iframe"as const,environment:"live"as const,adapterVersion:2,evidenceDigest:"sha256:"+"b".repeat(64)};
 for(const stale of[{...current,adapterVersion:1},{...current,evidenceDigest:"sha256:"+"a".repeat(64)}]){
  const result=setupStatus(tenant(),{...input,payment:{kind:"value",value:{...online,authorities:[stale]}},access:{kind:"value",value:{...proof,payment:{kind:"ready",providers:[current]}}}});
  assert.equal(result.payment.kind,"configured");assert.equal(result.payment.state,"action_required");
 }
 const matched=setupStatus(tenant(),{...input,payment:{kind:"value",value:{...online,authorities:[current]}},access:{kind:"value",value:{...proof,payment:{kind:"ready",providers:[current]}}}});
 assert.equal(matched.payment.kind,"live");assert.equal(matched.payment.state,"ready");
});
