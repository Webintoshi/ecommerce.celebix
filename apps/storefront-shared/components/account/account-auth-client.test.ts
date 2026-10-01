import assert from "node:assert/strict";
import test from "node:test";

import * as client from "./account-auth-client.ts";

test("phone challenge only enters verification after confirmed WhatsApp delivery", async () => {
  const body = { phone: "05551112233", firstName: "Ada", lastName: "Yılmaz", returnTo: "/account" };
  const delivered = await client.startAccountPhoneChallenge(body, async (path, options) => {
    assert.equal(path, "/api/account/auth/start");
    assert.deepEqual(JSON.parse(String(options?.body)), body);
    assert.equal(options?.credentials, "same-origin");
    return Response.json({ deliveryRequired: true, message: "Kod gönderildi.", retryAfterSeconds: 70 });
  });
  assert.equal(delivered.retryAfterSeconds, 70);
  await assert.rejects(client.startAccountPhoneChallenge(body, async () => Response.json({ deliveryRequired: false, retryAfterSeconds: 70 })), /Kod gönderilemedi/u);
  await assert.rejects(client.startAccountPhoneChallenge(body, async () => Response.json({ message: "Talebiniz alındı." })), /Kod gönderilemedi/u);
});

test("HTTP429 preserves the server retry duration instead of converting it into a sent code", async () => {
  await assert.rejects(client.postAccountAuth("/api/account/auth/start", { phone: "05551112233", returnTo: "/account" }, async () => Response.json({ code: "rate_limited", message: "Daha sonra deneyin.", retryAfterSeconds: 123 }, { status: 429 })), (error: unknown) => {
    assert.ok(error instanceof client.AccountAuthRequestError);
    assert.equal(error.message, "Daha sonra deneyin.");
    assert.equal(error.retryAfterSeconds, 123);
    return true;
  });
});

test("verification sends only the code and return path and exposes the confirmed destination", async () => {
  const result = await client.postAccountAuth("/api/account/auth/verify", { code: "123456", returnTo: "/account/orders" }, async (path, options) => {
    assert.equal(path, "/api/account/auth/verify");
    assert.deepEqual(JSON.parse(String(options?.body)), { code: "123456", returnTo: "/account/orders" });
    return Response.json({ outcome: "authenticated", profileRequired: false, destination: "/account/orders" });
  });
  assert.equal(result.destination, "/account/orders");
});

test("verification accepts a safe profile destination carrying the original checkout target", async () => {
  const result = await client.postAccountAuth("/api/account/auth/verify", { code: "123456", returnTo: "/checkout" }, async () => Response.json({ outcome: "profile_required", profileRequired: true, destination: "/account/profile?returnTo=%2Fcheckout" }));
  assert.equal(result.destination, "/account/profile?returnTo=%2Fcheckout");
});

test("verification rejects missing, external and normalized near-match destinations", async () => {
  for (const destination of [undefined, "https://attacker.example/account", "//attacker.example/account", "/account/../checkout", "/checkout?next=external", "/%61ccount", "/account/profile?returnTo=%252Fcheckout", "/account/profile?returnTo=%2Fcheckout&returnTo=%2Faccount", 42]) {
    await assert.rejects(client.postAccountAuth("/api/account/auth/verify", { code: "123456", returnTo: "/checkout" }, async () => Response.json({ outcome: "authenticated", profileRequired: false, destination })), /İşlem tamamlanamadı/u);
  }
});

test("failed code verification keeps a useful message and rejects malformed success", async () => {
  await assert.rejects(client.postAccountAuth("/api/account/auth/verify", { code: "123456", returnTo: "/account" }, async () => Response.json({ message: "Kod geçersiz veya süresi dolmuş." }, { status: 400 })), /Kod geçersiz veya süresi dolmuş/u);
  await assert.rejects(client.postAccountAuth("/api/account/auth/verify", { code: "123456", returnTo: "/account" }, async () => new Response("not-json")), /İşlem tamamlanamadı/u);
});
