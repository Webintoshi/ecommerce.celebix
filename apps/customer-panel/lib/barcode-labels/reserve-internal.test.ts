import assert from "node:assert/strict";
import test from "node:test";
import { reserveInternalBarcode } from "./reserve-internal.ts";

test("form reservation obtains a server-issued internal code without saving a product", async () => {
  const calls: string[] = [];
  const code = await reserveInternalBarcode(async (input, init) => {
    calls.push(String(input));
    assert.equal(init?.method, "POST");
    assert.equal(init?.body, "{}");
    assert.ok(new Headers(init?.headers).get("idempotency-key"));
    return Response.json({ barcode: "970000123", replayed: false });
  });
  assert.equal(code, "970000123");
  assert.deepEqual(calls, ["/api/catalog/barcodes/internal/reservations"]);
});

test("malformed or retail GTIN-like responses never populate the form", async () => {
  await assert.rejects(() => reserveInternalBarcode(async () => Response.json({ barcode: "8691234567890", replayed: false })), /unavailable/);
});
