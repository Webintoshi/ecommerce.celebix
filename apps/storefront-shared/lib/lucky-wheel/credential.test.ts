import assert from "node:assert/strict";
import test from "node:test";
import { createWheelCredential, digestWheelCredential, readWheelCredential, serializeWheelCredential, readWheelOperationCookie, serializeWheelOperationCookie } from "./credential.ts";

const HOST = "store.example", TOKEN = Buffer.alloc(32, 17).toString("base64url");
test("wheel visitor is independent of an empty cart and is scoped, secure and opaque", () => {
  const created = createWheelCredential(HOST, size => new Uint8Array(size).fill(17));
  assert.equal(created.value, TOKEN);
  assert.match(created.digest, /^[a-f0-9]{64}$/);
  assert.notEqual(created.digest, digestWheelCredential("other.example", TOKEN));
  assert.equal(serializeWheelCredential(created.value), `__Host-celebix_wheel=${TOKEN}; Path=/; Max-Age=7776000; HttpOnly; Secure; SameSite=Lax`);
  assert.deepEqual(readWheelCredential(`__Host-celebix_cart=anything; __Host-celebix_wheel=${TOKEN}`), { kind: "present", value: TOKEN });
});
test("duplicate malformed and oversized wheel cookies cannot select a visitor", () => {
  for (const value of [`__Host-celebix_wheel=${TOKEN}; __Host-celebix_wheel=${TOKEN}`, "__Host-celebix_wheel=forged", "x=" + "a".repeat(9000)]) assert.equal(readWheelCredential(value).kind, "invalid");
  assert.equal(readWheelCredential(null).kind, "missing");
});
test("coupon recovery cookie stores only an operation reference and rejects forged cardinality", () => {
  const operation = { campaignId: "21000000-0000-4000-8000-000000000001", operationId: "22000000-0000-4000-8000-000000000001" };
  const cookie = serializeWheelOperationCookie(operation);
  assert.deepEqual(readWheelOperationCookie(cookie), operation);
  assert.equal(readWheelOperationCookie(cookie + "; " + cookie), null);
  assert.equal(readWheelOperationCookie("__Host-celebix_wheel_operation=ada@example.com"), null);
});
