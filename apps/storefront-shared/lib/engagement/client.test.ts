import assert from "node:assert/strict";
import test from "node:test";
import { createStoreEngagementClient, prepareEngagementContact, StoreEngagementClientError } from "./client.ts";

const ID = "40000000-0000-4000-8000-000000000001";
const command = { operationId: ID, campaignId: ID, email: "ADA@Example.com", marketingConsent: false };
const response = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
test("contact capture normalizes contact and retries exactly the same operation without identity, prices or consent invention", async () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const client = createStoreEngagementClient(async (input, init) => { calls.push({ path: String(input), init }); return response({ contactCaptured: true, couponCode: "MERHABA10" }); });
  const prepared = prepareEngagementContact(command);
  await client.captureContact(prepared); await client.captureContact(prepared);
  assert.equal(calls[0].path, "/api/cart/contact"); assert.equal(calls[0].init?.credentials, "same-origin"); assert.equal(calls[0].init?.cache, "no-store");
  assert.equal(calls[0].init?.body, calls[1].init?.body);
  assert.deepEqual(JSON.parse(String(calls[0].init?.body)), { ...command, email: "ada@example.com" });
  assert.doesNotMatch(String(calls[0].init?.body), /customerId|tenantId|storeId|price|cartToken/);
  assert.throws(() => prepareEngagementContact({ ...command, customerId: ID }), StoreEngagementClientError);
});
test("session reads skip both authenticated and incomplete profiles, and fail closed on unknown sessions", async () => {
  for (const [value, expected] of [[{ outcome: "unauthenticated" }, "anonymous"], [{ outcome: "found", snapshot: {} }, "authenticated"], [{ outcome: "profile_required" }, "authenticated"], [{ outcome: "surprise" }, "unknown"]] as const) {
    const calls: string[] = [];
    const client = createStoreEngagementClient(async input => { calls.push(String(input)); return response(value); });
    assert.equal(await client.accountSession(), expected); assert.deepEqual(calls, ["/api/account/session"]);
  }
  assert.equal(await createStoreEngagementClient(async () => { throw Error(); }).accountSession(), "unknown");
});
test("capture preserves finite public failures and rejects malformed or injected server responses", async () => {
  for (const code of ["contact_conflict", "rate_limited", "cart_unavailable", "campaign_unavailable", "promotion_unavailable", "invalid_reference"]) {
    const client = createStoreEngagementClient(async () => response({ code }, 409));
    await assert.rejects(client.captureContact(prepareEngagementContact(command)), (error: unknown) => error instanceof StoreEngagementClientError && error.code === code);
  }
  for (const value of [{ contactCaptured: false, couponCode: null }, { contactCaptured: true, couponCode: "not normalized" }, { contactCaptured: true, couponCode: "OK", customerId: ID }]) {
    await assert.rejects(createStoreEngagementClient(async () => response(value)).captureContact(prepareEngagementContact(command)), StoreEngagementClientError);
  }
});
