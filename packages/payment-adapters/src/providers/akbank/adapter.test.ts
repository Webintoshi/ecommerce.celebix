import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import type { HostedPaymentCallbackInput, HostedPaymentInitializeInput, HostedPaymentQueryInput } from "../../contracts.ts";
import type { ProviderTransport, ProviderTransportRequest, ProviderTransportResult } from "../../transport.ts";
import { createAkbankHostedAdapter, validateAkbankCredentialWithTransport } from "./adapter.ts";
import { createPaymentAdapterRegistry } from "../../registry.ts";

const encoder = new TextEncoder();
const credential = Object.freeze({ merchantSafeId: "1".repeat(32), terminalSafeId: "2".repeat(32), secretKey: "celebix-documentation-fixture-only" });
const ATTEMPT = "11111111-1111-4111-8111-111111111111";
const options = Object.freeze({ now: () => new Date("2026-10-25T09:30:00.000Z"), randomBytes: (size: number) => new Uint8Array(size).fill(0xaa) });
function mac(body: Uint8Array): string { return createHmac("sha512", credential.secretKey).update(body).digest("base64"); }
function signedResponse(value: unknown, signature?: string): ProviderTransportResult {
  const body = encoder.encode(typeof value === "string" ? value : JSON.stringify(value));
  return { kind: "response", status: 200, contentType: "application/json", body, headers: { "auth-hash": signature ?? mac(body) } } as ProviderTransportResult;
}
function transport(implementation: (request: ProviderTransportRequest) => ProviderTransportResult): ProviderTransport { return { async request(request) { return implementation(request); } }; }
const noCalls = transport(() => { throw new Error("unexpected transaction request"); });
function initial(overrides: Partial<HostedPaymentInitializeInput<typeof credential>> = {}): HostedPaymentInitializeInput<typeof credential> {
  return { environment: "test", credential, preferences: { environment: "test", locale: "tr", threeDSecure: "provider_managed", installmentMode: "single_payment", maxInstallment: 0 }, attemptId: ATTEMPT, orderReference: "platform-order-123", amountMinor: 1000, currency: "TRY", callbackUrl: "https://shop.celebix.site/api/payments/akbank_json/callback/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", successUrl: "https://shop.celebix.site/odeme/hizli/sonuc?durum=basarili", failureUrl: "https://shop.celebix.site/odeme/hizli/sonuc?durum=basarisiz", customer: { name: "Ada", email: "ada@example.com", phone: "", address: "", ipAddress: "" }, basket: [{reference:"sku",name:"Product",quantity:1,unitAmountMinor:1000}], signal: new AbortController().signal, ...overrides };
}
function detail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { txnCode: "1000", responseCode: "VPS-0000", hostResponseCode: "00", txnDateTime: "2026-10-25T12:31:00.000", orderId: ATTEMPT, orgOrderId: ATTEMPT, authCode: "123456", rrn: "123456789012", batchNumber: 211, stan: 16, txnStatus: "N", amount: 10, currencyCode: 949, installCount: 1, ccbRewardAmount: 0, pcbRewardAmount: 0, xcbRewardAmount: 0, secureType: "BANK_HOSTED_ENUM_NOT_ASSUMED", ...overrides };
}
function inquiry(details: readonly Record<string, unknown>[] = [detail()], overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { txnCode: "1010", responseCode: "VPS-0000", responseMessage: "SUCCESSFUL", txnDateTime: "2026-10-25T12:32:00.000", terminal: { merchantSafeId: credential.merchantSafeId, terminalSafeId: credential.terminalSafeId }, txnDetailList: details, ...overrides };
}
function queryInput(overrides: Partial<HostedPaymentQueryInput<typeof credential>> = {}): HostedPaymentQueryInput<typeof credential> {
  return { environment: "test", credential, attemptId: ATTEMPT, orderReference: "platform-order-123", providerReference: ATTEMPT, amountMinor: 1000, currency: "TRY", signal: new AbortController().signal, ...overrides };
}
function callback(overrides: Record<string, string> = {}, signedNames?: readonly string[]): Uint8Array {
  const fields = { merchantSafeId: credential.merchantSafeId, terminalSafeId: credential.terminalSafeId, orderId: ATTEMPT, txnCode: "1000", responseCode: "VPS-0000", hostResponseCode: "00", amount: "10.00", currencyCode: "949", installCount: "1", txnDateTime: "2026-10-25T12:31:00.000", ...overrides };
  const names = signedNames ?? Object.keys(fields).reverse();
  const joined = encoder.encode(names.map(name => fields[name as keyof typeof fields]).join(""));
  return encoder.encode(new URLSearchParams({ ...fields, hashParams: names.join("+"), hash: mac(joined) }).toString());
}
function callbackInput(overrides: Partial<HostedPaymentCallbackInput<typeof credential>> = {}): HostedPaymentCallbackInput<typeof credential> {
  return { environment: "test", credential, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: callback(), expected: { attemptId: ATTEMPT, orderReference: "platform-order-123", providerReference: ATTEMPT, amountMinor: 1000, currency: "TRY" }, signal: new AbortController().signal, ...overrides };
}

