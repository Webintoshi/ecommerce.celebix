import assert from "node:assert/strict";
import test from "node:test";
import { createStorefrontSetupCapabilitiesRoute } from "./setup-capabilities.ts";

test("setup capability reader checks tenant health before reading payment availability", async () => {
  let paymentReads = 0;
  const route = createStorefrontSetupCapabilitiesRoute({
    selectAuthority:()=>({kind:"trusted",hostname:"shop.saas-staging.celebix.net"}),
    resolveRepository:async()=>({get:async()=>({schemaVersion:1,status:"ok",storeId:"fixture-store",hostname:"shop.saas-staging.celebix.net"})}),
    paymentAvailability:async()=>{paymentReads++;return {kind:"ready",providers:[{providerCode:"paytr_iframe",environment:"test",adapterVersion:2,evidenceDigest:`sha256:${"a".repeat(64)}`}]};},
    now:()=>new Date(),
  });
  const response=await route(new Request("https://shop.saas-staging.celebix.net/api/setup-capabilities"));
  assert.equal(response.status,200);
  assert.deepEqual(await response.json(),{schemaVersion:1,storeId:"fixture-store",hostname:"shop.saas-staging.celebix.net",payment:{kind:"ready",providers:[{providerCode:"paytr_iframe",environment:"test",adapterVersion:2,evidenceDigest:`sha256:${"a".repeat(64)}`} ]}});
  assert.equal(response.headers.get("cache-control"),"no-store");
  assert.equal(paymentReads,1);
});
test("missing or malformed execution tuples cannot be projected as current payment readiness",async()=>{
 for(const extra of [{},{adapterVersion:0,evidenceDigest:`sha256:${"a".repeat(64)}`},{adapterVersion:1,evidenceDigest:"private_detail"}]){
  const route=createStorefrontSetupCapabilitiesRoute({
   selectAuthority:()=>({kind:"trusted",hostname:"shop.saas-staging.celebix.net"}),
   resolveRepository:async()=>({get:async()=>({schemaVersion:1,status:"ok",storeId:"fixture-store",hostname:"shop.saas-staging.celebix.net"})}),
   paymentAvailability:async()=>({kind:"ready",providers:[{providerCode:"paytr_iframe",environment:"test",...extra}]}) as never,now:()=>new Date(),
  });
  const dto=await(await route(new Request("https://shop.saas-staging.celebix.net/api/setup-capabilities"))).json();
  assert.deepEqual(dto.payment,{kind:"unavailable",providers:[]});
 }
});

test("unknown host and mismatching health never read capability or report ready",async()=>{
  let reads=0;
  const base={resolveRepository:async()=>({get:async()=>({schemaVersion:1 as const,status:"ok" as const,storeId:"fixture-store",hostname:"other.saas-staging.celebix.net"})}),paymentAvailability:async()=>{reads++;throw new Error("must_not_run");},now:()=>new Date()};
  const denied=createStorefrontSetupCapabilitiesRoute({...base,selectAuthority:()=>({kind:"disabled"})});
  const mismatch=createStorefrontSetupCapabilitiesRoute({...base,selectAuthority:()=>({kind:"trusted",hostname:"shop.saas-staging.celebix.net"})});
  const req=new Request("https://shop.saas-staging.celebix.net/api/setup-capabilities");
  assert.equal((await denied(req)).status,404);
  assert.equal((await mismatch(req)).status,503);
  assert.equal(reads,0);
});

test("read failures stay unavailable and no raw dependency error is projected",async()=>{
  const route=createStorefrontSetupCapabilitiesRoute({
    selectAuthority:()=>({kind:"trusted",hostname:"shop.saas-staging.celebix.net"}),
    resolveRepository:async()=>({get:async()=>({schemaVersion:1,status:"ok",storeId:"fixture-store",hostname:"shop.saas-staging.celebix.net"})}),
    paymentAvailability:async()=>{throw new Error("private_dependency_detail");},now:()=>new Date(),
  });
  const response=await route(new Request("https://shop.saas-staging.celebix.net/api/setup-capabilities"));
  const dto=await response.json();
  assert.equal(dto.payment.kind,"unavailable");
  assert.equal(JSON.stringify(dto).includes("private_dependency_detail"),false);
  assert.equal((await route(new Request("https://shop.saas-staging.celebix.net/api/setup-capabilities?storeId=other"))).status,404);
});
