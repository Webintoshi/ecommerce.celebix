import assert from "node:assert/strict";
import test from "node:test";
import { sendNativeMarketingEmail } from "./resend.ts";
import type { NativeMarketingProviderRequest } from "./seal.ts";
const DELIVERY = "22222222-2222-4222-8222-222222222222";
const request: NativeMarketingProviderRequest = { from: "Mağaza <noreply@marketing.celebix.co>", to: "ada@example.test", subject: "Yeni ürünler", html: "<p>Yeni ürünler</p>", text: "Yeni ürünler", headers: { "List-Unsubscribe": "<https://owner.saas-staging.celebix.net/api/marketing/unsubscribe?token=" + "a".repeat(43) + ">", "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }, tags: [{ name: "tenant_id", value: "11111111-1111-4111-8111-111111111111" }, { name: "delivery_id", value: DELIVERY }] };
test("marketing sends exact frozen headers without Reply-To and uses its own idempotency family", async () => {
  let sent: Record<string, unknown> | undefined;
  const result = await sendNativeMarketingEmail(request, { apiKey: "re_private_marketing_authority", idempotencyKey: `native-marketing/v1/${DELIVERY}`, timeoutMs: 1_000, fetch: async (url, init) => {
    assert.equal(url, "https://api.resend.com/emails");
    assert.equal(new Headers(init?.headers).get("idempotency-key"), `native-marketing/v1/${DELIVERY}`);
    assert.equal(init?.redirect, "error");
    sent = JSON.parse(String(init?.body)); return Response.json({ id: DELIVERY });
  } });
  assert.deepEqual(result, { kind: "accepted", providerMessageId: DELIVERY });
  assert.deepEqual(sent, { ...request, to: [request.to] });
  assert.equal(Object.hasOwn(sent!, "reply_to"), false);
});
test("ambiguous provider/network outcomes remain retryable with bounded Retry-After and safe errors", async () => {
  for (const [status, name, kind] of [[429,"rate_limit_exceeded","retryable"],[503,"private_text","retryable"],[409,"invalid_idempotent_request","permanent"],[403,"validation_error","permanent"]] as const) {
    const result = await sendNativeMarketingEmail(request, { apiKey: "re_private_marketing_authority", idempotencyKey: `native-marketing/v1/${DELIVERY}`, timeoutMs: 1_000, fetch: async () => Response.json({ name, message: "private secret diagnostic" }, { status, headers: { "retry-after": "90" } }) });
    assert.equal(result.kind, kind); assert.doesNotMatch(JSON.stringify(result), /private|secret|diagnostic/u);
    if (status === 429) assert.equal(result.kind === "retryable" && result.retryAfterMs, 90_000);
  }
});
test("Free quota errors have finite distinct reasons instead of a generic rapid retry", async () => {
  for (const [name, expected] of [["daily_quota_exceeded", { kind: "retryable", code: "provider_daily_quota_exceeded" }], ["monthly_quota_exceeded", { kind: "permanent", code: "provider_monthly_quota_exceeded" }]] as const) {
    const result = await sendNativeMarketingEmail(request, { apiKey: "re_private_marketing_authority", idempotencyKey: `native-marketing/v1/${DELIVERY}`, timeoutMs: 1_000, fetch: async () => Response.json({ name }, { status: 429 }) });
    assert.deepEqual(result, expected);
  }
});