test("initializes a card-free signed hosting form without a server sale request", async () => {
  const result = await createAkbankHostedAdapter(noCalls, options).initialize(initial());
  assert.equal(result.kind, "form_post");
  if (result.kind !== "form_post") return;
  assert.equal(result.url, "https://virtualpospaymentgatewaypre.akbank.com/payhosting");
  assert.equal(result.providerReference, ATTEMPT);
  assert.equal(result.fields.orderId, ATTEMPT);
  assert.equal(result.fields.paymentModel, "3D_PAY_HOSTING");
  assert.equal(result.fields.txnCode, "3000");
  assert.equal(result.fields.amount, "10.00");
  assert.equal(result.fields.lang, "TR");
  assert.equal(result.fields.installCount, "1");
  assert.equal(result.fields.requestDateTime, "2026-10-25T12:30:00.000");
  assert.equal(result.fields.randomNumber, "AA".repeat(64));
  assert.equal(result.fields.okUrl, initial().callbackUrl);
  assert.equal(result.fields.failUrl, initial().callbackUrl);
  assert.equal(result.fields.emailAddress, "");
  assert.equal(Object.keys(result.fields).length, 29);
  assert.equal(Object.hasOwn(result.fields, "secretKey"), false);
  assert.equal(Object.hasOwn(result.fields, "cvv"), false);
});

test("hosting request matches the independent published fixture field order", async () => {
  const result = await createAkbankHostedAdapter(noCalls, options).initialize(initial());
  assert.equal(result.kind, "form_post");
  if (result.kind !== "form_post") return;
  // The independent fixture differs only in orderId and return URL from the real operation-bound form.
  const fields: Record<string,string> = { ...result.fields, orderId: "celebix-fixture-0001", okUrl: "https://example.com/api/payments/akbank/return", failUrl: "https://example.com/api/payments/akbank/return" };
  const names = ["paymentModel","txnCode","merchantSafeId","terminalSafeId","orderId","lang","amount","ccbRewardAmount","pcbRewardAmount","xcbRewardAmount","currencyCode","installCount","okUrl","failUrl","emailAddress","mobilePhone","homePhone","workPhone","subMerchantId","randomNumber","requestDateTime","b2bIdentityNumber","merchantData","merchantBranchNo","mobileEci","walletProgramData","mobileAssignedId","mobileDeviceType"];
  assert.equal(mac(encoder.encode(names.map(name => fields[name]).join(""))), "NSs9+WJu7pK3PLlzDJ4vCmyR9X9g90LSV3Q8DZlUzWg9BkYDqXb4JEV7dLeWtd/P7swes+fsqt1F+mgwGgZaSA==");
  assert.equal(result.fields.hash, mac(encoder.encode(names.map(name => result.fields[name]).join(""))));
});

