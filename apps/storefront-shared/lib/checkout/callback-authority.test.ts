import assert from "node:assert/strict";
import test from "node:test";

type CallbackAuthorityModule = typeof import("./callback-authority.ts");
const callbackAuthority = await import("./callback-authority.ts")
  .catch(() => ({} as Partial<CallbackAuthorityModule>));

const hostname = "pilot.saas-staging.celebix.site";
const callbackUrl = `https://${hostname}/api/payments/paytr/callback`;
const form = new URLSearchParams({
  merchant_oid: "abcdef0123456789abcdef0123456789",
  status: "success",
  total_amount: "3600",
  hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
  payment_type: "card",
  test_mode: "1",
}).toString();

function request(target = callbackUrl, overrides: Readonly<{
  method?: string; body?: string; headers?: Record<string, string>;
}> = {}): Request {
  return new Request(target, {
    method: overrides.method ?? "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      "x-celebix-storefront-proxy": `p1.${Buffer.alloc(32, 0x41).toString("base64url")}`,
      "x-forwarded-host": hostname,
      "x-forwarded-proto": "https",
      ...overrides.headers,
    },
    ...((overrides.method ?? "POST") === "POST" ? { body: overrides.body ?? form } : {}),
  });
}

test("callback authority accepts one exact signed-host request without browser Origin or session", async () => {
  assert.equal(typeof callbackAuthority.readExactPaytrCallbackRequest, "function");
  const result = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(), trustedHostname: hostname, configuredCallbackUrl: callbackUrl,
  });
  assert.deepEqual(result, {
    merchantOid: "abcdef0123456789abcdef0123456789",
    form,
    callbackDigest: "4cafeff04ae5c17f1cc49635b8d33185d3a35e05e6ce43a7a9ee01dd5c96c0f0",
  });
});

test("callback authority accepts the documented successful payment context", async () => {
  const paymentContextForm = new URLSearchParams({
    merchant_oid: "abcdef0123456789abcdef0123456789",
    status: "success",
    total_amount: "3600",
    hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "3600",
    currency: "TL",
  }).toString();
  const result = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: paymentContextForm }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  });
  assert.equal(result?.merchantOid, "abcdef0123456789abcdef0123456789");
  assert.equal(result?.form, paymentContextForm);
  assert.match(result?.callbackDigest ?? "", /^[a-f0-9]{64}$/);
});

test("callback authority accepts PayTR adapter merchant oid vocabulary", async () => {
  const providerReference = "CV11111111111141118111111111111111";
  const providerReferenceForm = new URLSearchParams({
    merchant_oid: providerReference,
    status: "success",
    total_amount: "100",
    hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "100",
    currency: "TL",
  }).toString();
  const result = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: providerReferenceForm }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  });
  assert.equal(result?.merchantOid, providerReference);
  assert.equal(result?.form, providerReferenceForm);
});

test("callback authority normalizes PayTR form_oid before adapter verification", async () => {
  const digest = "4bb06f8e4e3a7715d201d573d0aa423762e55dabd61a2c02278fa56cc6d294e0";
  const providerForm = new URLSearchParams({
    form_oid: digest,
    status: "success",
    total_amount: "3600",
    hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "3600",
    currency: "TL",
    installment_count: "1",
    merchant_id: "123456",
  }).toString();
  const result = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: providerForm }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  });
  const adapterForm = new URLSearchParams({
    merchant_oid: digest,
    status: "success",
    total_amount: "3600",
    hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "3600",
    currency: "TL",
  }).toString();
  assert.equal(result?.merchantOid, digest);
  assert.equal(result?.form, adapterForm);
  assert.match(result?.callbackDigest ?? "", /^[a-f0-9]{64}$/);
  assert.equal(await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: `${providerForm}&merchant_oid=${digest}` }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  }), null);
});

test("callback authority accepts one bounded PayTR installment count on success", async () => {
  const installmentForm = new URLSearchParams({
    merchant_oid: "abcdef0123456789abcdef0123456789",
    status: "success",
    total_amount: "3600",
    hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "3600",
    currency: "TL",
    installment_count: "0",
  }).toString();
  const result = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: installmentForm }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  });
  assert.equal(result?.merchantOid, "abcdef0123456789abcdef0123456789");
  const adapterForm = new URLSearchParams(installmentForm);
  adapterForm.delete("installment_count");
  assert.equal(result?.form, adapterForm.toString());
  assert.equal((await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: installmentForm.replace("installment_count=0", "installment_count=1") }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  }))?.merchantOid, "abcdef0123456789abcdef0123456789");
  for (const value of ["", "00", "13", "+2", "2.0"]) {
    assert.equal(await callbackAuthority.readExactPaytrCallbackRequest!({
      request: request(callbackUrl, { body: installmentForm.replace("installment_count=0", `installment_count=${encodeURIComponent(value)}`) }),
      trustedHostname: hostname,
      configuredCallbackUrl: callbackUrl,
    }), null);
  }
});

