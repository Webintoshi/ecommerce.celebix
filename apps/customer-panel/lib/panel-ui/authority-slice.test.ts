import assert from "node:assert/strict";
import test from "node:test";
import {
  emptyAuthority,
  readyAuthority,
  unavailableAuthority,
  unsupportedAuthority,
} from "./authority-slice.ts";

test("freezes every authority slice and ready payload", () => {
  const ready = readyAuthority({ total: 3 }, "2026-07-20T12:00:00.000Z");
  assert.deepEqual(ready, { state: "ready", value: { total: 3 }, asOf: "2026-07-20T12:00:00.000Z" });
  assert.equal(Object.isFrozen(ready), true);
  assert.equal(Object.isFrozen(ready.value), true);
});

test("represents absence without fabricated numeric values", () => {
  assert.deepEqual(emptyAuthority("Kayıt bulunmuyor"), { state: "empty", message: "Kayıt bulunmuyor" });
  assert.deepEqual(unavailableAuthority(false), { state: "unavailable", retryable: false });
  assert.deepEqual(unsupportedAuthority("orders"), { state: "unsupported", capability: "orders" });
});