test("honors English and live endpoint while rejecting unsupported preferences and unsafe totals", async () => {
  const adapter = createAkbankHostedAdapter(noCalls, options);
  const english = await adapter.initialize(initial({ environment:"live", preferences:{...initial().preferences, environment:"live", locale:"en"} }));
  assert.equal(english.kind, "form_post");
  if (english.kind === "form_post") { assert.equal(english.fields.lang, "EN"); assert.equal(english.url, "https://virtualpospaymentgateway.akbank.com/payhosting"); }
  for (const change of [{amountMinor:0}, {amountMinor:1.1}, {currency:"USD"}, {callbackUrl:"https://evil.example/api/payments/akbank_json/callback/not-an-operation-binding"}, {preferences:{...initial().preferences,installmentMode:"all" as const}}, {preferences:{...initial().preferences,installmentMode:"limited" as const,maxInstallment:3 as const}}]) {
    assert.equal((await adapter.initialize(initial(change))).kind, "rejected");
  }
});

test("query signs exact inquiry bytes, binds the attempt and wipes request/response buffers", async () => {
  let requestBody: Uint8Array | undefined;
  const response = signedResponse(inquiry());
  let selectedRequest: ProviderTransportRequest | undefined;
  const adapter = createAkbankHostedAdapter(transport(request => {
    requestBody = request.body;
    selectedRequest = {...request,body:request.body.slice()};
    return response;
  }), options);
  assert.deepEqual(await adapter.query(queryInput()), {kind:"succeeded",providerReference:ATTEMPT,paidAmountMinor:1000,currency:"TRY"});
  assert.ok(selectedRequest);
  assert.equal(selectedRequest.url,"https://apipre.akbank.com/api/v1/payment/virtualpos/transaction/process");
  assert.deepEqual(JSON.parse(new TextDecoder().decode(selectedRequest.body)),{version:"1.00",txnCode:"1010",requestDateTime:"2026-10-25T12:30:00.000",randomNumber:"AA".repeat(64),terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId},order:{orderId:ATTEMPT}});
  assert.equal((selectedRequest.headers as Record<string,string>)["auth-hash"],mac(selectedRequest.body));
  assert.ok(requestBody?.every(byte => byte === 0));
  if (response.kind === "response") assert.ok(response.body.every(byte => byte === 0));
});

test("only a matching normal original sale can become paid", async () => {
  for (const overrides of [{txnCode:"3000"},{txnCode:"1002"},{txnStatus:"R"},{txnStatus:"V"},{txnStatus:"S"},{amount:11},{currencyCode:840},{orderId:"another-attempt"},{orgOrderId:"another-attempt"},{installCount:2},{responseCode:"VPS-9999"},{hostResponseCode:"05"}]) {
    const result = await createAkbankHostedAdapter(transport(() => signedResponse(inquiry([detail(overrides)]))), options).query(queryInput());
    assert.notEqual(result.kind,"succeeded",JSON.stringify(overrides));
  }
  for (const value of [inquiry([]),inquiry([detail()],{terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:"3".repeat(32)}}),inquiry([detail(),detail({txnCode:"1002",orderId:"refund",orgOrderId:ATTEMPT})]),inquiry([detail({totalRefundAmount:1,refundCounter:1})])]) {
    assert.notEqual((await createAkbankHostedAdapter(transport(() => signedResponse(value)),options).query(queryInput())).kind,"succeeded");
  }
});

test("unsigned, tampered and duplicate-key inquiry responses cannot authorize payment", async () => {
  const raw = JSON.stringify(inquiry());
  const invalidResponses = [signedResponse(inquiry(),"A".repeat(86)+"=="),{kind:"response",status:200,contentType:"application/json",body:encoder.encode(raw)},signedResponse(raw.replace('"txnStatus":"N"','"txnStatus":"R","txnStatus":"N"'))];
  for (const value of invalidResponses) {
    assert.notEqual((await createAkbankHostedAdapter(transport(() => value as ProviderTransportResult),options).query(queryInput())).kind,"succeeded");
  }
});

