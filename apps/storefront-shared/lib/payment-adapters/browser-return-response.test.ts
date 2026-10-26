import assert from "node:assert/strict";
import test from "node:test";
import { createHostedPaymentCallbackRoute, type HostedPaymentRuntime } from "./runtime.ts";
const binding=Buffer.alloc(32,7).toString("base64url");
const runtime={callback:async()=>({kind:"rejected"})} as unknown as HostedPaymentRuntime;

test("a rejected browser bank return keeps its failure status but gives a safe recovery screen instead of raw INVALID",async()=>{
 for(const providerCode of ["akbank_json","iyzico_iframe"]){
  const route=createHostedPaymentCallbackRoute({resolveRuntime:async()=>runtime});
  const response=await route(new Request(`https://shop.example/api/payments/${providerCode}/callback/${binding}`,{method:"POST",headers:{accept:"text/html,application/xhtml+xml","content-type":"application/x-www-form-urlencoded"},body:"untrusted=payload"}),{params:Promise.resolve({providerCode,binding})});
  assert.equal(response.status,400);
  assert.match(response.headers.get("content-type")??"",/^text\/html/);
  const html=await response.text();
  assert.ok(html.includes("Ödeme durumunuzu kontrol edin"));
  assert.ok(html.includes('href="/account/orders"'));
  for(const forbidden of ["INVALID","Ödemeniz alındı","Siparişiniz oluşturuldu","<script","<form",binding,"untrusted=payload"]){assert.ok(!html.includes(forbidden),forbidden);}
  assert.equal(response.headers.get("cache-control"),"no-store");
 }
});
test("server acknowledgments and nonbrowser callbacks retain their original opaque response",async()=>{
 const route=createHostedPaymentCallbackRoute({resolveRuntime:async()=>runtime});
 for(const [providerCode,accept]of [["paytr_iframe","text/html"],["akbank_json","application/json"]]){
  const response=await route(new Request(`https://shop.example/api/payments/${providerCode}/callback/${binding}`,{method:"POST",headers:{accept},body:"untrusted=payload"}),{params:Promise.resolve({providerCode,binding})});
  assert.equal(response.status,400);assert.equal(await response.text(),"INVALID");
 }
});
test("unavailable runtime and failed customer-return resolution cannot claim a payment outcome", async () => {
 for (const resolveRuntime of [async () => null, async () => { throw new Error("private-provider-error"); }]) {
  const route = createHostedPaymentCallbackRoute({ resolveRuntime });
  const response = await route(new Request(`https://shop.example/api/payments/akbank_json/callback/${binding}`, {
   method: "POST", headers: { accept: "text/html" }, body: "untrusted=payload",
  }), { params: Promise.resolve({ providerCode: "akbank_json", binding }) });
  assert.equal(response.status, 400);
  assert.match(response.headers.get("content-security-policy") ?? "", /default-src 'none'/);
  const html = await response.text();
  assert.ok(html.includes("Ödeme durumunuzu kontrol edin"));
  for (const forbidden of ["private-provider-error", "Siparişiniz alındı", "Yeniden ödeme", "<script", "<form", binding]) assert.ok(!html.includes(forbidden));
 }
});
