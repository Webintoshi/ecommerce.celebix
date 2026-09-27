import assert from "node:assert/strict";
import test from "node:test";
import { setupAdminPaymentAuthorities } from "./default.ts";
import type { ServerPaymentMethodsRuntime } from "../server-payment-methods/runtime.ts";
import { setupStatus } from "../setup-ui/model.ts";
import { inputs, tenant, payment } from "../setup-ui/fixtures.ts";
function fixture(){const authority={environment:"live",adapterVersion:1,evidenceDigest:"sha256:"+"a".repeat(64)},entry={providerCode:"paytr_iframe",familyCode:"paytr",modeCode:"iframe",readiness:"production_ready",executionAuthority:authority},descriptor={capability:"payment_processing",adapterVersion:1,environments:["live"],executionAuthority:{...authority}},packet={providerCode:"paytr_iframe",familyCode:"paytr",modeCode:"iframe",adapterVersion:1,readiness:{live:"production_ready"},endpoints:{live:["fixture"]}},adapter={packet,execute:()=>assert.fail("provider execution called")};
 const runtime={catalog:[entry],providerExecution:{registry:{get:()=>descriptor},adapters:{packet:()=>packet,adapter:()=>adapter}}}as unknown as ServerPaymentMethodsRuntime;return {runtime,entry,descriptor,packet,adapter};}
test("admin authority derives only from agreeing execution evidence descriptor packet and adapter",()=>{
 const value=fixture();assert.deepEqual(setupAdminPaymentAuthorities(value.runtime),[{providerCode:"paytr_iframe",environment:"live",adapterVersion:1,evidenceDigest:"sha256:"+"a".repeat(64)}]);
 for(const corrupt of[(v:ReturnType<typeof fixture>)=>{v.entry.executionAuthority.evidenceDigest="sha256:"+"b".repeat(64);},(v:ReturnType<typeof fixture>)=>{v.descriptor.environments=["test"];},(v:ReturnType<typeof fixture>)=>{v.packet.adapterVersion=2;},(v:ReturnType<typeof fixture>)=>{v.packet.endpoints.live=[];},(v:ReturnType<typeof fixture>)=>{v.entry.readiness="maintenance";},(v:ReturnType<typeof fixture>)=>{v.adapter.packet={...v.packet};}]){const next=fixture();corrupt(next);assert.deepEqual(setupAdminPaymentAuthorities(next.runtime),[]);}
 assert.deepEqual(setupAdminPaymentAuthorities({...fixture().runtime,providerExecution:null}),[]);
});
test("actual admin metadata projection cannot claim live against different current storefront evidence",()=>{
 const value=fixture(),input=inputs(),proof=input.access.kind==="value"?input.access.value:null;assert.ok(proof);
 const admin=setupAdminPaymentAuthorities(value.runtime)[0]!;
 for(const current of[{...admin,providerCode:"paytr_iframe"as const,adapterVersion:2},{...admin,providerCode:"paytr_iframe"as const,evidenceDigest:"sha256:"+"b".repeat(64)}]){
  const result=setupStatus(tenant(),{...input,payment:{kind:"value",value:{...payment(),authorities:[admin]}},access:{kind:"value",value:{...proof,payment:{kind:"ready",providers:[current]}}}});
  assert.equal(result.payment.kind,"configured");assert.equal(result.payment.state,"action_required");
 }
});