test("signed callback needs signed inquiry confirmation and returns a stable idempotency key", async () => {
  let count = 0;
  const adapter = createAkbankHostedAdapter(transport(() => {count += 1; return signedResponse(inquiry());}),options);
  const first = await adapter.verifyCallback(callbackInput());
  const replay = await adapter.verifyCallback(callbackInput());
  assert.equal(first.status,"succeeded");
  assert.equal(first.paidAmountMinor,1000);
  assert.equal(first.providerReference,ATTEMPT);
  assert.equal(first.eventKey,replay.eventKey);
  assert.equal(count,2);
});

test("callback rejects missing signed critical fields, duplicate keys and wrong identity before inquiry", async () => {
  let count = 0;
  const adapter = createAkbankHostedAdapter(transport(() => {count += 1; return signedResponse(inquiry());}),options);
  const missingCurrency = ["merchantSafeId","terminalSafeId","orderId","txnCode","responseCode","hostResponseCode","amount","installCount"];
  const body = callback();
  const invalidBodies = [callback({},missingCurrency),callback({orderId:"other-order"}),callback({amount:"11.00"}),callback({currencyCode:"840"}),callback({terminalSafeId:"3".repeat(32)}),encoder.encode(`${new TextDecoder().decode(body)}&amount=10.00`),callback({},[...missingCurrency,"currencyCode","orderId"])];
  for (const value of invalidBodies) await assert.rejects(adapter.verifyCallback(callbackInput({body:value})),/akbank_callback_invalid/);
  assert.equal(count,0);
});

test("callback never trusts a success response when inquiry is unavailable or reversed", async () => {
  const unavailable = await createAkbankHostedAdapter(transport(() => ({kind:"unknown",code:"transport_outcome_unknown"})),options).verifyCallback(callbackInput());
  assert.equal(unavailable.status,"retry");
  const reversed = await createAkbankHostedAdapter(transport(() => signedResponse(inquiry([detail({txnStatus:"R"})]))),options).verifyCallback(callbackInput());
  assert.notEqual(reversed.status,"succeeded");
});

test("credential check sends only signed read-only inquiry and accepts terminal-bound authenticated not-found", async () => {
  const syntheticNotFound = {txnCode:"1010",responseCode:"VPS-1007",terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId}};
  const result = await validateAkbankCredentialWithTransport(transport(request => { assert.equal(JSON.parse(new TextDecoder().decode(request.body)).txnCode,"1010"); return signedResponse(syntheticNotFound); }),{environment:"test",credential,validationReference:ATTEMPT,signal:new AbortController().signal},options);
  assert.deepEqual(result,{kind:"validated",maskedAccountReference:"Akbank…1111/2222",outcomeCode:"provider_validated"});
  for (const value of [{responseCode:"VPS-1007"},{...syntheticNotFound,terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:"3".repeat(32)}},inquiry([])]) {
    assert.deepEqual(await validateAkbankCredentialWithTransport(transport(() => signedResponse(value)),{environment:"test",credential,validationReference:ATTEMPT,signal:new AbortController().signal},options),{kind:"rejected",outcomeCode:"validation_unavailable"});
  }
});

test("LIVE credential check accepts authenticated VPS-1123 with an absent or empty transaction list", async () => {
  // Synthetic response using the bank's documented not-found code; no merchant data.
  const notFound = {txnCode:"1010",responseCode:"VPS-1123",terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId}};
  for (const value of [notFound,{...notFound,txnDetailList:[]}]) {
    const result = await validateAkbankCredentialWithTransport(transport(request => {
      assert.equal(request.url,"https://api.akbank.com/api/v1/payment/virtualpos/transaction/process");
      assert.equal(request.method,"POST");
      assert.equal(JSON.parse(new TextDecoder().decode(request.body)).txnCode,"1010");
      assert.equal("auth-hash" in request.headers ? request.headers["auth-hash"] : undefined,mac(request.body));
      return signedResponse(value);
    }),{environment:"live",credential,validationReference:ATTEMPT,signal:new AbortController().signal},options);
    assert.deepEqual(result,{kind:"validated",maskedAccountReference:"Akbank…1111/2222",outcomeCode:"provider_validated"});
  }
});