test("callback authority strips one bounded PayTR merchant id before adapter verification", async () => {
  const providerForm = new URLSearchParams({
    merchant_oid: "abcdef0123456789abcdef0123456789",
    status: "success",
    total_amount: "3600",
    hash: "SrJicdvlvDikrVx+LFBeFuunzwB3upOVN2hMKAQxa6k=",
    payment_type: "card",
    test_mode: "1",
    payment_amount: "3600",
    currency: "TL",
    installment_count: "1",
    merchant_id: "123456",
  }).toString();
  const result = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: providerForm }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  });
  const adapterForm = new URLSearchParams(providerForm);
  adapterForm.delete("installment_count");
  adapterForm.delete("merchant_id");
  assert.equal(result?.form, adapterForm.toString());
  const withoutTestMode = providerForm.replace("&test_mode=1", "");
  const withoutTestModeResult = await callbackAuthority.readExactPaytrCallbackRequest!({
    request: request(callbackUrl, { body: withoutTestMode }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
  });
  const withoutTestModeAdapterForm = new URLSearchParams(withoutTestMode);
  withoutTestModeAdapterForm.delete("installment_count");
  withoutTestModeAdapterForm.delete("merchant_id");
  assert.equal(withoutTestModeResult?.form, withoutTestModeAdapterForm.toString());
  for (const value of ["", "012345", "12345", "12345678901234567", "+123456", "ABC123"]) {
    assert.equal(await callbackAuthority.readExactPaytrCallbackRequest!({
      request: request(callbackUrl, { body: providerForm.replace("merchant_id=123456", `merchant_id=${encodeURIComponent(value)}`) }),
      trustedHostname: hostname,
      configuredCallbackUrl: callbackUrl,
    }), null);
  }
});

test("callback authority denies host, scheme, path, type, duplicate, unknown, and size near matches", async () => {
  const read = callbackAuthority.readExactPaytrCallbackRequest!;
  const cases = [
    { request: request(`${callbackUrl}/`) },
    { request: request(`${callbackUrl}?x=1`) },
    { request: request(callbackUrl, { method: "GET" }) },
    { request: request(callbackUrl, { headers: { "content-type": "application/json" } }) },
    { request: request(callbackUrl, { headers: { cookie: "__Host-celebix_quick=q1.secret" } }) },
    { request: request(callbackUrl, { headers: { origin: `https://${hostname}` } }) },
    { request: request(callbackUrl, { body: `${form}&merchant_oid=duplicate` }) },
    { request: request(callbackUrl, { body: `${form}&unknown=x` }) },
    { request: request(callbackUrl, { body: `${form}&payment_amount=3600` }) },
    { request: request(callbackUrl, { body: `${form}&currency=TL` }) },
    { request: request(callbackUrl, { body: "x".repeat(2_049) }) },
  ];
  for (const selected of cases) {
    assert.equal(await read({ ...selected, trustedHostname: hostname, configuredCallbackUrl: callbackUrl }), null);
  }
  assert.equal(await read({ request: request(), trustedHostname: "other.example", configuredCallbackUrl: callbackUrl }), null);
  assert.equal(await read({ request: request(), trustedHostname: hostname, configuredCallbackUrl: `https://other.example/api/payments/paytr/callback` }), null);
});

test("callback reader cancels the first streamed chunk that exceeds its fixed byte budget", async () => {
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) { controller.enqueue(new Uint8Array(2_049).fill(0x78)); },
    cancel() { cancelled = true; },
  });
  const streamed = new Request(callbackUrl, {
    method: "POST", body, duplex: "half",
    headers: { "content-type": "application/x-www-form-urlencoded" },
  } as RequestInit);
  assert.equal(await callbackAuthority.readExactPaytrCallbackRequest!({
    request: streamed, trustedHostname: hostname, configuredCallbackUrl: callbackUrl,
  }), null);
  assert.equal(cancelled, true);
});

test("callback authority reports only a finite rejection stage", async () => {
  const events: string[] = [];
  const read = callbackAuthority.readExactPaytrCallbackRequest!;
  assert.equal(await read({
    request: request(callbackUrl, { headers: { "content-type": "application/json" } }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
    audit: (stage: string) => events.push(stage),
  }), null);
  assert.equal(await read({
    request: request(callbackUrl, { body: `${form}&unknown=x` }),
    trustedHostname: hostname,
    configuredCallbackUrl: callbackUrl,
    audit: (stage: string) => events.push(stage),
  }), null);
  assert.deepEqual(events, ["content_type", "form_fields_unknown_extra"]);
});