test("authenticated VPS-1123 remains pending rather than paid for query and callback", async () => {
  const notFound = {txnCode:"1010",responseCode:"VPS-1123",terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId}};
  for (const value of [notFound,{...notFound,txnDetailList:[]}]) {
    const adapter = createAkbankHostedAdapter(transport(() => signedResponse(value)),options);
    assert.deepEqual(await adapter.query(queryInput({environment:"live"})),{kind:"pending",providerReference:ATTEMPT});
    assert.equal((await adapter.verifyCallback(callbackInput({environment:"live"}))).status,"pending");
  }
});

test("VPS-1123 cannot bypass authentication scope transaction-list or HTTP checks", async () => {
  const notFound = {txnCode:"1010",responseCode:"VPS-1123",terminal:{merchantSafeId:credential.merchantSafeId,terminalSafeId:credential.terminalSafeId}};
  const input = {environment:"live" as const,credential,validationReference:ATTEMPT,signal:new AbortController().signal};
  const cases: readonly [string,() => ProviderTransportResult][] = [
    ["unsigned",() => { return {kind:"response",status:200,contentType:"application/json",body:encoder.encode(JSON.stringify(notFound))} as ProviderTransportResult; }],
    ["tampered",() => signedResponse(notFound,mac(encoder.encode(JSON.stringify({...notFound,responseCode:"VPS-1007"}))))],
    ["wrong merchant",() => signedResponse({...notFound,terminal:{...notFound.terminal,merchantSafeId:"3".repeat(32)}})],
    ["wrong terminal",() => signedResponse({...notFound,terminal:{...notFound.terminal,terminalSafeId:"3".repeat(32)}})],
    ["wrong transaction",() => signedResponse({...notFound,txnCode:"1000"})],
    ["nonempty transaction list",() => signedResponse({...notFound,txnDetailList:[detail()]})],
    ["null transaction list",() => signedResponse({...notFound,txnDetailList:null})],
    ["object transaction list",() => signedResponse({...notFound,txnDetailList:{}})],
    ["HTTP 401",() => ({...signedResponse(notFound),status:401} as ProviderTransportResult)],
    ["date error is not not-found",() => signedResponse({...notFound,responseCode:"VPS-1073"})],
  ];
  for (const [label,response] of cases) {
    const selected = transport(response);
    assert.deepEqual(await validateAkbankCredentialWithTransport(selected,input,options),{kind:"rejected",outcomeCode:"validation_unavailable"},label);
    const adapter = createAkbankHostedAdapter(selected,options);
    assert.notEqual((await adapter.query(queryInput({environment:"live"}))).kind,"succeeded",label);
    assert.notEqual((await adapter.verifyCallback(callbackInput({environment:"live"}))).status,"succeeded",label);
  }
});

test("credential check treats documented empty 401 as denial and missing MAC as inconclusive", async () => {
  const input = {environment:"test" as const,credential,validationReference:ATTEMPT,signal:new AbortController().signal};
  assert.deepEqual(await validateAkbankCredentialWithTransport(transport(() => ({kind:"response",status:401,contentType:"",body:new Uint8Array()})),input,options),{kind:"rejected",outcomeCode:"provider_rejected"});
  assert.deepEqual(await validateAkbankCredentialWithTransport(transport(() => ({kind:"response",status:200,contentType:"application/json",body:encoder.encode('{"responseCode":"VPS-2160"}')})),input,options),{kind:"rejected",outcomeCode:"validation_unavailable"});
});


test("Akbank adapter participates in the immutable explicit provider registry", () => {
  const adapter = createAkbankHostedAdapter(noCalls,options);
  const registry = createPaymentAdapterRegistry([adapter.packet],[adapter]);
  assert.equal(registry.adapter("akbank_json"),adapter);
  assert.equal(registry.adapter("akbank"),null);
});


test("hosting signs the authoritative payable total despite shipping, discounts or free basket lines", async () => {
  const adapter = createAkbankHostedAdapter(noCalls,options);
  for (const basket of [[{reference:"sku",name:"Product",quantity:1,unitAmountMinor:999}],[{reference:"sku",name:"Product",quantity:1,unitAmountMinor:2000}],[{reference:"gift",name:"Gift",quantity:1,unitAmountMinor:0}]]) {
    const result = await adapter.initialize(initial({basket}));
    assert.equal(result.kind,"form_post");
    if (result.kind === "form_post") assert.equal(result.fields.amount,"10.00");
  }
});

test("verified pending and failed callbacks preserve the authorized total for native status processing", async () => {
  const pending = await createAkbankHostedAdapter(transport(() => signedResponse(inquiry([detail({txnCode:"3000"})]))),options).verifyCallback(callbackInput());
  assert.equal(pending.status,"pending");
  assert.equal(pending.paidAmountMinor,1000);
  const failed = await createAkbankHostedAdapter(transport(() => signedResponse(inquiry([detail({txnStatus:"R"})]))),options).verifyCallback(callbackInput());
  assert.equal(failed.status,"failed");
  assert.equal(failed.paidAmountMinor,1000);
});

test("signed numeric money uses its exact raw decimal token before matching safe-integer minor totals", async () => {
  const numericRaw=JSON.stringify(inquiry()).replace('"amount":10','"amount":90071992547409.91');
  const wrong=await createAkbankHostedAdapter(transport(()=>signedResponse(numericRaw)),options).query(queryInput({amountMinor:9007199254740990}));
  assert.notEqual(wrong.kind,"succeeded");
  const exact=await createAkbankHostedAdapter(transport(()=>signedResponse(numericRaw)),options).query(queryInput({amountMinor:9007199254740991}));
  assert.equal(exact.kind,"succeeded");
  const tinyFractionRaw=JSON.stringify(inquiry()).replace('"amount":10','"amount":10.0000000000000000001');
  const fractional=await createAkbankHostedAdapter(transport(()=>signedResponse(tinyFractionRaw)),options).query(queryInput());
  assert.notEqual(fractional.kind,"succeeded");
});

test("signed numeric currency, installment and refund counts preserve exact protocol integer tokens", async () => {
  for (const [source,replacement] of [['"currencyCode":949','"currencyCode":949.0000000000000000001'],['"installCount":1','"installCount":1.0000000000000000001'],['"refundCounter":0','"refundCounter":0.0000000000000000001']]) {
    const raw=JSON.stringify(inquiry([detail({refundCounter:0})])).replace(source!,replacement!);
    const result=await createAkbankHostedAdapter(transport(()=>signedResponse(raw)),options).query(queryInput());
    assert.notEqual(result.kind,"succeeded");
  }
  const normal=await createAkbankHostedAdapter(transport(()=>signedResponse(inquiry([detail({refundCounter:0})]))),options).query(queryInput());
  assert.equal(normal.kind,"succeeded");
});

test("lossless bank numbers work when JSON.parse revivers receive no context as on older runtimes", async () => {
  const nativeParse=JSON.parse;
  JSON.parse=((source:string,reviver?: (key:string,value:unknown)=>unknown)=>nativeParse(source,function(key,value){return reviver===undefined?value:reviver.call(this,key,value);})) as typeof JSON.parse;
  try {
    const adapter=createAkbankHostedAdapter(transport(()=>signedResponse(inquiry([detail({refundCounter:0})]))),options);
    assert.equal((await adapter.query(queryInput())).kind,"succeeded");
    const raw=JSON.stringify(inquiry()).replace('"amount":10','"amount":90071992547409.91');
    const exact=createAkbankHostedAdapter(transport(()=>signedResponse(raw)),options);
    assert.notEqual((await exact.query(queryInput({amountMinor:9007199254740990}))).kind,"succeeded");
    assert.equal((await exact.query(queryInput({amountMinor:9007199254740991}))).kind,"succeeded");
  } finally { JSON.parse=nativeParse; }
});
